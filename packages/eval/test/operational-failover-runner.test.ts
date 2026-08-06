import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILOVER_SCENARIOS,
  simulateFailoverTest,
  runOperationalFailoverSuite,
} from '../src/operational-failover-runner.js';

describe('operational-failover-runner', () => {
  describe('constants', () => {
    it('has 6 scenarios', () => {
      assert.equal(FAILOVER_SCENARIOS.length, 6);
    });

    it('scenario names are unique', () => {
      const names = FAILOVER_SCENARIOS.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateFailoverTest', () => {
    it('returns valid result', () => {
      const r = simulateFailoverTest(FAILOVER_SCENARIOS[0]!, 0);
      assert.ok(['automatic-recovery', 'manual-intervention', 'degraded-operation', 'total-failure'].includes(r.outcome));
      assert.ok(r.recoveryTimeMs > 0);
      assert.equal(typeof r.dataLoss, 'boolean');
      assert.equal(typeof r.alertFired, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateFailoverTest(FAILOVER_SCENARIOS[0]!, 0);
      const b = simulateFailoverTest(FAILOVER_SCENARIOS[0]!, 0);
      assert.deepEqual(a, b);
    });

    it('never causes data loss', () => {
      for (const scenario of FAILOVER_SCENARIOS) {
        for (let i = 0; i < 3; i++) {
          const r = simulateFailoverTest(scenario, i);
          assert.equal(r.dataLoss, false);
        }
      }
    });

    it('always fires alerts', () => {
      for (const scenario of FAILOVER_SCENARIOS) {
        for (let i = 0; i < 3; i++) {
          const r = simulateFailoverTest(scenario, i);
          assert.equal(r.alertFired, true);
        }
      }
    });
  });

  describe('runOperationalFailoverSuite', () => {
    it('produces correct total tests', () => {
      const report = runOperationalFailoverSuite();
      assert.equal(report.totalTests, 6 * 3);
    });

    it('has 6 scenario summaries', () => {
      const report = runOperationalFailoverSuite();
      assert.equal(report.scenarioSummaries.length, 6);
    });

    it('zero data loss', () => {
      const report = runOperationalFailoverSuite();
      assert.equal(report.zeroDataLoss, true);
    });

    it('verdict is resilient or adequate', () => {
      const report = runOperationalFailoverSuite();
      assert.ok(report.verdict === 'resilient' || report.verdict === 'adequate');
    });

    it('accepts custom attempts count', () => {
      const report = runOperationalFailoverSuite(FAILOVER_SCENARIOS.slice(0, 2), 5);
      assert.equal(report.totalTests, 2 * 5);
    });
  });
});
