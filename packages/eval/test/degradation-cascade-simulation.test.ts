import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIOS,
  ISOLATION_CHECKS,
  simulateCascadeStep,
  runDegradationCascadeSuite,
} from '../src/degradation-cascade-simulation.js';

describe('degradation-cascade-simulation', () => {
  describe('constants', () => {
    it('has 5 cascade scenarios', () => {
      assert.equal(CASCADE_SCENARIOS.length, 5);
    });

    it('has 4 isolation checks', () => {
      assert.equal(ISOLATION_CHECKS.length, 4);
    });

    it('scenario names are unique', () => {
      const names = CASCADE_SCENARIOS.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('check names are unique', () => {
      const names = ISOLATION_CHECKS.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateCascadeStep', () => {
    it('returns valid result', () => {
      const r = simulateCascadeStep(CASCADE_SCENARIOS[0]!, ISOLATION_CHECKS[0]!);
      assert.equal(typeof r.isolated, 'boolean');
      assert.equal(typeof r.blastRadiusPct, 'number');
      assert.ok(r.blastRadiusPct >= 0 && r.blastRadiusPct <= 1);
      assert.equal(typeof r.recoveryOrderCorrect, 'boolean');
      assert.equal(typeof r.dataIntact, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateCascadeStep(CASCADE_SCENARIOS[0]!, ISOLATION_CHECKS[0]!);
      const b = simulateCascadeStep(CASCADE_SCENARIOS[0]!, ISOLATION_CHECKS[0]!);
      assert.deepEqual(a, b);
    });

    it('never loses data', () => {
      for (const scenario of CASCADE_SCENARIOS) {
        for (const check of ISOLATION_CHECKS) {
          const r = simulateCascadeStep(scenario, check);
          assert.equal(r.dataIntact, true);
        }
      }
    });

    it('always maintains recovery ordering', () => {
      for (const scenario of CASCADE_SCENARIOS) {
        for (const check of ISOLATION_CHECKS) {
          const r = simulateCascadeStep(scenario, check);
          assert.equal(r.recoveryOrderCorrect, true);
        }
      }
    });
  });

  describe('runDegradationCascadeSuite', () => {
    it('produces correct total tests', () => {
      const report = runDegradationCascadeSuite();
      assert.equal(report.totalTests, 5 * 4);
    });

    it('has 5 scenario summaries', () => {
      const report = runDegradationCascadeSuite();
      assert.equal(report.scenarioSummaries.length, 5);
    });

    it('zero data loss', () => {
      const report = runDegradationCascadeSuite();
      assert.equal(report.zeroDataLoss, true);
    });

    it('all recovery ordered', () => {
      const report = runDegradationCascadeSuite();
      assert.equal(report.allRecoveryOrdered, true);
    });

    it('verdict is contained or partially-contained', () => {
      const report = runDegradationCascadeSuite();
      assert.ok(report.verdict === 'contained' || report.verdict === 'partially-contained');
    });

    it('accepts custom inputs', () => {
      const report = runDegradationCascadeSuite(
        CASCADE_SCENARIOS.slice(0, 2),
        ISOLATION_CHECKS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
