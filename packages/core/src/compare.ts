import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { fingerprintSem } from './fingerprint.js';
import type { LunumClause, LunumSem, LunumTerm } from './types.js';

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
}

export function compareSem(expected: LunumSem, actual: LunumSem): SemanticComparison {
  const left = canonicalizeSem(expected);
  const right = canonicalizeSem(actual);
  const expectedFeatures = new Set([`world:${left.world}`, `kind:${left.kind}`, ...flatten(left.clauses)]);
  const actualFeatures = new Set([`world:${right.world}`, `kind:${right.kind}`, ...flatten(right.clauses)]);
  const missingFeatures = [...expectedFeatures].filter((feature) => !actualFeatures.has(feature)).sort();
  const extraFeatures = [...actualFeatures].filter((feature) => !expectedFeatures.has(feature)).sort();
  const intersection = expectedFeatures.size - missingFeatures.length;
  return {
    exactFingerprint: fingerprintSem(left) === fingerprintSem(right),
    exactCanonical: stableStringify(left) === stableStringify(right),
    featureRecall: expectedFeatures.size ? intersection / expectedFeatures.size : 1,
    featurePrecision: actualFeatures.size ? intersection / actualFeatures.size : 1,
    missingFeatures,
    extraFeatures
  };
}
