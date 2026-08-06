export type FailoverScenarioName =
  | 'primary-down'
  | 'network-partition'
  | 'disk-failure'
  | 'memory-exhaustion'
  | 'process-crash'
  | 'config-corruption';

export type FailoverOutcome =
  | 'automatic-recovery'
  | 'manual-intervention'
  | 'degraded-operation'
  | 'total-failure';

export interface FailoverScenarioProfile {
  name: FailoverScenarioName;
  description: string;
  severity: number;
  expectedRecoveryMs: number;
}

export interface FailoverTestResult {
  scenario: FailoverScenarioName;
  outcome: FailoverOutcome;
  recoveryTimeMs: number;
  dataLoss: boolean;
  serviceAvailable: boolean;
  alertFired: boolean;
}

export interface FailoverScenarioSummary {
  scenario: FailoverScenarioName;
  attempts: number;
  autoRecovered: number;
  meanRecoveryMs: number;
  noDataLoss: boolean;
  allAlertsFired: boolean;
}

export interface OperationalFailoverReport {
  results: readonly FailoverTestResult[];
  scenarioSummaries: readonly FailoverScenarioSummary[];
  totalTests: number;
  autoRecoveryRate: number;
  meanRecoveryMs: number;
  zeroDataLoss: boolean;
  verdict: 'resilient' | 'adequate' | 'vulnerable';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const FAILOVER_SCENARIOS: readonly FailoverScenarioProfile[] = Object.freeze([
  Object.freeze({ name: 'primary-down' as FailoverScenarioName, description: 'Primary service becomes unavailable', severity: 0.9, expectedRecoveryMs: 5000 }),
  Object.freeze({ name: 'network-partition' as FailoverScenarioName, description: 'Network split between components', severity: 0.8, expectedRecoveryMs: 10000 }),
  Object.freeze({ name: 'disk-failure' as FailoverScenarioName, description: 'Storage device becomes unresponsive', severity: 0.95, expectedRecoveryMs: 30000 }),
  Object.freeze({ name: 'memory-exhaustion' as FailoverScenarioName, description: 'OOM condition triggered', severity: 0.7, expectedRecoveryMs: 8000 }),
  Object.freeze({ name: 'process-crash' as FailoverScenarioName, description: 'Unexpected process termination', severity: 0.6, expectedRecoveryMs: 3000 }),
  Object.freeze({ name: 'config-corruption' as FailoverScenarioName, description: 'Configuration file corruption detected', severity: 0.5, expectedRecoveryMs: 15000 }),
]);

export function simulateFailoverTest(
  scenario: FailoverScenarioProfile,
  attemptIndex: number,
): FailoverTestResult {
  const seed = hashSeed(`${scenario.name}:${attemptIndex}`);

  const recoveryChance = (1 - scenario.severity * 0.3) + seed * 0.2;

  let outcome: FailoverOutcome;
  if (recoveryChance >= 0.85) {
    outcome = 'automatic-recovery';
  } else if (recoveryChance >= 0.7) {
    outcome = 'degraded-operation';
  } else if (recoveryChance >= 0.5) {
    outcome = 'manual-intervention';
  } else {
    outcome = 'total-failure';
  }

  const recoveryTimeMs = Math.round(
    scenario.expectedRecoveryMs * (0.5 + seed * 1.0) *
    (outcome === 'automatic-recovery' ? 1 : outcome === 'degraded-operation' ? 1.5 : 3),
  );

  return {
    scenario: scenario.name,
    outcome,
    recoveryTimeMs,
    dataLoss: false,
    serviceAvailable: outcome === 'automatic-recovery' || outcome === 'degraded-operation',
    alertFired: true,
  };
}

export function runOperationalFailoverSuite(
  scenarios: readonly FailoverScenarioProfile[] = FAILOVER_SCENARIOS,
  attemptsPerScenario: number = 3,
): OperationalFailoverReport {
  const results: FailoverTestResult[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < attemptsPerScenario; i++) {
      results.push(simulateFailoverTest(scenario, i));
    }
  }

  const scenarioSummaries: FailoverScenarioSummary[] = [];
  for (const scenario of scenarios) {
    const sr = results.filter(r => r.scenario === scenario.name);
    const autoRecovered = sr.filter(r => r.outcome === 'automatic-recovery').length;
    const meanRecoveryMs = Math.round(sr.reduce((s, r) => s + r.recoveryTimeMs, 0) / sr.length);

    scenarioSummaries.push({
      scenario: scenario.name,
      attempts: sr.length,
      autoRecovered,
      meanRecoveryMs,
      noDataLoss: sr.every(r => !r.dataLoss),
      allAlertsFired: sr.every(r => r.alertFired),
    });
  }

  const autoRecovered = results.filter(r => r.outcome === 'automatic-recovery').length;
  const autoRecoveryRate = Math.round(autoRecovered / results.length * 1000) / 1000;
  const meanRecoveryMs = Math.round(results.reduce((s, r) => s + r.recoveryTimeMs, 0) / results.length);
  const zeroDataLoss = results.every(r => !r.dataLoss);

  let verdict: 'resilient' | 'adequate' | 'vulnerable';
  if (autoRecoveryRate >= 0.8 && zeroDataLoss) {
    verdict = 'resilient';
  } else if (autoRecoveryRate >= 0.5) {
    verdict = 'adequate';
  } else {
    verdict = 'vulnerable';
  }

  return {
    results,
    scenarioSummaries,
    totalTests: results.length,
    autoRecoveryRate,
    meanRecoveryMs,
    zeroDataLoss,
    verdict,
  };
}
