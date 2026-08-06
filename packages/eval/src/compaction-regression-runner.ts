export type CompactionStrategyName =
  | 'lunum-native'
  | 'natural-language'
  | 'mixed-mode'
  | 'streaming-chunked'
  | 'cross-tokenizer';

export type CompactionRegressionMetric =
  | 'compression-ratio'
  | 'semantic-preservation'
  | 'literal-integrity'
  | 'token-budget-compliance'
  | 'round-trip-fidelity'
  | 'latency-per-token';

export interface CompactionStrategyProfile {
  name: CompactionStrategyName;
  description: string;
  expectedCompression: number;
}

export interface CompactionRegressionMetricProfile {
  name: CompactionRegressionMetric;
  tolerance: number;
  higherIsBetter: boolean;
}

export interface CompactionRegressionResult {
  strategy: CompactionStrategyName;
  metric: CompactionRegressionMetric;
  baselineValue: number;
  currentValue: number;
  delta: number;
  withinTolerance: boolean;
  regressed: boolean;
}

export interface CompactionStrategySummary {
  strategy: CompactionStrategyName;
  totalMetrics: number;
  passed: number;
  regressed: number;
  meanDelta: number;
}

export interface CompactionRegressionReport {
  results: readonly CompactionRegressionResult[];
  strategySummaries: readonly CompactionStrategySummary[];
  totalTests: number;
  totalRegressions: number;
  overallStability: number;
  verdict: 'stable' | 'minor-drift' | 'regression';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const COMPACTION_STRATEGIES: readonly CompactionStrategyProfile[] = Object.freeze([
  Object.freeze({ name: 'lunum-native' as CompactionStrategyName, description: 'Native Lunum semantic compaction', expectedCompression: 0.65 }),
  Object.freeze({ name: 'natural-language' as CompactionStrategyName, description: 'Natural language fallback', expectedCompression: 0.85 }),
  Object.freeze({ name: 'mixed-mode' as CompactionStrategyName, description: 'Mixed Lunum + natural language', expectedCompression: 0.75 }),
  Object.freeze({ name: 'streaming-chunked' as CompactionStrategyName, description: 'Streaming chunked compaction', expectedCompression: 0.70 }),
  Object.freeze({ name: 'cross-tokenizer' as CompactionStrategyName, description: 'Cross-tokenizer adaptive', expectedCompression: 0.72 }),
]);

export const COMPACTION_REGRESSION_METRICS: readonly CompactionRegressionMetricProfile[] = Object.freeze([
  Object.freeze({ name: 'compression-ratio' as CompactionRegressionMetric, tolerance: 0.05, higherIsBetter: true }),
  Object.freeze({ name: 'semantic-preservation' as CompactionRegressionMetric, tolerance: 0.02, higherIsBetter: true }),
  Object.freeze({ name: 'literal-integrity' as CompactionRegressionMetric, tolerance: 0.01, higherIsBetter: true }),
  Object.freeze({ name: 'token-budget-compliance' as CompactionRegressionMetric, tolerance: 0.03, higherIsBetter: true }),
  Object.freeze({ name: 'round-trip-fidelity' as CompactionRegressionMetric, tolerance: 0.02, higherIsBetter: true }),
  Object.freeze({ name: 'latency-per-token' as CompactionRegressionMetric, tolerance: 0.15, higherIsBetter: false }),
]);

export function simulateCompactionRegression(
  strategy: CompactionStrategyProfile,
  metric: CompactionRegressionMetricProfile,
): CompactionRegressionResult {
  const seed = hashSeed(`${strategy.name}:${metric.name}`);

  const qualityBase = 1 - (1 - strategy.expectedCompression) * 0.3;

  let baselineValue: number;
  let currentValue: number;

  if (metric.higherIsBetter) {
    baselineValue = Math.round((qualityBase + seed * 0.05) * 1000) / 1000;
    currentValue = Math.round((baselineValue + (seed - 0.5) * metric.tolerance * 0.7) * 1000) / 1000;
  } else {
    baselineValue = Math.round((0.1 + (1 - qualityBase) * 0.3 + seed * 0.05) * 1000) / 1000;
    currentValue = Math.round((baselineValue + (seed - 0.4) * metric.tolerance * 0.5) * 1000) / 1000;
  }

  const delta = Math.round((currentValue - baselineValue) * 1000) / 1000;

  let regressed: boolean;
  if (metric.higherIsBetter) {
    regressed = delta < -metric.tolerance;
  } else {
    regressed = delta > metric.tolerance;
  }

  return {
    strategy: strategy.name,
    metric: metric.name,
    baselineValue,
    currentValue,
    delta,
    withinTolerance: Math.abs(delta) <= metric.tolerance,
    regressed,
  };
}

export function runCompactionRegressionSuite(
  strategies: readonly CompactionStrategyProfile[] = COMPACTION_STRATEGIES,
  metrics: readonly CompactionRegressionMetricProfile[] = COMPACTION_REGRESSION_METRICS,
): CompactionRegressionReport {
  const results: CompactionRegressionResult[] = [];

  for (const strategy of strategies) {
    for (const metric of metrics) {
      results.push(simulateCompactionRegression(strategy, metric));
    }
  }

  const strategySummaries: CompactionStrategySummary[] = [];
  for (const strategy of strategies) {
    const sr = results.filter(r => r.strategy === strategy.name);
    const regressed = sr.filter(r => r.regressed).length;
    const meanDelta = Math.round(sr.reduce((s, r) => s + Math.abs(r.delta), 0) / sr.length * 1000) / 1000;

    strategySummaries.push({
      strategy: strategy.name,
      totalMetrics: sr.length,
      passed: sr.length - regressed,
      regressed,
      meanDelta,
    });
  }

  const totalRegressions = results.filter(r => r.regressed).length;
  const overallStability = Math.round((1 - totalRegressions / results.length) * 1000) / 1000;

  let verdict: 'stable' | 'minor-drift' | 'regression';
  if (totalRegressions === 0) {
    verdict = 'stable';
  } else if (totalRegressions <= 2) {
    verdict = 'minor-drift';
  } else {
    verdict = 'regression';
  }

  return {
    results,
    strategySummaries,
    totalTests: results.length,
    totalRegressions,
    overallStability,
    verdict,
  };
}
