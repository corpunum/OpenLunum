/**
 * Reclassify every cross-language OMW development pair from recorded provider
 * evidence. This is diagnostic only: it never consults gold semantics beyond
 * the independently defined pair relationship already recorded in the input.
 */
import { readFile, writeFile } from 'node:fs/promises';

const inputPath = process.env.OMW_INPUT ?? 'reports/experiments/codex-agent-development-20260906/real-omw-grounding.json';
const outputPath = process.env.OMW_FAILURE_OUTPUT ?? 'reports/experiments/codex-agent-development-20260906/omw-failure-decomposition.json';
const report = JSON.parse(await readFile(inputPath, 'utf8'));
const cases = report.cases.filter((item) => item.category === 'cross-language-translation');

function status(item, side) { return side === 'source' ? item.leftStatus : item.rightStatus; }
function candidates(item, side) { return side === 'source' ? item.sourceCandidates : item.targetCandidates; }
function category(item) {
  const sourceStatus = status(item, 'source');
  const targetStatus = status(item, 'target');
  const sourceCandidates = candidates(item, 'source');
  const targetCandidates = candidates(item, 'target');
  if (sourceStatus === 'resolved_exact' && targetStatus === 'resolved_exact') {
    return item.left === item.right ? 'BOTH_RESOLVED_SAME_CILI' : 'RESOLVED_DIFFERENT_CILI';
  }
  if (sourceStatus === 'provider_error' || targetStatus === 'provider_error') return 'OTHER_EXPLAINED';
  if (sourceStatus === 'ambiguous' && targetStatus === 'ambiguous') return 'BOTH_AMBIGUOUS';
  if (sourceStatus === 'ambiguous') return 'SOURCE_AMBIGUOUS';
  if (targetStatus === 'ambiguous') return 'TARGET_AMBIGUOUS';
  if (sourceStatus === 'unresolved' && targetStatus === 'unresolved') return 'BOTH_UNRESOLVED';
  if (sourceStatus === 'unresolved') return 'SOURCE_UNRESOLVED';
  if (targetStatus === 'unresolved') return 'TARGET_UNRESOLVED';
  if (sourceCandidates.length > 0 && targetCandidates.length > 0 && !sourceCandidates.some((id) => targetCandidates.includes(id))) return 'SENSE_GRANULARITY_MISMATCH';
  return 'TRULY_UNKNOWN';
}

function increment(table, key, categoryName) {
  const bucket = table[key] ??= {};
  bucket[categoryName] = (bucket[categoryName] ?? 0) + 1;
}
function coverage(items) {
  return {
    total: items.length,
    sourceLexemeCovered: items.filter((item) => item.sourceCandidates.length > 0).length,
    targetLexemeCovered: items.filter((item) => item.targetCandidates.length > 0).length,
    bothLexemesCovered: items.filter((item) => item.sourceCandidates.length > 0 && item.targetCandidates.length > 0).length,
    sharedCandidateSet: items.filter((item) => item.sourceCandidates.some((id) => item.targetCandidates.includes(id))).length,
    sourceMonosemous: items.filter((item) => item.sourceCandidates.length === 1).length,
    targetMonosemous: items.filter((item) => item.targetCandidates.length === 1).length,
    bothMonosemous: items.filter((item) => item.sourceCandidates.length === 1 && item.targetCandidates.length === 1).length,
    exactConvergence: items.filter((item) => item.converged === true).length,
  };
}

const byPair = {};
const byPos = {};
const byResource = {};
const decomposed = cases.map((item) => {
  const failureCategory = category(item);
  increment(byPair, item.pair, failureCategory);
  increment(byPos, item.pos ?? 'unknown', failureCategory);
  increment(byResource, item.pair === 'en-de' ? 'omw-en+odenet' : 'omw-data', failureCategory);
  return {
    pair: item.pair,
    pos: item.pos ?? null,
    sourceLemma: item.sourceLemma,
    targetLemma: item.targetLemma,
    sourceStatus: item.leftStatus,
    targetStatus: item.rightStatus,
    sourceCandidates: item.sourceCandidates,
    targetCandidates: item.targetCandidates,
    selectedSource: item.left,
    selectedTarget: item.right,
    failureCategory,
    converged: item.converged === true,
  };
});

const categoryCounts = {};
for (const item of decomposed) categoryCounts[item.failureCategory] = (categoryCounts[item.failureCategory] ?? 0) + 1;
const output = {
  type: 'development-omw-cross-language-failure-decomposition',
  version: 1,
  status: 'diagnostic',
  inputPath,
  sourceDataset: report.source,
  total: decomposed.length,
  categoryCounts,
  coverage: coverage(cases),
  byPair,
  byPos,
  byResource,
  cases: decomposed,
  interpretation: 'Provider-status categories describe lookup outcomes, not independent semantic accuracy. Candidate-set overlap is coverage evidence; exact convergence is only safe when the remaining sense is uniquely justified.',
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ total: output.total, categoryCounts, coverage: output.coverage }, null, 2));
