import type { LunumSem } from './types.js';

// ── Parse Confidence Type (R2.8) ────────────────────────────────────

/**
 * Evidence factors contributing to parse confidence.
 * Each factor is a score 0-1 representing evidence strength.
 * All factors are optional to support partial evidence collection.
 */
export interface ConfidenceEvidenceFactors {
  /** Lexical/syntactic parsing success (0-1) */
  syntacticValidity?: number | undefined;
  /** Semantic role fulfillment (0-1) */
  roleCompletion?: number | undefined;
  /** Predicate vocabulary coverage (0-1) */
  predicateKnown?: number | undefined;
  /** Modality expression clarity (0-1) */
  modalityClarity?: number | undefined;
  /** Structural well-formedness (0-1) */
  structuralWellFormedness?: number | undefined;
  /** Contextual alignment (0-1) */
  contextAlignment?: number | undefined;
  /** Additional custom factors (0-1) */
  [key: string]: number | undefined;
}

/**
 * Describes uncertainty in parse results.
 * Used for diagnostics and fallback decisions.
 */
export interface UncertaintyReason {
  /** Category of uncertainty (e.g., 'ambiguity', 'incomplete', 'unknown') */
  category: 'ambiguity' | 'incomplete' | 'unknown' | 'conflict' | 'lowEvidence';
  /** Human-readable description */
  description: string;
  /** Affected clause index (if applicable) */
  clauseIndex?: number;
}

/**
 * ParseConfidence: aggregated confidence score with evidence breakdown.
 *
 * The score represents P(correct parse | input).
 * Evidence factors explain what contributes to the score.
 * Uncertainty reasons explain what could be wrong.
 *
 * Fail-safe: if confidence is missing, NaN, or undefined, treat as 0.
 */
export interface ParseConfidence {
  /** Aggregated confidence score (0-1). NaN or missing = 0 (fail-safe). */
  score: number;
  /** Evidence factors contributing to the score */
  evidence: ConfidenceEvidenceFactors;
  /** Minimum evidence factor among all evidence sources */
  minEvidence: number;
  /** Uncertainty reasons explaining low confidence */
  uncertaintyReasons: UncertaintyReason[];
  /** Whether this confidence meets minimum evidence threshold */
  meetsMinimumEvidence: boolean;
}

/**
 * Configuration for uncertainty-based fallback decisions.
 * Extends and supersedes basic FallbackPolicy for R2.8.
 */
export interface UncertaintyFallbackPolicy {
  /** Minimum confidence score required for storage (0-1) */
  minConfidence: number;
  /** Minimum average evidence factor across all evidence sources (0-1) */
  minEvidenceThreshold: number;
  /** If true, require ALL evidence factors to meet minEvidenceThreshold */
  requireAllEvidenceFactors: boolean;
  /** Confidence band for review-level triage [min, minConfidence) */
  reviewBandWidth: number;
  /** If true, automatically fallback when evidence is insufficient */
  autoFallbackOnLowEvidence: boolean;
  /** If true, automatically preserve natural language on fallback */
  preserveNaturalOnFallback: boolean;
}

// ── Fallback Policy (existing) ──────────────────────────────────────

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

/**
 * Default uncertainty-based fallback policy (R2.8).
 * Stricter than basic policy: requires minimum evidence across all factors.
 */
export const DEFAULT_UNCERTAINTY_FALLBACK_POLICY: UncertaintyFallbackPolicy = {
  minConfidence: 0.7,
  minEvidenceThreshold: 0.6,
  requireAllEvidenceFactors: true,
  reviewBandWidth: 0.15,
  autoFallbackOnLowEvidence: true,
  preserveNaturalOnFallback: true
};

export interface FallbackDecision {
  action: 'store' | 'fallback' | 'review';
  reasons: string[];
  confidence: number;
  highRisk?: boolean;
}

export interface FallbackContext {
  expectedRoles?: readonly string[];
  knownPredicates?: ReadonlySet<string>;
  missingFeatureCount?: number;
}

export interface HighRiskFallbackRecord {
  sem: LunumSem;
  naturalText: string;
  decision: FallbackDecision;
  preserveNatural: true;
}

const HIGH_RISK_PREDICATES = new Set([
  'grant', 'revoke', 'authorize', 'approve', 'deny', 'reject',
  'consent', 'agree', 'opt_in', 'opt_out',
  'prohibit', 'forbid', 'restrict', 'block', 'allow', 'permit',
  'delete', 'destroy', 'erase', 'purge', 'remove',
  'disclose', 'share', 'export', 'transfer',
  'encrypt', 'decrypt', 'sign', 'verify',
  'escalate', 'alert', 'notify',
  'launch', 'execute', 'deploy',
]);

const HIGH_RISK_MODALITIES = new Set(['must', 'must_not', 'shall', 'shall_not']);

export function isHighRisk(sem: LunumSem): { highRisk: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const clause of sem.clauses) {
    if (HIGH_RISK_PREDICATES.has(clause.predicate)) {
      reasons.push(`predicate '${clause.predicate}' is safety-critical`);
    }
    if (clause.modality && HIGH_RISK_MODALITIES.has(clause.modality)) {
      reasons.push(`modality '${clause.modality}' on '${clause.predicate}' implies obligation/prohibition`);
    }
    if (clause.negated === true && HIGH_RISK_PREDICATES.has(clause.predicate)) {
      reasons.push(`negated safety-critical predicate '${clause.predicate}'`);
    }
    for (const condition of clause.conditions ?? []) {
      if (HIGH_RISK_PREDICATES.has(condition.predicate)) {
        reasons.push(`condition predicate '${condition.predicate}' is safety-critical`);
      }
    }
  }
  return { highRisk: reasons.length > 0, reasons };
}

export function evaluateHighRiskFallback(
  sem: LunumSem,
  confidence: number,
  naturalText: string,
  context: FallbackContext = {},
  policy: FallbackPolicy = DEFAULT_FALLBACK_POLICY
): HighRiskFallbackRecord {
  const base = evaluateFallback(sem, confidence, context, policy);
  const risk = isHighRisk(sem);
  if (risk.highRisk) {
    base.highRisk = true;
    if (base.action === 'store') {
      base.action = 'review';
      base.reasons = [...base.reasons, ...risk.reasons.map(r => `high-risk: ${r}`)];
    } else {
      base.reasons = [...base.reasons, ...risk.reasons.map(r => `high-risk: ${r}`)];
    }
  }
  return { sem, naturalText, decision: base, preserveNatural: true };
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

// ── Uncertainty-based Confidence Evaluation (R2.8) ────────────────────

/**
 * Compute ParseConfidence from evidence factors.
 *
 * Aggregates evidence factors into a single confidence score.
 * Uses weighted average: higher weight on critical factors.
 * Applies fail-safe: if evidence is missing/NaN, returns score 0.
 *
 * @param evidence Evidence factors (must have required factors)
 * @param uncertaintyReasons Optional list of uncertainty reasons
 * @returns ParseConfidence with aggregated score and metadata
 */
export function computeParseConfidence(
  evidence: ConfidenceEvidenceFactors,
  uncertaintyReasons: UncertaintyReason[] = [],
  minEvidenceThreshold = DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minEvidenceThreshold
): ParseConfidence {
  // Extract critical evidence factors
  const syntactic = evidence.syntacticValidity ?? 0;
  const roleComplete = evidence.roleCompletion ?? 0;
  const predicateKnown = evidence.predicateKnown ?? 0;
  const modalityClarity = evidence.modalityClarity ?? 0;
  const structural = evidence.structuralWellFormedness ?? 0;
  const contextAlign = evidence.contextAlignment ?? 0;

  // Check for NaN/undefined (fail-safe)
  const factors = [syntactic, roleComplete, predicateKnown, modalityClarity, structural, contextAlign];
  if (factors.some(f => !Number.isFinite(f))) {
    return {
      score: 0,
      evidence,
      minEvidence: 0,
      uncertaintyReasons: [...uncertaintyReasons, { category: 'lowEvidence', description: 'invalid evidence factors (NaN/undefined)' }],
      meetsMinimumEvidence: false
    };
  }

  // Compute minimum evidence (fail-safe threshold)
  const minEvidence = Math.min(...factors);

  // Weighted average: syntactic and structural are most critical
  const weights = [0.2, 0.15, 0.15, 0.15, 0.2, 0.15];
  const weightedSum = factors.reduce((sum, f, i) => sum + f * weights[i]!, 0);

  // Apply confidence adjustment based on minimum evidence
  let score = weightedSum;
  if (minEvidence < minEvidenceThreshold) {
    score = score * (minEvidence / minEvidenceThreshold);
  }

  // Ensure score is clamped to [0, 1]
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    evidence,
    minEvidence,
    uncertaintyReasons,
    meetsMinimumEvidence: minEvidence >= minEvidenceThreshold
  };
}

/**
 * Validate that confidence has sufficient evidence.
 *
 * Checks if all required evidence factors meet minimum threshold.
 * Fail-safe: missing confidence returns false.
 *
 * @param confidence ParseConfidence to validate
 * @param policy Uncertainty fallback policy (uses minEvidenceThreshold)
 * @returns true if evidence is sufficient, false otherwise
 */
export function hasMinimumEvidence(
  confidence: ParseConfidence | undefined | null,
  policy: UncertaintyFallbackPolicy = DEFAULT_UNCERTAINTY_FALLBACK_POLICY
): boolean {
  if (!confidence || !Number.isFinite(confidence.score)) {
    return false; // Fail-safe: treat missing/invalid as insufficient
  }

  if (confidence.minEvidence < policy.minEvidenceThreshold) {
    return false;
  }

  if (policy.requireAllEvidenceFactors) {
    const evidence = confidence.evidence;
    const criticalFactors = [
      evidence.syntacticValidity ?? 0,
      evidence.roleCompletion ?? 0,
      evidence.predicateKnown ?? 0,
      evidence.modalityClarity ?? 0,
      evidence.structuralWellFormedness ?? 0,
      evidence.contextAlignment ?? 0
    ];
    return criticalFactors.every(f => f >= policy.minEvidenceThreshold);
  }

  return true;
}

/**
 * Evaluate uncertainty-based fallback decision (R2.8).
 *
 * Combines confidence score with evidence validation.
 * Automatically falls back if:
 * - Confidence score is below minimum
 * - Evidence is insufficient
 * - Confidence is missing/invalid (fail-safe)
 *
 * @param sem Semantic structure
 * @param parseConfidence Confidence with evidence breakdown
 * @param naturalText Original source text
 * @param context Additional context (roles, predicates, etc.)
 * @param policy Uncertainty fallback policy
 * @returns Fallback decision with reasoning
 */
export function evaluateUncertaintyFallback(
  sem: LunumSem,
  parseConfidence: ParseConfidence | undefined | null,
  naturalText: string,
  context: FallbackContext = {},
  policy: UncertaintyFallbackPolicy = DEFAULT_UNCERTAINTY_FALLBACK_POLICY
): FallbackDecision {
  const reasons: string[] = [];

  // Fail-safe: missing or invalid confidence always triggers fallback
  if (!parseConfidence || !Number.isFinite(parseConfidence.score)) {
    reasons.push('confidence missing or invalid (fail-safe: treat as 0)');
    return { action: 'fallback', reasons, confidence: 0 };
  }

  const { score, minEvidence, uncertaintyReasons } = parseConfidence;

  // Check score against threshold
  if (score < policy.minConfidence - policy.reviewBandWidth) {
    reasons.push(`confidence ${score.toFixed(3)} below minimum ${policy.minConfidence}`);
  } else if (score < policy.minConfidence) {
    reasons.push(`confidence ${score.toFixed(3)} in review band [${(policy.minConfidence - policy.reviewBandWidth).toFixed(3)}, ${policy.minConfidence.toFixed(3)})`);
  }

  // Check minimum evidence requirement
  if (!hasMinimumEvidence(parseConfidence, policy)) {
    reasons.push(`minimum evidence ${minEvidence.toFixed(3)} below threshold ${policy.minEvidenceThreshold}`);
    if (policy.autoFallbackOnLowEvidence) {
      reasons.push('auto-fallback triggered by insufficient evidence');
    }
  }

  // Add uncertainty reasons to decision
  if (uncertaintyReasons.length > 0) {
    reasons.push(...uncertaintyReasons.map(r => `uncertainty: ${r.description}`));
  }

  // Determine action
  let action: 'store' | 'fallback' | 'review' = 'store';
  if (
    score < policy.minConfidence - policy.reviewBandWidth ||
    (policy.autoFallbackOnLowEvidence && !hasMinimumEvidence(parseConfidence, policy))
  ) {
    action = 'fallback';
  } else if (score < policy.minConfidence || !hasMinimumEvidence(parseConfidence, policy)) {
    action = 'review';
  }

  return { action, reasons, confidence: score };
}

/**
 * Create a natural-language fallback record for uncertain parses.
 *
 * Used when ParseConfidence indicates insufficient evidence.
 * Preserves original natural text and confidence reasoning.
 *
 * @param sem Semantic structure (possibly incomplete/uncertain)
 * @param parseConfidence Confidence with evidence breakdown
 * @param naturalText Original source text to preserve
 * @returns Fallback record with natural text preserved
 */
export interface UncertaintyFallbackRecord {
  sem: LunumSem;
  naturalText: string;
  parseConfidence: ParseConfidence;
  decision: FallbackDecision;
  preserveNatural: true;
}

export function createNaturalLanguageFallback(
  sem: LunumSem,
  parseConfidence: ParseConfidence | undefined | null,
  naturalText: string,
  context: FallbackContext = {},
  policy: UncertaintyFallbackPolicy = DEFAULT_UNCERTAINTY_FALLBACK_POLICY
): UncertaintyFallbackRecord {
  const decision = evaluateUncertaintyFallback(sem, parseConfidence, naturalText, context, policy);

  // Ensure action is fallback for natural language preservation
  if (policy.preserveNaturalOnFallback && decision.action === 'fallback') {
    decision.action = 'fallback';
  }

  return {
    sem,
    naturalText,
    parseConfidence: parseConfidence ?? {
      score: 0,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [{ category: 'unknown', description: 'confidence not provided' }],
      meetsMinimumEvidence: false
    },
    decision,
    preserveNatural: true
  };
}
