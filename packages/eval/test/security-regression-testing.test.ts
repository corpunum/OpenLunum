import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_CONTROL_AREAS,
  REGRESSION_CHECK_TYPES,
  simulateSecurityRegressionTest,
  runSecurityRegressionSuite,
} from '../src/security-regression-testing.js';

describe('security-regression-testing', () => {
  describe('constants', () => {
    it('has 6 security control areas', () => {
      assert.equal(SECURITY_CONTROL_AREAS.length, 6);
    });

    it('has 5 regression check types', () => {
      assert.equal(REGRESSION_CHECK_TYPES.length, 5);
    });

    it('control names are unique', () => {
      const names = SECURITY_CONTROL_AREAS.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('check names are unique', () => {
      const names = REGRESSION_CHECK_TYPES.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateSecurityRegressionTest', () => {
    it('returns valid result', () => {
      const r = simulateSecurityRegressionTest(SECURITY_CONTROL_AREAS[0]!, REGRESSION_CHECK_TYPES[0]!);
      assert.equal(typeof r.baselineScore, 'number');
      assert.equal(typeof r.currentScore, 'number');
      assert.equal(typeof r.delta, 'number');
      assert.equal(typeof r.regressed, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateSecurityRegressionTest(SECURITY_CONTROL_AREAS[0]!, REGRESSION_CHECK_TYPES[0]!);
      const b = simulateSecurityRegressionTest(SECURITY_CONTROL_AREAS[0]!, REGRESSION_CHECK_TYPES[0]!);
      assert.deepEqual(a, b);
    });

    it('never bypasses controls', () => {
      for (const control of SECURITY_CONTROL_AREAS) {
        for (const check of REGRESSION_CHECK_TYPES) {
          const r = simulateSecurityRegressionTest(control, check);
          assert.equal(r.controlBypassed, false);
        }
      }
    });

    it('always has complete audit trail', () => {
      for (const control of SECURITY_CONTROL_AREAS) {
        for (const check of REGRESSION_CHECK_TYPES) {
          const r = simulateSecurityRegressionTest(control, check);
          assert.equal(r.auditTrailComplete, true);
        }
      }
    });
  });

  describe('runSecurityRegressionSuite', () => {
    it('produces correct total tests (6 × 5)', () => {
      const report = runSecurityRegressionSuite();
      assert.equal(report.totalTests, 6 * 5);
    });

    it('has 6 control summaries', () => {
      const report = runSecurityRegressionSuite();
      assert.equal(report.controlSummaries.length, 6);
    });

    it('no controls bypassed', () => {
      const report = runSecurityRegressionSuite();
      assert.equal(report.noControlBypassed, true);
    });

    it('all audit trails complete', () => {
      const report = runSecurityRegressionSuite();
      assert.equal(report.allAuditTrailsComplete, true);
    });

    it('verdict is secure or degraded', () => {
      const report = runSecurityRegressionSuite();
      assert.ok(report.verdict === 'secure' || report.verdict === 'degraded');
    });

    it('accepts custom inputs', () => {
      const report = runSecurityRegressionSuite(
        SECURITY_CONTROL_AREAS.slice(0, 2),
        REGRESSION_CHECK_TYPES.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
