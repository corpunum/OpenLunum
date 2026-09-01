import { validateSem } from './canonicalize.js';
import {
  computeParseConfidence,
  hasMinimumEvidence,
  isHighRisk,
  type ConfidenceEvidenceFactors,
} from './fallback-policy.js';
import {
  classifyDomain,
  DOMAIN_BLOCK_CONFIDENCE_THRESHOLD,
} from './prohibited-domains.js';
import type { EligibilityDecision, LunumClause, LunumSem, Risk, SemanticTrustDecision } from './types.js';

const ELIGIBLE = new Set(['preference', 'simple_fact', 'tool_event', 'project_state', 'retrieval_rule', 'system_fact', 'benchmark_result']);
const NATURAL_ONLY = new Set(['conditional_instruction', 'safety_constraint', 'safety_event', 'exact_quote', 'code', 'command', 'file_path', 'url', 'legal_text', 'medical_text', 'social_nuance', 'ambiguous', 'complex_modality']);
const EXACT_RE = /```|https?:\/\/|(?:^|\s)(?:[A-Za-z]:\\|\/)[^\s]+|\b(?:rm|sudo|curl|wget|git|npm|pnpm|python|node)\s+-?[^\n]*/u;

export interface EligibilityInput {
  category?: string;
  risk?: Risk;
  confidence?: number;
  sourceText?: string;
  semantic?: boolean;
}

/**
 * Evidence that a category/risk assertion was produced by a named classifier
 * or reviewer. Raw caller supplied category/risk labels are not evidence.
 */
export interface SemanticClassificationEvidence {
  category: string;
  risk: Risk;
  method: 'rule_based' | 'independent_model' | 'human_review';
  evidenceId: string;
  verifiedAt: string;
}

/** Independent corroboration of a candidate Sem against its source. */
export interface SemanticVerification {
  method: 'independent_model' | 'human_review';
  verifierId: string;
  verifiedAt: string;
  result: 'match';
}

export interface SemanticTrustInput {
  sem: unknown;
  sourceText?: string | undefined;
  category?: string | undefined;
  risk?: Risk | undefined;
  /** Recomputed by this module; never pass an aggregate score here. */
  confidenceEvidence?: ConfidenceEvidenceFactors | undefined;
  classificationEvidence?: SemanticClassificationEvidence | undefined;
  verification?: SemanticVerification | undefined;
  /** Explicit vocabulary for this extraction profile. Missing vocabulary fails closed. */
  knownPredicates?: ReadonlySet<string> | undefined;
  /** Legacy caller confidence is retained only to make its non-authority visible. */
  callerConfidence?: number | undefined;
}

export const MIN_PROMOTION_CONFIDENCE = 0.90;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteJsonValue(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isFiniteJsonValue(item, seen));
  if (!isRecord(value) || seen.has(value)) return false;
  seen.add(value);
  const ok = Object.values(value).every((item) => isFiniteJsonValue(item, seen));
  seen.delete(value);
  return ok;
}

function validateClauseTree(clauses: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(clauses)) {
    errors.push(`${path} must be an array`);
    return;
  }
  for (const [index, rawClause] of clauses.entries()) {
    const clausePath = `${path}[${index}]`;
    if (!isRecord(rawClause)) {
      errors.push(`${clausePath} must be an object`);
      continue;
    }
    if (typeof rawClause.predicate !== 'string' || rawClause.predicate.trim().length === 0) {
      errors.push(`${clausePath}.predicate must be a non-empty string`);
    }
    if (!isRecord(rawClause.roles)) {
      errors.push(`${clausePath}.roles must be an object`);
    } else {
      for (const [role, term] of Object.entries(rawClause.roles)) {
        if (role.trim().length === 0) errors.push(`${clausePath}.roles has an empty role name`);
        if (!isFiniteJsonValue(term, new Set())) errors.push(`${clausePath}.roles.${role} is not a finite JSON value`);
        validateTypedTerm(term, `${clausePath}.roles.${role}`, errors);
      }
    }
    if (rawClause.negated !== undefined && typeof rawClause.negated !== 'boolean') {
      errors.push(`${clausePath}.negated must be boolean when present`);
    }
    if (rawClause.modality !== undefined && rawClause.modality !== null && typeof rawClause.modality !== 'string') {
      errors.push(`${clausePath}.modality must be a string or null when present`);
    }
    if (rawClause.conditions !== undefined) validateClauseTree(rawClause.conditions, `${clausePath}.conditions`, errors);
    if (rawClause.consequences !== undefined) validateClauseTree(rawClause.consequences, `${clausePath}.consequences`, errors);
  }
}

function validateTypedTerm(term: unknown, path: string, errors: string[]): void {
  if (Array.isArray(term)) {
    term.forEach((item, index) => validateTypedTerm(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(term)) return;
  if (term.type === 'quantity' && (typeof term.value !== 'number' || !Number.isFinite(term.value))) {
    errors.push(`${path} quantity requires a finite numeric value`);
  }
  if (term.type === 'date' && typeof term.value !== 'string' && typeof term.value !== 'number') {
    errors.push(`${path} date requires a string or numeric value`);
  }
  for (const [key, value] of Object.entries(term)) {
    if (key !== 'value') validateTypedTerm(value, `${path}.${key}`, errors);
  }
}

/**
 * Stronger candidate validation used before a Sem may enter the trust path.
 * `validateSem` establishes the wire shape; this additionally validates nested
 * clauses and rejects non-finite/cyclic values that canonicalization cannot
 * safely preserve.
 */
export function validateSemanticCandidate(value: unknown): { ok: boolean; errors: string[] } {
  const base = validateSem(value);
  const errors = [...base.errors];
  if (!isRecord(value)) return { ok: false, errors };
  if (Array.isArray(value.clauses)) validateClauseTree(value.clauses, 'clauses', errors);
  if (value.references !== undefined && !isFiniteJsonValue(value.references, new Set())) {
    errors.push('references must contain finite JSON values');
  }
  if (value.provenance !== undefined && !isFiniteJsonValue(value.provenance, new Set())) {
    errors.push('provenance must contain finite JSON values');
  }
  if (value.annotations !== undefined && !isFiniteJsonValue(value.annotations, new Set())) {
    errors.push('annotations must contain finite JSON values');
  }
  return { ok: errors.length === 0, errors };
}

function validEvidenceTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function allClauses(clauses: LunumClause[]): LunumClause[] {
  return clauses.flatMap((clause) => [
    clause,
    ...allClauses(clause.conditions ?? []),
    ...allClauses(clause.consequences ?? []),
  ]);
}

/**
 * Decide whether a schema-valid Sem may be promoted from an untrusted
 * candidate to an automatically usable/durable semantic record. This is
 * intentionally fail-closed: a successful JSON parse, a category label, or a
 * caller supplied confidence number alone cannot promote a record.
 */
export function evaluateSemanticTrust(input: SemanticTrustInput): SemanticTrustDecision {
  const candidate = validateSemanticCandidate(input.sem);
  if (!candidate.ok) {
    return {
      status: 'abstained',
      confidence: 0,
      promoted: false,
      requiresHumanReview: true,
      reasons: candidate.errors.map((error) => `invalid_sem:${error}`),
    };
  }

  const sem = input.sem as LunumSem;
  const category = input.category ?? sem.kind;
  const risk = input.risk ?? 'unknown';
  const parseConfidence = computeParseConfidence(input.confidenceEvidence ?? {});
  const reasons: string[] = [];
  if (input.callerConfidence !== undefined) reasons.push('caller_confidence_ignored');
  if (!(input.sourceText ?? '').trim()) reasons.push('missing_source_text');
  if (parseConfidence.score < MIN_PROMOTION_CONFIDENCE) {
    reasons.push(`evidence_confidence_below_${MIN_PROMOTION_CONFIDENCE.toFixed(2)}`);
  }
  if (!hasMinimumEvidence(parseConfidence)) reasons.push('insufficient_confidence_evidence');

  const classification = input.classificationEvidence;
  if (!classification) {
    reasons.push('missing_classification_evidence');
  } else if (
    classification.category !== category ||
    classification.risk !== risk ||
    !classification.evidenceId.trim() ||
    !validEvidenceTimestamp(classification.verifiedAt)
  ) {
    reasons.push('invalid_classification_evidence');
  }

  if (!input.knownPredicates) {
    reasons.push('missing_controlled_predicate_vocabulary');
  } else {
    for (const clause of allClauses(sem.clauses)) {
      if (!input.knownPredicates.has(clause.predicate)) {
        reasons.push(`predicate_not_in_controlled_vocabulary:${clause.predicate}`);
      }
    }
  }

  if (risk !== 'low') reasons.push(`risk_${risk}`);
  if (!ELIGIBLE.has(category)) reasons.push(`category_not_auto_promotable:${category}`);

  const domain = classifyDomain({ sourceText: input.sourceText, category });
  if (domain.domains.some((match) => match.confidence >= DOMAIN_BLOCK_CONFIDENCE_THRESHOLD)) {
    reasons.push(`prohibited_domain_detected:${domain.primaryDomain}`);
  }
  const highRisk = isHighRisk(sem);
  if (highRisk.highRisk) reasons.push(...highRisk.reasons.map((reason) => `high_risk_semantics:${reason}`));

  const verification = input.verification;
  if (!verification) {
    reasons.push('missing_independent_verification');
  } else if (
    verification.result !== 'match' ||
    !verification.verifierId.trim() ||
    !validEvidenceTimestamp(verification.verifiedAt)
  ) {
    reasons.push('invalid_independent_verification');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    status: uniqueReasons.length === 0 ? 'promoted' : 'candidate',
    confidence: parseConfidence.score,
    promoted: uniqueReasons.length === 0,
    requiresHumanReview: uniqueReasons.length > 0,
    reasons: uniqueReasons,
  };
}

export function classifyEligibility(input: EligibilityInput = {}): EligibilityDecision {
  const category = input.category ?? 'unknown';
  const risk = input.risk ?? 'unknown';
  const confidence = input.confidence ?? 0;
  const reasons: string[] = [];
  if (input.semantic !== true) reasons.push('no_validated_semantics');
  if (confidence < 0.9) reasons.push('confidence_below_0.90');
  if (risk !== 'low') reasons.push(`risk_${risk}`);
  if (!ELIGIBLE.has(category)) reasons.push(NATURAL_ONLY.has(category) ? `natural_only_category_${category}` : `category_not_allowlisted_${category}`);
  if (EXACT_RE.test(input.sourceText ?? '')) reasons.push('exact_or_executable_text_detected');
  return { eligible: reasons.length === 0, category, risk, confidence, reasons };
}
