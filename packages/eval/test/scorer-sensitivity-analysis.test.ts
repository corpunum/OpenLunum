import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SENSITIVITY_DIMENSIONS,
  SCORER_COMPONENTS,
  simulateSensitivityTest,
  runScorerSensitivitySuite,
} from '../src/scorer-sensitivity-analysis.js';

describe('scorer-sensitivity-analysis', () => {
  describe('constants', () => {
    it('has 5 sensitivity dimensions', () => {
      assert.equal(SENSITIVITY_DIMENSIONS.length, 5);
    });

    it('has 6 scorer components', () => {
      assert.equal(SCORER_COMPONENTS.length, 6);
    });

    it('dimension names are unique', () => {
      const names = SENSITIVITY_DIMENSIONS.map(d => d.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('component names are unique', () => {
      const names = SCORER_COMPONENTS.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('has both critical and non-critical components', () => {
      assert.ok(SCORER_COMPONENTS.some(c => c.critical));
      assert.ok(SCORER_COMPONENTS.some(c => !c.critical));
    });
  });

  describe('simulateSensitivityTest', () => {
    it('returns valid result', () => {
      const r = simulateSensitivityTest(SENSITIVITY_DIMENSIONS[0]!, SCORER_COMPONENTS[0]!);
      assert.equal(typeof r.baselineScore, 'number');
      assert.equal(typeof r.perturbedScore, 'number');
      assert.equal(typeof r.delta, 'number');
      assert.equal(typeof r.stable, 'boolean');
      assert.equal(typeof r.calibrationConfident, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateSensitivityTest(SENSITIVITY_DIMENSIONS[0]!, SCORER_COMPONENTS[0]!);
      const b = simulateSensitivityTest(SENSITIVITY_DIMENSIONS[0]!, SCORER_COMPONENTS[0]!);
      assert.deepEqual(a, b);
    });

    it('delta equals perturbed minus baseline', () => {
      for (const dim of SENSITIVITY_DIMENSIONS) {
        for (const comp of SCORER_COMPONENTS) {
          const r = simulateSensitivityTest(dim, comp);
          assert.equal(r.delta, Math.round((r.perturbedScore - r.baselineScore) * 1000) / 1000);
        }
      }
    });
  });

  describe('runScorerSensitivitySuite', () => {
    it('produces correct total tests (5 × 6)', () => {
      const report = runScorerSensitivitySuite();
      assert.equal(report.totalTests, 5 * 6);
    });

    it('has 6 component summaries', () => {
      const report = runScorerSensitivitySuite();
      assert.equal(report.componentSummaries.length, 6);
    });

    it('verdict is calibrated or sensitive', () => {
      const report = runScorerSensitivitySuite();
      assert.ok(report.verdict === 'calibrated' || report.verdict === 'sensitive');
    });

    it('overall stability is between 0 and 1', () => {
      const report = runScorerSensitivitySuite();
      assert.ok(report.overallStability >= 0 && report.overallStability <= 1);
    });

    it('accepts custom inputs', () => {
      const report = runScorerSensitivitySuite(
        SENSITIVITY_DIMENSIONS.slice(0, 2),
        SCORER_COMPONENTS.slice(0, 3),
      );
      assert.equal(report.totalTests, 2 * 3);
    });
  });
});
