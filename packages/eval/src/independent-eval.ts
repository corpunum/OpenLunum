/**
 * Independent Evaluation Infrastructure (R5.7)
 *
 * Requires independent evaluation for every scorer, weighting or threshold
 * change. Provides a structured change-review protocol that ensures no
 * scorer modification is accepted without independent validation.
 */

export type ChangeType = 'scorer-logic' | 'weight-adjustment' | 'threshold-change' | 'invariant-addition' | 'invariant-removal';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs-revision';

export interface ScorerChange {
  id: string;
  changeType: ChangeType;
  component: string;
  description: string;
  previousValue: string;
  proposedValue: string;
  justification: string;
  evidenceRefs: readonly string[];
  timestamp: string;
}

export interface EvalBenchmark {
  datasetId: string;
  datasetHash: string;
  metrics: readonly BenchmarkMetric[];
}

export interface BenchmarkMetric {
  name: string;
  baseline: number;
  measured: number;
  threshold: number;
  passed: boolean;
}

export interface IndependentReview {
  changeId: string;
  reviewerId: string;
  reviewerIndependent: boolean;
  status: ReviewStatus;
  beforeBenchmark: EvalBenchmark;
  afterBenchmark: EvalBenchmark;
  regressionDetected: boolean;
  comments: string;
  timestamp: string;
}

export interface ChangeReviewProtocol {
  version: string;
  requiredReviewers: number;
  requireIndependentReviewer: boolean;
  requireBenchmarkComparison: boolean;
  regressionThreshold: number;
  allowedRegressionDimensions: readonly string[];
}

export interface ChangeReviewResult {
  change: ScorerChange;
  reviews: IndependentReview[];
  accepted: boolean;
  rejectionReasons: string[];
}

export const DEFAULT_REVIEW_PROTOCOL: ChangeReviewProtocol = Object.freeze({
  version: '1.0',
  requiredReviewers: 1,
  requireIndependentReviewer: true,
  requireBenchmarkComparison: true,
  regressionThreshold: 0.02,
  allowedRegressionDimensions: Object.freeze([]) as readonly string[],
});

export function validateScorerChange(change: ScorerChange): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!change.id) errors.push('missing change id');
  if (!change.component) errors.push('missing component');
  if (!change.description) errors.push('missing description');
  if (!change.justification) errors.push('missing justification');
  if (change.evidenceRefs.length === 0) errors.push('no evidence references provided');

  const validTypes = new Set<ChangeType>(['scorer-logic', 'weight-adjustment', 'threshold-change', 'invariant-addition', 'invariant-removal']);
  if (!validTypes.has(change.changeType)) errors.push(`invalid change type: ${change.changeType}`);

  if (change.changeType === 'invariant-removal' && !change.justification.toLowerCase().includes('reason')) {
    errors.push('invariant removal requires explicit reason in justification');
  }

  return { valid: errors.length === 0, errors };
}

export function validateReview(review: IndependentReview, protocol: ChangeReviewProtocol): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!review.reviewerId) errors.push('missing reviewer ID');
  if (protocol.requireIndependentReviewer && !review.reviewerIndependent) {
    errors.push('reviewer must be independent of the change author');
  }

  if (protocol.requireBenchmarkComparison) {
    if (!review.beforeBenchmark || !review.afterBenchmark) {
      errors.push('benchmark comparison required but missing');
    } else if (review.beforeBenchmark.datasetHash !== review.afterBenchmark.datasetHash) {
      errors.push('before and after benchmarks must use the same dataset');
    }
  }

  const validStatuses = new Set<ReviewStatus>(['pending', 'approved', 'rejected', 'needs-revision']);
  if (!validStatuses.has(review.status)) errors.push(`invalid review status: ${review.status}`);

  return { valid: errors.length === 0, errors };
}

export function detectRegressions(
  before: EvalBenchmark,
  after: EvalBenchmark,
  threshold: number,
): { regressions: BenchmarkMetric[]; improvements: BenchmarkMetric[] } {
  const regressions: BenchmarkMetric[] = [];
  const improvements: BenchmarkMetric[] = [];

  for (const afterMetric of after.metrics) {
    const beforeMetric = before.metrics.find(m => m.name === afterMetric.name);
    if (!beforeMetric) continue;

    const delta = afterMetric.measured - beforeMetric.measured;
    if (delta < -threshold) {
      regressions.push(afterMetric);
    } else if (delta > threshold) {
      improvements.push(afterMetric);
    }
  }

  return { regressions, improvements };
}

export function evaluateChangeReview(
  change: ScorerChange,
  reviews: IndependentReview[],
  protocol: ChangeReviewProtocol,
): ChangeReviewResult {
  const rejectionReasons: string[] = [];

  const changeValidation = validateScorerChange(change);
  if (!changeValidation.valid) {
    rejectionReasons.push(...changeValidation.errors);
  }

  if (reviews.length < protocol.requiredReviewers) {
    rejectionReasons.push(`insufficient reviews: ${reviews.length}/${protocol.requiredReviewers}`);
  }

  const independentReviews = reviews.filter(r => r.reviewerIndependent);
  if (protocol.requireIndependentReviewer && independentReviews.length === 0) {
    rejectionReasons.push('no independent reviewer found');
  }

  for (const review of reviews) {
    const reviewValidation = validateReview(review, protocol);
    if (!reviewValidation.valid) {
      rejectionReasons.push(...reviewValidation.errors.map(e => `review ${review.reviewerId}: ${e}`));
    }

    if (review.regressionDetected) {
      const { regressions } = detectRegressions(
        review.beforeBenchmark,
        review.afterBenchmark,
        protocol.regressionThreshold,
      );
      for (const reg of regressions) {
        if (!(protocol.allowedRegressionDimensions as readonly string[]).includes(reg.name)) {
          rejectionReasons.push(`regression in ${reg.name}: ${reg.measured} (was ${review.beforeBenchmark.metrics.find(m => m.name === reg.name)?.measured})`);
        }
      }
    }

    if (review.status === 'rejected') {
      rejectionReasons.push(`rejected by ${review.reviewerId}: ${review.comments}`);
    }
  }

  const allApproved = reviews.length >= protocol.requiredReviewers &&
    reviews.every(r => r.status === 'approved') &&
    rejectionReasons.length === 0;

  return {
    change,
    reviews,
    accepted: allApproved,
    rejectionReasons,
  };
}
