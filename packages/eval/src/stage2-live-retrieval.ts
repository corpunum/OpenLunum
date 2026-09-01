import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { NearSemanticFingerprintGenerator, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, readJson, sha256File, writeJson, validateProfile } from './io.js';
import { effectiveSystemPrompt, OpenAICompatibleModel } from './model.js';
import { extractStructuredJson } from './parse-experiment.js';
import { parsePrompt } from './prompts.js';
import { runRawTextRetrievalEvaluation, type RawTextMemory, type RawTextQuery } from './raw-text-retrieval.js';
import type { DatasetItem, ModelProfile } from './types.js';

interface RetrievalMemory extends RawTextMemory { type: 'memory' }
interface RetrievalQuery extends RawTextQuery { type: 'query' }
type RetrievalItem = RetrievalMemory | RetrievalQuery;

interface ExtractionEvidence {
  id: string;
  kind: 'memory' | 'query';
  language: string;
  text: string;
  rawOutput: string;
  rawRequest?: unknown;
  rawResponse?: unknown;
  valid: boolean;
  abstained: boolean;
  error?: string;
}

function sha256Text(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function git(root: string, args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function cleanTree(root: string): boolean {
  try { execFileSync('git', ['diff', '--quiet'], { cwd: root, stdio: 'ignore' }); execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: root, stdio: 'ignore' }); return true; }
  catch { return false; }
}
function tokens(text: string): string[] { return text.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? []; }

/** A transparent lexical baseline over the exact same raw memory/query inputs. */
function lexicalBaseline(input: { query: Omit<RawTextQuery, 'expectedMemoryIds'>; memories: RawTextMemory[]; topK: number }): string[] {
  const queryTokens = new Set(tokens(input.query.text));
  const scored = input.memories.map((memory) => {
    const memoryTokens = tokens(memory.text);
    const score = memoryTokens.filter((token) => queryTokens.has(token)).length;
    return { id: memory.id, score };
  });
  return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, input.topK).map((item) => item.id);
}

async function loadItems(root: string, datasetPath: string): Promise<RetrievalItem[]> {
  const lines = (await readFile(path.join(root, datasetPath), 'utf8')).split(/\r?\n/u).filter((line) => line.trim());
  return lines.map((line) => JSON.parse(line) as RetrievalItem);
}

export async function runStage2LiveRetrieval(): Promise<string> {
  const root = await findWorkspaceRoot();
  const datasetPath = 'datasets/dev/stage2-retrieval-v1.jsonl';
  const profilePath = 'profiles/models/superqwen3.8-27b-abliterated-live.json';
  const items = await loadItems(root, datasetPath);
  const memories = items.filter((item): item is RetrievalMemory => item.type === 'memory');
  const queries = items.filter((item): item is RetrievalQuery => item.type === 'query');
  const profile = await readJson<ModelProfile>(path.join(root, profilePath));
  validateProfile(profile);
  const semSchema = await readJson<Record<string, unknown>>(path.join(root, 'schemas/lunum-sem.schema.json'));
  const extractionSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://openlunum.org/schemas/semantic-extraction-result/0.1',
    oneOf: [semSchema, { type: 'object', additionalProperties: false, required: ['status', 'reason'], properties: { status: { const: 'abstain' }, reason: { type: 'string', minLength: 1 } } }]
  };
  const schemaSha256 = sha256Text(JSON.stringify(extractionSchema));
  const model = new OpenAICompatibleModel(profile);
  const advertised = await model.doctor() as { data?: Array<{ id?: string }> };
  const advertisedModelIds = (advertised.data ?? []).flatMap((entry) => typeof entry.id === 'string' ? [entry.id] : []);
  const extractionEvidence: ExtractionEvidence[] = [];
  const cache = new Map<string, LunumSem | null>();
  const extract = async (input: { id: string; text: string; language: string; kind: 'memory' | 'query' }): Promise<LunumSem | null> => {
    const cacheKey = `${input.kind}:${input.id}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
    const promptItem: DatasetItem = { id: input.id, sourceLanguage: input.language, sourceText: input.text, goldSem: {} as LunumSem };
    const prompt = parsePrompt(promptItem);
    const evidence: ExtractionEvidence = { id: input.id, kind: input.kind, language: input.language, text: input.text, rawOutput: '', valid: false, abstained: false };
    try {
      const completion = await model.complete(prompt.system, prompt.user, { structuredOutput: { mode: 'json_schema', schema: extractionSchema, strict: true, fallback: 'json_object' } });
      evidence.rawOutput = completion.content;
      evidence.rawRequest = completion.rawRequest;
      evidence.rawResponse = completion.rawResponse;
      const parsed = extractStructuredJson(completion.content) as Record<string, unknown>;
      if (parsed.status === 'abstain') { evidence.abstained = true; evidence.valid = true; cache.set(cacheKey, null); extractionEvidence.push(evidence); return null; }
      const validation = validateSem(parsed);
      if (!validation.ok) throw new Error(validation.errors.join('; '));
      evidence.valid = true;
      const sem = parsed as unknown as LunumSem;
      cache.set(cacheKey, sem);
      extractionEvidence.push(evidence);
      return sem;
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error);
      extractionEvidence.push(evidence);
      cache.set(cacheKey, null);
      return null;
    }
  };
  const startedAt = new Date().toISOString();
  const report = await runRawTextRetrievalEvaluation({ memories, queries, extract, threshold: 0.8, topK: 3, baselines: { lexical: lexicalBaseline } });
  const output = path.join(root, 'reports/experiments/retrieval-stage2-superqwen', new Date().toISOString().replace(/[:.]/gu, '-'));
  await mkdir(output, { recursive: true });
  const datasetSha256 = await sha256File(path.join(root, datasetPath));
  const promptProbe = parsePrompt({ id: 'probe', sourceLanguage: 'en', sourceText: 'probe', goldSem: {} as LunumSem });
  await writeJson(path.join(output, 'retrieval-report.json'), report);
  await writeJson(path.join(output, 'environment.json'), {
    inputMode: 'raw-text-only',
    modelProfile: profile,
    modelIdentity: { requestedModel: profile.model, reportedModelId: advertisedModelIds.includes(profile.model) ? profile.model : null, advertisedModelIds, verified: advertisedModelIds.includes(profile.model), endpoint: profile.baseUrl, modelFileIdentity: profile.metadata?.modelFile ?? null },
    provenance: { startedAt, completedAt: new Date().toISOString(), codeCommit: git(root, ['rev-parse', 'HEAD']), workingTreeClean: cleanTree(root), datasetPath, datasetSha256, promptVersion: 'parse-prompt/3', effectiveSystemPromptSha256: sha256Text(effectiveSystemPrompt(profile, promptProbe.system)), schemaVersion: 'semantic-extraction-result/0.1', schemaSha256, structuredOutputMode: 'json-schema', decoding: { temperature: profile.temperature, seed: profile.seed ?? null, maxTokens: profile.maxTokens, chatTemplateKwargs: profile.chatTemplateKwargs ?? null }, modelId: profile.model }
  });
  await writeJson(path.join(output, 'raw-extractions.json'), extractionEvidence);
  await appendFile(path.join(output, 'README.md'), `# Stage 2 raw-text retrieval\n\nRaw memories and raw queries only; no gold Sem is sent to the extractor. The evaluator uses gold IDs only for scoring.\n\nEmbedding baseline: NOT RUN (no embedding endpoint was available without changing the loaded model).\n`);
  return output;
}

if (process.argv[1]?.endsWith('stage2-live-retrieval.js')) console.log(await runStage2LiveRetrieval());
