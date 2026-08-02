import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFORMANCE_VECTORS,
  runConformanceCheck,
  runConformanceSuite,
} from '../src/schema-conformance-runner.js';

describe('schema-conformance-runner', () => {
  describe('CONFORMANCE_VECTORS', () => {
    it('has 15 vectors', () => {
      assert.equal(CONFORMANCE_VECTORS.length, 15);
    });

    it('covers all 6 categories', () => {
      const cats = new Set(CONFORMANCE_VECTORS.map(v => v.category));
      assert.equal(cats.size, 6);
    });

    it('has unique ids', () => {
      const ids = CONFORMANCE_VECTORS.map(v => v.id);
      assert.equal(new Set(ids).size, ids.length);
    });

    it('includes both valid and invalid expectations', () => {
      const valid = CONFORMANCE_VECTORS.filter(v => v.expectValid);
      const invalid = CONFORMANCE_VECTORS.filter(v => !v.expectValid);
      assert.ok(valid.length > 0);
      assert.ok(invalid.length > 0);
    });
  });

  describe('runConformanceCheck', () => {
    it('valid sem passes', () => {
      const vector = CONFORMANCE_VECTORS.find(v => v.id === 'rf-01')!;
      const result = runConformanceCheck(vector);
      assert.equal(result.passed, true);
    });

    it('missing predicate correctly detected as invalid', () => {
      const vector = CONFORMANCE_VECTORS.find(v => v.id === 'rf-02')!;
      const result = runConformanceCheck(vector);
      assert.equal(result.passed, true);
      assert.equal(result.actualValid, false);
    });

    it('numeric predicate correctly detected as invalid', () => {
      const vector = CONFORMANCE_VECTORS.find(v => v.id === 'tc-02')!;
      const result = runConformanceCheck(vector);
      assert.equal(result.passed, true);
      assert.equal(result.actualValid, false);
    });

    it('extra fields correctly rejected', () => {
      const vector = CONFORMANCE_VECTORS.find(v => v.id === 'cf-02')!;
      const result = runConformanceCheck(vector);
      assert.equal(result.passed, true);
      assert.equal(result.actualValid, false);
    });

    it('unicode text passes', () => {
      const vector = CONFORMANCE_VECTORS.find(v => v.id === 'bv-02')!;
      const result = runConformanceCheck(vector);
      assert.equal(result.passed, true);
    });

    it('result message includes vector id', () => {
      const vector = CONFORMANCE_VECTORS[0]!;
      const result = runConformanceCheck(vector);
      assert.ok(result.message.includes(vector.id));
    });
  });

  describe('runConformanceSuite', () => {
    it('runs all vectors', () => {
      const report = runConformanceSuite();
      assert.equal(report.totalVectors, 15);
    });

    it('all vectors pass on default suite', () => {
      const report = runConformanceSuite();
      assert.equal(report.passedVectors, 15);
      assert.equal(report.failedVectors, 0);
    });

    it('produces conformant verdict', () => {
      const report = runConformanceSuite();
      assert.equal(report.verdict, 'conformant');
    });

    it('pass rate is 1.0 for all-passing', () => {
      const report = runConformanceSuite();
      assert.equal(report.overallPassRate, 1);
    });

    it('reports per-category summaries', () => {
      const report = runConformanceSuite();
      assert.equal(report.categories.length, 6);
      for (const cat of report.categories) {
        assert.equal(cat.passRate, 1);
      }
    });

    it('accepts custom vector list', () => {
      const subset = CONFORMANCE_VECTORS.slice(0, 3);
      const report = runConformanceSuite(subset);
      assert.equal(report.totalVectors, 3);
    });
  });
});
