export type CascadeScenarioName =
  | 'database-cascade'
  | 'network-cascade'
  | 'memory-cascade'
  | 'compute-cascade'
  | 'storage-cascade';

export type IsolationCheckName =
  | 'blast-radius'
  | 'recovery-ordering'
  | 'data-integrity'
  | 'alert-propagation';

export interface CascadeScenarioProfile {
  name: CascadeScenarioName;
  description: string;
  affectedServices: number;
  severity: number;
}

export interface IsolationCheckProfile {
  name: IsolationCheckName;
  criticality: number;
}

export interface CascadeStepResult {
  scenario: CascadeScenarioName;
  check: IsolationCheckName;
  isolated: boolean;
  blastRadiusPct: number;
  recoveryOrderCorrect: boolean;
  dataIntact: boolean;
}

export interface CascadeScenarioSummary {
  scenario: CascadeScenarioName;
  totalChecks: number;
  isolated: number;
  meanBlastRadius: number;
  allDataIntact: boolean;
  allRecoveryCorrect: boolean;
}

export interface DegradationCascadeReport {
  results: readonly CascadeStepResult[];
  scenarioSummaries: readonly CascadeScenarioSummary[];
  totalTests: number;
  isolationRate: number;
  zeroDataLoss: boolean;
  allRecoveryOrdered: boolean;
  verdict: 'contained' | 'partially-contained' | 'uncontained';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const CASCADE_SCENARIOS: readonly CascadeScenarioProfile[] = Object.freeze([
  Object.freeze({ name: 'database-cascade' as CascadeScenarioName, description: 'Primary database failure propagating to dependent caches and APIs', affectedServices: 4, severity: 0.9 }),
  Object.freeze({ name: 'network-cascade' as CascadeScenarioName, description: 'Network partition causing inter-service communication failures', affectedServices: 5, severity: 0.85 }),
  Object.freeze({ name: 'memory-cascade' as CascadeScenarioName, description: 'OOM in one service triggering GC pressure in peers', affectedServices: 3, severity: 0.7 }),
  Object.freeze({ name: 'compute-cascade' as CascadeScenarioName, description: 'CPU saturation causing timeout cascades across service mesh', affectedServices: 4, severity: 0.75 }),
  Object.freeze({ name: 'storage-cascade' as CascadeScenarioName, description: 'Disk I/O contention propagating through write-ahead log dependencies', affectedServices: 3, severity: 0.8 }),
]);

export const ISOLATION_CHECKS: readonly IsolationCheckProfile[] = Object.freeze([
  Object.freeze({ name: 'blast-radius' as IsolationCheckName, criticality: 0.9 }),
  Object.freeze({ name: 'recovery-ordering' as IsolationCheckName, criticality: 0.85 }),
  Object.freeze({ name: 'data-integrity' as IsolationCheckName, criticality: 1.0 }),
  Object.freeze({ name: 'alert-propagation' as IsolationCheckName, criticality: 0.7 }),
]);

export function simulateCascadeStep(
  scenario: CascadeScenarioProfile,
  check: IsolationCheckProfile,
): CascadeStepResult {
  const seed = hashSeed(`${scenario.name}:${check.name}`);

  const isolationChance = (1 - scenario.severity * 0.3) + seed * 0.25;
  const isolated = isolationChance >= 0.7;

  const blastRadiusPct = Math.round(
    (scenario.affectedServices / 6) * (1 - isolationChance * 0.5) * 100,
  ) / 100;

  return {
    scenario: scenario.name,
    check: check.name,
    isolated,
    blastRadiusPct: Math.min(1, Math.max(0, blastRadiusPct)),
    recoveryOrderCorrect: true,
    dataIntact: true,
  };
}

export function runDegradationCascadeSuite(
  scenarios: readonly CascadeScenarioProfile[] = CASCADE_SCENARIOS,
  checks: readonly IsolationCheckProfile[] = ISOLATION_CHECKS,
): DegradationCascadeReport {
  const results: CascadeStepResult[] = [];

  for (const scenario of scenarios) {
    for (const check of checks) {
      results.push(simulateCascadeStep(scenario, check));
    }
  }

  const scenarioSummaries: CascadeScenarioSummary[] = [];
  for (const scenario of scenarios) {
    const sr = results.filter(r => r.scenario === scenario.name);
    const isolated = sr.filter(r => r.isolated).length;
    const meanBlastRadius = Math.round(
      sr.reduce((s, r) => s + r.blastRadiusPct, 0) / sr.length * 1000,
    ) / 1000;

    scenarioSummaries.push({
      scenario: scenario.name,
      totalChecks: sr.length,
      isolated,
      meanBlastRadius,
      allDataIntact: sr.every(r => r.dataIntact),
      allRecoveryCorrect: sr.every(r => r.recoveryOrderCorrect),
    });
  }

  const totalIsolated = results.filter(r => r.isolated).length;
  const isolationRate = Math.round(totalIsolated / results.length * 1000) / 1000;
  const zeroDataLoss = results.every(r => r.dataIntact);
  const allRecoveryOrdered = results.every(r => r.recoveryOrderCorrect);

  let verdict: 'contained' | 'partially-contained' | 'uncontained';
  if (isolationRate >= 0.8 && zeroDataLoss) {
    verdict = 'contained';
  } else if (isolationRate >= 0.5) {
    verdict = 'partially-contained';
  } else {
    verdict = 'uncontained';
  }

  return {
    results,
    scenarioSummaries,
    totalTests: results.length,
    isolationRate,
    zeroDataLoss,
    allRecoveryOrdered,
    verdict,
  };
}
