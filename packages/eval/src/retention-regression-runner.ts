export type RetentionStrategy =
  | 'exact-match'
  | 'feature-recall'
  | 'semantic-similarity'
  | 'role-preservation'
  | 'literal-integrity';

export type RetentionQualityMetric =
  | 'preservation-rate'
  | 'drift-magnitude'
  | 'stability-score'
  | 'degradation-rate'
  | 'recovery-potential'
  | 'cross-language-parity';

export interface RetentionStrategyProfile {
  name: RetentionStrategy;
  description: string;
  baselinePreservation: number;
}

export interface RetentionQualityMetricProfile {
  name: RetentionQualityMetric;
  description: string;
  threshold: number;
}

export interface RetentionRegressionResult {
  strategy: RetentionStrategy;
  metric: RetentionQualityMetric;
  score: number;
  passed: boolean;
  delta: number;
  preservationBounded: boolean;
}

export interface RetentionStrategySummary {
  strategy: RetentionStrategy;
  totalMetrics: number;
  passedCount: number;
  failedCount: number;
  meanScore: number;
  maxDrift: number;
}

export interface RetentionRegressionReport {
  results: readonly RetentionRegressionResult[];
  strategySummaries: readonly RetentionStrategySummary[];
  totalTests: number;
  totalFailed: number;
  overallPreservation: number;
  allBounded: boolean;
  verdict: 'stable' | 'degrading' | 'unstable';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const RETENTION_STRATEGIES: readonly RetentionStrategyProfile[] = Object.freeze([
  Object.freeze({ name: 'exact-match' as RetentionStrategy, description: 'Byte-identical round-trip preservation', baselinePreservation: 0.95 }),
  Object.freeze({ name: 'feature-recall' as RetentionStrategy, description: 'Feature-level recall after realization and parse-back', baselinePreservation: 0.92 }),
  Object.freeze({ name: 'semantic-similarity' as RetentionStrategy, description: 'Semantic similarity score after round-trip', baselinePreservation: 0.90 }),
  Object.freeze({ name: 'role-preservation' as RetentionStrategy, description: 'Role identity preserved through round-trip', baselinePreservation: 0.93 }),
  Object.freeze({ name: 'literal-integrity' as RetentionStrategy, description: 'Protected literals survive round-trip unchanged', baselinePreservation: 0.96 }),
]);

export const RETENTION_QUALITY_METRICS: readonly RetentionQualityMetricProfile[] = Object.freeze([
  Object.freeze({ name: 'preservation-rate' as RetentionQualityMetric, description: 'Fraction of records preserved', threshold: 0.85 }),
  Object.freeze({ name: 'drift-magnitude' as RetentionQualityMetric, description: 'Maximum observed drift from baseline', threshold: 0.10 }),
  Object.freeze({ name: 'stability-score' as RetentionQualityMetric, description: 'Stability across repeated passes', threshold: 0.80 }),
  Object.freeze({ name: 'degradation-rate' as RetentionQualityMetric, description: 'Rate of quality degradation per pass', threshold: 0.05 }),
  Object.freeze({ name: 'recovery-potential' as RetentionQualityMetric, description: 'Ability to recover from degraded state', threshold: 0.70 }),
  Object.freeze({ name: 'cross-language-parity' as RetentionQualityMetric, description: 'Consistency across languages', threshold: 0.80 }),
]);

export function simulateRetentionRegression(
  strategy: RetentionStrategyProfile,
  metric: RetentionQualityMetricProfile,
): RetentionRegressionResult {
  const seed = hashSeed(`${strategy.name}:${metric.name}`);

  const scoreBase = strategy.baselinePreservation * (0.95 + seed * 0.08);
  const score = Math.round(Math.min(1, scoreBase) * 1000) / 1000;

  const delta = Math.round((score - strategy.baselinePreservation) * 1000) / 1000;

  const passed = score >= metric.threshold;

  const preservationBounded = Math.abs(delta) <= 0.15;

  return {
    strategy: strategy.name,
    metric: metric.name,
    score,
    passed,
    delta,
    preservationBounded,
  };
}

export function runRetentionRegressionSuite(
  strategies: readonly RetentionStrategyProfile[] = RETENTION_STRATEGIES,
  metrics: readonly RetentionQualityMetricProfile[] = RETENTION_QUALITY_METRICS,
): RetentionRegressionReport {
  const results: RetentionRegressionResult[] = [];

  for (const strategy of strategies) {
    for (const metric of metrics) {
      results.push(simulateRetentionRegression(strategy, metric));
    }
  }

  const strategySummaries: RetentionStrategySummary[] = [];
  for (const strategy of strategies) {
    const sr = results.filter(r => r.strategy === strategy.name);
    const passedCount = sr.filter(r => r.passed).length;
    const meanScore = Math.round(sr.reduce((s, r) => s + r.score, 0) / sr.length * 1000) / 1000;
    const maxDrift = Math.round(Math.max(...sr.map(r => Math.abs(r.delta))) * 1000) / 1000;

    strategySummaries.push({
      strategy: strategy.name,
      totalMetrics: sr.length,
      passedCount,
      failedCount: sr.length - passedCount,
      meanScore,
      maxDrift,
    });
  }

  const totalFailed = results.filter(r => !r.passed).length;
  const overallPreservation = Math.round((1 - totalFailed / results.length) * 1000) / 1000;
  const allBounded = results.every(r => r.preservationBounded);

  let verdict: 'stable' | 'degrading' | 'unstable';
  if (overallPreservation >= 0.85 && allBounded) {
    verdict = 'stable';
  } else if (overallPreservation >= 0.6) {
    verdict = 'degrading';
  } else {
    verdict = 'unstable';
  }

  return {
    results,
    strategySummaries,
    totalTests: results.length,
    totalFailed,
    overallPreservation,
    allBounded,
    verdict,
  };
}
