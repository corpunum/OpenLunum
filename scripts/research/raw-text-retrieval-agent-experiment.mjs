/**
 * Development-only raw-text retrieval experiment.
 *
 * The candidate ledger is produced outside this script by an agent reading
 * only the raw text. This harness never receives gold Sem, expected IDs, or a
 * model endpoint. It validates candidate records through the existing
 * evaluator boundary and writes only to the requested development report.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { findWorkspaceRoot, sha256File } from '../../packages/eval/dist/src/io.js';
import { runRawTextRetrievalEvaluation } from '../../packages/eval/dist/src/raw-text-retrieval.js';
import { normalizeSemanticCandidate, validateSemanticCandidate } from '../../packages/core/dist/src/index.js';

const root = await findWorkspaceRoot();
const datasetPath = 'datasets/dev/stage2-retrieval-v1.jsonl';
const candidatePath = 'reports/experiments/codex-agent-development-20260906/agent-extracted-retrieval-candidates.jsonl';
const reportDir = 'reports/experiments/codex-agent-development-20260906';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function tokens(text) { return text.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? []; }
function lexicalBaseline({ query, memories, topK }) {
  const queryTokens = new Set(tokens(query.text));
  return memories.map((memory) => ({
    id: memory.id,
    score: tokens(memory.text).filter((token) => queryTokens.has(token)).length
  })).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK).map((item) => item.id);
}
async function jsonl(file) {
  return (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL at ${file}:${index + 1}: ${error.message}`); }
  });
}

const dataset = await jsonl(path.join(root, datasetPath));
const candidates = await jsonl(path.join(root, candidatePath));
const forbidden = ['goldSem', 'expectedMemoryIds', 'semanticEquivalentMemoryIds'];
const leakage = candidates.flatMap((candidate) => forbidden.filter((field) => Object.hasOwn(candidate, field)).map((field) => `${candidate.id ?? '<missing-id>'}:${field}`));
if (leakage.length) throw new Error(`Candidate ledger contains scoring or gold fields: ${leakage.join(', ')}`);

const candidateById = new Map();
for (const candidate of candidates) {
  if (typeof candidate.id !== 'string' || !candidate.id) throw new Error('Every candidate needs a non-empty id');
  if (candidateById.has(candidate.id)) throw new Error(`Duplicate candidate id: ${candidate.id}`);
  if (candidate.status === 'abstain') { candidateById.set(candidate.id, null); continue; }
  if (!candidate.sem || typeof candidate.sem !== 'object') throw new Error(`Candidate ${candidate.id} needs sem or status=abstain`);
  const structural = validateSemanticCandidate(candidate.sem);
  if (!structural.ok) throw new Error(`Candidate ${candidate.id} invalid: ${structural.errors.join('; ')}`);
  const normalized = normalizeSemanticCandidate(candidate.sem);
  if (!normalized.sem || !normalized.canonical) throw new Error(`Candidate ${candidate.id} is not canonical: ${normalized.issues.map((issue) => issue.message).join('; ')}`);
  candidateById.set(candidate.id, normalized.sem);
}

const memories = dataset.filter((item) => item.type === 'memory');
const queries = dataset.filter((item) => item.type === 'query');
const extract = async ({ id }) => candidateById.get(id) ?? null;
const evaluation = await runRawTextRetrievalEvaluation({ memories, queries, extract, threshold: 0.8, topK: 3, baselines: { lexical: lexicalBaseline } });
const output = {
  type: 'codex-agent-development-raw-text-retrieval',
  version: 1,
  status: 'diagnostic',
  protected: false,
  localInferenceUsed: false,
  embeddingUsed: false,
  extractor: { kind: 'agent-produced-candidate-ledger', input: 'raw text plus language only', candidatePath, candidateSha256: await sha256File(path.join(root, candidatePath)), candidateCount: candidates.length, acceptedCandidates: [...candidateById.values()].filter(Boolean).length },
  dataset: { path: datasetPath, sha256: await sha256File(path.join(root, datasetPath)), memoryCount: memories.length, queryCount: queries.length },
  evaluator: { implementation: 'packages/eval/src/raw-text-retrieval.ts', inputMode: evaluation.inputMode, threshold: evaluation.threshold, topK: evaluation.topK },
  metrics: evaluation.metrics,
  baselines: evaluation.baselines,
  queryResults: evaluation.queryResults,
  interpretation: 'Development evidence only. Candidate coverage, conditional retrieval, and lexical comparison do not qualify raw-text retrieval for production or protected evaluation.'
};
await mkdir(path.join(root, reportDir), { recursive: true });
await writeFile(path.join(root, reportDir, 'raw-text-retrieval-agent-experiment.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ metrics: output.metrics, baselines: output.baselines, candidateCount: candidates.length }, null, 2));
