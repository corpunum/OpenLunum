/**
 * Development-only retrieval replay for the source-only grounding ladder.
 *
 * The candidate ledger is the output of the isolated extraction agent. Gold is
 * used only by this harness to define relevance; it is never supplied to the
 * extractor callback. This is diagnostic evidence, not a capability claim.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { runRawTextRetrievalEvaluation } from '../../packages/eval/dist/src/raw-text-retrieval.js';

const corpusPath = 'experiments/development-grounding-ladder-20260906/corpus.json';
const candidatePath = 'experiments/development-grounding-ladder-20260906/candidate-ledger.json';
const outputPath = 'experiments/development-grounding-ladder-20260906/retrieval-results.json';
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const candidates = JSON.parse(await readFile(candidatePath, 'utf8')).items;
const memories = [];
const queries = [];
for (const group of corpus.groups) {
  for (const memory of group.rows) {
    memories.push({ id: memory.id, text: memory.sourceText, language: memory.sourceLanguage });
  }
  for (const [index, row] of group.rows.entries()) {
    const memory = group.rows[(index + 1) % group.rows.length];
    queries.push({
      id: row.id,
      text: row.sourceText,
      language: row.sourceLanguage,
      targetLanguage: memory.sourceLanguage,
      expectedMemoryIds: [memory.id],
      semanticEquivalentMemoryIds: [memory.id],
    });
  }
}
const candidateById = new Map(Object.entries(candidates));
const extract = async ({ id }) => candidateById.get(id) ?? null;
const tokens = (text) => text.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? [];
const lexical = ({ query, memories: pool, topK }) => {
  const queryTokens = new Set(tokens(query.text));
  return pool.map((memory) => ({ id: memory.id, score: tokens(memory.text).filter((token) => queryTokens.has(token)).length }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, topK).map((item) => item.id);
};
const report = await runRawTextRetrievalEvaluation({ memories, queries, extract, mode: 'exact', topK: 1, baselines: { lexical } });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const output = {
  type: 'openlunum-development-agent-retrieval',
  version: '2026-09-06',
  status: 'diagnostic-development-only',
  protected: false,
  localInferenceUsed: false,
  sourceCorpus: { path: corpusPath, sha256: sha256(JSON.stringify(corpus)) },
  candidateLedger: { path: candidatePath, sha256: sha256(JSON.stringify(candidates)), sourceOnly: true },
  dataset: { memoryCount: memories.length, queryCount: queries.length, targetRouting: 'each query targets the next language row in its semantic group' },
  evaluator: { mode: report.mode, threshold: report.threshold, topK: report.topK, inputMode: report.inputMode },
  metrics: report.metrics,
  baselines: report.baselines,
  queryResults: report.queryResults,
  interpretation: 'Development replay only. Repeated candidate identities from one source-only ledger do not establish generalization; no gold Sem entered extraction.',
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, metrics: report.metrics, baselines: report.baselines }, null, 2));
