/**
 * Human-review triggers and mandatory natural-fallback for high-risk records (R6.5).
 *
 * Defines when a semantic record must be held for human review before
 * automatic use is permitted. A record is "high-risk" when any of:
 *  - prohibited-domain proximity (near-miss of a blocked category)
 *  - low parse confidence (below the review threshold)
 *  - safety-invariant near-miss (one invariant away from blocking)
 *  - high protected-literal density
 *
 * When any trigger fires the record is:
 *  - blocked from automatic use
 *  - flagged with `requiresHumanReview: true`
 *  - forced to use natural-text fallback
 *
 * @see {@link https://github.com/earendil-works/OpenLunum/issues/487 Issue #487}
 * @see {@link ./prohibited-domains Prohibited domain classifier}
 * @see {@link ./fallback-policy Parse confidence & uncertainty}
 * @see {@link ./hard-gates Safety invariant enforcement}
 */

// ── Import cross-module types and functions ─────────────────────────

import {
  classifyDomain,
  type DomainClassificationResult,
} from './prohibited-domains.js';

import type { LunumSem } from './types.js';

import type { FallbackDecision, ParseConfidence } from './fallback-policy.js';

import type { GatedComparison } from './hard-gates.js';

// ── Risk threshold configuration ──────────────────────────────────

/**
 * Confidence score at or below which a record is auto-flagged for review.
 * Mirrors the review-band ceiling from uncertainty policy.
 */
export const CONFIDENCE_REVIEW_THRESHOLD = 0.85;

/**
 * Proximity threshold for "near-miss" prohibited-domain classification.
 * Scores in [proximityThreshold, 0.5) trigger review without a full block.
 */
export const PROXIMITY_THRESHOLD = 0.35;

/**
 * Maximum tolerated protected-literal ratio before review is triggered.
 * Computed as: (count of protected literals) / (total clauses).
 */
export const PROTECTED_LITERAL_DENSITY_THRESHOLD = 0.5;

/**
 * Maximum number of safety invariants that can fire before review.
 * When invariants exceed this count, automatic use is blocked.
 * (Zero means any single hard invariant triggers review.)
 */
export const SAFETY_INVARIANT_NEAR_MISS_LIMIT = 1;

// ── Review trigger definitions ────────────────────────────────────

/** Category of a human-review trigger */
export type ReviewTriggerCategory =
  | 'prohibited_domain_proximity'
  | 'low_confidence'
  | 'safety_invariant_near_miss'
  | 'protected_literal_density';

/** Detailed reason for a review trigger firing */
export interface ReviewTriggerDetail {
  /** Stable category identifying the trigger type */
  category: ReviewTriggerCategory;
  /** Human-readable explanation */
  reason: string;
  /** Supporting numeric evidence, if applicable (0-1 scale) */
  evidence?: number;
  /** Specific identifiers, if applicable (e.g. domain id, invariant code) */
  identifier?: string;
}

// ── High-risk record classification ───────────────────────────────

/**
 * Result of evaluating whether a record warrants human review.
 */
export interface HumanReviewResult {
  /** True if the record requires human review before automatic use */
  requiresHumanReview: boolean;
  /** All triggered review conditions */
  triggers: ReviewTriggerDetail[];
  /** Highest-priority trigger (for observability / UI) */
  primaryTrigger: ReviewTriggerDetail | null;
  /** The raw semantic record being assessed */
  sem: LunumSem;
  /** Whether automatic use is blocked pending review */
  automaticUseBlocked: boolean;
  /** Whether natural-text fallback is forced */
  forceNaturalFallback: boolean;
  /** Optional classification result from the prohibited-domain classifier */
  domainClassification?: DomainClassificationResult;
  /** Optional parse confidence from the uncertainty policy */
  parseConfidence?: ParseConfidence;
  /** Optional gated comparison from the safety invariant engine */
  gatedComparison?: GatedComparison;
}

// ── Review flag on records ────────────────────────────────────────

/**
 * Enriched record type that carries the human-review flag.
 * Can be merged into LunumRecord annotations or a sidecar.
 */
export interface HumanReviewFlag {
  /** Stable ID for the review session that approved or rejected this record */
  reviewSessionId?: string;
  /** Human reviewer identity */
  reviewedBy?: string;
  /** ISO 8601 timestamp of review decision */
  reviewedAt?: string;
  /** Whether the reviewer approved automatic use */
  approved: boolean;
  /** Human-readable reviewer rationale */
  rationale?: string;
  /** Whether the record is still awaiting review */
  pending: boolean;
}

// ── Natural-text fallback ─────────────────────────────────────────

/**
 * Natural-text fallback record used when human review is required.
 * Preserves the original natural-language source so it is not lost
 * while the semantic record is in review.
 */
export interface HumanReviewFallbackRecord {
  /** Original natural-language source text */
  naturalText: string;
  /** The semantic structure under review */
  sem: LunumSem;
  /** Why review was triggered */
  triggers: ReviewTriggerDetail[];
  /** Whether the record is still awaiting human review */
  pendingReview: boolean;
}

// ── Trigger evaluation functions ──────────────────────────────────

/**
 * Evaluate prohibited-domain proximity.
 *
 * Returns a trigger detail if the domain classifier found a near-miss:
 * the highest-confidence match is in [PROXIMITY_THRESHOLD, 0.5).
 * Above 0.5 the prohibited-domain hard block already applies; below the
 * proximity threshold the domain signal is too weak to warrant review.
 */
function evaluateDomainProximity(
  classification: DomainClassificationResult
): ReviewTriggerDetail | null {
  if (!classification.isProhibited || classification.primaryDomain === null) {
    return null;
  }

  const primary = classification.domains.find(
    (d) => d.domain === classification.primaryDomain
  );
  if (primary === undefined) return null;

  if (
    primary.confidence >= PROXIMITY_THRESHOLD &&
    primary.confidence < 0.5
  ) {
    return {
      category: 'prohibited_domain_proximity',
      reason: `near-miss for prohibited domain "${primary.domain}" (confidence ${primary.confidence.toFixed(3)})`,
      evidence: primary.confidence,
      identifier: primary.domain
    };
  }

  return null;
}

/**
 * Evaluate parse confidence against the review threshold.
 *
 * Returns a trigger when confidence is below CONFIDENCE_REVIEW_THRESHOLD.
 */
function evaluateLowConfidence(
  parseConfidence: ParseConfidence
): ReviewTriggerDetail | null {
  const score = Number.isFinite(parseConfidence.score)
    ? parseConfidence.score
    : 0;

  if (score < CONFIDENCE_REVIEW_THRESHOLD) {
    return {
      category: 'low_confidence',
      reason: `parse confidence ${score.toFixed(3)} below review threshold ${CONFIDENCE_REVIEW_THRESHOLD}`,
      evidence: score
    };
  }

  return null;
}

/**
 * Evaluate safety-invariant near-miss from a gated comparison.
 *
 * Returns a trigger when the number of blocking invariants exceeds the
 * configured near-miss limit but has not yet reached a hard block.
 */
function evaluateSafetyInvariantNearMiss(
  gatedResult: GatedComparison
): ReviewTriggerDetail | null {
  const blockerCount = gatedResult.blockingInvariants.length;
  if (blockerCount > 0 && blockerCount <= SAFETY_INVARIANT_NEAR_MISS_LIMIT) {
    return {
      category: 'safety_invariant_near_miss',
      reason: `${blockerCount} blocking invariant(s) detected near review threshold`,
      evidence: blockerCount,
      identifier: gatedResult.blockingInvariants[0]!.code
    };
  }
  return null;
}

/**
 * Evaluate protected-literal density against the threshold.
 *
 * Computed as the ratio of clauses containing protected literals to the
 * total number of clauses in the semantic record.
 */
function evaluateProtectedLiteralDensity(
  sem: LunumSem,
  registry?: { hasProtectedLiteral: (text: string) => boolean }
): ReviewTriggerDetail | null {
  if (sem.clauses.length === 0) return null;

  let protectedClauseCount = 0;

  // Simple heuristic: when no registry is provided, look for obvious
  // proper-name patterns ("Alice", "New York") in string role values.
  // For structured values (objects), scan the JSON representation for
  // proper-name patterns in any string field.
  const PROPER_NAME_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/;

  function looksLikeProtectedName(s: string): boolean {
    return PROPER_NAME_RE.test(s);
  }

  function extractStringsFromValue(v: unknown): string[] {
    if (typeof v === 'string') return [v];
    if (typeof v === 'object' && v !== null) {
      try {
        const obj = v as Record<string, unknown>;
        return Object.values(obj)
          .filter(x => typeof x === 'string')
          .map(x => x as string);
      } catch {
        return [];
      }
    }
    return [];
  }

  for (const clause of sem.clauses) {
    let clauseHasProtected = false;
    for (const [roleName, roleValue] of Object.entries(clause.roles ?? {})) {
      const valueStr =
        typeof roleValue === 'string'
          ? roleValue
          : typeof roleValue === 'object' && roleValue !== null
            ? JSON.stringify(roleValue)
            : String(roleValue ?? '');

      const hasProtected = registry?.hasProtectedLiteral?.(valueStr)
        ?? extractStringsFromValue(roleValue).some(looksLikeProtectedName);

      if (hasProtected) {
        clauseHasProtected = true;
      }
    }
    if (clauseHasProtected) protectedClauseCount++;
  }

  const density = protectedClauseCount / sem.clauses.length;

  if (density >= PROTECTED_LITERAL_DENSITY_THRESHOLD) {
    return {
      category: 'protected_literal_density',
      reason: `protected-literal density ${density.toFixed(3)} (threshold ${PROTECTED_LITERAL_DENSITY_THRESHOLD})`,
      evidence: density
    };
  }

  return null;
}

// ── Priority ordering for triggers ────────────────────────────────

/**
 * Priority ranking of trigger categories (lower = higher priority).
 * Used to select the primary trigger for reporting.
 */
const TRIGGER_PRIORITY: Record<ReviewTriggerCategory, number> = {
  'prohibited_domain_proximity': 1,
  'low_confidence': 2,
  'safety_invariant_near_miss': 3,
  'protected_literal_density': 4
};

// ── Main evaluation function ──────────────────────────────────────

export interface HumanReviewInput {
  /** The semantic record to evaluate */
  sem: LunumSem;
  /** Source text for domain classification and literal density checks */
  sourceText?: string | undefined;
  /** Optional domain classification result (pre-computed or from classifier) */
  domainClassification?: DomainClassificationResult | undefined;
  /** Optional parse confidence from uncertainty policy */
  parseConfidence?: ParseConfidence | undefined;
  /** Optional gated comparison from safety invariant engine */
  gatedComparison?: GatedComparison | undefined;
  /** Optional protected-literal registry */
  protectedLiteralRegistry?: {
    hasProtectedLiteral: (text: string) => boolean;
  } | undefined;
}

/**
 * Evaluate whether a semantic record requires human review before automatic use.
 *
 * Checks four high-risk dimensions:
 * 1. Prohibited domain proximity — near-miss classification
 * 2. Low parse confidence — below the review threshold
 * 3. Safety invariant near-miss — blocking invariants present
 * 4. Protected literal density — too many protected literals per clause
 *
 * When any trigger fires:
 *  - automaticUseBlocked is true
 *  - requiresHumanReview is true
 *  - forceNaturalFallback is true
 *
 * @param input - Semantic record and optional pre-computed signals
 * @returns HumanReviewResult with all triggered review conditions
 */
export function evaluateHumanReview(
  input: HumanReviewInput
): HumanReviewResult {
  const {
    sem,
    sourceText,
    domainClassification: maybeDomainClassification,
    parseConfidence,
    gatedComparison,
    protectedLiteralRegistry
  } = input;

  const triggers: ReviewTriggerDetail[] = [];

  // 1. Prohibited domain proximity
  let domainClassification: DomainClassificationResult | undefined;
  if (maybeDomainClassification !== undefined) {
    domainClassification = maybeDomainClassification;
  } else if (sourceText !== undefined) {
    domainClassification = classifyDomain({ sourceText });
  }

  if (domainClassification !== undefined) {
    const domainTrigger = evaluateDomainProximity(domainClassification);
    if (domainTrigger) triggers.push(domainTrigger);
  }

  // 2. Low confidence
  if (parseConfidence !== undefined) {
    const confidenceTrigger = evaluateLowConfidence(parseConfidence);
    if (confidenceTrigger) triggers.push(confidenceTrigger);
  }

  // 3. Safety invariant near-miss
  if (gatedComparison !== undefined) {
    const invariantTrigger = evaluateSafetyInvariantNearMiss(gatedComparison);
    if (invariantTrigger) triggers.push(invariantTrigger);
  }

  // 4. Protected literal density
  const literalTrigger = evaluateProtectedLiteralDensity(
    sem,
    protectedLiteralRegistry
  );
  if (literalTrigger) triggers.push(literalTrigger);

  // Determine outcome
  const requiresHumanReview = triggers.length > 0;
  const primaryTrigger = requiresHumanReview
    ? triggers.reduce((best, current) =>
        TRIGGER_PRIORITY[current.category] < TRIGGER_PRIORITY[best.category]
          ? current
          : best
      )
    : null;

  const result: HumanReviewResult = {
    requiresHumanReview,
    triggers,
    primaryTrigger,
    sem,
    automaticUseBlocked: requiresHumanReview,
    forceNaturalFallback: requiresHumanReview,
  };
  if (domainClassification !== undefined) result.domainClassification = domainClassification;
  if (parseConfidence !== undefined) result.parseConfidence = parseConfidence;
  if (gatedComparison !== undefined) result.gatedComparison = gatedComparison;
  return result;
}

// ── Human review flag management ──────────────────────────────────

/**
 * Create or update a human-review flag on a record's annotations.
 * Mutates the annotations record in-place (returns the same object).
 */
export function setHumanReviewFlag(
  annotations: Record<string, unknown>,
  flag: HumanReviewFlag
): Record<string, unknown> {
  annotations['humanReview'] = flag;
  return annotations;
}

/**
 * Read a human-review flag from a record's annotations.
 * Returns null if no flag is present.
 */
export function getHumanReviewFlag(
  annotations: Record<string, unknown>
): HumanReviewFlag | null {
  const flag = annotations['humanReview'] as HumanReviewFlag | undefined;
  return flag ?? null;
}

/**
 * Clear a human-review flag (e.g., after the record is reviewed and removed).
 */
export function clearHumanReviewFlag(
  annotations: Record<string, unknown>
): void {
  delete annotations['humanReview'];
}

/**
 * Check whether a record with the given annotations requires human review.
 */
export function annotationsRequireReview(
  annotations: Record<string, unknown>
): boolean {
  const flag = getHumanReviewFlag(annotations);
  if (flag === null) return false;
  return flag.pending || !flag.approved;
}

// ── Natural-text fallback ─────────────────────────────────────────

/**
 * Create a human-review fallback record.
 *
 * This preserves the original natural text while the semantic record
 * is held for human review. The fallback record can be used as a
 * drop-in replacement for the semantic record in rendering and storage.
 *
 * @param naturalText - Original natural-language source
 * @param sem - The semantic structure under review
 * @param triggers - The review triggers that caused this fallback
 * @returns A fallback record with natural text preserved
 */
export function createHumanReviewFallback(
  naturalText: string,
  sem: LunumSem,
  triggers: ReviewTriggerDetail[]
): HumanReviewFallbackRecord {
  return {
    naturalText,
    sem,
    triggers,
    pendingReview: triggers.length > 0
  };
}

/**
 * Check if a fallback decision should force natural-text fallback
 * based on human review requirements.
 */
export function shouldForceNaturalFallback(
  fallbackDecision: FallbackDecision,
  reviewRequired: boolean
): FallbackDecision {
  if (!reviewRequired) return fallbackDecision;

  return {
    ...fallbackDecision,
    action: 'fallback' as const,
    reasons: [
      ...fallbackDecision.reasons,
      'human-review-required: forced natural-text fallback'
    ]
  };
}

// ── Export to prevent tree-shaking ────────────────────────────────

export const humanReviewPolicyExports = [
  evaluateHumanReview,
  setHumanReviewFlag,
  getHumanReviewFlag,
  clearHumanReviewFlag,
  annotationsRequireReview,
  createHumanReviewFallback,
  shouldForceNaturalFallback
] as const;
