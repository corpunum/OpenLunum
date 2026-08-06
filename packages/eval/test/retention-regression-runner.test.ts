import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETENTION_STRATEGIES,
  RETENTION_QUALITY_METRICS,
  simulateRetentionRegression,
  runRetentionRegressionSuite,
} from '../src/retention-regression-runner.js';

describe('retention-regression-runner', () => {
  describe('constants', () => {
    it('has 5 retention strategies', () => {
      assert.equal(RETENTION_STRATEGIES.length, 5);
    });

    it('has 6 quality metrics', () => {
      assert.equal(RETENTION_QUALITY_METRICS.length, 6);
    });

    it('strategy names are unique', () => {
      const names = RETENTION_STRATEGIES.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = RETENTION_QUALITY_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateRetentionRegression', () => {
    it('returns valid result', () => {
      const r = simulateRetentionRegression(RETENTION_STRATEGIES[0]!, RETENTION_QUALITY_METRICS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.delta, 'number');
      assert.equal(typeof r.preservationBounded, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateRetentionRegression(RETENTION_STRATEGIES[0]!, RETENTION_QUALITY_METRICS[0]!);
      const b = simulateRetentionRegression(RETENTION_STRATEGIES[0]!, RETENTION_QUALITY_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('preservation is always bounded', () => {
      for (const strategy of RETENTION_STRATEGIES) {
        for (const metric of RETENTION_QUALITY_METRICS) {
          const r = simulateRetentionRegression(strategy, metric);
          assert.equal(r.preservationBounded, true);
        }
      }
    });

    it('delta is consistent with score and baseline', () => {
      for (const strategy of RETENTION_STRATEGIES) {
        const r = simulateRetentionRegression(strategy, RETENTION_QUALITY_METRICS[0]!);
        const expected = Math.round((r.score - strategy.baselinePreservation) * 1000) / 1000;
        assert.equal(r.delta, expected);
      }
    });
  });

  describe('runRetentionRegressionSuite', () => {
    it('produces correct total tests (5 × 6)', () => {
      const report = runRetentionRegressionSuite();
      assert.equal(report.totalTests, 5 * 6);
    });

    it('has 5 strategy summaries', () => {
      const report = runRetentionRegressionSuite();
      assert.equal(report.strategySummaries.length, 5);
    });

    it('all preservation bounded', () => {
      const report = runRetentionRegressionSuite();
      assert.equal(report.allBounded, true);
    });

    it('verdict is stable or degrading', () => {
      const report = runRetentionRegressionSuite();
      assert.ok(report.verdict === 'stable' || report.verdict === 'degrading');
    });

    it('accepts custom inputs', () => {
      const report = runRetentionRegressionSuite(
        RETENTION_STRATEGIES.slice(0, 2),
        RETENTION_QUALITY_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
