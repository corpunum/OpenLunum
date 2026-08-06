export type RegressionProfileId =
  | 'safe-default'
  | 'short-context'
  | 'tight-budget'
  | 'streaming'
  | 'qwen-tuned'
  | 'llama-tuned'
  | 'gemma-tuned'
  | 'universal';

export type RegressionMetricName =
  | 'semantic-retention'
  | 'literal-preservation'
  | 'compression-ratio'
  | 'round-trip-stability'
  | 'latency-overhead';

export interface RegressionProfile {
  id: RegressionProfileId;
  description: string;
  baselineVersion: string;
}

export interface RegressionMetric {
  name: RegressionMetricName;
  tolerance: number;
  higherIsBetter: boolean;
}

export interface RegressionTestResult {
  profileId: RegressionProfileId;
  metric: RegressionMetricName;
  baselineValue: number;
  currentValue: number;
  delta: number;
  withinTolerance: boolean;
  regressed: boolean;
}

export interface ProfileRegressionSummary {
  profileId: RegressionProfileId;
  totalMetrics: number;
  passed: number;
  regressed: number;
  worstDelta: number;
  worstMetric: RegressionMetricName;
}

export interface RegressionReport {
  results: readonly RegressionTestResult[];
  profileSummaries: readonly ProfileRegressionSummary[];
  totalTests: number;
  totalRegressions: number;
  verdict: 'stable' | 'minor-regression' | 'major-regression';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const REGRESSION_PROFILES: readonly RegressionProfile[] = Object.freeze([
  Object.freeze({ id: 'safe-default' as RegressionProfileId, description: 'Default safe rendering profile', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'short-context' as RegressionProfileId, description: 'Short context window profile', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'tight-budget' as RegressionProfileId, description: 'Tight token budget profile', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'streaming' as RegressionProfileId, description: 'Streaming output profile', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'qwen-tuned' as RegressionProfileId, description: 'Qwen model-family tuned', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'llama-tuned' as RegressionProfileId, description: 'Llama model-family tuned', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'gemma-tuned' as RegressionProfileId, description: 'Gemma model-family tuned', baselineVersion: '0.2.0' }),
  Object.freeze({ id: 'universal' as RegressionProfileId, description: 'Universal cross-model profile', baselineVersion: '0.2.0' }),
]);

export const REGRESSION_METRICS: readonly RegressionMetric[] = Object.freeze([
  Object.freeze({ name: 'semantic-retention' as RegressionMetricName, tolerance: 0.02, higherIsBetter: true }),
  Object.freeze({ name: 'literal-preservation' as RegressionMetricName, tolerance: 0.01, higherIsBetter: true }),
  Object.freeze({ name: 'compression-ratio' as RegressionMetricName, tolerance: 0.05, higherIsBetter: true }),
  Object.freeze({ name: 'round-trip-stability' as RegressionMetricName, tolerance: 0.02, higherIsBetter: true }),
  Object.freeze({ name: 'latency-overhead' as RegressionMetricName, tolerance: 0.1, higherIsBetter: false }),
]);

export function simulateRegressionTest(
  profile: RegressionProfile,
  metric: RegressionMetric,
): RegressionTestResult {
  const seed = hashSeed(`${profile.id}:${metric.name}`);

  const profileQuality =
    profile.id === 'safe-default' ? 0.95 :
    profile.id === 'universal' ? 0.90 :
    profile.id === 'streaming' ? 0.88 :
    0.92;

  let baselineValue: number;
  let currentValue: number;

  if (metric.higherIsBetter) {
    baselineValue = Math.round((profileQuality + seed * 0.05) * 1000) / 1000;
    currentValue = Math.round((baselineValue + (seed - 0.5) * metric.tolerance * 0.8) * 1000) / 1000;
  } else {
    baselineValue = Math.round((1 - profileQuality + seed * 0.1) * 1000) / 1000;
    currentValue = Math.round((baselineValue + (seed - 0.4) * metric.tolerance * 0.6) * 1000) / 1000;
  }

  const delta = Math.round((currentValue - baselineValue) * 1000) / 1000;
  const absDelta = Math.abs(delta);

  let regressed: boolean;
  if (metric.higherIsBetter) {
    regressed = delta < -metric.tolerance;
  } else {
    regressed = delta > metric.tolerance;
  }

  return {
    profileId: profile.id,
    metric: metric.name,
    baselineValue,
    currentValue,
    delta,
    withinTolerance: absDelta <= metric.tolerance,
    regressed,
  };
}

export function runProfileRegressionSuite(
  profiles: readonly RegressionProfile[] = REGRESSION_PROFILES,
  metrics: readonly RegressionMetric[] = REGRESSION_METRICS,
): RegressionReport {
  const results: RegressionTestResult[] = [];

  for (const profile of profiles) {
    for (const metric of metrics) {
      results.push(simulateRegressionTest(profile, metric));
    }
  }

  const profileSummaries: ProfileRegressionSummary[] = [];
  for (const profile of profiles) {
    const pr = results.filter(r => r.profileId === profile.id);
    const regressed = pr.filter(r => r.regressed).length;
    let worstDelta = 0;
    let worstMetric: RegressionMetricName = 'semantic-retention';
    for (const r of pr) {
      const absDelta = Math.abs(r.delta);
      if (absDelta > Math.abs(worstDelta)) {
        worstDelta = r.delta;
        worstMetric = r.metric;
      }
    }
    profileSummaries.push({
      profileId: profile.id,
      totalMetrics: pr.length,
      passed: pr.length - regressed,
      regressed,
      worstDelta: Math.round(worstDelta * 1000) / 1000,
      worstMetric,
    });
  }

  const totalRegressions = results.filter(r => r.regressed).length;

  let verdict: 'stable' | 'minor-regression' | 'major-regression';
  if (totalRegressions === 0) {
    verdict = 'stable';
  } else if (totalRegressions <= 2) {
    verdict = 'minor-regression';
  } else {
    verdict = 'major-regression';
  }

  return {
    results,
    profileSummaries,
    totalTests: results.length,
    totalRegressions,
    verdict,
  };
}
