import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableStringify, validateSemanticCandidate } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, readJson, sha256File, writeJson, validateProfile } from './io.js';
import { effectiveSystemPrompt, ModelResponseError, OpenAICompatibleModel } from './model.js';
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
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'packages/core/src', 'packages/core/test', 'packages/eval/src', 'packages/eval/test', 'packages/eval/package.json', 'schemas/model-profile.schema.json', 'profiles/models/superqwen3.8-27b-abliterated-live.json', 'datasets/dev/stage2-heldout-v1.jsonl', 'datasets/dev/stage2-heldout-v2.jsonl', 'datasets/dev/stage2-retrieval-v1.jsonl', 'datasets/adversarial/critical-semantic-differences-v1.jsonl', 'datasets/manifests/stage2-heldout-v1.json', 'datasets/manifests/stage2-heldout-v2.json', 'datasets/manifests/stage2-retrieval-v1.json', 'datasets/manifests/critical-semantic-differences-v1.json', 'experiments/parse-stage2-superqwen-diagnostic/experiment.json', 'experiments/parse-stage2-superqwen-frozen/experiment.json'], { cwd: root, encoding: 'utf8' });
    return status.trim().length === 0;
  }
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
  const { $defs: semDefs, $schema: _semSchema, $id: _semId, title: _semTitle, ...semBranch } = semSchema;
  const extractionSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://openlunum.org/schemas/semantic-extraction-result/0.1',
    title: 'OpenLunum semantic extraction result',
    oneOf: [semBranch, { type: 'object', additionalProperties: false, required: ['status', 'reason'], properties: { status: { const: 'abstain' }, reason: { type: 'string', minLength: 1 } } }],
    $defs: semDefs
  };
  const schemaSha256 = sha256Text(stableStringify(extractionSchema));
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
      const validation = validateSemanticCandidate(parsed);
      if (!validation.ok) throw new Error(validation.errors.join('; '));
      evidence.valid = true;
      const sem = parsed as unknown as LunumSem;
      cache.set(cacheKey, sem);
      extractionEvidence.push(evidence);
      return sem;
    } catch (error) {
      if (error instanceof ModelResponseError) {
        evidence.rawRequest = error.rawRequest;
        evidence.rawResponse = error.rawResponse;
      }
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
  await writeJson(path.join(output, 'summary.json'), report);
  const codeCommit = git(root, ['rev-parse', 'HEAD']);
  const provenance = { startedAt, completedAt: new Date().toISOString(), codeCommit, workingTreeClean: cleanTree(root), datasetPath, datasetSha256, promptVersion: 'parse-prompt/3', effectiveSystemPromptSha256: sha256Text(effectiveSystemPrompt(profile, promptProbe.system)), schemaVersion: 'semantic-extraction-result/0.1', schemaSha256, structuredOutputMode: 'json-schema', decoding: { temperature: profile.temperature, seed: profile.seed ?? null, maxTokens: profile.maxTokens, chatTemplateKwargs: profile.chatTemplateKwargs ?? null }, modelId: profile.model };
  await writeJson(path.join(output, 'environment.json'), {
    inputMode: 'raw-text-only',
    codeCommit,
    modelProfile: profile,
    modelIdentity: { requestedModel: profile.model, reportedModelId: advertisedModelIds.includes(profile.model) ? profile.model : null, advertisedModelIds, verified: advertisedModelIds.includes(profile.model), endpoint: profile.baseUrl, modelFileIdentity: profile.metadata?.modelFile ?? null },
    prompt: { version: 'parse-prompt/3', systemSha256: provenance.effectiveSystemPromptSha256 },
    decoding: { ...provenance.decoding, structuredOutputMode: provenance.structuredOutputMode },
    provenance
  });
  await writeJson(path.join(output, 'raw-extractions.json'), extractionEvidence);
  await mkdir(path.join(output, 'raw'), { recursive: true });
  await writeFile(path.join(output, 'raw', 'items.jsonl'), extractionEvidence.map((item) => JSON.stringify({ id: item.id, status: item.valid ? 'passed' : 'failed', rawOutput: item.rawOutput, rawRequest: item.rawRequest, rawResponse: item.rawResponse, error: item.error })).join('\n') + '\n', 'utf8');
  await writeJson(path.join(output, 'manifest.snapshot.json'), { schema: 'openlunum-experiment/0.1', id: 'retrieval-stage2-superqwen', area: 'retrieval', task: 'retrieval', hypothesis: 'Raw multilingual semantic retrieval is useful only if extraction errors are visible and critical negatives fail closed.', baselineCommit: codeCommit, dataset: { path: datasetPath, sha256: datasetSha256 }, modelProfile: profilePath, limits: { maxItems: items.length, maxAttemptsPerItem: 1, maxModelCalls: items.length }, gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false }, outputDirectory: 'reports/experiments/retrieval-stage2-superqwen' });
  await appendFile(path.join(output, 'README.md'), `# Stage 2 raw-text retrieval\n\nRaw memories and raw queries only; no gold Sem is sent to the extractor. The evaluator uses gold IDs only for scoring.\n\nEmbedding baseline: NOT RUN (no embedding endpoint was available without changing the loaded model).\n`);
  return output;
}

if (process.argv[1]?.endsWith('stage2-live-retrieval.js')) console.log(await runStage2LiveRetrieval());
