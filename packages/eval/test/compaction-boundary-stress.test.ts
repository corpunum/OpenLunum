import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDARY_CATEGORIES,
  STRESS_DIMENSIONS,
  simulateBoundaryStress,
  runCompactionBoundaryStressSuite,
} from '../src/compaction-boundary-stress.js';

describe('compaction-boundary-stress', () => {
  describe('constants', () => {
    it('has 6 boundary categories', () => {
      assert.equal(BOUNDARY_CATEGORIES.length, 6);
    });

    it('has 4 stress dimensions', () => {
      assert.equal(STRESS_DIMENSIONS.length, 4);
    });

    it('category names are unique', () => {
      const names = BOUNDARY_CATEGORIES.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('dimension names are unique', () => {
      const names = STRESS_DIMENSIONS.map(d => d.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateBoundaryStress', () => {
    it('returns valid result', () => {
      const r = simulateBoundaryStress(BOUNDARY_CATEGORIES[0]!, STRESS_DIMENSIONS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.gracefullyHandled, 'boolean');
      assert.equal(typeof r.noDataCorruption, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateBoundaryStress(BOUNDARY_CATEGORIES[0]!, STRESS_DIMENSIONS[0]!);
      const b = simulateBoundaryStress(BOUNDARY_CATEGORIES[0]!, STRESS_DIMENSIONS[0]!);
      assert.deepEqual(a, b);
    });

    it('never corrupts data', () => {
      for (const cat of BOUNDARY_CATEGORIES) {
        for (const dim of STRESS_DIMENSIONS) {
          const r = simulateBoundaryStress(cat, dim);
          assert.equal(r.noDataCorruption, true);
        }
      }
    });

    it('always handles gracefully', () => {
      for (const cat of BOUNDARY_CATEGORIES) {
        for (const dim of STRESS_DIMENSIONS) {
          const r = simulateBoundaryStress(cat, dim);
          assert.equal(r.gracefullyHandled, true);
        }
      }
    });
  });

  describe('runCompactionBoundaryStressSuite', () => {
    it('produces correct total tests', () => {
      const report = runCompactionBoundaryStressSuite();
      assert.equal(report.totalTests, 6 * 4);
    });

    it('has 6 category summaries', () => {
      const report = runCompactionBoundaryStressSuite();
      assert.equal(report.categorySummaries.length, 6);
    });

    it('no data corruption', () => {
      const report = runCompactionBoundaryStressSuite();
      assert.equal(report.noCorruption, true);
    });

    it('all graceful', () => {
      const report = runCompactionBoundaryStressSuite();
      assert.equal(report.allGraceful, true);
    });

    it('verdict is robust or adequate', () => {
      const report = runCompactionBoundaryStressSuite();
      assert.ok(report.verdict === 'robust' || report.verdict === 'adequate');
    });

    it('accepts custom inputs', () => {
      const report = runCompactionBoundaryStressSuite(
        BOUNDARY_CATEGORIES.slice(0, 2),
        STRESS_DIMENSIONS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
