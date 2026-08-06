import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSE_ERROR_PROFILES,
  simulateParseErrorRecovery,
  runParseErrorRecoverySuite,
} from '../src/parse-error-recovery.js';

describe('parse-error-recovery', () => {
  describe('constants', () => {
    it('has 7 error profiles', () => {
      assert.equal(PARSE_ERROR_PROFILES.length, 7);
    });

    it('category names are unique', () => {
      const names = PARSE_ERROR_PROFILES.map(p => p.category);
      assert.equal(new Set(names).size, names.length);
    });

    it('contains both recoverable and non-recoverable profiles', () => {
      assert.ok(PARSE_ERROR_PROFILES.some(p => p.recoverable));
      assert.ok(PARSE_ERROR_PROFILES.some(p => !p.recoverable));
    });
  });

  describe('simulateParseErrorRecovery', () => {
    it('returns valid result', () => {
      const r = simulateParseErrorRecovery(PARSE_ERROR_PROFILES[0]!, 0);
      assert.ok(['graceful-fallback', 'partial-result', 'safe-reject', 'retry-simplified'].includes(r.action));
      assert.ok(r.latencyMs > 0);
      assert.ok(r.preservedFields >= 0 && r.preservedFields <= r.totalFields);
    });

    it('is deterministic', () => {
      const a = simulateParseErrorRecovery(PARSE_ERROR_PROFILES[0]!, 0);
      const b = simulateParseErrorRecovery(PARSE_ERROR_PROFILES[0]!, 0);
      assert.deepEqual(a, b);
    });

    it('never corrupts state', () => {
      for (const profile of PARSE_ERROR_PROFILES) {
        for (let i = 0; i < 4; i++) {
          const r = simulateParseErrorRecovery(profile, i);
          assert.equal(r.stateCorrupted, false);
        }
      }
    });

    it('always produces structured errors', () => {
      for (const profile of PARSE_ERROR_PROFILES) {
        for (let i = 0; i < 4; i++) {
          const r = simulateParseErrorRecovery(profile, i);
          assert.equal(r.structuredError, true);
        }
      }
    });

    it('non-recoverable profiles use safe-reject', () => {
      const nonRecoverable = PARSE_ERROR_PROFILES.filter(p => !p.recoverable);
      for (const profile of nonRecoverable) {
        for (let i = 0; i < 4; i++) {
          const r = simulateParseErrorRecovery(profile, i);
          assert.equal(r.action, 'safe-reject');
          assert.equal(r.preservedFields, 0);
        }
      }
    });
  });

  describe('runParseErrorRecoverySuite', () => {
    it('produces correct total tests', () => {
      const report = runParseErrorRecoverySuite();
      assert.equal(report.totalTests, 7 * 4);
    });

    it('has 7 category summaries', () => {
      const report = runParseErrorRecoverySuite();
      assert.equal(report.categorySummaries.length, 7);
    });

    it('zero corruption', () => {
      const report = runParseErrorRecoverySuite();
      assert.equal(report.zeroCorruption, true);
    });

    it('all structured errors', () => {
      const report = runParseErrorRecoverySuite();
      assert.equal(report.allStructuredErrors, true);
    });

    it('verdict is robust or acceptable', () => {
      const report = runParseErrorRecoverySuite();
      assert.ok(report.verdict === 'robust' || report.verdict === 'acceptable');
    });

    it('accepts custom attempts count', () => {
      const report = runParseErrorRecoverySuite(PARSE_ERROR_PROFILES.slice(0, 2), 6);
      assert.equal(report.totalTests, 2 * 6);
    });
  });
});
