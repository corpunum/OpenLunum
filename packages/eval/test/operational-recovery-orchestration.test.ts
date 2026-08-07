import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_SCENARIOS,
  COORDINATION_METRICS,
  simulateRecoveryOrchestration,
  runOperationalRecoveryOrchestrationSuite,
} from '../src/operational-recovery-orchestration.js';

describe('operational-recovery-orchestration', () => {
  describe('constants', () => {
    it('has 5 recovery scenarios', () => {
      assert.equal(RECOVERY_SCENARIOS.length, 5);
    });

    it('has 4 coordination metrics', () => {
      assert.equal(COORDINATION_METRICS.length, 4);
    });

    it('scenario names are unique', () => {
      const names = RECOVERY_SCENARIOS.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = COORDINATION_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateRecoveryOrchestration', () => {
    it('returns valid result', () => {
      const r = simulateRecoveryOrchestration(RECOVERY_SCENARIOS[0]!, COORDINATION_METRICS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.dataLost, 'boolean');
      assert.equal(typeof r.serviceOrderCorrect, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateRecoveryOrchestration(RECOVERY_SCENARIOS[0]!, COORDINATION_METRICS[0]!);
      const b = simulateRecoveryOrchestration(RECOVERY_SCENARIOS[0]!, COORDINATION_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('never loses data', () => {
      for (const scenario of RECOVERY_SCENARIOS) {
        for (const metric of COORDINATION_METRICS) {
          const r = simulateRecoveryOrchestration(scenario, metric);
          assert.equal(r.dataLost, false);
        }
      }
    });

    it('always maintains service order', () => {
      for (const scenario of RECOVERY_SCENARIOS) {
        for (const metric of COORDINATION_METRICS) {
          const r = simulateRecoveryOrchestration(scenario, metric);
          assert.equal(r.serviceOrderCorrect, true);
        }
      }
    });
  });

  describe('runOperationalRecoveryOrchestrationSuite', () => {
    it('produces correct total tests (5 × 4)', () => {
      const report = runOperationalRecoveryOrchestrationSuite();
      assert.equal(report.totalTests, 5 * 4);
    });

    it('has 5 scenario summaries', () => {
      const report = runOperationalRecoveryOrchestrationSuite();
      assert.equal(report.scenarioSummaries.length, 5);
    });

    it('zero data loss', () => {
      const report = runOperationalRecoveryOrchestrationSuite();
      assert.equal(report.zeroDataLoss, true);
    });

    it('all service order correct', () => {
      const report = runOperationalRecoveryOrchestrationSuite();
      assert.equal(report.allServiceOrderCorrect, true);
    });

    it('verdict is orchestrated or manual-required', () => {
      const report = runOperationalRecoveryOrchestrationSuite();
      assert.ok(report.verdict === 'orchestrated' || report.verdict === 'manual-required');
    });

    it('accepts custom inputs', () => {
      const report = runOperationalRecoveryOrchestrationSuite(
        RECOVERY_SCENARIOS.slice(0, 2),
        COORDINATION_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
