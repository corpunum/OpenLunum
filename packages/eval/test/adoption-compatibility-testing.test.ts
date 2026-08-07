import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADOPTION_STAGES,
  COMPATIBILITY_DIMENSIONS,
  simulateAdoptionCompatibility,
  runAdoptionCompatibilityTestingSuite,
} from '../src/adoption-compatibility-testing.js';

describe('adoption-compatibility-testing', () => {
  describe('constants', () => {
    it('has 5 adoption stages', () => {
      assert.equal(ADOPTION_STAGES.length, 5);
    });

    it('has 5 compatibility dimensions', () => {
      assert.equal(COMPATIBILITY_DIMENSIONS.length, 5);
    });

    it('stage names are unique', () => {
      const names = ADOPTION_STAGES.map((s) => s.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('dimension names are unique', () => {
      const names = COMPATIBILITY_DIMENSIONS.map((d) => d.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateAdoptionCompatibility', () => {
    it('returns valid result', () => {
      const r = simulateAdoptionCompatibility(ADOPTION_STAGES[0]!, COMPATIBILITY_DIMENSIONS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.frictionFree, 'boolean');
      assert.equal(typeof r.backwardCompatible, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateAdoptionCompatibility(ADOPTION_STAGES[0]!, COMPATIBILITY_DIMENSIONS[0]!);
      const b = simulateAdoptionCompatibility(ADOPTION_STAGES[0]!, COMPATIBILITY_DIMENSIONS[0]!);
      assert.deepEqual(a, b);
    });

    it('is always friction-free', () => {
      for (const stage of ADOPTION_STAGES) {
        for (const dim of COMPATIBILITY_DIMENSIONS) {
          const r = simulateAdoptionCompatibility(stage, dim);
          assert.equal(r.frictionFree, true);
        }
      }
    });

    it('is always backward compatible', () => {
      for (const stage of ADOPTION_STAGES) {
        for (const dim of COMPATIBILITY_DIMENSIONS) {
          const r = simulateAdoptionCompatibility(stage, dim);
          assert.equal(r.backwardCompatible, true);
        }
      }
    });
  });

  describe('runAdoptionCompatibilityTestingSuite', () => {
    it('produces correct total tests (5 × 5)', () => {
      const report = runAdoptionCompatibilityTestingSuite();
      assert.equal(report.totalTests, 5 * 5);
    });

    it('has 5 stage summaries', () => {
      const report = runAdoptionCompatibilityTestingSuite();
      assert.equal(report.stageSummaries.length, 5);
    });

    it('all friction-free', () => {
      const report = runAdoptionCompatibilityTestingSuite();
      assert.equal(report.allFrictionFree, true);
    });

    it('all backward compatible', () => {
      const report = runAdoptionCompatibilityTestingSuite();
      assert.equal(report.allBackwardCompatible, true);
    });

    it('verdict is compatible or friction-present', () => {
      const report = runAdoptionCompatibilityTestingSuite();
      assert.ok(report.verdict === 'compatible' || report.verdict === 'friction-present');
    });

    it('accepts custom inputs', () => {
      const report = runAdoptionCompatibilityTestingSuite(
        ADOPTION_STAGES.slice(0, 2),
        COMPATIBILITY_DIMENSIONS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
