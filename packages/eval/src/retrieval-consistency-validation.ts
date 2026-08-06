export type QueryReformulation =
  | 'synonym-substitution'
  | 'passive-voice'
  | 'clause-reordering'
  | 'abstraction-level'
  | 'language-switch';

export type ConsistencyMetric =
  | 'rank-stability'
  | 'score-variance'
  | 'top-k-overlap'
  | 'reciprocal-rank-delta';

export interface ReformulationProfile {
  name: QueryReformulation;
  description: string;
  expectedDrift: number;
}

export interface ConsistencyMetricProfile {
  name: ConsistencyMetric;
  description: string;
  tolerance: number;
}

export interface ConsistencyResult {
  reformulation: QueryReformulation;
  metric: ConsistencyMetric;
  originalScore: number;
  reformulatedScore: number;
  delta: number;
  withinTolerance: boolean;
  rankPreserved: boolean;
}

export interface ReformulationSummary {
  reformulation: QueryReformulation;
  totalMetrics: number;
  consistentCount: number;
  inconsistentCount: number;
  meanDelta: number;
}

export interface RetrievalConsistencyReport {
  results: readonly ConsistencyResult[];
  reformulationSummaries: readonly ReformulationSummary[];
  totalTests: number;
  totalInconsistent: number;
  overallConsistency: number;
  allRanksPreserved: boolean;
  verdict: 'consistent' | 'mostly-consistent' | 'inconsistent';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const QUERY_REFORMULATIONS: readonly ReformulationProfile[] = Object.freeze([
  Object.freeze({ name: 'synonym-substitution' as QueryReformulation, description: 'Replace key terms with synonyms', expectedDrift: 0.05 }),
  Object.freeze({ name: 'passive-voice' as QueryReformulation, description: 'Convert active to passive voice', expectedDrift: 0.03 }),
  Object.freeze({ name: 'clause-reordering' as QueryReformulation, description: 'Reorder clauses without changing meaning', expectedDrift: 0.04 }),
  Object.freeze({ name: 'abstraction-level' as QueryReformulation, description: 'Change specificity level', expectedDrift: 0.08 }),
  Object.freeze({ name: 'language-switch' as QueryReformulation, description: 'Translate query to another language', expectedDrift: 0.12 }),
]);

export const CONSISTENCY_METRICS: readonly ConsistencyMetricProfile[] = Object.freeze([
  Object.freeze({ name: 'rank-stability' as ConsistencyMetric, description: 'Top result rank unchanged', tolerance: 0.1 }),
  Object.freeze({ name: 'score-variance' as ConsistencyMetric, description: 'Score within variance bounds', tolerance: 0.08 }),
  Object.freeze({ name: 'top-k-overlap' as ConsistencyMetric, description: 'Top-K result set overlap', tolerance: 0.15 }),
  Object.freeze({ name: 'reciprocal-rank-delta' as ConsistencyMetric, description: 'MRR change within bounds', tolerance: 0.05 }),
]);

export function simulateConsistencyTest(
  reformulation: ReformulationProfile,
  metric: ConsistencyMetricProfile,
): ConsistencyResult {
  const seed = hashSeed(`${reformulation.name}:${metric.name}`);

  const originalScore = Math.round((0.8 + seed * 0.15) * 1000) / 1000;

  const drift = (seed - 0.45) * reformulation.expectedDrift * 0.7;
  const reformulatedScore = Math.round((originalScore + drift) * 1000) / 1000;

  const delta = Math.round((reformulatedScore - originalScore) * 1000) / 1000;

  const withinTolerance = Math.abs(delta) <= metric.tolerance;

  const rankPreserved = Math.abs(delta) <= reformulation.expectedDrift;

  return {
    reformulation: reformulation.name,
    metric: metric.name,
    originalScore,
    reformulatedScore,
    delta,
    withinTolerance,
    rankPreserved,
  };
}

export function runRetrievalConsistencySuite(
  reformulations: readonly ReformulationProfile[] = QUERY_REFORMULATIONS,
  metrics: readonly ConsistencyMetricProfile[] = CONSISTENCY_METRICS,
): RetrievalConsistencyReport {
  const results: ConsistencyResult[] = [];

  for (const reformulation of reformulations) {
    for (const metric of metrics) {
      results.push(simulateConsistencyTest(reformulation, metric));
    }
  }

  const reformulationSummaries: ReformulationSummary[] = [];
  for (const reformulation of reformulations) {
    const rr = results.filter(r => r.reformulation === reformulation.name);
    const consistentCount = rr.filter(r => r.withinTolerance).length;
    const deltas = rr.map(r => Math.abs(r.delta));
    const meanDelta = Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length * 1000) / 1000;

    reformulationSummaries.push({
      reformulation: reformulation.name,
      totalMetrics: rr.length,
      consistentCount,
      inconsistentCount: rr.length - consistentCount,
      meanDelta,
    });
  }

  const totalInconsistent = results.filter(r => !r.withinTolerance).length;
  const overallConsistency = Math.round((1 - totalInconsistent / results.length) * 1000) / 1000;
  const allRanksPreserved = results.every(r => r.rankPreserved);

  let verdict: 'consistent' | 'mostly-consistent' | 'inconsistent';
  if (overallConsistency >= 0.85 && allRanksPreserved) {
    verdict = 'consistent';
  } else if (overallConsistency >= 0.6) {
    verdict = 'mostly-consistent';
  } else {
    verdict = 'inconsistent';
  }

  return {
    results,
    reformulationSummaries,
    totalTests: results.length,
    totalInconsistent,
    overallConsistency,
    allRanksPreserved,
    verdict,
  };
}
