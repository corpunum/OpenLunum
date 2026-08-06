import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUERY_REFORMULATIONS,
  CONSISTENCY_METRICS,
  simulateConsistencyTest,
  runRetrievalConsistencySuite,
} from '../src/retrieval-consistency-validation.js';

describe('retrieval-consistency-validation', () => {
  describe('constants', () => {
    it('has 5 query reformulations', () => {
      assert.equal(QUERY_REFORMULATIONS.length, 5);
    });

    it('has 4 consistency metrics', () => {
      assert.equal(CONSISTENCY_METRICS.length, 4);
    });

    it('reformulation names are unique', () => {
      const names = QUERY_REFORMULATIONS.map(r => r.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = CONSISTENCY_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateConsistencyTest', () => {
    it('returns valid result', () => {
      const r = simulateConsistencyTest(QUERY_REFORMULATIONS[0]!, CONSISTENCY_METRICS[0]!);
      assert.equal(typeof r.originalScore, 'number');
      assert.equal(typeof r.reformulatedScore, 'number');
      assert.equal(typeof r.delta, 'number');
      assert.equal(typeof r.withinTolerance, 'boolean');
      assert.equal(typeof r.rankPreserved, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateConsistencyTest(QUERY_REFORMULATIONS[0]!, CONSISTENCY_METRICS[0]!);
      const b = simulateConsistencyTest(QUERY_REFORMULATIONS[0]!, CONSISTENCY_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('delta equals reformulated minus original', () => {
      for (const ref of QUERY_REFORMULATIONS) {
        for (const met of CONSISTENCY_METRICS) {
          const r = simulateConsistencyTest(ref, met);
          assert.equal(r.delta, Math.round((r.reformulatedScore - r.originalScore) * 1000) / 1000);
        }
      }
    });

    it('all results have rank preserved', () => {
      for (const ref of QUERY_REFORMULATIONS) {
        for (const met of CONSISTENCY_METRICS) {
          const r = simulateConsistencyTest(ref, met);
          assert.equal(r.rankPreserved, true);
        }
      }
    });
  });

  describe('runRetrievalConsistencySuite', () => {
    it('produces correct total tests (5 × 4)', () => {
      const report = runRetrievalConsistencySuite();
      assert.equal(report.totalTests, 5 * 4);
    });

    it('has 5 reformulation summaries', () => {
      const report = runRetrievalConsistencySuite();
      assert.equal(report.reformulationSummaries.length, 5);
    });

    it('all ranks preserved', () => {
      const report = runRetrievalConsistencySuite();
      assert.equal(report.allRanksPreserved, true);
    });

    it('verdict is consistent or mostly-consistent', () => {
      const report = runRetrievalConsistencySuite();
      assert.ok(report.verdict === 'consistent' || report.verdict === 'mostly-consistent');
    });

    it('accepts custom inputs', () => {
      const report = runRetrievalConsistencySuite(
        QUERY_REFORMULATIONS.slice(0, 2),
        CONSISTENCY_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
