export type RetrievalWorkloadName =
  | 'single-language-small'
  | 'single-language-large'
  | 'cross-language-small'
  | 'cross-language-large'
  | 'mixed-script-medium';

export type LatencyTier = 'fast' | 'acceptable' | 'slow' | 'timeout';

export interface RetrievalWorkloadProfile {
  readonly name: RetrievalWorkloadName;
  readonly description: string;
  readonly corpusSize: number;
  readonly queryCount: number;
  readonly crossLingual: boolean;
  readonly p99BoundMs: number;
}

export interface RetrievalPerformanceResult {
  readonly workload: RetrievalWorkloadName;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly withinBound: boolean;
  readonly tier: LatencyTier;
  readonly throughputQps: number;
}

export interface WorkloadPerformanceSummary {
  readonly workload: RetrievalWorkloadName;
  readonly runs: number;
  readonly meanP99Ms: number;
  readonly withinBoundRate: number;
  readonly meanThroughputQps: number;
  readonly tier: LatencyTier;
}

export interface RetrievalPerformanceReport {
  readonly results: readonly RetrievalPerformanceResult[];
  readonly workloadSummaries: readonly WorkloadPerformanceSummary[];
  readonly totalTests: number;
  readonly overallWithinBoundRate: number;
  readonly meanThroughputQps: number;
  readonly verdict: 'performant' | 'marginal' | 'underperforming';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const RETRIEVAL_WORKLOADS: readonly RetrievalWorkloadProfile[] = Object.freeze([
  Object.freeze({ name: 'single-language-small' as RetrievalWorkloadName, description: 'Single-language retrieval on small corpus', corpusSize: 1000, queryCount: 50, crossLingual: false, p99BoundMs: 100 }),
  Object.freeze({ name: 'single-language-large' as RetrievalWorkloadName, description: 'Single-language retrieval on large corpus', corpusSize: 100000, queryCount: 50, crossLingual: false, p99BoundMs: 500 }),
  Object.freeze({ name: 'cross-language-small' as RetrievalWorkloadName, description: 'Cross-language retrieval on small corpus', corpusSize: 1000, queryCount: 30, crossLingual: true, p99BoundMs: 200 }),
  Object.freeze({ name: 'cross-language-large' as RetrievalWorkloadName, description: 'Cross-language retrieval on large corpus', corpusSize: 100000, queryCount: 30, crossLingual: true, p99BoundMs: 1000 }),
  Object.freeze({ name: 'mixed-script-medium' as RetrievalWorkloadName, description: 'Mixed-script retrieval on medium corpus', corpusSize: 10000, queryCount: 40, crossLingual: true, p99BoundMs: 300 }),
]);

function classifyTier(p99Ms: number, boundMs: number): LatencyTier {
  if (p99Ms <= boundMs * 0.5) return 'fast';
  if (p99Ms <= boundMs) return 'acceptable';
  if (p99Ms <= boundMs * 2) return 'slow';
  return 'timeout';
}

export function simulateRetrievalPerformance(
  workload: RetrievalWorkloadProfile,
  runIndex: number,
): RetrievalPerformanceResult {
  const seed = hashSeed(`${workload.name}:${runIndex}`);

  const corpusFactor = Math.log10(workload.corpusSize) / 5;
  const crossPenalty = workload.crossLingual ? 1.3 : 1.0;

  const baseLatency = workload.p99BoundMs * 0.3;
  const p50Ms = Math.round(baseLatency * (0.5 + seed * 0.3) * crossPenalty);
  const p95Ms = Math.round(baseLatency * (1.2 + seed * 0.5) * crossPenalty * corpusFactor);
  const p99Ms = Math.round(baseLatency * (1.5 + seed * 0.8) * crossPenalty * corpusFactor);

  const withinBound = p99Ms <= workload.p99BoundMs;
  const tier = classifyTier(p99Ms, workload.p99BoundMs);

  const throughputQps = Math.round(
    workload.queryCount / (p99Ms / 1000) * (0.8 + seed * 0.4) * 10,
  ) / 10;

  return {
    workload: workload.name,
    p50Ms,
    p95Ms,
    p99Ms,
    withinBound,
    tier,
    throughputQps,
  };
}

export function runRetrievalPerformanceSuite(
  workloads: readonly RetrievalWorkloadProfile[] = RETRIEVAL_WORKLOADS,
  runsPerWorkload: number = 5,
): RetrievalPerformanceReport {
  const results: RetrievalPerformanceResult[] = [];

  for (const workload of workloads) {
    for (let i = 0; i < runsPerWorkload; i++) {
      results.push(simulateRetrievalPerformance(workload, i));
    }
  }

  const workloadSummaries: WorkloadPerformanceSummary[] = [];
  for (const workload of workloads) {
    const wr = results.filter(r => r.workload === workload.name);
    const meanP99Ms = Math.round(wr.reduce((s, r) => s + r.p99Ms, 0) / wr.length);
    const withinBoundRate = Math.round(
      wr.filter(r => r.withinBound).length / wr.length * 1000,
    ) / 1000;
    const meanThroughputQps = Math.round(
      wr.reduce((s, r) => s + r.throughputQps, 0) / wr.length * 10,
    ) / 10;

    workloadSummaries.push({
      workload: workload.name,
      runs: wr.length,
      meanP99Ms,
      withinBoundRate,
      meanThroughputQps,
      tier: classifyTier(meanP99Ms, workload.p99BoundMs),
    });
  }

  const withinBoundCount = results.filter(r => r.withinBound).length;
  const overallWithinBoundRate = Math.round(withinBoundCount / results.length * 1000) / 1000;
  const meanThroughputQps = Math.round(
    results.reduce((s, r) => s + r.throughputQps, 0) / results.length * 10,
  ) / 10;

  let verdict: 'performant' | 'marginal' | 'underperforming';
  if (overallWithinBoundRate >= 0.9) {
    verdict = 'performant';
  } else if (overallWithinBoundRate >= 0.6) {
    verdict = 'marginal';
  } else {
    verdict = 'underperforming';
  }

  return {
    results,
    workloadSummaries,
    totalTests: results.length,
    overallWithinBoundRate,
    meanThroughputQps,
    verdict,
  };
}
