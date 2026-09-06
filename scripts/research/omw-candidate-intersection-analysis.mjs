/**
 * Development-only analysis of explicit translation-pair candidate-set
 * narrowing. The pair relation is the benchmark's judged translation
 * relation; this does not claim that either isolated lexical lookup is exact.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { intersectGroundingCandidateSets } from '../../packages/core/dist/src/grounding-provider.js';

const inputPath = 'reports/experiments/codex-agent-development-20260906/real-omw-grounding.json';
const outputPath = 'reports/experiments/codex-agent-development-20260906/omw-candidate-intersection-analysis.json';
const report = JSON.parse(await readFile(inputPath, 'utf8'));
const cases = report.cases.filter((item) => item.category === 'cross-language-translation');
const byPair = {};
for (const item of cases) {
  const left = { status: item.leftStatus, provider: `omw:${item.pair.split('-')[0]}`, providerVersion: 'omw-data/v2.0+cili/v1.0', snapshotHash: '0'.repeat(64), language: item.pair.split('-')[0], candidates: item.sourceCandidates.map((externalId) => ({ externalId, evidence: [`source:${item.sourceLemma}`] })), diagnostics: [] };
  const right = { status: item.rightStatus, provider: `omw:${item.pair.split('-')[1]}`, providerVersion: 'omw-data/v2.0+cili/v1.0', snapshotHash: '0'.repeat(64), language: item.pair.split('-')[1], candidates: item.targetCandidates.map((externalId) => ({ externalId, evidence: [`source:${item.targetLemma}`] })), diagnostics: [] };
  const result = intersectGroundingCandidateSets([left, right], { relation: 'same-translation' });
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
