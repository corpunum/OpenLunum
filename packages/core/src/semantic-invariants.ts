/**
 * Hard semantic invariants (#370, readiness R5.1 / R5.1a / R6.1).
 *
 * Invariants implemented:
 *  - role-identity (R5.1a): clause-path role-identity binding
 *  - negation-flip (R6.1): matched clause negation differs
 *  - condition-change (R6.1): condition presence/predicates differ
 *  - protected-literal (R6.1): quantity/date value differs in matched clause
 */

import type { LunumClause, LunumSem, LunumTerm } from './types.js';

export type HardInvariantCode = 'role-identity' | 'negation-flip' | 'condition-change' | 'protected-literal';

export interface InvariantFiring {
  code: HardInvariantCode;
  path: string;
  detail: string;
}

export interface HardInvariantResult {
  hardMismatch: boolean;
  invariants: InvariantFiring[];
}

function isTermObject(term: unknown): term is Record<string, unknown> {
  return term !== null && term !== undefined && typeof term === 'object' && !Array.isArray(term);
}

function extractFillerId(term: LunumTerm | undefined): string | undefined {
  if (!isTermObject(term)) return undefined;
  return typeof term.id === 'string' ? term.id : undefined;
}

function extractProtectedLiteral(term: LunumTerm | undefined): { type: string; token: string } | undefined {
  if (!isTermObject(term)) return undefined;
  const type = (term as Record<string, unknown>).type;
  if (type !== 'quantity' && type !== 'date') return undefined;
  const unit = 'unit' in (term as Record<string, unknown>) ? (term as Record<string, unknown>).unit : undefined;
  return { type: String(type), token: JSON.stringify({ value: (term as Record<string, unknown>).value, unit: unit ?? null }) };
}

function walkClauses(clauses: LunumClause[] | undefined, pathPrefix: string, visit: (path: string, clause: LunumClause) => void): void {
  const occurrenceCounts = new Map<string, number>();
  for (const clause of clauses ?? []) {
    const occurrence = occurrenceCounts.get(clause.predicate) ?? 0;
    occurrenceCounts.set(clause.predicate, occurrence + 1);
    const path = `${pathPrefix}${clause.predicate}#${occurrence}`;
    visit(path, clause);
    walkClauses(clause.conditions, `${path}.condition.`, visit);
    walkClauses(clause.consequences, `${path}.consequence.`, visit);
  }
}

function walkClausePairs(
  clausesA: LunumClause[] | undefined,
  clausesB: LunumClause[] | undefined,
  pathPrefix: string,
  visit: (path: string, a: LunumClause, b: LunumClause) => void
): void {
  const left = clausesA ?? [];
  const right = clausesB ?? [];
  const rightByPredicate = new Map<string, number[]>();
  right.forEach((clause, index) => {
    const bucket = rightByPredicate.get(clause.predicate) ?? [];
    bucket.push(index);
    rightByPredicate.set(clause.predicate, bucket);
  });
  const occurrenceCounts = new Map<string, number>();
  for (const a of left) {
    const occurrence = occurrenceCounts.get(a.predicate) ?? 0;
    occurrenceCounts.set(a.predicate, occurrence + 1);
    const path = `${pathPrefix}${a.predicate}#${occurrence}`;
    const candidates = rightByPredicate.get(a.predicate);
    if (!candidates || candidates.length === 0) continue;
    const indexB = candidates.shift()!;
    const b = right[indexB]!;
    visit(path, a, b);
    walkClausePairs(a.conditions ?? [], b.conditions ?? [], `${path}.condition.`, visit);
    walkClausePairs(a.consequences ?? [], b.consequences ?? [], `${path}.consequence.`, visit);
  }
}

function collectIdentitySlots(clauses: LunumClause[], out: Map<string, string>): void {
  walkClauses(clauses, '', (path, clause) => {
    for (const role of Object.keys(clause.roles ?? {}).sort()) {
      const id = extractFillerId(clause.roles[role]);
      if (id !== undefined) out.set(`${path}:${role}`, id);
    }
  });
}

export function checkRoleIdentityInvariant(a: LunumSem, b: LunumSem): InvariantFiring[] {
  const slotsA = new Map<string, string>();
  const slotsB = new Map<string, string>();
  collectIdentitySlots(a.clauses, slotsA);
  collectIdentitySlots(b.clauses, slotsB);

  if (slotsA.size === 0 || slotsA.size !== slotsB.size) return [];
  const keys = [...slotsA.keys()];
  if (!keys.every((key) => slotsB.has(key))) return [];

  const diffKeys = keys.filter((key) => slotsA.get(key) !== slotsB.get(key));
  if (diffKeys.length === 0) return [];

  const forward = new Map<string, string>();
  const backward = new Map<string, string>();
  for (const key of keys) {
    const valueA = slotsA.get(key)!;
    const valueB = slotsB.get(key)!;
    const existingForward = forward.get(valueA);
    if (existingForward !== undefined && existingForward !== valueB) return [];
    forward.set(valueA, valueB);
    const existingBackward = backward.get(valueB);
    if (existingBackward !== undefined && existingBackward !== valueA) return [];
    backward.set(valueB, valueA);
  }

  const changedValuesA = new Set(diffKeys.map((key) => slotsA.get(key)!));
  const changedValuesB = new Set(diffKeys.map((key) => slotsB.get(key)!));
  if (changedValuesA.size !== changedValuesB.size || [...changedValuesA].some((value) => !changedValuesB.has(value))) {
    return [];
  }

  return diffKeys.map((key) => ({
    code: 'role-identity' as const,
    path: key,
    detail: `filler id reassigned: '${slotsA.get(key)}' -> '${slotsB.get(key)}' (consistent relabeling across clause-path/role slots -- a role/authority swap, not a content change)`
  }));
}

export function checkNegationInvariant(a: LunumSem, b: LunumSem): InvariantFiring[] {
  const firings: InvariantFiring[] = [];
  walkClausePairs(a.clauses, b.clauses, '', (path, clauseA, clauseB) => {
    const negatedA = clauseA.negated === true;
    const negatedB = clauseB.negated === true;
    if (negatedA !== negatedB) {
      firings.push({
        code: 'negation-flip',
        path,
        detail: `predicate '${clauseA.predicate}' negated ${negatedA} vs ${negatedB}`
      });
    }
  });
  return firings;
}

export function checkConditionInvariant(a: LunumSem, b: LunumSem): InvariantFiring[] {
  const firings: InvariantFiring[] = [];
  walkClausePairs(a.clauses, b.clauses, '', (path, clauseA, clauseB) => {
    const conditionsA = clauseA.conditions ?? [];
    const conditionsB = clauseB.conditions ?? [];
    if ((conditionsA.length > 0) !== (conditionsB.length > 0)) {
      firings.push({
        code: 'condition-change',
        path,
        detail: `condition presence differs: ${conditionsA.length > 0} vs ${conditionsB.length > 0}`
      });
      return;
    }
    if (conditionsA.length === 0) return;
    const predicatesA = [...conditionsA.map((clause) => clause.predicate)].sort();
    const predicatesB = [...conditionsB.map((clause) => clause.predicate)].sort();
    if (JSON.stringify(predicatesA) !== JSON.stringify(predicatesB)) {
      firings.push({
        code: 'condition-change',
        path,
        detail: `condition predicates differ: [${predicatesA.join(', ')}] vs [${predicatesB.join(', ')}]`
      });
    }
  });
  return firings;
}

export function checkProtectedLiteralInvariant(a: LunumSem, b: LunumSem): InvariantFiring[] {
  const firings: InvariantFiring[] = [];
  walkClausePairs(a.clauses, b.clauses, '', (path, clauseA, clauseB) => {
    const roles = new Set([...Object.keys(clauseA.roles ?? {}), ...Object.keys(clauseB.roles ?? {})]);
    for (const role of [...roles].sort()) {
      const literalA = extractProtectedLiteral(clauseA.roles?.[role]);
      const literalB = extractProtectedLiteral(clauseB.roles?.[role]);
      if (!literalA || !literalB) continue;
      if (literalA.type !== literalB.type || literalA.token !== literalB.token) {
        firings.push({
          code: 'protected-literal',
          path: `${path}:${role}`,
          detail: `${literalA.type} value differs: ${literalA.token} vs ${literalB.token}`
        });
      }
    }
  });
  return firings;
}

export function checkHardInvariants(a: LunumSem, b: LunumSem): HardInvariantResult {
  const invariants = [
    ...checkRoleIdentityInvariant(a, b),
    ...checkNegationInvariant(a, b),
    ...checkConditionInvariant(a, b),
    ...checkProtectedLiteralInvariant(a, b)
  ];
  return { hardMismatch: invariants.length > 0, invariants };
}
