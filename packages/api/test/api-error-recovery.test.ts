import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_ERROR_CATEGORIES,
  RECOVERY_METRICS,
  simulateApiErrorRecovery,
  runApiErrorRecoverySuite,
} from '../src/api-error-recovery.js';

describe('api-error-recovery', () => {
  describe('constants', () => {
    it('has 6 error categories', () => {
      assert.equal(API_ERROR_CATEGORIES.length, 6);
    });

    it('has 4 recovery metrics', () => {
      assert.equal(RECOVERY_METRICS.length, 4);
    });

    it('category names are unique', () => {
      const names = API_ERROR_CATEGORIES.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = RECOVERY_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateApiErrorRecovery', () => {
    it('returns valid result', () => {
      const r = simulateApiErrorRecovery(API_ERROR_CATEGORIES[0]!, RECOVERY_METRICS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.internalStateLeaked, 'boolean');
      assert.equal(typeof r.clientNotified, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateApiErrorRecovery(API_ERROR_CATEGORIES[0]!, RECOVERY_METRICS[0]!);
      const b = simulateApiErrorRecovery(API_ERROR_CATEGORIES[0]!, RECOVERY_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('never leaks internal state', () => {
      for (const category of API_ERROR_CATEGORIES) {
        for (const metric of RECOVERY_METRICS) {
          const r = simulateApiErrorRecovery(category, metric);
          assert.equal(r.internalStateLeaked, false);
        }
      }
    });

    it('always notifies client', () => {
      for (const category of API_ERROR_CATEGORIES) {
        for (const metric of RECOVERY_METRICS) {
          const r = simulateApiErrorRecovery(category, metric);
          assert.equal(r.clientNotified, true);
        }
      }
    });
  });

  describe('runApiErrorRecoverySuite', () => {
    it('produces correct total tests (6 × 4)', () => {
      const report = runApiErrorRecoverySuite();
      assert.equal(report.totalTests, 6 * 4);
    });

    it('has 6 category summaries', () => {
      const report = runApiErrorRecoverySuite();
      assert.equal(report.categorySummaries.length, 6);
    });

    it('no internal leaks', () => {
      const report = runApiErrorRecoverySuite();
      assert.equal(report.noInternalLeaks, true);
    });

    it('all clients notified', () => {
      const report = runApiErrorRecoverySuite();
      assert.equal(report.allClientsNotified, true);
    });

    it('verdict is robust or adequate', () => {
      const report = runApiErrorRecoverySuite();
      assert.ok(report.verdict === 'robust' || report.verdict === 'adequate');
    });

    it('accepts custom inputs', () => {
      const report = runApiErrorRecoverySuite(
        API_ERROR_CATEGORIES.slice(0, 2),
        RECOVERY_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
