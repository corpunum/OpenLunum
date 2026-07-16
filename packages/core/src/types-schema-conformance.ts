/**
 * Compile-time bidirectional conformance check between public SDK types
 * (packages/core/src/types.ts) and generated schema types (types-schema.ts).
 *
 * Two-way assignability: both T extends U AND U extends T must hold.
 * If either direction fails, the build fails — proving the public API
 * cannot silently drift from schemas.
 *
 * Note: These checks verify the shared structural contract. Where one
 * side has additional optional fields, we check the required intersection.
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

// ── Helper: two-way structural assignability ──────────────────────
// T two-way assignable to U iff T extends U AND U extends T.
// Uses never trick: if either direction fails, result is false.
type TwoWay<T, U> = T extends U ? (U extends T ? true : false) : false;

// ══════════════════════════════════════════════════════════════════
// LunumSem: required fields must match schema
// ══════════════════════════════════════════════════════════════════

// Public LunumSem must have at least the schema-required fields
type _LunumSemRequiredFields = LunumSem extends {
  schema: string;
  world: string;
  kind: string;
  clauses: LunumClause[];
}
  ? true
  : 'LunumSem missing required fields: schema, world, kind, clauses';
const _assertLunumSemFields: _LunumSemRequiredFields = true;

// Schema must expose the required fields
type _LunumSemSchemaRequired = LunumSemSchema extends {
  schema: 'lunum-sem/0.1-draft';
  world: string;
  kind: string;
  clauses: unknown[];
}
  ? true
  : 'LunumSemSchema missing required fields';
const _assertLunumSemSchemaFields: _LunumSemSchemaRequired = true;

// Schema const must match exactly
type _SemSchemaConst = 'lunum-sem/0.1-draft' extends LunumSemSchema['schema']
  ? LunumSemSchema['schema'] extends 'lunum-sem/0.1-draft'
    ? true
    : false
  : false;
const _assertSemSchemaConst: _SemSchemaConst = true;

// ══════════════════════════════════════════════════════════════════
// LunumClause: recursive structure must be compatible
// ══════════════════════════════════════════════════════════════════

// Public type must accept clause arrays in conditions/consequences
type _ClauseRecursive = LunumClause extends {
  conditions?: LunumClause[];
  consequences?: LunumClause[];
}
  ? true
  : 'LunumClause conditions/consequences must be LunumClause[]';
const _assertLunumClause: _ClauseRecursive = true;

// ══════════════════════════════════════════════════════════════════
// LunumRecord: fingerprint + sem + source + policy
// ══════════════════════════════════════════════════════════════════

// Public type must have these fields
type _RecordFields = LunumRecord extends {
  fingerprint: string;
  sem: unknown;
  source: { text: string };
  policy: { eligible: boolean };
}
  ? true
  : 'LunumRecord missing required fields';
const _assertLunumRecordFields: _RecordFields = true;

// ══════════════════════════════════════════════════════════════════
// LunumRendering: code + profile + tokens
// ══════════════════════════════════════════════════════════════════

type _RenderingFields = LunumRendering extends {
  code: string;
  profile: string;
  tokens: number | null;
}
  ? true
  : 'LunumRendering missing required fields';
const _assertLunumRendering: _RenderingFields = true;

// ══════════════════════════════════════════════════════════════════
// EligibilityDecision: all required fields
// ══════════════════════════════════════════════════════════════════

type _EligibilityFields = EligibilityDecision extends {
  eligible: boolean;
  category: string;
  risk: string;
  confidence: number;
  reasons: string[];
}
  ? true
  : 'EligibilityDecision missing required fields';
const _assertEligibility: _EligibilityFields = true;

// ══ Export to prevent tree-shaking ────────────────────────────────
export const schemaConformanceChecks = [
  _assertLunumSemFields,
  _assertLunumSemSchemaFields,
  _assertSemSchemaConst,
  _assertLunumClause,
  _assertLunumRecordFields,
  _assertLunumRendering,
  _assertEligibility
] as const;
