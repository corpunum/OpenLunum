import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_ERROR_SCENARIOS,
  simulateErrorRecovery,
  runCliErrorRecoverySuite,
} from '../src/cli-error-recovery.js';

describe('cli-error-recovery', () => {
  describe('constants', () => {
    it('has 8 error scenarios', () => {
      assert.equal(CLI_ERROR_SCENARIOS.length, 8);
    });

    it('categories are unique', () => {
      const cats = CLI_ERROR_SCENARIOS.map(s => s.category);
      assert.equal(new Set(cats).size, cats.length);
    });
  });

  describe('simulateErrorRecovery', () => {
    it('returns valid result', () => {
      const r = simulateErrorRecovery(CLI_ERROR_SCENARIOS[0]!, 0);
      assert.ok(['recovered', 'degraded', 'failed', 'user-intervention'].includes(r.outcome));
      assert.ok(typeof r.exitCode === 'number');
      assert.equal(typeof r.errorMessageStructured, 'boolean');
      assert.equal(typeof r.stateCorrupted, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateErrorRecovery(CLI_ERROR_SCENARIOS[0]!, 0);
      const b = simulateErrorRecovery(CLI_ERROR_SCENARIOS[0]!, 0);
      assert.deepEqual(a, b);
    });

    it('never corrupts state', () => {
      for (const scenario of CLI_ERROR_SCENARIOS) {
        for (let i = 0; i < 3; i++) {
          const r = simulateErrorRecovery(scenario, i);
          assert.equal(r.stateCorrupted, false);
        }
      }
    });

    it('all error messages are structured', () => {
      for (const scenario of CLI_ERROR_SCENARIOS) {
        for (let i = 0; i < 3; i++) {
          const r = simulateErrorRecovery(scenario, i);
          assert.equal(r.errorMessageStructured, true);
        }
      }
    });
  });

  describe('runCliErrorRecoverySuite', () => {
    it('produces correct total tests', () => {
      const report = runCliErrorRecoverySuite();
      assert.equal(report.totalTests, 8 * 3);
    });

    it('has 8 category summaries', () => {
      const report = runCliErrorRecoverySuite();
      assert.equal(report.categorySummaries.length, 8);
    });

    it('no state corruption', () => {
      const report = runCliErrorRecoverySuite();
      assert.equal(report.noStateCorruption, true);
    });

    it('all structured errors', () => {
      const report = runCliErrorRecoverySuite();
      assert.equal(report.allStructuredErrors, true);
    });

    it('verdict is resilient or adequate', () => {
      const report = runCliErrorRecoverySuite();
      assert.ok(report.verdict === 'resilient' || report.verdict === 'adequate');
    });

    it('accepts custom attempts count', () => {
      const report = runCliErrorRecoverySuite(CLI_ERROR_SCENARIOS.slice(0, 2), 5);
      assert.equal(report.totalTests, 2 * 5);
    });
  });
});
