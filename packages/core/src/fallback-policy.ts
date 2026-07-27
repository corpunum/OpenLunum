import type { LunumSem } from './types.js';

export interface FallbackPolicy {
  minConfidence: number;
  requireAllRoles: boolean;
  requirePredicateInVocabulary: boolean;
  maxMissingFeatures: number;
  reviewBandWidth: number;
}

export const DEFAULT_FALLBACK_POLICY: FallbackPolicy = {
  minConfidence: 0.6,
  requireAllRoles: true,
  requirePredicateInVocabulary: true,
  maxMissingFeatures: 0,
  reviewBandWidth: 0.15
};

export interface FallbackDecision {
  action: 'store' | 'fallback' | 'review';
  reasons: string[];
  confidence: number;
}

export interface FallbackContext {
  expectedRoles?: readonly string[];
  knownPredicates?: ReadonlySet<string>;
  missingFeatureCount?: number;
}

export function evaluateFallback(
  sem: LunumSem,
  confidence: number,
  context: FallbackContext = {},
  policy: FallbackPolicy = DEFAULT_FALLBACK_POLICY
): FallbackDecision {
  const reasons: string[] = [];
  const reviewReasons: string[] = [];

  if (confidence < policy.minConfidence - policy.reviewBandWidth) {
    reasons.push(`confidence ${confidence.toFixed(3)} below minimum ${policy.minConfidence}`);
  } else if (confidence < policy.minConfidence) {
    reviewReasons.push(`confidence ${confidence.toFixed(3)} in review band [${(policy.minConfidence - policy.reviewBandWidth).toFixed(3)}, ${policy.minConfidence.toFixed(3)})`);
  }

  if (policy.requireAllRoles && context.expectedRoles) {
    for (const clause of sem.clauses) {
      const presentRoles = new Set(Object.keys(clause.roles ?? {}));
      const missing = context.expectedRoles.filter((r) => !presentRoles.has(r));
      if (missing.length > 0) {
        reasons.push(`missing expected roles: ${missing.join(', ')}`);
      }
    }
  }

  if (policy.requirePredicateInVocabulary && context.knownPredicates) {
    for (const clause of sem.clauses) {
      if (!context.knownPredicates.has(clause.predicate)) {
        reviewReasons.push(`predicate '${clause.predicate}' not in controlled vocabulary`);
      }
    }
  }

  if (context.missingFeatureCount !== undefined && context.missingFeatureCount > policy.maxMissingFeatures) {
    reasons.push(`${context.missingFeatureCount} missing features exceeds maximum ${policy.maxMissingFeatures}`);
  }

  if (reasons.length > 0) {
    return { action: 'fallback', reasons: [...reasons, ...reviewReasons], confidence };
  }
  if (reviewReasons.length > 0) {
    return { action: 'review', reasons: reviewReasons, confidence };
  }
  return { action: 'store', reasons: [], confidence };
}
