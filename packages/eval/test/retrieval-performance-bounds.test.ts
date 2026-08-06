import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETRIEVAL_WORKLOADS,
  simulateRetrievalPerformance,
  runRetrievalPerformanceSuite,
} from '../src/retrieval-performance-bounds.js';

describe('retrieval-performance-bounds', () => {
  describe('constants', () => {
    it('has 5 workloads', () => {
      assert.equal(RETRIEVAL_WORKLOADS.length, 5);
    });

    it('workload names are unique', () => {
      const names = RETRIEVAL_WORKLOADS.map(w => w.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('contains both cross-lingual and single-language workloads', () => {
      assert.ok(RETRIEVAL_WORKLOADS.some(w => w.crossLingual));
      assert.ok(RETRIEVAL_WORKLOADS.some(w => !w.crossLingual));
    });
  });

  describe('simulateRetrievalPerformance', () => {
    it('returns valid result', () => {
      const r = simulateRetrievalPerformance(RETRIEVAL_WORKLOADS[0]!, 0);
      assert.ok(r.p50Ms > 0);
      assert.ok(r.p95Ms >= r.p50Ms);
      assert.ok(r.p99Ms >= r.p95Ms);
      assert.ok(r.throughputQps > 0);
      assert.ok(['fast', 'acceptable', 'slow', 'timeout'].includes(r.tier));
    });

    it('is deterministic', () => {
      const a = simulateRetrievalPerformance(RETRIEVAL_WORKLOADS[0]!, 0);
      const b = simulateRetrievalPerformance(RETRIEVAL_WORKLOADS[0]!, 0);
      assert.deepEqual(a, b);
    });

    it('latency percentiles are ordered p50 <= p95 <= p99', () => {
      for (const workload of RETRIEVAL_WORKLOADS) {
        for (let i = 0; i < 5; i++) {
          const r = simulateRetrievalPerformance(workload, i);
          assert.ok(r.p50Ms <= r.p95Ms, `p50 (${r.p50Ms}) > p95 (${r.p95Ms}) for ${workload.name}`);
          assert.ok(r.p95Ms <= r.p99Ms, `p95 (${r.p95Ms}) > p99 (${r.p99Ms}) for ${workload.name}`);
        }
      }
    });

    it('small corpus has lower latency than large corpus for same type', () => {
      const small = simulateRetrievalPerformance(RETRIEVAL_WORKLOADS[0]!, 0);
      const large = simulateRetrievalPerformance(RETRIEVAL_WORKLOADS[1]!, 0);
      assert.ok(small.p99Ms < large.p99Ms);
    });
  });

  describe('runRetrievalPerformanceSuite', () => {
    it('produces correct total tests', () => {
      const report = runRetrievalPerformanceSuite();
      assert.equal(report.totalTests, 5 * 5);
    });

    it('has 5 workload summaries', () => {
      const report = runRetrievalPerformanceSuite();
      assert.equal(report.workloadSummaries.length, 5);
    });

    it('verdict is performant or marginal', () => {
      const report = runRetrievalPerformanceSuite();
      assert.ok(report.verdict === 'performant' || report.verdict === 'marginal');
    });

    it('accepts custom runs count', () => {
      const report = runRetrievalPerformanceSuite(RETRIEVAL_WORKLOADS.slice(0, 2), 3);
      assert.equal(report.totalTests, 2 * 3);
    });

    it('within-bound rate is between 0 and 1', () => {
      const report = runRetrievalPerformanceSuite();
      assert.ok(report.overallWithinBoundRate >= 0 && report.overallWithinBoundRate <= 1);
    });
  });
});
