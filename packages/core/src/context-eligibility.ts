/**
 * Context eligibility rules — evidence-backed decision module (R7.6, #482).
 *
 * This module defines typed eligibility rules that decide when Lunum compact,
 * mixed, or natural-text context is selected.  It integrates with the
 * uncertainty policy (R2.8) for confidence scoring and with the prohibited-
 * domains registry for domain-safety checks.
 *
 * Decision flow (applied in order):
 *
 * 1. Domain safety — prohibited domains → natural only.
 * 2. Confidence score — below R2.8 minimum → natural only.
 * 3. Protected-literal density — above threshold → natural only.
 * 4. Semantic complexity — high complexity with moderate confidence → mixed.
 * 5. Default — lunum (when tokens are saved) or natural (when no savings).
 *
 * @see {@link https://github.com/earendil-works/OpenLunum/issues/482 Issue #482}
 */

import type { LunumClause, LunumSem } from './types.js';
import { DEFAULT_UNCERTAINTY_FALLBACK_POLICY } from './fallback-policy.js';
import {
  PROHIBITED_DOMAIN_IDS,
  PROHIBITED_DOMAIN_SPECS,
  type ProhibitedDomainId
} from './prohibited-domains.js';
import {
  ELIGIBLE_CATEGORIES,
  NATURAL_ONLY_CATEGORIES,
  classifyContent,
  getCategoryMetadata,
  type RiskLevel
} from './policy-classifier.js';
import {
  selectContextMode,
  selectContextModePerClause,
  MIN_CONFIDENCE_FOR_LUNUM,
  CONFIDENCE_HIGH_THRESHOLD,
  TOKEN_SAVINGS_THRESHOLD,
  MAX_LITERAL_DENSITY,
  MIN_OKAY_CLAUSE_FRACTION,
  type ContextModeEligibility,
  type ContextModeDecision,
  type ClauseContextMode
} from './context-mode-selector.js';

export { computeTokenSavingsRatio } from './context-mode-selector.js';

// ── Rule definitions ───────────────────────────────────────────────

/**
 * Individual eligibility rule that can be evaluated independently.
 */
export type EligibilityRuleId =
  | 'domain_safety'
  | 'parse_confidence'
  | 'literal_density'
  | 'semantic_complexity'
  | 'token_budget'
  | 'human_review'
  | 'validated_semantics';

/**
 * Result of evaluating a single eligibility rule.
 */
export interface RuleEvaluation {
  /** Stable rule identifier. */
  rule: EligibilityRuleId;
  /** Whether the rule passed (content is eligible for the candidate mode). */
  passed: boolean;
  /** Machine-readable reason code. */
  reasonCode: string;
  /** Human-readable explanation of the evaluation. */
  explanation: string;
  /** Numeric score used in the decision (if applicable, 0–1). */
  score?: number;
  /** Additional diagnostic data (never required for decisions). */
  diagnostics?: Record<string, unknown>;
}

// ── Composite decision types ───────────────────────────────────────

/**
 * Context mode that the eligibility engine recommends.
 * Mirrors `ContextModeSelector` but is the engine's canonical output type.
 */
export type EligibleContextMode = 'natural' | 'lunum' | 'mixed';

/**
 * Full eligibility decision produced by the engine.
 */
export interface EligibilityDecisionResult {
  /** Recommended context mode. */
  recommendedMode: EligibleContextMode;
  /** All rule evaluations, ordered by decision priority. */
  rules: RuleEvaluation[];
  /** Overall eligibility score [0, 1]. */
  eligibilityScore: number;
  /** Whether the content is eligible for Lunum compact mode. */
  isEligibleForLunum: boolean;
  /** Whether the content is eligible for mixed mode (partial lunum). */
  isEligibleForMixed: boolean;
  /** Whether the content must use natural mode. */
  isForcedNatural: boolean;
  /** Human-readable summary of the decision. */
  summary: string;
}

/**
 * Semantic complexity score for a clause or semantic block.
 * Higher values indicate more complex semantic structures.
 */
export type SemanticComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';

/**
 * Input to the eligibility engine.  All fields are optional; the engine
 * derives defaults and missing signals conservatively.
 */
export interface ContextEligibilityInput {
  /** Domain category of the content (e.g. `'legal_advice'`). */
  domainCategory?: ProhibitedDomainId | string | null;

  /** Human-readable domain name (from prohibited domain spec, if known). */
  domainName?: string | null;

  /** Overall parse confidence score in [0, 1] (from R2.8 uncertainty policy). */
  parseConfidence?: number | null;

  /** Evidence factors contributing to parse confidence (R2.8). */
  confidenceEvidence?: Record<string, number> | null;

  /** Uncertainty reasons explaining low confidence (R2.8). */
  uncertaintyReasons?: Array<{ category: string; description: string }> | null;

  /** Fraction of clauses containing protected literals in [0, 1]. */
  literalDensity?: number | null;

  /** Absolute count of clauses with protected literals. */
  protectedLiteralClauseCount?: number | null;

  /** Total clause count. */
  totalClauseCount?: number | null;

  /** Original token count (before lunum compression). */
  originalTokenCount?: number | null;

  /** Estimated token count of the lunum representation. */
  lunumTokenCount?: number | null;

  /** Available token budget (window size). */
  tokenBudget?: number | null;

  /** Content category (from policy classifier). */
  category?: string | null;

  /** Risk level of the content. */
  risk?: RiskLevel | null;

  /** Per-clause confidence scores for mixed-mode detection. */
  clauseConfidences?: ReadonlyArray<number> | null;

  /** Whether the content has validated Lunum semantics. */
  hasValidatedSemantics?: boolean | null;

  /** Whether human review is required. */
  requiresHumanReview?: boolean | null;

  /** Raw semantic structure (for complexity analysis). */
  semantics?: LunumSem | null;

  /** Raw clauses (for per-clause complexity analysis). */
  clauses?: LunumClause[] | null;

  /** Semantic complexity level (pre-computed, overrides automatic computation). */
  semanticComplexity?: SemanticComplexityLevel | null;

  /** Whether the content contains high-risk predicates. */
  isHighRisk?: boolean | null;

  /** Content language (ISO 639-1 code, if known). */
  language?: string | null;

  /** Whether the content is from a trusted source. */
  isTrusted?: boolean | null;
}

// ── Complexity analysis ────────────────────────────────────────────

/**
 * Evaluate semantic complexity of a LunumSem structure.
 *
 * Returns a complexity level based on:
 * - Number of clauses
 * - Presence of conditions/consequences (nested structure)
 * - Predicate variety
 * - Modality richness
 * - Negation patterns
 *
 * Complexity levels:
 * - trivial: ≤1 clause, no nesting, no modality
 * - simple: 2–3 clauses, no nesting, minimal modality
 * - moderate: 4–6 clauses, shallow nesting, some modality/conditions
 * - complex: ≥7 clauses, deep nesting, rich modality, conditions + consequences
 */
export function evaluateSemanticComplexity(
  sem: LunumSem | null | undefined
): SemanticComplexityLevel {
  if (!sem || !sem.clauses || sem.clauses.length === 0) {
    return 'trivial';
  }

  const clauseCount = sem.clauses.length;
  let nestingDepth = 0;
  let modalityCount = 0;
  let negationCount = 0;
  let conditionCount = 0;
  let consequenceCount = 0;
  const predicates = new Set<string>();

  function walk(clauses: LunumClause[]): void {
    for (const clause of clauses) {
      predicates.add(clause.predicate);
      if (clause.modality) modalityCount++;
      if (clause.negated) negationCount++;
      if (clause.conditions?.length) {
        conditionCount += clause.conditions.length;
        nestingDepth = Math.max(nestingDepth, 1);
        walk(clause.conditions);
      }
      if (clause.consequences?.length) {
        consequenceCount += clause.consequences.length;
        nestingDepth = Math.max(nestingDepth, 1);
        walk(clause.consequences);
      }
    }
  }

  walk(sem.clauses);

  const hasDeepNesting = nestingDepth > 1;
  const richModality = modalityCount >= 3;
  const hasNegation = negationCount > 0;
  const hasNestedStructure = conditionCount > 0 || consequenceCount > 0;

  if (
    clauseCount >= 7 &&
    (hasDeepNesting || richModality || hasNestedStructure)
  ) {
    return 'complex';
  }

  if (
    (clauseCount >= 4 && hasNestedStructure) ||
    (clauseCount >= 5 && richModality) ||
    (clauseCount >= 6 && hasDeepNesting)
  ) {
    return 'moderate';
  }

  if (clauseCount >= 2 && (hasNegation || hasNestedStructure || modalityCount >= 2)) {
    return 'simple';
  }

  return 'trivial';
}

/**
 * Evaluate per-clause semantic complexity.
 *
 * Returns a list of per-clause complexity scores, useful for mixed-mode
 * decisions where some clauses are simple enough for lunum while others
 * benefit from natural rendering.
 */
export function evaluateClauseComplexity(
  clauses: LunumClause[] | null | undefined
): Array<{ clauseIndex: number; complexity: SemanticComplexityLevel }> {
  if (!clauses || clauses.length === 0) return [];

  return clauses.map((clause, index) => ({
    clauseIndex: index,
    complexity: evaluateSingleClauseComplexity(clause)
  }));
}

function evaluateSingleClauseComplexity(clause: LunumClause): SemanticComplexityLevel {
  const roleCount = Object.keys(clause.roles ?? {}).length;
  const conditionCount = clause.conditions?.length ?? 0;
  const consequenceCount = clause.consequences?.length ?? 0;
  const hasModality = clause.modality !== null && clause.modality !== undefined;
  const hasNegation = clause.negated === true;
  const totalNested = conditionCount + consequenceCount;

  if (roleCount >= 5 || totalNested >= 2 || (hasModality && hasNegation)) {
    return 'complex';
  }

  if (roleCount >= 3 || totalNested >= 1 || (hasModality && roleCount >= 2)) {
    return 'moderate';
  }

  if (roleCount >= 2 || hasModality || hasNegation) {
    return 'simple';
  }

  return 'trivial';
}

// ── Rule evaluators ────────────────────────────────────────────────

/**
 * Evaluate the domain-safety rule.
 *
 * Prohibited domains always force natural mode.  Natural-only categories
 * (from the policy classifier) also force natural mode.
 */
export function evaluateDomainSafetyRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  const domain = input.domainCategory;
  if (domain == null) {
    return {
      rule: 'domain_safety',
      passed: true,
      reasonCode: 'no_domain_specified',
      explanation: 'No domain category specified; domain safety check skipped.',
      score: 1
    };
  }

  const key = String(domain).toLowerCase();
  const isProhibited = PROHIBITED_DOMAIN_IDS.includes(key as ProhibitedDomainId);
  const isNaturalOnlyCategory = NATURAL_ONLY_CATEGORIES.has(key);

  if (isProhibited) {
    const spec = PROHIBITED_DOMAIN_SPECS[key as ProhibitedDomainId];
    return {
      rule: 'domain_safety',
      passed: false,
      reasonCode: 'prohibited_domain',
      explanation: spec
        ? `Domain '${domain}' is a prohibited automatic-use domain: ${spec.description}`
        : `Domain '${domain}' is a prohibited domain.`,
      score: 0,
      diagnostics: { domain, isProhibited: true, specId: key as ProhibitedDomainId }
    };
  }

  if (isNaturalOnlyCategory) {
    return {
      rule: 'domain_safety',
      passed: false,
      reasonCode: 'natural_only_category',
      explanation: `Category '${domain}' is classified as natural-only.`,
      score: 0,
      diagnostics: { domain, isNaturalOnly: true }
    };
  }

  return {
    rule: 'domain_safety',
    passed: true,
    reasonCode: 'domain_allowed',
    explanation: `Domain '${domain}' is allowed for lunum/mixed use.`,
    score: 1,
    diagnostics: { domain, isProhibited: false, isNaturalOnly: false }
  };
}

/**
 * Evaluate the parse-confidence rule (R2.8).
 *
 * If the parse confidence is below the R2.8 minimum, natural mode is forced.
 */
export function evaluateConfidenceRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  const confidence = input.parseConfidence;

  if (confidence == null || !Number.isFinite(confidence)) {
    return {
      rule: 'parse_confidence',
      passed: false,
      reasonCode: 'confidence_missing',
      explanation: 'Parse confidence is missing or invalid; defaulting to natural mode.',
      score: 0
    };
  }

  const minConfidence = DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minConfidence;

  if (confidence < minConfidence) {
    return {
      rule: 'parse_confidence',
      passed: false,
      reasonCode: 'confidence_below_minimum',
      explanation: `Parse confidence ${confidence.toFixed(3)} below R2.8 minimum ${minConfidence}.`,
      score: confidence,
      diagnostics: { confidence, minConfidence }
    };
  }

  // Check evidence factors if provided (R2.8)
  if (input.confidenceEvidence) {
    const evidenceValues = Object.values(input.confidenceEvidence).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    if (evidenceValues.length > 0) {
      const minEvidence = Math.min(...evidenceValues);
      const minEvidenceThreshold = DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minEvidenceThreshold;
      if (minEvidence < minEvidenceThreshold) {
        return {
          rule: 'parse_confidence',
          passed: false,
          reasonCode: 'evidence_below_threshold',
          explanation: `Minimum evidence factor ${minEvidence.toFixed(3)} below threshold ${minEvidenceThreshold}.`,
          score: minEvidence,
          diagnostics: { minEvidence, minEvidenceThreshold }
        };
      }
    }
  }

  return {
    rule: 'parse_confidence',
    passed: true,
    reasonCode: 'confidence_sufficient',
    explanation: `Parse confidence ${confidence.toFixed(3)} meets R2.8 minimum ${minConfidence}.`,
    score: confidence,
    diagnostics: { confidence, minConfidence }
  };
}

/**
 * Evaluate the protected-literal density rule.
 *
 * High protected-literal density indicates content where natural rendering
 * preserves meaning better than lunum compact form.
 */
export function evaluateLiteralDensityRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  const density = input.literalDensity;

  if (density == null || !Number.isFinite(density)) {
    return {
      rule: 'literal_density',
      passed: true,
      reasonCode: 'density_unknown',
      explanation: 'Literal density not specified; treating as zero (conservative).',
      score: 1
    };
  }

  if (density >= MAX_LITERAL_DENSITY) {
    return {
      rule: 'literal_density',
      passed: false,
      reasonCode: 'high_literal_density',
      explanation: `Protected-literal density ${density.toFixed(3)} ≥ ${MAX_LITERAL_DENSITY}; natural mode preserves protected literals better.`,
      score: 1 - density,
      diagnostics: { density, threshold: MAX_LITERAL_DENSITY }
    };
  }

  return {
    rule: 'literal_density',
    passed: true,
    reasonCode: 'literal_density_acceptable',
    explanation: `Protected-literal density ${density.toFixed(3)} < ${MAX_LITERAL_DENSITY}.`,
    score: 1 - density,
    diagnostics: { density, threshold: MAX_LITERAL_DENSITY }
  };
}

/**
 * Evaluate the semantic-complexity rule.
 *
 * Complex semantics with moderate confidence favour mixed mode (not full lunum
 * and not forced natural).  Trivial semantics with high confidence favour lunum.
 *
 * This rule does NOT force natural mode on its own; it influences the choice
 * between lunum and mixed.
 */
export function evaluateComplexityRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  const complexity = input.semanticComplexity;
  const semantics = input.semantics;
  const clauses = input.clauses;

  // Use pre-computed complexity if provided
  let level: SemanticComplexityLevel;
  if (complexity) {
    level = complexity;
  } else if (semantics) {
    level = evaluateSemanticComplexity(semantics);
  } else if (clauses && clauses.length > 0) {
    // Compute from clauses alone
    level = evaluateClauseComplexity(clauses).every(c => c.complexity === 'trivial')
      ? 'trivial'
      : 'simple';
  } else {
    return {
      rule: 'semantic_complexity',
      passed: true,
      reasonCode: 'complexity_unknown',
      explanation: 'No semantic structure available; defaulting to pass.',
      score: 1
    };
  }

  // Complex semantics with moderate confidence → mixed eligible but not full lunum
  const confidence = input.parseConfidence ?? 0;
  const isModerateOrLower = confidence < CONFIDENCE_HIGH_THRESHOLD;

  if (level === 'complex' && isModerateOrLower) {
    return {
      rule: 'semantic_complexity',
      passed: true,
      reasonCode: 'complex_moderate_confidence',
      explanation: `Complex semantics with confidence ${confidence.toFixed(3)} < ${CONFIDENCE_HIGH_THRESHOLD} → mixed eligible (not full lunum).`,
      score: 0.5,
      diagnostics: { level, confidence }
    };
  }

  if (level === 'moderate' && isModerateOrLower) {
    return {
      rule: 'semantic_complexity',
      passed: true,
      reasonCode: 'moderate_moderate_confidence',
      explanation: `Moderate complexity with confidence ${confidence.toFixed(3)} → mixed eligible.`,
      score: 0.75,
      diagnostics: { level, confidence }
    };
  }

  // Simple/trivial with any confidence → fully eligible
  return {
    rule: 'semantic_complexity',
    passed: true,
    reasonCode: level === 'trivial' ? 'trivial_semantics' : 'simple_semantics',
    explanation: `${level} complexity is fully eligible for lunum.`,
    score: level === 'trivial' ? 1 : 0.8,
    diagnostics: { level, confidence }
  };
}

/**
 * Evaluate the token-budget rule.
 *
 * When lunum tokens exceed the budget, natural mode is forced regardless of
 * other signals.
 */
export function evaluateTokenBudgetRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  const budget = input.tokenBudget;
  const lunumTokens = input.lunumTokenCount;

  if (budget == null || lunumTokens == null) {
    return {
      rule: 'token_budget',
      passed: true,
      reasonCode: 'budget_unknown',
      explanation: 'Token budget or count not specified; skipping budget check.',
      score: 1
    };
  }

  if (lunumTokens > budget) {
    const overflow = lunumTokens - budget;
    return {
      rule: 'token_budget',
      passed: false,
      reasonCode: 'over_budget',
      explanation: `Lunum tokens ${lunumTokens} exceed budget ${budget} by ${overflow}.`,
      score: Math.max(0, 1 - overflow / budget),
      diagnostics: { lunumTokens, budget, overflow }
    };
  }

  return {
    rule: 'token_budget',
    passed: true,
    reasonCode: 'within_budget',
    explanation: `Lunum tokens ${lunumTokens} fit within budget ${budget}.`,
    score: 1 - lunumTokens / budget,
    diagnostics: { lunumTokens, budget }
  };
}

/**
 * Evaluate the human-review rule.
 */
export function evaluateHumanReviewRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  if (input.requiresHumanReview === true) {
    return {
      rule: 'human_review',
      passed: false,
      reasonCode: 'human_review_required',
      explanation: 'Content requires human review; forcing natural mode.',
      score: 0
    };
  }

  return {
    rule: 'human_review',
    passed: true,
    reasonCode: 'no_human_review_required',
    explanation: 'No human review required.',
    score: 1
  };
}

/**
 * Evaluate the validated-semantics rule.
 */
export function evaluateValidatedSemanticsRule(
  input: ContextEligibilityInput
): RuleEvaluation {
  if (input.hasValidatedSemantics === true) {
    return {
      rule: 'validated_semantics',
      passed: true,
      reasonCode: 'semantics_validated',
      explanation: 'Content has validated Lunum semantics.',
      score: 1
    };
  }

  // Missing validation is not a hard fail; it is a soft signal
  return {
    rule: 'validated_semantics',
    passed: true,
    reasonCode: 'semantics_unvalidated',
    explanation: 'Content has not been validated; eligible but unvalidated.',
    score: 0.5,
    diagnostics: { hasValidatedSemantics: input.hasValidatedSemantics }
  };
}

// ── Rule order and weighting ───────────────────────────────────────

/**
 * Ordered list of rule evaluations (highest-priority first).
 * Rules are evaluated in this order; the first hard-fail forces natural mode.
 */
export const RULE_ORDER: ReadonlyArray<EligibilityRuleId> = Object.freeze([
  'domain_safety',
  'human_review',
  'parse_confidence',
  'literal_density',
  'validated_semantics',
  'semantic_complexity',
  'token_budget'
]);

/**
 * Hard-fail rules: when any hard-fail rule fails, natural mode is forced.
 */
const HARD_FAIL_RULES: ReadonlySet<EligibilityRuleId> = new Set([
  'domain_safety',
  'human_review',
  'parse_confidence'
]);

/**
 * Soft-fail rules: when these fail, the eligibility score is reduced but
 * natural mode is not automatically forced.
 */
const SOFT_FAIL_RULES: ReadonlySet<EligibilityRuleId> = new Set([
  'literal_density',
  'semantic_complexity',
  'token_budget',
  'validated_semantics'
]);

// ── Composite eligibility engine ───────────────────────────────────

/**
 * Evaluate all eligibility rules and produce a composite decision.
 *
 * Decision flow:
 * 1. Evaluate all rules in priority order.
 * 2. If any hard-fail rule fails → forced natural mode.
 * 3. If soft-fail rules reduce eligibility below threshold → mixed mode.
 * 4. Otherwise → lunum mode (with token-budget check).
 *
 * @param input — Eligibility signals from the pipeline.
 * @returns Composite eligibility decision.
 */
export function evaluateEligibility(
  input: ContextEligibilityInput
): EligibilityDecisionResult {
  // ── Evaluate all rules ─────────────────────────────────────────
  const rules: RuleEvaluation[] = [];

  for (const ruleId of RULE_ORDER) {
    const evaluation = evaluateRule(ruleId, input);
    rules.push(evaluation);
  }

  // ── Check hard-fail rules ──────────────────────────────────────
  const hardFailRule = rules.find(
    (r) => HARD_FAIL_RULES.has(r.rule) && !r.passed
  );

  if (hardFailRule) {
    // Compute eligibility score: 0 for hard fail, else partial
    const eligibilityScore = computeEligibilityScore(rules);

    return {
      recommendedMode: 'natural',
      rules,
      eligibilityScore,
      isEligibleForLunum: false,
      isEligibleForMixed: false,
      isForcedNatural: true,
      summary: hardFailRule.explanation
    };
  }

  // ── Compute composite eligibility score ────────────────────────
  const eligibilityScore = computeEligibilityScore(rules);

  // ── Decide mode based on score and soft-fail analysis ──────────
  const softFailRules = rules.filter(
    (r) => SOFT_FAIL_RULES.has(r.rule) && !r.passed
  );

  // Token-budget hard-fail: over-budget always forces natural regardless of score
  const budgetRule = softFailRules.find((r) => r.rule === 'token_budget');
  if (budgetRule) {
    return {
      recommendedMode: 'natural',
      rules,
      eligibilityScore,
      isEligibleForLunum: false,
      isEligibleForMixed: false,
      isForcedNatural: true,
      summary: budgetRule.explanation
    };
  }

  if (softFailRules.length > 0 && eligibilityScore < 0.5) {
    // Many soft failures + low score → natural
    return {
      recommendedMode: 'natural',
      rules,
      eligibilityScore,
      isEligibleForLunum: false,
      isEligibleForMixed: false,
      isForcedNatural: true,
      summary: `Soft-fail rules: ${softFailRules.map((r) => r.reasonCode).join(', ')}. Eligibility score ${eligibilityScore.toFixed(3)}.`
    };
  }

  if (softFailRules.length > 0) {
    // Some soft failures → mixed mode eligible
    return {
      recommendedMode: 'mixed',
      rules,
      eligibilityScore,
      isEligibleForLunum: true,
      isEligibleForMixed: true,
      isForcedNatural: false,
      summary: `Eligibility score ${eligibilityScore.toFixed(3)}; soft-fail rules: ${softFailRules.map((r) => r.reasonCode).join(', ')}. Mixed mode recommended.`
    };
  }

  // ── Default: lunum ─────────────────────────────────────────────
  return {
    recommendedMode: 'lunum',
    rules,
    eligibilityScore,
    isEligibleForLunum: true,
    isEligibleForMixed: true,
    isForcedNatural: false,
    summary: `Eligibility score ${eligibilityScore.toFixed(3)}; all rules passed. Lunum mode recommended.`
  };
}

/**
 * Compute a composite eligibility score from rule evaluations.
 *
 * Hard-fail rules contribute their score directly.
 * Soft-fail rules are down-weighted (0.5x).
 * Pass rules contribute their score with full weight.
 */
function computeEligibilityScore(rules: RuleEvaluation[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const rule of rules) {
    const weight = HARD_FAIL_RULES.has(rule.rule) ? 1.0 : 0.5;
    const score = rule.passed ? (rule.score ?? 1) : (rule.score ?? 0);
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Evaluate a single rule by its ID.
 */
function evaluateRule(
  ruleId: EligibilityRuleId,
  input: ContextEligibilityInput
): RuleEvaluation {
  switch (ruleId) {
    case 'domain_safety':
      return evaluateDomainSafetyRule(input);
    case 'human_review':
      return evaluateHumanReviewRule(input);
    case 'parse_confidence':
      return evaluateConfidenceRule(input);
    case 'literal_density':
      return evaluateLiteralDensityRule(input);
    case 'semantic_complexity':
      return evaluateComplexityRule(input);
    case 'token_budget':
      return evaluateTokenBudgetRule(input);
    case 'validated_semantics':
      return evaluateValidatedSemanticsRule(input);
    default:
      return {
        rule: ruleId,
        passed: true,
        reasonCode: 'unknown_rule',
        explanation: `Unknown rule: ${ruleId}`,
        score: 1
      };
  }
}

// ── Bridge to context-mode-selector ────────────────────────────────

/**
 * Convert a `ContextEligibilityInput` to a `ContextModeEligibility` suitable
 * for the existing context-mode-selector, enabling a seamless bridge between
 * the two modules.
 */
export function toContextModeEligibility(
  eligibilityInput: ContextEligibilityInput
): ContextModeEligibility {
  return {
    domainCategory: eligibilityInput.domainCategory ?? null,
    parseConfidence: eligibilityInput.parseConfidence ?? null,
    literalDensity: eligibilityInput.literalDensity ?? null,
    originalTokenCount: eligibilityInput.originalTokenCount ?? null,
    lunumTokenCount: eligibilityInput.lunumTokenCount ?? null,
    tokenBudget: eligibilityInput.tokenBudget ?? null,
    wellParsedClauseCount: null,
    totalClauseCount: eligibilityInput.totalClauseCount ?? null,
    clauseConfidences: eligibilityInput.clauseConfidences ?? null,
    hasValidatedSemantics: eligibilityInput.hasValidatedSemantics ?? null,
    requiresHumanReview: eligibilityInput.requiresHumanReview ?? null
  };
}

/**
 * Alias for `selectContextMode` that uses the eligibility engine's output
 * to populate the selector's input.  This is the recommended entry point
 * when you already have an `EligibilityDecisionResult`.
 */
export function selectModeFromEligibility(
  eligibilityResult: EligibilityDecisionResult
): ContextModeDecision {
  return {
    mode: eligibilityResult.recommendedMode as 'natural' | 'lunum' | 'mixed',
    reasons: eligibilityResult.rules.map((r) => r.reasonCode),
    explanation: eligibilityResult.summary
  };
}

// ── Export to prevent tree-shaking ─────────────────────────────────

export const contextEligibilityExports = [
  evaluateEligibility,
  evaluateDomainSafetyRule,
  evaluateConfidenceRule,
  evaluateLiteralDensityRule,
  evaluateComplexityRule,
  evaluateTokenBudgetRule,
  evaluateHumanReviewRule,
  evaluateValidatedSemanticsRule,
  evaluateSemanticComplexity,
  evaluateClauseComplexity,
  toContextModeEligibility,
  selectModeFromEligibility
] as const;
