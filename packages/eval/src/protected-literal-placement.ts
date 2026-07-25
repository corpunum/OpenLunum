/**
 * Placement-aware protected literal verification.
 *
 * The naive check (presence-matching) asks only "does this literal string
 * occur somewhere in the serialised output?" That credits a model that
 * emits `120` for a protected literal `20` (substring of the serialisation)
 * and credits a literal that landed in an unrelated semantic role.
 *
 * This module instead walks the typed `LunumSem` tree, records the
 * structural "role path" of every primitive value it finds (role name,
 * nesting depth under conditions/consequences, and which field of a typed
 * term the value came from — `id`, `ref`, or `value`), and then checks
 * that a protected literal from the gold semantics reappears at the same
 * structural role path in the candidate semantics — not merely anywhere
 * in the tree.
 *
 * Predicate wording is deliberately excluded from the role path: two
 * clauses that mean the same thing can be predicated differently
 * (`below` vs `is_below` vs `is_less_than`) without that being a
 * protected-literal placement failure. Predicate fidelity is already
 * scored separately via `compareSem`'s feature recall/precision.
 */

import type { LunumClause, LunumSem, LunumTerm } from '@corpunum/lunum';

export interface LiteralPlacement {
  /** Structural role path where this primitive value was found. */
  path: string;
  /** Canonical string form of the primitive value at that path. */
  value: string;
}

export type ProtectedLiteralPlacementStatus =
  | 'placed'            // literal found at (one of) the expected role path(s)
  | 'wrong-role'        // literal value present in the candidate, but never at an expected role path
  | 'missing'           // literal value not present anywhere in the candidate
  | 'literal-not-in-gold'; // the declared protected literal does not actually occur in goldSem (data issue)

export interface ProtectedLiteralPlacementCheck {
  literal: string;
  status: ProtectedLiteralPlacementStatus;
  /** Normalised role path(s) where the literal is expected, per goldSem. */
  expectedPaths: string[];
  /** Normalised role path(s) where the literal was actually found in the candidate. */
  candidatePaths: string[];
  /** True only when status === 'placed'. */
  satisfied: boolean;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function canonicalPrimitive(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value);
  return String(value);
}

/** Strip array indices so sibling ordering does not fragment the role path. */
function normalizePath(path: string): string {
  return path.replace(/\[\d+\]/g, '');
}

function walkTerm(term: LunumTerm | undefined, pathPrefix: string, out: LiteralPlacement[]): void {
  if (term === undefined) return;
  if (Array.isArray(term)) {
    term.forEach((entry, index) => walkTerm(entry, `${pathPrefix}[${index}]`, out));
    return;
  }
  if (isPrimitive(term)) {
    if (term !== null) out.push({ path: pathPrefix, value: canonicalPrimitive(term) });
    return;
  }
  // LunumTermObject
  if (typeof term.id === 'string') out.push({ path: `${pathPrefix}.id`, value: canonicalPrimitive(term.id) });
  if (typeof term.ref === 'string') out.push({ path: `${pathPrefix}.ref`, value: canonicalPrimitive(term.ref) });
  if ('value' in term) {
    const value = (term as { value?: unknown }).value;
    if (isPrimitive(value)) {
      if (value !== null) out.push({ path: `${pathPrefix}.value`, value: canonicalPrimitive(value) });
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => walkTerm(entry as LunumTerm, `${pathPrefix}.value[${index}]`, out));
    } else if (value !== null && typeof value === 'object') {
      walkTerm(value as LunumTerm, `${pathPrefix}.value`, out);
    }
  }
}

function walkClause(clause: LunumClause, pathPrefix: string, out: LiteralPlacement[]): void {
  for (const key of Object.keys(clause.roles ?? {}).sort()) {
    walkTerm(clause.roles[key], `${pathPrefix}>roles.${key}`, out);
  }
  if (clause.time !== undefined) walkTerm(clause.time, `${pathPrefix}>time`, out);
  for (const condition of clause.conditions ?? []) walkClause(condition, `${pathPrefix}>conditions`, out);
  for (const consequence of clause.consequences ?? []) walkClause(consequence, `${pathPrefix}>consequences`, out);
}

/**
 * Collect every primitive value in a LunumSem tree together with the
 * structural role path it was found at.
 */
export function collectLiteralPlacements(sem: LunumSem | null | undefined): LiteralPlacement[] {
  const out: LiteralPlacement[] = [];
  if (!sem) return out;
  for (const clause of sem.clauses ?? []) walkClause(clause, 'root', out);
  for (const reference of sem.references ?? []) walkTerm(reference, 'references', out);
  return out.map((placement) => ({ path: normalizePath(placement.path), value: placement.value }));
}

/**
 * Verify that each declared protected literal appears in `candidateSem`
 * at the same structural role path it occupies in `goldSem` — not merely
 * anywhere in the serialised candidate.
 */
export function checkProtectedLiteralPlacement(
  goldSem: LunumSem | null | undefined,
  candidateSem: LunumSem | null | undefined,
  protectedLiterals: readonly string[]
): ProtectedLiteralPlacementCheck[] {
  const goldPlacements = collectLiteralPlacements(goldSem);
  const candidatePlacements = collectLiteralPlacements(candidateSem);

  return protectedLiterals.map((literal) => {
    const expectedPaths = [...new Set(
      goldPlacements.filter((placement) => placement.value === literal).map((placement) => placement.path)
    )];
    const candidateMatches = candidatePlacements.filter((placement) => placement.value === literal);
    const candidatePaths = [...new Set(candidateMatches.map((placement) => placement.path))];

    let status: ProtectedLiteralPlacementStatus;
    if (expectedPaths.length === 0) {
      status = 'literal-not-in-gold';
    } else if (candidateMatches.length === 0) {
      status = 'missing';
    } else if (expectedPaths.some((path) => candidatePaths.includes(path))) {
      status = 'placed';
    } else {
      status = 'wrong-role';
    }

    return {
      literal,
      status,
      expectedPaths,
      candidatePaths,
      satisfied: status === 'placed'
    };
  });
}

/** Fraction of protected literals that landed in their expected role. 1 when there are none to check. */
export function protectedLiteralPlacementCoverage(checks: readonly ProtectedLiteralPlacementCheck[]): number {
  if (checks.length === 0) return 1;
  const satisfied = checks.filter((check) => check.satisfied).length;
  return satisfied / checks.length;
}
