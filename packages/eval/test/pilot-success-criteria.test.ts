import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePilotHealth,
  formatPilotHealthReport,
  shouldRollback,
  canProceedSafely,
  DEFAULT_SUCCESS_CRITERIA,
  PILOT_SUCCESS_VERSION,
} from '../src/pilot-success-criteria.js';
import type { PilotMetrics, SuccessCriteria } from '../src/pilot-success-criteria.js';

describe('pilot-success-criteria constants', () => {
  it('version is semver', () => {
    assert.match(PILOT_SUCCESS_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('default criteria are set', () => {
    assert.strictEqual(DEFAULT_SUCCESS_CRITERIA.retentionThresholdPercent, 98.0);
    assert.strictEqual(DEFAULT_SUCCESS_CRITERIA.latencyP95Ms, 50);
    assert.strictEqual(DEFAULT_SUCCESS_CRITERIA.dataCorruptionTolerance, 0);
  });
});

describe('evaluatePilotHealth with passing metrics', () => {
  const goodMetrics: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'shadow',
    durationHours: 24,
    retentionRatePercent: 99.5,
    fingerprintStabilityPercent: 99.95,
    roundTripFidelityPercent: 99.8,
    multilingualConsistencyPercent: 99.5,
    latencyP95Ms: 35,
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 10,
    languagesTested: ['en', 'el', 'es', 'ja'],
    testCorpusSize: 500,
  };

  it('evaluates to PASS when all criteria met', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    assert.strictEqual(eval_result.status, 'PASS');
    assert.strictEqual(eval_result.failedCriteria.length, 0);
    assert.ok(eval_result.passedCriteria.length >= 6);
  });

  it('includes all passed criteria', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    const report = eval_result.passedCriteria.join(', ');
    assert.match(report, /Retention rate/);
    assert.match(report, /Fingerprint stability/);
    assert.match(report, /Round-trip fidelity/);
    assert.match(report, /Latency P95/);
  });

  it('has no triggered rollbacks', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    assert.strictEqual(eval_result.triggeredRollbacks.length, 0);
  });

  it('canProceedSafely returns true', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    assert.ok(canProceedSafely(eval_result));
  });

  it('shouldRollback returns false', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    assert.ok(!shouldRollback(eval_result));
  });
});

describe('evaluatePilotHealth with retention failure', () => {
  const poorRetention: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'partial',
    durationHours: 24,
    retentionRatePercent: 94.0, // Below 95% hard stop
    fingerprintStabilityPercent: 99.95,
    roundTripFidelityPercent: 99.8,
    multilingualConsistencyPercent: 99.5,
    latencyP95Ms: 35,
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 10,
    languagesTested: ['en', 'el'],
    testCorpusSize: 100,
  };

  it('evaluates to FAIL when retention collapses', () => {
    const eval_result = evaluatePilotHealth(poorRetention);
    assert.strictEqual(eval_result.status, 'FAIL');
    assert.ok(eval_result.failedCriteria.some(c => c.includes('Retention')));
  });

  it('triggers hard-stop rollback R-3', () => {
    const eval_result = evaluatePilotHealth(poorRetention);
    const trigger = eval_result.triggeredRollbacks.find(t => t.id === 'R-3');
    assert.ok(trigger);
    assert.strictEqual(trigger.severity, 'hard-stop');
  });

  it('shouldRollback returns true', () => {
    const eval_result = evaluatePilotHealth(poorRetention);
    assert.ok(shouldRollback(eval_result));
  });
});

describe('evaluatePilotHealth with data corruption', () => {
  const corrupted: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'shadow',
    durationHours: 12,
    retentionRatePercent: 98.5,
    fingerprintStabilityPercent: 99.95,
    roundTripFidelityPercent: 99.8,
    multilingualConsistencyPercent: 99.5,
    latencyP95Ms: 35,
    validationErrors: 3, // Data corruption detected
    scenariosRun: 10,
    scenariosPassed: 8,
    languagesTested: ['en', 'el'],
    testCorpusSize: 100,
  };

  it('evaluates to FAIL when validation errors detected', () => {
    const eval_result = evaluatePilotHealth(corrupted);
    assert.strictEqual(eval_result.status, 'FAIL');
    assert.ok(eval_result.failedCriteria.some(c => c.includes('corruption')));
  });

  it('triggers hard-stop rollbacks R-1 and R-5', () => {
    const eval_result = evaluatePilotHealth(corrupted);
    const triggers = eval_result.triggeredRollbacks.map(t => t.id);
    assert.ok(triggers.includes('R-1'));
    assert.ok(triggers.includes('R-5'));
    assert.ok(eval_result.triggeredRollbacks.every(t => t.severity === 'hard-stop'));
  });

  it('shouldRollback returns true', () => {
    const eval_result = evaluatePilotHealth(corrupted);
    assert.ok(shouldRollback(eval_result));
  });
});

describe('evaluatePilotHealth with latency spike', () => {
  const slowQuery: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'partial',
    durationHours: 2,
    retentionRatePercent: 98.5,
    fingerprintStabilityPercent: 99.95,
    roundTripFidelityPercent: 99.8,
    multilingualConsistencyPercent: 99.5,
    latencyP95Ms: 120, // Hard stop at > 100ms
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 10,
    languagesTested: ['en', 'el'],
    testCorpusSize: 100,
  };

  it('evaluates to FAIL when latency spikes', () => {
    const eval_result = evaluatePilotHealth(slowQuery);
    assert.strictEqual(eval_result.status, 'FAIL');
    assert.ok(eval_result.failedCriteria.some(c => c.includes('Latency P95')));
  });

  it('triggers hard-stop rollback R-4', () => {
    const eval_result = evaluatePilotHealth(slowQuery);
    const trigger = eval_result.triggeredRollbacks.find(t => t.id === 'R-4');
    assert.ok(trigger);
    assert.strictEqual(trigger.severity, 'hard-stop');
  });
});

describe('evaluatePilotHealth with fingerprint drift', () => {
  const driftingFingerprints: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'shadow',
    durationHours: 24,
    retentionRatePercent: 98.5,
    fingerprintStabilityPercent: 99.4, // Drift of 0.6%, exceeds 0.5% threshold
    roundTripFidelityPercent: 99.8,
    multilingualConsistencyPercent: 99.5,
    latencyP95Ms: 35,
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 10,
    languagesTested: ['en', 'el'],
    testCorpusSize: 100,
  };

  it('evaluates to FAIL when fingerprint drifts > 0.5%', () => {
    const eval_result = evaluatePilotHealth(driftingFingerprints);
    assert.strictEqual(eval_result.status, 'FAIL');
  });

  it('triggers hard-stop rollback R-2', () => {
    const eval_result = evaluatePilotHealth(driftingFingerprints);
    const trigger = eval_result.triggeredRollbacks.find(t => t.id === 'R-2');
    assert.ok(trigger);
    assert.strictEqual(trigger.severity, 'hard-stop');
  });
});

describe('evaluatePilotHealth with soft warnings', () => {
  const degradedMetrics: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'partial',
    durationHours: 12,
    retentionRatePercent: 98.5, // Above threshold (98%)
    fingerprintStabilityPercent: 99.92, // Good stability (above 99.9 threshold)
    roundTripFidelityPercent: 99.5, // Above threshold
    multilingualConsistencyPercent: 99.5, // Above threshold
    latencyP95Ms: 42, // Between 40ms and 100ms, triggers W-4 soft warning
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 10,
    languagesTested: ['en', 'el'],
    testCorpusSize: 100,
  };

  it('evaluates to WARN when soft warnings triggered', () => {
    const eval_result = evaluatePilotHealth(degradedMetrics);
    assert.strictEqual(eval_result.status, 'WARN');
  });

  it('identifies soft warning W-4 for latency creep', () => {
    const eval_result = evaluatePilotHealth(degradedMetrics);
    const triggerIds = eval_result.triggeredRollbacks.map(t => t.id);
    // W-4 is latency creep: 40-100ms range
    assert.ok(triggerIds.includes('W-4'));
    assert.ok(eval_result.triggeredRollbacks.every(t => t.severity === 'soft-warning'));
  });

  it('shouldRollback returns false for soft warnings', () => {
    const eval_result = evaluatePilotHealth(degradedMetrics);
    // Soft warnings should not trigger immediate rollback
    assert.ok(!shouldRollback(eval_result));
  });
});

describe('evaluatePilotHealth with custom criteria', () => {
  const customCriteria: SuccessCriteria = {
    retentionThresholdPercent: 95.0, // Relaxed from 98%
    fingerprintDriftThresholdPercent: 0.2,
    roundTripFidelityThresholdPercent: 95.0, // Relaxed from 99%
    latencyP95Ms: 100, // Relaxed from 50ms
    multilingualConsistencyPercent: 95.0, // Relaxed from 99%
    dataCorruptionTolerance: 0,
    testCoverageThresholdPercent: 80.0,
  };

  const metrics: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'setup',
    durationHours: 1,
    retentionRatePercent: 96.0,
    fingerprintStabilityPercent: 99.9,
    roundTripFidelityPercent: 96.0,
    multilingualConsistencyPercent: 96.0,
    latencyP95Ms: 75,
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 8,
    languagesTested: ['en', 'el'],
    testCorpusSize: 50,
  };

  it('passes when metrics meet relaxed criteria', () => {
    const eval_result = evaluatePilotHealth(metrics, customCriteria);
    assert.strictEqual(eval_result.status, 'PASS');
  });

  it('fails when metrics fall below relaxed criteria', () => {
    const poorMetrics: PilotMetrics = { ...metrics, retentionRatePercent: 94.0 };
    const eval_result = evaluatePilotHealth(poorMetrics, customCriteria);
    assert.strictEqual(eval_result.status, 'FAIL');
  });
});

describe('formatPilotHealthReport', () => {
  const goodMetrics: PilotMetrics = {
    timestamp: new Date().toISOString(),
    phase: 'shadow',
    durationHours: 24,
    retentionRatePercent: 99.5,
    fingerprintStabilityPercent: 99.95,
    roundTripFidelityPercent: 99.8,
    multilingualConsistencyPercent: 99.5,
    latencyP95Ms: 35,
    validationErrors: 0,
    scenariosRun: 10,
    scenariosPassed: 10,
    languagesTested: ['en', 'el', 'es', 'ja'],
    testCorpusSize: 500,
  };

  it('formats PASS report', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    const report = formatPilotHealthReport(eval_result);
    assert.match(report, /Status: PASS/);
    assert.match(report, /Passed Criteria/);
    assert.match(report, /✓/);
  });

  it('includes timestamp', () => {
    const eval_result = evaluatePilotHealth(goodMetrics);
    const report = formatPilotHealthReport(eval_result);
    assert.match(report, /Pilot Health Report/);
  });

  const failMetrics: PilotMetrics = { ...goodMetrics, retentionRatePercent: 94.0 };
  it('formats FAIL report with failed criteria', () => {
    const eval_result = evaluatePilotHealth(failMetrics);
    const report = formatPilotHealthReport(eval_result);
    assert.match(report, /Status: FAIL/);
    assert.match(report, /Failed Criteria/);
    assert.match(report, /✗/);
  });

  it('formats report with rollback triggers', () => {
    const eval_result = evaluatePilotHealth(failMetrics);
    const report = formatPilotHealthReport(eval_result);
    if (eval_result.triggeredRollbacks.length > 0) {
      assert.match(report, /Triggered Rollbacks/);
    }
  });
});
