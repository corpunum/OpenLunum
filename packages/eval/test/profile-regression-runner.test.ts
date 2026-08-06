import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGRESSION_PROFILES,
  REGRESSION_METRICS,
  simulateRegressionTest,
  runProfileRegressionSuite,
} from '../src/profile-regression-runner.js';

describe('profile-regression-runner', () => {
  describe('constants', () => {
    it('has 8 profiles', () => {
      assert.equal(REGRESSION_PROFILES.length, 8);
    });

    it('has 5 metrics', () => {
      assert.equal(REGRESSION_METRICS.length, 5);
    });

    it('profile ids are unique', () => {
      const ids = REGRESSION_PROFILES.map(p => p.id);
      assert.equal(new Set(ids).size, ids.length);
    });
  });

  describe('simulateRegressionTest', () => {
    it('returns valid result', () => {
      const r = simulateRegressionTest(REGRESSION_PROFILES[0]!, REGRESSION_METRICS[0]!);
      assert.ok(r.baselineValue >= 0 && r.baselineValue <= 1);
      assert.ok(r.currentValue >= 0 && r.currentValue <= 1);
      assert.equal(typeof r.withinTolerance, 'boolean');
      assert.equal(typeof r.regressed, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateRegressionTest(REGRESSION_PROFILES[0]!, REGRESSION_METRICS[0]!);
      const b = simulateRegressionTest(REGRESSION_PROFILES[0]!, REGRESSION_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('delta equals current minus baseline', () => {
      const r = simulateRegressionTest(REGRESSION_PROFILES[0]!, REGRESSION_METRICS[0]!);
      assert.equal(r.delta, Math.round((r.currentValue - r.baselineValue) * 1000) / 1000);
    });
  });

  describe('runProfileRegressionSuite', () => {
    it('produces correct total tests', () => {
      const report = runProfileRegressionSuite();
      assert.equal(report.totalTests, 8 * 5);
    });

    it('has 8 profile summaries', () => {
      const report = runProfileRegressionSuite();
      assert.equal(report.profileSummaries.length, 8);
    });

    it('profile summary counts are consistent', () => {
      const report = runProfileRegressionSuite();
      for (const ps of report.profileSummaries) {
        assert.equal(ps.passed + ps.regressed, ps.totalMetrics);
      }
    });

    it('verdict is stable or minor-regression', () => {
      const report = runProfileRegressionSuite();
      assert.ok(report.verdict === 'stable' || report.verdict === 'minor-regression');
    });

    it('accepts custom subset', () => {
      const report = runProfileRegressionSuite(
        REGRESSION_PROFILES.slice(0, 2),
        REGRESSION_METRICS.slice(0, 3),
      );
      assert.equal(report.totalTests, 2 * 3);
    });
  });
});
