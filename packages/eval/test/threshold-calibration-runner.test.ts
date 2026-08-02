import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEMANTIC_CHANGE_TYPES,
  THRESHOLD_LEVELS,
  simulateCalibrationRun,
  runThresholdCalibrationSuite,
} from '../src/threshold-calibration-runner.js';

describe('threshold-calibration-runner', () => {
  describe('SEMANTIC_CHANGE_TYPES', () => {
    it('has 6 entries', () => {
      assert.equal(SEMANTIC_CHANGE_TYPES.length, 6);
    });

    it('includes both safety-critical and non-critical types', () => {
      const critical = SEMANTIC_CHANGE_TYPES.filter(t => t.safetyCritical);
      const nonCritical = SEMANTIC_CHANGE_TYPES.filter(t => !t.safetyCritical);
      assert.ok(critical.length > 0);
      assert.ok(nonCritical.length > 0);
    });

    it('has unique type names', () => {
      const names = SEMANTIC_CHANGE_TYPES.map(t => t.type);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('THRESHOLD_LEVELS', () => {
    it('has 5 entries', () => {
      assert.equal(THRESHOLD_LEVELS.length, 5);
    });

    it('values are in descending order', () => {
      for (let i = 1; i < THRESHOLD_LEVELS.length; i++) {
        assert.ok(THRESHOLD_LEVELS[i - 1]!.value > THRESHOLD_LEVELS[i]!.value);
      }
    });
  });

  describe('simulateCalibrationRun', () => {
    it('returns valid metrics between 0 and 1', () => {
      const result = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[0]!);
      assert.ok(result.metrics.precision >= 0 && result.metrics.precision <= 1);
      assert.ok(result.metrics.recall >= 0 && result.metrics.recall <= 1);
      assert.ok(result.metrics.f1 >= 0 && result.metrics.f1 <= 1);
      assert.ok(result.metrics.truePositiveRate >= 0 && result.metrics.truePositiveRate <= 1);
      assert.ok(result.metrics.falsePositiveRate >= 0 && result.metrics.falsePositiveRate <= 1);
      assert.ok(result.metrics.falseNegativeRate >= 0 && result.metrics.falseNegativeRate <= 1);
    });

    it('is deterministic', () => {
      const a = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[2]!);
      const b = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[2]!);
      assert.deepEqual(a, b);
    });

    it('stricter thresholds have higher precision', () => {
      const strict = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[0]!);
      const loose = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[4]!);
      assert.ok(strict.metrics.precision >= loose.metrics.precision);
    });

    it('looser thresholds have higher recall', () => {
      const strict = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[0]!);
      const loose = simulateCalibrationRun(SEMANTIC_CHANGE_TYPES[0]!, THRESHOLD_LEVELS[4]!);
      assert.ok(loose.metrics.recall >= strict.metrics.recall);
    });

    it('includes safety-critical flag from change type', () => {
      const critical = SEMANTIC_CHANGE_TYPES.find(t => t.safetyCritical)!;
      const result = simulateCalibrationRun(critical, THRESHOLD_LEVELS[2]!);
      assert.equal(result.safetyCritical, true);
    });
  });

  describe('runThresholdCalibrationSuite', () => {
    it('produces correct total runs', () => {
      const report = runThresholdCalibrationSuite();
      assert.equal(report.totalRuns, 30);
    });

    it('has 6 change type summaries', () => {
      const report = runThresholdCalibrationSuite();
      assert.equal(report.changeTypes.length, 6);
    });

    it('has 5 threshold summaries', () => {
      const report = runThresholdCalibrationSuite();
      assert.equal(report.thresholds.length, 5);
    });

    it('safety-critical changes detected at standard threshold', () => {
      const report = runThresholdCalibrationSuite();
      assert.equal(report.safetyCriticalAllDetected, true);
    });

    it('each change type has results for all thresholds', () => {
      const report = runThresholdCalibrationSuite();
      for (const ct of report.changeTypes) {
        assert.equal(ct.results.length, 5);
      }
    });

    it('optimal F1 is positive for all change types', () => {
      const report = runThresholdCalibrationSuite();
      for (const ct of report.changeTypes) {
        assert.ok(ct.optimalF1 > 0);
      }
    });

    it('threshold summaries have valid mean metrics', () => {
      const report = runThresholdCalibrationSuite();
      for (const th of report.thresholds) {
        assert.ok(th.meanPrecision >= 0 && th.meanPrecision <= 1);
        assert.ok(th.meanRecall >= 0 && th.meanRecall <= 1);
        assert.ok(th.meanF1 >= 0 && th.meanF1 <= 1);
      }
    });

    it('strict threshold has higher mean precision than loose', () => {
      const report = runThresholdCalibrationSuite();
      const strict = report.thresholds.find(t => t.threshold === 'strict')!;
      const loose = report.thresholds.find(t => t.threshold === 'loose')!;
      assert.ok(strict.meanPrecision >= loose.meanPrecision);
    });

    it('accepts custom subset', () => {
      const report = runThresholdCalibrationSuite(
        SEMANTIC_CHANGE_TYPES.slice(0, 2),
        THRESHOLD_LEVELS.slice(0, 3),
      );
      assert.equal(report.totalRuns, 6);
      assert.equal(report.changeTypes.length, 2);
      assert.equal(report.thresholds.length, 3);
    });
  });
});
