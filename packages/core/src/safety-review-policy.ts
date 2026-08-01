/**
 * Safety-review policy: risk classification and human-review / natural-fallback
 * requirements for high-risk semantic records (R6.5).
 *
 * Provides a rule-based classifier that inspects semantic features (negation,
 * obligation, permission, protected literals) to assign a risk level, then
 * maps that level to concrete review and fallback requirements.
 *
 * @see {@link https://github.com/earendil-works/OpenLunum/issues/560 Issue #560}
 * @see {@link ./human-review-policy Human review trigger evaluation}
 */

// ── Risk levels ──────────────────────────────────────────────────

/**
 * Safety risk level for a semantic record.
 *
 * Named `SafetyRiskLevel` to avoid collision with the existing
 * `RiskLevel` exported by `policy-classifier.ts`.
 */
export type SafetyRiskLevel = 'low' | 'medium' | 'high' | 'critical';

// ── Review requirement ───────────────────────────────────────────

/** Per-level review and fallback requirements. */
export interface ReviewRequirement {
  riskLevel: SafetyRiskLevel;
  humanReviewRequired: boolean;
  naturalFallbackRequired: boolean;
  justification: string;
}

/**
 * Canonical policy table mapping each risk level to its review and
 * fallback requirements.
 */
export const REVIEW_POLICY: readonly ReviewRequirement[] = [
  {
    riskLevel: 'low',
    humanReviewRequired: false,
    naturalFallbackRequired: false,
    justification: 'no elevated risk detected',
  },
  {
    riskLevel: 'medium',
    humanReviewRequired: false,
    naturalFallbackRequired: true,
    justification: 'semantic compression may lose nuance',
  },
  {
    riskLevel: 'high',
    humanReviewRequired: true,
    naturalFallbackRequired: true,
    justification: 'safety-critical semantic changes need human verification',
  },
  {
    riskLevel: 'critical',
    humanReviewRequired: true,
    naturalFallbackRequired: true,
    justification: 'must not proceed without human sign-off',
  },
] as const;

// ── Risk classification ──────────────────────────────────────────

/** Result of classifying a record's risk level. */
export interface RiskClassification {
  recordType: string;
  riskLevel: SafetyRiskLevel;
  reason: string;
}

/**
 * Classify the risk level of a semantic record based on its features.
 *
 * Rule priority (first match wins):
 * 1. negation AND (obligation OR permission) => critical
 * 2. protected literal present             => high
 * 3. obligation OR permission              => high
 * 4. negation only                         => medium
 * 5. otherwise                             => low
 */
export function classifyRecordRisk(
  recordType: string,
  hasNegation: boolean,
  hasObligation: boolean,
  hasPermission: boolean,
  hasProtectedLiteral: boolean,
): RiskClassification {
  if (hasNegation && (hasObligation || hasPermission)) {
    return {
      recordType,
      riskLevel: 'critical',
      reason: 'negation combined with obligation or permission',
    };
  }

  if (hasProtectedLiteral) {
    return {
      recordType,
      riskLevel: 'high',
      reason: 'contains protected literal',
    };
  }

  if (hasObligation || hasPermission) {
    return {
      recordType,
      riskLevel: 'high',
      reason: 'contains obligation or permission',
    };
  }

  if (hasNegation) {
    return {
      recordType,
      riskLevel: 'medium',
      reason: 'contains negation',
    };
  }

  return {
    recordType,
    riskLevel: 'low',
    reason: 'no elevated risk indicators',
  };
}

// ── Review requirement lookup ────────────────────────────────────

/**
 * Look up the review requirement for the given risk level.
 *
 * @throws {Error} if the risk level is not found in REVIEW_POLICY
 */
export function getReviewRequirement(
  riskLevel: SafetyRiskLevel,
): ReviewRequirement {
  const entry = REVIEW_POLICY.find((r) => r.riskLevel === riskLevel);
  if (entry === undefined) {
    throw new Error(`unknown risk level: ${riskLevel}`);
  }
  return entry;
}

// ── Fallback decision ────────────────────────────────────────────

/** Result of deciding whether to fall back to natural text. */
export interface SafetyFallbackDecision {
  useNaturalFallback: boolean;
  reason: string;
  originalMode: string;
  fallbackMode: 'natural';
}

/** Ordered risk levels for >= comparison. */
const RISK_ORDER: Record<SafetyRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Decide whether a compaction mode must be overridden with the natural
 * fallback, based on the record's risk level.
 *
 * If riskLevel >= high AND the current mode is not already 'natural',
 * the decision forces a fallback. Otherwise the original mode is kept.
 */
export function decideFallback(
  riskLevel: SafetyRiskLevel,
  compactionMode: string,
): SafetyFallbackDecision {
  if (RISK_ORDER[riskLevel] >= RISK_ORDER['high'] && compactionMode !== 'natural') {
    return {
      useNaturalFallback: true,
      reason: `risk level "${riskLevel}" requires natural fallback (was "${compactionMode}")`,
      originalMode: compactionMode,
      fallbackMode: 'natural',
    };
  }

  return {
    useNaturalFallback: false,
    reason: `risk level "${riskLevel}" allows "${compactionMode}" mode`,
    originalMode: compactionMode,
    fallbackMode: 'natural',
  };
}

// ── Audit entry ──────────────────────────────────────────────────

/** Audit log entry for a review decision. */
export interface ReviewAuditEntry {
  timestamp: string;
  recordType: string;
  riskLevel: SafetyRiskLevel;
  reviewRequired: boolean;
  fallbackApplied: boolean;
  reviewer: string | null;
}

// ── Anti-tree-shaking guard ──────────────────────────────────────

export const safetyReviewPolicyExports = [
  classifyRecordRisk,
  getReviewRequirement,
  decideFallback,
] as const;
