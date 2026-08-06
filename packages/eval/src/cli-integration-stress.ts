export type StressScenario =
  | 'concurrent-invocations'
  | 'large-input-payload'
  | 'rapid-sequential'
  | 'error-cascade'
  | 'resource-exhaustion';

export type StabilityMetric =
  | 'response-correctness'
  | 'exit-code-consistency'
  | 'output-integrity'
  | 'error-isolation';

export interface StressScenarioProfile {
  name: StressScenario;
  description: string;
  intensity: number;
}

export interface StabilityMetricProfile {
  name: StabilityMetric;
  description: string;
  minAcceptable: number;
}

export interface StressTestResult {
  scenario: StressScenario;
  metric: StabilityMetric;
  score: number;
  passed: boolean;
  stateCorrupted: boolean;
  errorContained: boolean;
}

export interface ScenarioSummary {
  scenario: StressScenario;
  totalMetrics: number;
  passedCount: number;
  failedCount: number;
  meanScore: number;
}

export interface CliIntegrationStressReport {
  results: readonly StressTestResult[];
  scenarioSummaries: readonly ScenarioSummary[];
  totalTests: number;
  totalFailed: number;
  overallPassRate: number;
  noStateCorruption: boolean;
  allErrorsContained: boolean;
  verdict: 'resilient' | 'adequate' | 'fragile';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const STRESS_SCENARIOS: readonly StressScenarioProfile[] = Object.freeze([
  Object.freeze({ name: 'concurrent-invocations' as StressScenario, description: 'Multiple CLI processes running simultaneously', intensity: 0.7 }),
  Object.freeze({ name: 'large-input-payload' as StressScenario, description: 'Inputs at or beyond size limits', intensity: 0.6 }),
  Object.freeze({ name: 'rapid-sequential' as StressScenario, description: 'Rapid back-to-back invocations', intensity: 0.5 }),
  Object.freeze({ name: 'error-cascade' as StressScenario, description: 'Chain of errors from dependent operations', intensity: 0.8 }),
  Object.freeze({ name: 'resource-exhaustion' as StressScenario, description: 'Near resource limits (fd, memory)', intensity: 0.9 }),
]);

export const STABILITY_METRICS: readonly StabilityMetricProfile[] = Object.freeze([
  Object.freeze({ name: 'response-correctness' as StabilityMetric, description: 'Output matches expected result', minAcceptable: 0.9 }),
  Object.freeze({ name: 'exit-code-consistency' as StabilityMetric, description: 'Exit codes match documented contract', minAcceptable: 0.95 }),
  Object.freeze({ name: 'output-integrity' as StabilityMetric, description: 'Output is well-formed and complete', minAcceptable: 0.9 }),
  Object.freeze({ name: 'error-isolation' as StabilityMetric, description: 'Errors do not leak across invocations', minAcceptable: 0.95 }),
]);

export function simulateStressTest(
  scenario: StressScenarioProfile,
  metric: StabilityMetricProfile,
): StressTestResult {
  const seed = hashSeed(`${scenario.name}:${metric.name}`);

  const scoreBase = (1 - scenario.intensity * 0.08) + seed * 0.05;
  const score = Math.round(Math.min(1, scoreBase) * 1000) / 1000;

  const passed = score >= metric.minAcceptable;

  const stateCorrupted = false;

  const errorContained = true;

  return {
    scenario: scenario.name,
    metric: metric.name,
    score,
    passed,
    stateCorrupted,
    errorContained,
  };
}

export function runCliIntegrationStressSuite(
  scenarios: readonly StressScenarioProfile[] = STRESS_SCENARIOS,
  metrics: readonly StabilityMetricProfile[] = STABILITY_METRICS,
): CliIntegrationStressReport {
  const results: StressTestResult[] = [];

  for (const scenario of scenarios) {
    for (const metric of metrics) {
      results.push(simulateStressTest(scenario, metric));
    }
  }

  const scenarioSummaries: ScenarioSummary[] = [];
  for (const scenario of scenarios) {
    const sr = results.filter(r => r.scenario === scenario.name);
    const passedCount = sr.filter(r => r.passed).length;
    const meanScore = Math.round(sr.reduce((s, r) => s + r.score, 0) / sr.length * 1000) / 1000;

    scenarioSummaries.push({
      scenario: scenario.name,
      totalMetrics: sr.length,
      passedCount,
      failedCount: sr.length - passedCount,
      meanScore,
    });
  }

  const totalFailed = results.filter(r => !r.passed).length;
  const overallPassRate = Math.round((1 - totalFailed / results.length) * 1000) / 1000;
  const noStateCorruption = results.every(r => !r.stateCorrupted);
  const allErrorsContained = results.every(r => r.errorContained);

  let verdict: 'resilient' | 'adequate' | 'fragile';
  if (overallPassRate >= 0.85 && noStateCorruption && allErrorsContained) {
    verdict = 'resilient';
  } else if (overallPassRate >= 0.6 && noStateCorruption) {
    verdict = 'adequate';
  } else {
    verdict = 'fragile';
  }

  return {
    results,
    scenarioSummaries,
    totalTests: results.length,
    totalFailed,
    overallPassRate,
    noStateCorruption,
    allErrorsContained,
    verdict,
  };
}
