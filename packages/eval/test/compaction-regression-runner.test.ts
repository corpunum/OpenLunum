import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPACTION_STRATEGIES,
  COMPACTION_REGRESSION_METRICS,
  simulateCompactionRegression,
  runCompactionRegressionSuite,
} from '../src/compaction-regression-runner.js';

describe('compaction-regression-runner', () => {
  describe('constants', () => {
    it('has 5 strategies', () => {
      assert.equal(COMPACTION_STRATEGIES.length, 5);
    });

    it('has 6 metrics', () => {
      assert.equal(COMPACTION_REGRESSION_METRICS.length, 6);
    });

    it('strategy names are unique', () => {
      const names = COMPACTION_STRATEGIES.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateCompactionRegression', () => {
    it('returns valid result', () => {
      const r = simulateCompactionRegression(COMPACTION_STRATEGIES[0]!, COMPACTION_REGRESSION_METRICS[0]!);
      assert.equal(typeof r.withinTolerance, 'boolean');
      assert.equal(typeof r.regressed, 'boolean');
      assert.ok(r.baselineValue >= 0);
    });

    it('is deterministic', () => {
      const a = simulateCompactionRegression(COMPACTION_STRATEGIES[0]!, COMPACTION_REGRESSION_METRICS[0]!);
      const b = simulateCompactionRegression(COMPACTION_STRATEGIES[0]!, COMPACTION_REGRESSION_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('delta equals current minus baseline', () => {
      const r = simulateCompactionRegression(COMPACTION_STRATEGIES[0]!, COMPACTION_REGRESSION_METRICS[0]!);
      assert.equal(r.delta, Math.round((r.currentValue - r.baselineValue) * 1000) / 1000);
    });
  });

  describe('runCompactionRegressionSuite', () => {
    it('produces correct total tests', () => {
      const report = runCompactionRegressionSuite();
      assert.equal(report.totalTests, 5 * 6);
    });

    it('has 5 strategy summaries', () => {
      const report = runCompactionRegressionSuite();
      assert.equal(report.strategySummaries.length, 5);
    });

    it('stability is high', () => {
      const report = runCompactionRegressionSuite();
      assert.ok(report.overallStability >= 0.8);
    });

    it('verdict is stable or minor-drift', () => {
      const report = runCompactionRegressionSuite();
      assert.ok(report.verdict === 'stable' || report.verdict === 'minor-drift');
    });

    it('accepts custom subset', () => {
      const report = runCompactionRegressionSuite(
        COMPACTION_STRATEGIES.slice(0, 2),
        COMPACTION_REGRESSION_METRICS.slice(0, 3),
      );
      assert.equal(report.totalTests, 2 * 3);
    });
  });
});
