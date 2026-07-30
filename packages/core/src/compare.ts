import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { fingerprintSem } from './fingerprint.js';
import { checkHardInvariants, type InvariantFiring } from './semantic-invariants.js';
import type { ComparisonExplanation, LunumClause, LunumSem, LunumTerm } from './types.js';

function scalar(term: LunumTerm | undefined): string {
  if (term == null) return '';
  if (Array.isArray(term)) return term.map(scalar).join('|');
  if (typeof term === 'object') return String(term.id ?? term.value ?? term.ref ?? stableStringify(term));
  return String(term);
}

function flatten(clauses: LunumClause[], prefix = ''): string[] {
  const rows: string[] = [];
  clauses.forEach((clause, index) => {
    const path = `${prefix}${index}`;
    rows.push(`predicate:${path}:${clause.predicate}`);
    rows.push(`negated:${path}:${clause.negated === true}`);
    if (clause.modality) rows.push(`modality:${path}:${clause.modality}`);
    for (const [role, value] of Object.entries(clause.roles)) rows.push(`role:${path}:${role}:${scalar(value)}`);
    if (clause.conditions?.length) rows.push(...flatten(clause.conditions, `${path}.condition.`));
    if (clause.consequences?.length) rows.push(...flatten(clause.consequences, `${path}.consequence.`));
  });
  return rows;
}

export interface SemanticComparison {
  exactFingerprint: boolean;
  exactCanonical: boolean;
  featureRecall: number;
  featurePrecision: number;
  missingFeatures: string[];
  extraFeatures: string[];
  hardMismatch: boolean;
  hardInvariants: InvariantFiring[];
  explanation?: ComparisonExplanation;
}

function buildExplanation(
  expectedFeatures: Set<string>,
  actualFeatures: Set<string>,
  missingFeatures: string[],
  extraFeatures: string[],
  invariantResult: { hardMismatch: boolean; invariants: InvariantFiring[] },
  featureRecall: number,
  featurePrecision: number
): ComparisonExplanation {
  const matched = [...expectedFeatures].filter((feature) => actualFeatures.has(feature)).sort();
  const intersection = expectedFeatures.size - missingFeatures.length;

  const reasoning: string[] = [];
  reasoning.push(`Feature recall: ${(featureRecall * 100).toFixed(1)}% (${intersection}/${expectedFeatures.size} expected features matched)`);
  reasoning.push(`Feature precision: ${(featurePrecision * 100).toFixed(1)}% (${intersection}/${actualFeatures.size} actual features are expected)`);

  if (missingFeatures.length > 0) {
    reasoning.push(`Missing ${missingFeatures.length} expected features`);
  }
  if (extraFeatures.length > 0) {
    reasoning.push(`${extraFeatures.length} extra features in actual`);
  }

  const invariantExplanations = invariantResult.invariants.map((inv) => ({
    code: inv.code,
    path: inv.path,
    detail: inv.detail,
    severity: 'hard' as const
  }));

  if (invariantExplanations.length > 0) {
    reasoning.push(`${invariantExplanations.length} hard invariant(s) violated`);
  }

  const summaryParts: string[] = [];
  if (featureRecall === 1 && featurePrecision === 1 && invariantExplanations.length === 0) {
    summaryParts.push('Perfect match: all expected features present, no extra features, no invariant violations');
  } else if (featureRecall === 1 && featurePrecision === 1 && invariantExplanations.length > 0) {
    summaryParts.push('Features match perfectly but hard invariants are violated');
  } else if (invariantExplanations.length > 0) {
    summaryParts.push(`Hard invariants are violated: ${invariantExplanations.length} invariant(s) failed`);
  } else if (featureRecall === 1 && featurePrecision < 1) {
    summaryParts.push('All expected features present but with extra features');
  } else if (featureRecall < 1 && featurePrecision === 1) {
    summaryParts.push('No extra features but missing some expected features');
  } else if (featureRecall < 1 && featurePrecision < 1) {
    summaryParts.push('Partial match with both missing and extra features');
  } else {
    summaryParts.push('Semantic comparison completed');
  }

  return {
    features: { matched, missing: missingFeatures, extra: extraFeatures },
    invariants: invariantExplanations,
    scores: {
      featureRecall,
      featurePrecision,
      featureRecallReason: `${matched.length} of ${expectedFeatures.size} expected features matched`,
      featurePrecisionReason: `${matched.length} of ${actualFeatures.size} actual features are in expected set`
    },
    reasoning,
    summary: summaryParts.join('; ')
  };
}

export function compareSem(expected: LunumSem, actual: LunumSem, options?: { explain?: boolean }): SemanticComparison {
  const left = canonicalizeSem(expected);
  const right = canonicalizeSem(actual);
  const expectedFeatures = new Set([`world:${left.world}`, `kind:${left.kind}`, ...flatten(left.clauses)]);
  const actualFeatures = new Set([`world:${right.world}`, `kind:${right.kind}`, ...flatten(right.clauses)]);
  const missingFeatures = [...expectedFeatures].filter((feature) => !actualFeatures.has(feature)).sort();
  const extraFeatures = [...actualFeatures].filter((feature) => !expectedFeatures.has(feature)).sort();
  const intersection = expectedFeatures.size - missingFeatures.length;
  const invariantResult = checkHardInvariants(left, right);

  const featureRecall = expectedFeatures.size ? intersection / expectedFeatures.size : 1;
  const featurePrecision = actualFeatures.size ? intersection / actualFeatures.size : 1;

  const result: SemanticComparison = {
    exactFingerprint: fingerprintSem(left) === fingerprintSem(right),
    exactCanonical: stableStringify(left) === stableStringify(right),
    featureRecall,
    featurePrecision,
    missingFeatures,
    extraFeatures,
    hardMismatch: invariantResult.hardMismatch,
    hardInvariants: invariantResult.invariants
  };

  if (options?.explain) {
    result.explanation = buildExplanation(expectedFeatures, actualFeatures, missingFeatures, extraFeatures, invariantResult, featureRecall, featurePrecision);
  }

  return result;
}
