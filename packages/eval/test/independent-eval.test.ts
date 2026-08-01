import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REVIEW_PROTOCOL,
  validateScorerChange,
  validateReview,
  detectRegressions,
  evaluateChangeReview,
} from '../src/independent-eval.js';
import type {
  ScorerChange,
  IndependentReview,
  EvalBenchmark,
} from '../src/independent-eval.js';

const TS = '2026-01-01T00:00:00Z';

function makeChange(overrides?: Partial<ScorerChange>): ScorerChange {
  return {
    id: 'change-001',
    changeType: 'threshold-change',
    component: 'near-semantic-scorer',
    description: 'Raise similarity threshold from 0.8 to 0.85',
    previousValue: '0.8',
    proposedValue: '0.85',
    justification: 'Reduce false positives observed in R5.4 sweep',
    evidenceRefs: ['#365', 'reports/experiments/threshold-sweep/'],
    timestamp: TS,
    ...overrides,
  };
}

function makeBenchmark(overrides?: Partial<EvalBenchmark>): EvalBenchmark {
  return {
    datasetId: 'mutation-corpus-v2',
    datasetHash: 'abc123',
    metrics: [
      { name: 'precision', baseline: 0.5, measured: 0.6, threshold: 0.4, passed: true },
      { name: 'recall', baseline: 1.0, measured: 0.75, threshold: 0.7, passed: true },
      { name: 'f1', baseline: 0.667, measured: 0.667, threshold: 0.5, passed: true },
    ],
    ...overrides,
  };
}

function makeReview(overrides?: Partial<IndependentReview>): IndependentReview {
  return {
    changeId: 'change-001',
    reviewerId: 'independent-reviewer-1',
    reviewerIndependent: true,
    status: 'approved',
    beforeBenchmark: makeBenchmark(),
    afterBenchmark: makeBenchmark(),
    regressionDetected: false,
    comments: 'Change validated against mutation corpus',
    timestamp: TS,
    ...overrides,
  };
}

describe('independent-eval', () => {
  describe('validateScorerChange', () => {
    it('validates a well-formed change', () => {
      const result = validateScorerChange(makeChange());
      assert.ok(result.valid);
      assert.equal(result.errors.length, 0);
    });

    it('rejects change without evidence refs', () => {
      const result = validateScorerChange(makeChange({ evidenceRefs: [] }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('evidence')));
    });

    it('rejects change without justification', () => {
      const result = validateScorerChange(makeChange({ justification: '' }));
      assert.equal(result.valid, false);
    });
  });

  describe('validateReview', () => {
    it('validates a well-formed review', () => {
      const result = validateReview(makeReview(), DEFAULT_REVIEW_PROTOCOL);
      assert.ok(result.valid);
    });

    it('rejects non-independent reviewer when required', () => {
      const result = validateReview(
        makeReview({ reviewerIndependent: false }),
        DEFAULT_REVIEW_PROTOCOL,
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('independent')));
    });

    it('rejects mismatched dataset hashes', () => {
      const result = validateReview(
        makeReview({
          afterBenchmark: makeBenchmark({ datasetHash: 'different' }),
        }),
        DEFAULT_REVIEW_PROTOCOL,
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('same dataset')));
    });
  });

  describe('detectRegressions', () => {
    it('detects no regressions when metrics are stable', () => {
      const before = makeBenchmark();
      const after = makeBenchmark();
      const { regressions, improvements } = detectRegressions(before, after, 0.02);
      assert.equal(regressions.length, 0);
      assert.equal(improvements.length, 0);
    });

    it('detects regression when metric drops beyond threshold', () => {
      const before = makeBenchmark();
      const after = makeBenchmark({
        metrics: [
          { name: 'precision', baseline: 0.5, measured: 0.3, threshold: 0.4, passed: false },
          { name: 'recall', baseline: 1.0, measured: 0.75, threshold: 0.7, passed: true },
          { name: 'f1', baseline: 0.667, measured: 0.667, threshold: 0.5, passed: true },
        ],
      });
      const { regressions } = detectRegressions(before, after, 0.02);
      assert.equal(regressions.length, 1);
      assert.equal(regressions[0]!.name, 'precision');
    });

    it('detects improvements', () => {
      const before = makeBenchmark();
      const after = makeBenchmark({
        metrics: [
          { name: 'precision', baseline: 0.5, measured: 0.8, threshold: 0.4, passed: true },
          { name: 'recall', baseline: 1.0, measured: 0.75, threshold: 0.7, passed: true },
          { name: 'f1', baseline: 0.667, measured: 0.667, threshold: 0.5, passed: true },
        ],
      });
      const { improvements } = detectRegressions(before, after, 0.02);
      assert.equal(improvements.length, 1);
      assert.equal(improvements[0]!.name, 'precision');
    });
  });

  describe('evaluateChangeReview', () => {
    it('accepts change with valid review', () => {
      const change = makeChange();
      const reviews = [makeReview()];
      const result = evaluateChangeReview(change, reviews, DEFAULT_REVIEW_PROTOCOL);
      assert.ok(result.accepted);
      assert.equal(result.rejectionReasons.length, 0);
    });

    it('rejects change with no reviews', () => {
      const change = makeChange();
      const result = evaluateChangeReview(change, [], DEFAULT_REVIEW_PROTOCOL);
      assert.equal(result.accepted, false);
      assert.ok(result.rejectionReasons.some(r => r.includes('insufficient reviews')));
    });

    it('rejects change when reviewer rejects', () => {
      const change = makeChange();
      const reviews = [makeReview({ status: 'rejected', comments: 'Regression too severe' })];
      const result = evaluateChangeReview(change, reviews, DEFAULT_REVIEW_PROTOCOL);
      assert.equal(result.accepted, false);
      assert.ok(result.rejectionReasons.some(r => r.includes('rejected')));
    });

    it('rejects change with detected regression in non-allowed dimension', () => {
      const before = makeBenchmark();
      const after = makeBenchmark({
        metrics: [
          { name: 'precision', baseline: 0.5, measured: 0.3, threshold: 0.4, passed: false },
          { name: 'recall', baseline: 1.0, measured: 0.75, threshold: 0.7, passed: true },
          { name: 'f1', baseline: 0.667, measured: 0.667, threshold: 0.5, passed: true },
        ],
      });
      const change = makeChange();
      const reviews = [makeReview({
        status: 'approved',
        regressionDetected: true,
        beforeBenchmark: before,
        afterBenchmark: after,
      })];
      const result = evaluateChangeReview(change, reviews, DEFAULT_REVIEW_PROTOCOL);
      assert.equal(result.accepted, false);
      assert.ok(result.rejectionReasons.some(r => r.includes('regression in precision')));
    });
  });
});
