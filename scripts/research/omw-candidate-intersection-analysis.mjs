/**
 * Development-only analysis of explicit translation-pair candidate-set
 * narrowing. The pair relation is the benchmark's judged translation
 * relation; this does not claim that either isolated lexical lookup is exact.
 */
import { readFile, writeFile } from 'node:fs/promises';

const inputPath = 'reports/experiments/codex-agent-development-20260906/real-omw-grounding.json';
const outputPath = 'reports/experiments/codex-agent-development-20260906/omw-candidate-intersection-analysis.json';
const report = JSON.parse(await readFile(inputPath, 'utf8'));
const cases = report.cases.filter((item) => item.category === 'cross-language-translation');
const byPair = {};
function intersectRecordedCandidates(item) {
  const shared = item.sourceCandidates.filter((id) => item.targetCandidates.includes(id));
  return [...new Set(shared)].sort((a, b) => a.localeCompare(b, 'en'));
}
for (const item of cases) {
  // This is a report-only set calculation over recorded evidence. It must not
  // call the core intersection API: recorded JSON is not authenticated provider
  // capability and must never enter an identity/materialization path.
  const candidates = intersectRecordedCandidates(item);
  const result = { status: candidates.length === 1 ? 'candidate_narrowed' : candidates.length > 1 ? 'ambiguous' : 'unresolved', candidates };
  const bucket = byPair[item.pair] ?? { total: 0, candidateNarrowed: 0, ambiguous: 0, unresolved: 0, candidateSizes: {}, independentExact: 0, narrowedFromAmbiguous: 0 };
  bucket.total++;
  bucket[result.status === 'candidate_narrowed' ? 'candidateNarrowed' : result.status]++;
  bucket.candidateSizes[result.candidates.length] = (bucket.candidateSizes[result.candidates.length] ?? 0) + 1;
  if (item.leftStatus === 'resolved_exact' && item.rightStatus === 'resolved_exact' && item.left === item.right) bucket.independentExact++;
  if (result.status === 'candidate_narrowed' && (item.leftStatus !== 'resolved_exact' || item.rightStatus !== 'resolved_exact')) bucket.narrowedFromAmbiguous++;
  byPair[item.pair] = bucket;
}
const all = Object.values(byPair).reduce((acc, bucket) => { for (const key of ['total', 'candidateNarrowed', 'ambiguous', 'unresolved', 'independentExact', 'narrowedFromAmbiguous']) acc[key] += bucket[key]; return acc; }, { total: 0, candidateNarrowed: 0, ambiguous: 0, unresolved: 0, independentExact: 0, narrowedFromAmbiguous: 0 });
const output = { type: 'development-omw-candidate-intersection-analysis', version: 1, status: 'diagnostic', inputPath, relation: 'same-translation', byPair, aggregate: all, interpretation: 'Intersection is an explicitly relation-conditioned narrowing operation. A singleton is not evidence that an isolated observation can be safely resolved; the translation relation must be independently justified.' };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
