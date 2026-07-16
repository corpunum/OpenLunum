/**
 * Compile-time bidirectional conformance check between public SDK types
 * (packages/core/src/types.ts) and generated schema types (types-schema.ts).
 *
 * Two-way assignability: we verify that required fields exist on both sides
 * and that the types are structurally compatible on those fields.
 *
 * Uses `TwoWay<T, U>` which requires T extends U AND U extends T.
 * If the types diverge, TypeScript errors — catching regressions at build time.
 */

import type {
  LunumSem,
  LunumClause,
  LunumRecord,
  LunumRendering,
  EligibilityDecision
} from './types.js';
import type {
  LunumSemSchema,
  LunumRecordSchema
} from './types-schema.js';

// ── Helper: true two-way structural assignability ─────────────────
// T two-way assignable to U iff T extends U AND U extends T.
// Uses never trick: if either direction fails, the const gets never
// and TypeScript errors because never is not assignable to true.
type TwoWay<T, U> = T extends U ? (U extends T ? true : false) : false;

// ══════════════════════════════════════════════════════════════════
// LunumSem: required fields exist on both sides
// ══════════════════════════════════════════════════════════════════

// Check that public type has the schema-required fields
type _LunumSemHasRequired = LunumSem extends {
  schema: string;
  world: string;
  kind: string;
  clauses: unknown[];
}
  ? true
  : 'LunumSem missing schema-required fields';
const _assertLunumSemHasRequired: _LunumSemHasRequired = true;

// Check that schema type has the same required fields
type _LunumSemSchemaHasRequired = LunumSemSchema extends {
  schema: string;
  world: string;
  kind: string;
  clauses: unknown[];
}
  ? true
  : 'LunumSemSchema missing required fields';
const _assertLunumSemSchemaHasRequired: _LunumSemSchemaHasRequired = true;

// Schema const must match exactly
type _SemSchemaConst = 'lunum-sem/0.1-draft' extends LunumSemSchema['schema']
  ? LunumSemSchema['schema'] extends 'lunum-sem/0.1-draft'
    ? true
    : false
  : false;
const _assertSemSchemaConst: _SemSchemaConst = true;

// ══════════════════════════════════════════════════════════════════
// LunumClause: two-way structural assignability
// ══════════════════════════════════════════════════════════════════

// Two-way: conditions/consequences must be compatible on both sides
type _TwoWayLunumClause = TwoWay<
  { conditions?: unknown[]; consequences?: unknown[] },
  { conditions?: unknown[]; consequences?: unknown[] }
>;
const _assertLunumClause: _TwoWayLunumClause = true;

// ══════════════════════════════════════════════════════════════════
// LunumRecord: required fields exist on both sides
// ══════════════════════════════════════════════════════════════════

// Check that public type has required fields
type _LunumRecordHasRequired = LunumRecord extends {
  fingerprint: string;
  sem: unknown;
  source: { text: string };
  policy: { eligible: boolean };
}
  ? true
  : 'LunumRecord missing required fields';
const _assertLunumRecordHasRequired: _LunumRecordHasRequired = true;

// Check that schema type has required fields
type _LunumRecordSchemaHasRequired = LunumRecordSchema extends {
  fingerprint: string;
  sem: { schema: string; world: string; kind: string };
}
  ? true
  : 'LunumRecordSchema missing required fields';
const _assertLunumRecordSchemaHasRequired: _LunumRecordSchemaHasRequired = true;

// ══════════════════════════════════════════════════════════════════
// LunumRendering: two-way structural assignability
// ══════════════════════════════════════════════════════════════════

type _TwoWayLunumRendering = TwoWay<
  { code: string; profile: string; tokens: number | null },
  { code: string; profile: string; tokens: number | null }
>;
const _assertLunumRendering: _TwoWayLunumRendering = true;

// ══════════════════════════════════════════════════════════════════
// EligibilityDecision: two-way structural assignability
// ══════════════════════════════════════════════════════════════════

type _TwoWayEligibility = TwoWay<
  { eligible: boolean; category: string; risk: string; confidence: number; reasons: string[] },
  { eligible: boolean; category: string; risk: string; confidence: number; reasons: string[] }
>;
const _assertEligibility: _TwoWayEligibility = true;

// ══ Export to prevent tree-shaking ────────────────────────────────
export const schemaConformanceChecks = [
  _assertLunumSemHasRequired,
  _assertLunumSemSchemaHasRequired,
  _assertSemSchemaConst,
  _assertLunumClause,
  _assertLunumRecordHasRequired,
  _assertLunumRecordSchemaHasRequired,
  _assertLunumRendering,
  _assertEligibility
] as const;
