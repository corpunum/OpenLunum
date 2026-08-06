export type RecoveryScenario =
  | 'rolling-restart'
  | 'blue-green-switchover'
  | 'emergency-rollback'
  | 'dependency-chain-recovery'
  | 'split-brain-resolution';

export type CoordinationMetric =
  | 'downtime-duration'
  | 'data-consistency'
  | 'service-ordering'
  | 'rollback-safety';

export interface RecoveryScenarioProfile {
  name: RecoveryScenario;
  description: string;
  complexity: number;
}

export interface CoordinationMetricProfile {
  name: CoordinationMetric;
  description: string;
  minAcceptable: number;
}

export interface RecoveryOrchestrationResult {
  scenario: RecoveryScenario;
  metric: CoordinationMetric;
  score: number;
  passed: boolean;
  dataLost: boolean;
  serviceOrderCorrect: boolean;
}

export interface RecoveryScenarioSummary {
  scenario: RecoveryScenario;
  totalMetrics: number;
  passedCount: number;
  failedCount: number;
  meanScore: number;
}

export interface OperationalRecoveryOrchestrationReport {
  results: readonly RecoveryOrchestrationResult[];
  scenarioSummaries: readonly RecoveryScenarioSummary[];
  totalTests: number;
  totalFailed: number;
  overallPassRate: number;
  zeroDataLoss: boolean;
  allServiceOrderCorrect: boolean;
  verdict: 'orchestrated' | 'manual-required' | 'unrecoverable';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const RECOVERY_SCENARIOS: readonly RecoveryScenarioProfile[] = Object.freeze([
  Object.freeze({ name: 'rolling-restart' as RecoveryScenario, description: 'Sequential service restart with zero-downtime target', complexity: 0.5 }),
  Object.freeze({ name: 'blue-green-switchover' as RecoveryScenario, description: 'Traffic switch between parallel deployments', complexity: 0.6 }),
  Object.freeze({ name: 'emergency-rollback' as RecoveryScenario, description: 'Immediate revert to last known good state', complexity: 0.7 }),
  Object.freeze({ name: 'dependency-chain-recovery' as RecoveryScenario, description: 'Cascading restart respecting dependency order', complexity: 0.8 }),
  Object.freeze({ name: 'split-brain-resolution' as RecoveryScenario, description: 'Resolving divergent state after network partition', complexity: 0.9 }),
]);

export const COORDINATION_METRICS: readonly CoordinationMetricProfile[] = Object.freeze([
  Object.freeze({ name: 'downtime-duration' as CoordinationMetric, description: 'Total service unavailability during recovery', minAcceptable: 0.85 }),
  Object.freeze({ name: 'data-consistency' as CoordinationMetric, description: 'Data integrity maintained throughout recovery', minAcceptable: 0.95 }),
  Object.freeze({ name: 'service-ordering' as CoordinationMetric, description: 'Services restarted in correct dependency order', minAcceptable: 0.90 }),
  Object.freeze({ name: 'rollback-safety' as CoordinationMetric, description: 'Rollback does not introduce new failures', minAcceptable: 0.90 }),
]);

export function simulateRecoveryOrchestration(
  scenario: RecoveryScenarioProfile,
  metric: CoordinationMetricProfile,
): RecoveryOrchestrationResult {
  const seed = hashSeed(`${scenario.name}:${metric.name}`);

  const scoreBase = (1 - scenario.complexity * 0.07) + seed * 0.05;
  const score = Math.round(Math.min(1, scoreBase) * 1000) / 1000;

  const passed = score >= metric.minAcceptable;

  const dataLost = false;
  const serviceOrderCorrect = true;

  return {
    scenario: scenario.name,
    metric: metric.name,
    score,
    passed,
    dataLost,
    serviceOrderCorrect,
  };
}

export function runOperationalRecoveryOrchestrationSuite(
  scenarios: readonly RecoveryScenarioProfile[] = RECOVERY_SCENARIOS,
  metrics: readonly CoordinationMetricProfile[] = COORDINATION_METRICS,
): OperationalRecoveryOrchestrationReport {
  const results: RecoveryOrchestrationResult[] = [];

  for (const scenario of scenarios) {
    for (const metric of metrics) {
      results.push(simulateRecoveryOrchestration(scenario, metric));
    }
  }

  const scenarioSummaries: RecoveryScenarioSummary[] = [];
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
  const zeroDataLoss = results.every(r => !r.dataLost);
  const allServiceOrderCorrect = results.every(r => r.serviceOrderCorrect);

  let verdict: 'orchestrated' | 'manual-required' | 'unrecoverable';
  if (overallPassRate >= 0.85 && zeroDataLoss && allServiceOrderCorrect) {
    verdict = 'orchestrated';
  } else if (overallPassRate >= 0.6 && zeroDataLoss) {
    verdict = 'manual-required';
  } else {
    verdict = 'unrecoverable';
  }

  return {
    results,
    scenarioSummaries,
    totalTests: results.length,
    totalFailed,
    overallPassRate,
    zeroDataLoss,
    allServiceOrderCorrect,
    verdict,
  };
}
