import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETRIEVAL_STRATEGIES,
  CORPUS_SIZES,
  QUERY_COMPLEXITIES,
  simulateRetrievalExecution,
  runRetrievalExecutionSuite,
} from '../src/retrieval-execution-validation.js';

describe('retrieval-execution-validation', () => {
  describe('constants', () => {
    it('has 6 strategies', () => {
      assert.equal(RETRIEVAL_STRATEGIES.length, 6);
    });

    it('has 4 corpus sizes', () => {
      assert.equal(CORPUS_SIZES.length, 4);
    });

    it('has 4 query complexities', () => {
      assert.equal(QUERY_COMPLEXITIES.length, 4);
    });

    it('strategy names are unique', () => {
      const names = RETRIEVAL_STRATEGIES.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateRetrievalExecution', () => {
    it('returns valid metrics', () => {
      const r = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[0]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      assert.ok(r.precision >= 0 && r.precision <= 1);
      assert.ok(r.recall >= 0 && r.recall <= 1);
      assert.ok(r.f1 >= 0 && r.f1 <= 1);
      assert.ok(r.mrr >= 0 && r.mrr <= 1);
      assert.ok(r.latencyMs > 0);
    });

    it('is deterministic', () => {
      const a = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[0]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      const b = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[0]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      assert.deepEqual(a, b);
    });

    it('larger corpus has higher latency', () => {
      const small = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[0]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      const large = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[0]!, CORPUS_SIZES[2]!, QUERY_COMPLEXITIES[0]!);
      assert.ok(large.latencyMs > small.latencyMs);
    });

    it('hybrid-weighted has higher precision than keyword-bm25', () => {
      const hybrid = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[2]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      const bm25 = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[1]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      assert.ok(hybrid.precision >= bm25.precision);
    });

    it('non-cross-lingual strategy penalized for multilingual queries', () => {
      const bm25ml = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[1]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[3]!);
      const bm25simple = simulateRetrievalExecution(RETRIEVAL_STRATEGIES[1]!, CORPUS_SIZES[0]!, QUERY_COMPLEXITIES[0]!);
      assert.ok(bm25ml.precision < bm25simple.precision);
    });
  });

  describe('runRetrievalExecutionSuite', () => {
    it('produces correct total tests', () => {
      const report = runRetrievalExecutionSuite();
      assert.equal(report.totalTests, 6 * 4 * 4);
    });

    it('has 6 strategy summaries', () => {
      const report = runRetrievalExecutionSuite();
      assert.equal(report.strategySummaries.length, 6);
    });

    it('has 4 corpus summaries', () => {
      const report = runRetrievalExecutionSuite();
      assert.equal(report.corpusSummaries.length, 4);
    });

    it('overall F1 is reasonable', () => {
      const report = runRetrievalExecutionSuite();
      assert.ok(report.overallMeanF1 > 0.5);
      assert.ok(report.overallMeanF1 <= 1);
    });

    it('verdict is excellent or acceptable', () => {
      const report = runRetrievalExecutionSuite();
      assert.ok(report.verdict === 'excellent' || report.verdict === 'acceptable');
    });

    it('accepts custom subset', () => {
      const report = runRetrievalExecutionSuite(
        RETRIEVAL_STRATEGIES.slice(0, 2),
        CORPUS_SIZES.slice(0, 2),
        QUERY_COMPLEXITIES.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2 * 2);
    });
  });
});
