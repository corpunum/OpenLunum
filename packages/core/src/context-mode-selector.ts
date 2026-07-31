/**
 * Context mode selector — evidence-backed eligibility rules for context mode
 * selection (R7.6).
 *
 * Picks an optimal context mode (`natural` | `lunum` | `mixed`) based on a set
 * of evidence signals:
 *  1. Domain category — known natural-only domains force `natural`.
 *  2. Parse confidence — low confidence forces `natural`.
 *  3. Literal density — high protected-literal density forces `natural`.
 *  4. Token budget & savings — lunum is preferred only when token savings are
 *     significant relative to the available budget.
 *  5. Clause-level mixed parsing — when some clauses parse well but others
 *     do not, `mixed` is selected.
 *
 * @see {@link https://github.com/earendil-works/OpenLunum/issues/510 Issue #510}
 */

import type { LunumClause } from './types.js';
import { DEFAULT_UNCERTAINTY_FALLBACK_POLICY } from './fallback-policy.js';
import { NATURAL_ONLY_CATEGORIES } from './policy-classifier.js';
import { PROHIBITED_DOMAIN_IDS } from './prohibited-domains.js';
import type { ProhibitedDomainId } from './prohibited-domains.js';

// ── Threshold configuration ────────────────────────────────────────

/**
 * Minimum parse confidence required for lunum or mixed mode.
 * Below this threshold the selector defaults to natural language.
 */
export const MIN_CONFIDENCE_FOR_LUNUM =
  DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minConfidence; // 0.7

/**
 * Confidence threshold for "high confidence" lunum-preference path.
 * When confidence exceeds this value *and* token savings are sufficient,
 * the selector chooses lunum unconditionally.
 */
export const CONFIDENCE_HIGH_THRESHOLD = 0.9;

/**
 * Minimum ratio of token savings to the original token count for lunum
 * to be preferred over natural.  Computed as:
 *   tokenSavings / originalTokenCount ≥ TOKEN_SAVINGS_THRESHOLD
 */
export const TOKEN_SAVINGS_THRESHOLD = 0.15; // 15 %

/**
 * Minimum ratio of token savings to the available budget for lunum to win.
 *  The budget-aware threshold ensures lunum is not selected when the savings
 *  would barely fit within the token budget.
 */
export const TOKEN_BUDGET_SAVINGS_THRESHOLD = 0.1; // 10 % of budget

/**
 * Maximum tolerated protected-literal ratio (clauses with protected literals
 * / total clauses) before the selector forces natural mode.
 */
export const MAX_LITERAL_DENSITY = 0.5;

/**
 * Minimum fraction of clauses that must parse well for lunum to be viable.
 * If fewer than this fraction of clauses parse above the confidence threshold,
 * natural mode is forced.
 */
export const MIN_OKAY_CLAUSE_FRACTION = 0.5;

/**
 * Fraction of clauses that parse well but not all — triggers mixed mode.
 * If the fraction of well-parsed clauses is between `MIN_OKAY_CLAUSE_FRACTION`
 * and `1.0` (exclusive), the selector returns `mixed`.
 */
const MIXED_MODE_CEILING = 0.95;

// ── Domain-category mapping ────────────────────────────────────────

/**
 * Categories that always force `natural` context mode, regardless of
 * confidence or token savings.
 */
const NATURAL_FORCE_CATEGORIES: ReadonlySet<string> = new Set([
  ...NATURAL_ONLY_CATEGORIES,
  'exact_quote',
  'code',
  'command',
  'file_path',
  'url',
  'legal_text',
  'medical_text',
  'social_nuance',
  'ambiguous',
  'complex_modality'
]);

// ── Context mode type ──────────────────────────────────────────────

/**
 * Possible context modes for a semantic record or clause.
 *
 *  - `natural` — render / store using the original natural-language text.
 *  - `lunum` — render / store using full Lunum semantic form.
 *  - `mixed` — blend: well-parsed clauses in lunum, the rest in natural.
 *
 * Re-exported from `./context.js` as `ContextMode` (which also includes
 * `'shadow_mixed'`).  This local type is the selector's decision space.
 */
export type ContextModeSelector = 'natural' | 'lunum' | 'mixed';

// ── Input signals ──────────────────────────────────────────────────

/**
 * Evidence signals used by the context mode selector to decide which context
 * mode to apply.
 *
 * All fields are optional; missing signals are treated conservatively (i.e.,
 * they bias the selector toward `natural`).
 */
export interface ContextModeEligibility {
  /** Domain category of the content (e.g. `'legal_advice'`). */
  domainCategory?: ProhibitedDomainId | string | null;

  /** Overall parse confidence score in [0, 1]. */
  parseConfidence?: number | null;

  /**
   * Fraction of clauses containing at least one protected literal in [0, 1].
   */
  literalDensity?: number | null;

  /** Original token count (before lunum compression). */
  originalTokenCount?: number | null;

  /** Estimated token count of the lunum representation. */
  lunumTokenCount?: number | null;

  /** Available token budget (window size). */
  tokenBudget?: number | null;

  /**
   * Number of well-parsed clauses (each clause's parse confidence ≥
   * `MIN_CONFIDENCE_FOR_LUNUM`).  Used for mixed-mode detection.
   */
  wellParsedClauseCount?: number | null;

  /** Total clause count. */
  totalClauseCount?: number | null;

  /**
   * Per-clause confidence scores.  When present the selector performs
   * clause-level analysis for mixed-mode decisions.
   */
  clauseConfidences?: ReadonlyArray<number> | null;

  /**
   * Whether the content has validated Lunum semantics.
   */
  hasValidatedSemantics?: boolean | null;

  /**
   * Human-review flag.  If `true` the selector defaults to `natural`
   * regardless of other signals.
   */
  requiresHumanReview?: boolean | null;
}

// ── Decision output ────────────────────────────────────────────────

/**
 * Decision made by the context mode selector, including the chosen mode and
 * human-readable reasoning.
 */
export interface ContextModeDecision {
  /** The selected context mode. */
  mode: ContextModeSelector;
  /** Stable reasons for this decision (machine-readable keys). */
  reasons: string[];
  /** Human-readable explanation of the decision. */
  explanation: string;
}

// ── Helper functions ───────────────────────────────────────────────

/**
 * Compute the token-savings ratio: `(original - lunum) / original`.
 * Returns `NaN` when original count is missing or zero.
 */
export function computeTokenSavingsRatio(
  originalTokenCount: number,
  lunumTokenCount: number
): number {
  if (originalTokenCount <= 0) return NaN;
  return (originalTokenCount - lunumTokenCount) / originalTokenCount;
}

/**
 * Determine whether the content falls in a domain that forces natural mode.
 */
export function domainForcesNatural(
  domainCategory: ProhibitedDomainId | string | null | undefined
): boolean {
  if (domainCategory == null) return false;
  const key = domainCategory.toLowerCase();

  // Prohibited domains always force natural.
  if (PROHIBITED_DOMAIN_IDS.includes(key as ProhibitedDomainId)) {
    return true;
  }

  // Natural-only categories force natural.
  if (NATURAL_FORCE_CATEGORIES.has(key)) {
    return true;
  }

  return false;
}

/**
 * Determine the fraction of clauses that parse well.
 */
export function computeWellParsedFraction(
  wellParsedClauseCount: number | null,
  totalClauseCount: number | null
): number | null {
  if (
    wellParsedClauseCount === null ||
    totalClauseCount === null ||
    totalClauseCount <= 0
  ) {
    return null;
  }
  return wellParsedClauseCount / totalClauseCount;
}

// ── Clause-level mixed-mode analysis ───────────────────────────────

/**
 * Analyse per-clause confidence scores to determine if mixed mode is warranted.
 *
 * Returns `true` when a meaningful subset of clauses parse well but not all of
 * them do — a signal that `mixed` mode can capture the well-parsed parts in
 * lunum and fall back to natural for the rest.
 */
export function clauseLevelMixedAnalysis(
  clauseConfidences: ReadonlyArray<number>,
  threshold: number
): { mixed: boolean; wellParsedCount: number } {
  const total = clauseConfidences.length;
  if (total === 0) return { mixed: false, wellParsedCount: 0 };

  let wellParsedCount = 0;
  for (const conf of clauseConfidences) {
    if (conf >= threshold) wellParsedCount++;
  }

  const fraction = wellParsedCount / total;
  const mixed =
    wellParsedCount > 0 &&
    wellParsedCount < total &&
    fraction >= MIN_OKAY_CLAUSE_FRACTION &&
    fraction < MIXED_MODE_CEILING;

  return { mixed, wellParsedCount };
}

// ── Main selector ──────────────────────────────────────────────────

/**
 * Select the optimal context mode for a semantic record based on evidence
 * signals.
 *
 * Decision flow (applied in order):
 *
 * 1. **Prohibited domain / natural-only category** → `natural`
 * 2. **Requires human review** → `natural`
 * 3. **Low parse confidence** (below `MIN_CONFIDENCE_FOR_LUNUM`) → `natural`
 * 4. **High confidence + sufficient token savings** → `lunum`
 * 5. **Clause-level mixed analysis** → `mixed` (when some clauses parse well
 *    but others do not)
 * 6. **Fallback** → `natural`
 *
 * @param input — Evidence signals from the pipeline.
 * @returns A `ContextModeDecision` with the selected mode and reasoning.
 */
export function selectContextMode(
  input: ContextModeEligibility
): ContextModeDecision {
  const reasons: string[] = [];
  const parts: string[] = [];

  // ── 1. Prohibited domain / natural-only category ─────────────────
  const dc = input.domainCategory;
  if (dc !== null && domainForcesNatural(dc)) {
    reasons.push('domain_forces_natural');
    parts.push(
      `domain '${dc}' forces natural mode`
    );
    return { mode: 'natural', reasons, explanation: parts.join('; ') };
  }

  // ── 2. Requires human review ─────────────────────────────────────
  if (input.requiresHumanReview === true) {
    reasons.push('human_review_required');
    parts.push('requires human review → natural fallback');
    return { mode: 'natural', reasons, explanation: parts.join('; ') };
  }

  // ── 3. Low parse confidence ──────────────────────────────────────
  const confidence =
    input.parseConfidence !== null && input.parseConfidence !== undefined &&
    Number.isFinite(input.parseConfidence)
      ? input.parseConfidence
      : 0;

  if (confidence < MIN_CONFIDENCE_FOR_LUNUM) {
    reasons.push('low_confidence');
    parts.push(
      `parse confidence ${confidence.toFixed(3)} below threshold ${MIN_CONFIDENCE_FOR_LUNUM}`
    );
    return { mode: 'natural', reasons, explanation: parts.join('; ') };
  }

  // ── 4. Literal density check (high density → natural) ────────────
  const literalDensity =
    input.literalDensity !== null && input.literalDensity !== undefined &&
    Number.isFinite(input.literalDensity)
      ? input.literalDensity
      : 0;

  if (literalDensity >= MAX_LITERAL_DENSITY) {
    reasons.push('high_literal_density');
    parts.push(
      `protected-literal density ${literalDensity.toFixed(3)} ≥ ${MAX_LITERAL_DENSITY}`
    );
    return { mode: 'natural', reasons, explanation: parts.join('; ') };
  }

  // ── 5. High confidence + sufficient token savings → lunum ────────
  if (
    confidence >= CONFIDENCE_HIGH_THRESHOLD &&
    input.originalTokenCount !== null &&
    input.originalTokenCount !== undefined &&
    input.lunumTokenCount !== null &&
    input.lunumTokenCount !== undefined
  ) {
    const savingsRatio = computeTokenSavingsRatio(
      input.originalTokenCount,
      input.lunumTokenCount
    );

    if (
      !Number.isNaN(savingsRatio) &&
      savingsRatio >= TOKEN_SAVINGS_THRESHOLD
    ) {
      if (
        input.tokenBudget !== null &&
        input.tokenBudget !== undefined &&
        input.tokenBudget > 0
      ) {
        const lunumFitRatio = input.lunumTokenCount / input.tokenBudget;
        if (lunumFitRatio <= 1.0) {
          reasons.push(
            'high_confidence',
            'token_savings_sufficient',
            'fits_within_budget'
          );
          parts.push(
            `confidence ${confidence.toFixed(3)} ≥ ${CONFIDENCE_HIGH_THRESHOLD}; ` +
              `token savings ${savingsRatio.toFixed(1)}% ≥ ${TOKEN_SAVINGS_THRESHOLD * 100}%; ` +
              `lunum fits in budget`
          );
          return { mode: 'lunum', reasons, explanation: parts.join('; ') };
        }
      } else {
        reasons.push('high_confidence', 'token_savings_sufficient');
        parts.push(
          `confidence ${confidence.toFixed(3)} ≥ ${CONFIDENCE_HIGH_THRESHOLD}; ` +
            `token savings ${savingsRatio.toFixed(1)}% ≥ ${TOKEN_SAVINGS_THRESHOLD * 100}%`
        );
        return { mode: 'lunum', reasons, explanation: parts.join('; ') };
      }
    }
  }

  // ── 6. Clause-level mixed analysis ───────────────────────────────
  if (input.clauseConfidences !== null && input.clauseConfidences !== undefined && input.clauseConfidences.length > 0) {
    const analysis = clauseLevelMixedAnalysis(
      input.clauseConfidences,
      MIN_CONFIDENCE_FOR_LUNUM
    );

    if (analysis.mixed) {
      reasons.push(
        'clause_level_mixed',
        `well_parsed_${analysis.wellParsedCount}/${input.clauseConfidences.length}`
      );
      parts.push(
        `${analysis.wellParsedCount} of ${input.clauseConfidences.length} clauses parse well → mixed mode`
      );
      return { mode: 'mixed', reasons, explanation: parts.join('; ') };
    }
  }

  // ── 7. Budget-aware fallback to lunum ────────────────────────────
  // When confidence is decent but below the "high" threshold, check if
  // lunum still fits the budget.  This allows partial lunum adoption.
  if (
    confidence >= MIN_CONFIDENCE_FOR_LUNUM &&
    input.lunumTokenCount !== null &&
    input.lunumTokenCount !== undefined &&
    input.lunumTokenCount > 0
  ) {
    if (
      input.tokenBudget !== null &&
      input.tokenBudget !== undefined &&
      input.tokenBudget > 0
    ) {
      const lunumFitRatio = input.lunumTokenCount / input.tokenBudget;
      if (lunumFitRatio <= 1.0) {
        reasons.push('fits_within_budget', 'decent_confidence');
        parts.push(
          `confidence ${confidence.toFixed(3)} ≥ ${MIN_CONFIDENCE_FOR_LUNUM}; ` +
            `lunum fits in budget (ratio ${lunumFitRatio.toFixed(3)})`
        );
        return { mode: 'lunum', reasons, explanation: parts.join('; ') };
      }
    }
  }

  // ── 8. Default → natural ─────────────────────────────────────────
  reasons.push('default_natural');
  parts.push('no signal strongly favours lunum; defaulting to natural');
  return { mode: 'natural', reasons, explanation: parts.join('; ') };
}

// ── Clause-level selector (for mixed mode rendering) ───────────────

/**
 * Per-clause context mode decision.
 */
export interface ClauseContextMode {
  /** Clause index. */
  clauseIndex: number;
  /** Selected mode for this clause. */
  mode: ContextModeSelector;
  /** Confidence score for this clause (if available). */
  confidence?: number;
  /** Reason for the decision. */
  reason: string;
}

/**
 * Re-export `ContextModeSelector` as `ContextMode` for barrel compatibility.
 * Note: `./context.js` also exports `ContextMode = 'natural' | 'lunum' | 'mixed' | 'shadow_mixed'`.
 * The barrel file resolves this by explicitly re-exporting both as named types.
 */

/**
 * Determine context mode for each clause individually.
 *
 * Returns an array of `ClauseContextMode`, one per clause, suitable for
 * building a mixed-mode rendering where some clauses are rendered in lunum
 * and others in natural language.
 *
 * @param clauses — The clauses to classify.
 * @param input — Shared eligibility signals (used for domain, confidence, etc.).
 * @returns Per-clause mode decisions.
 */
export function selectContextModePerClause(
  clauses: LunumClause[],
  input: ContextModeEligibility
): ClauseContextMode[] {
  return clauses.map((clause, index) => {
    const clauseConfidence =
      input.clauseConfidences !== null &&
      input.clauseConfidences !== undefined &&
      index < input.clauseConfidences.length
        ? input.clauseConfidences[index]
        : input.parseConfidence;

    const effectiveConfidence =
      clauseConfidence !== null && clauseConfidence !== undefined &&
      Number.isFinite(clauseConfidence)
        ? clauseConfidence
        : 0;

    if (effectiveConfidence >= MIN_CONFIDENCE_FOR_LUNUM) {
      return {
        clauseIndex: index,
        mode: 'lunum',
        confidence: effectiveConfidence,
        reason: `clause ${index} confidence ${effectiveConfidence.toFixed(3)} ≥ ${MIN_CONFIDENCE_FOR_LUNUM}`
      };
    }

    return {
      clauseIndex: index,
      mode: 'natural',
      confidence: effectiveConfidence,
      reason: `clause ${index} confidence ${effectiveConfidence.toFixed(3)} < ${MIN_CONFIDENCE_FOR_LUNUM}`
    };
  });
}

// ── Export to prevent tree-shaking ─────────────────────────────────

export const contextModeSelectorExports = [
  selectContextMode,
  selectContextModePerClause
] as const;
