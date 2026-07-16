/**
 * Compile-time bidirectional conformance check between public SDK types
 * (packages/core/src/types.ts) and generated schema types (types-schema.ts).
 *
 * Two-way assignability: we verify that required fields exist on both sides
 * and that the types are structurally compatible on those fields.
 *
 * Uses `TwoWay<T, U>` which requires T extends U AND U extends T.
 * Directly compares public types against generated schema types.
 */

import type {
  LunumSem,
  LunumRecord,
  LunumRendering,
  EligibilityDecision,
  Risk
} from './types.js';
import type {
  LunumSemSchema,
  LunumRecordSchema,
  Clause
} from './types-schema.js';

// ── Helper: two-way structural assignability ──────────────────────
// T two-way assignable to U iff T extends U AND U extends T.
// If either direction fails, result is never (which errors on const assignment).
// TwoWay checks verify that public SDK types and generated schema types
// (or expected schema-derived shapes) are structurally compatible.
type TwoWay<T, U> = T extends U ? (U extends T ? true : false) : false;

// ══════════════════════════════════════════════════════════════════
// LunumSem ↔ LunumSemSchema: real TwoWay check on shared fields
// ══════════════════════════════════════════════════════════════════

// Two-way: world, kind must match string types
type _TwoWayLunumSemCore = TwoWay<
  Pick<LunumSem, 'world' | 'kind'>,
  Pick<LunumSemSchema, 'world' | 'kind'>
>;
const _assertLunumSemCoreTwoWay: _TwoWayLunumSemCore = true;

// Schema const must match exactly in both directions
type _SemSchemaConst = 'lunum-sem/0.1-draft' extends LunumSemSchema['schema']
  ? LunumSemSchema['schema'] extends 'lunum-sem/0.1-draft'
    ? true
    : false
  : false;
const _assertSemSchemaConst: _SemSchemaConst = true;

// ══════════════════════════════════════════════════════════════════
// LunumRecord ↔ LunumRecordSchema: real TwoWay check
// ══════════════════════════════════════════════════════════════════

// Two-way: public LunumRecord.fingerprint and generated LunumRecordSchema.fingerprint
// must both be string — structural compatibility on the shared field.
type _TwoWayRecordFingerprint = TwoWay<
  Pick<LunumRecord, 'fingerprint'>,
  Pick<LunumRecordSchema, 'fingerprint'>
>;
const _assertRecordFingerprintTwoWay: _TwoWayRecordFingerprint = true;

// Two-way: sem world/kind must match string types (schema is checked separately via _assertSemSchemaConst)
type _TwoWayRecordSem = TwoWay<
  Pick<LunumRecord['sem'], 'world' | 'kind'>,
  Pick<LunumRecordSchema['sem'], 'world' | 'kind'>
>;
const _assertRecordSemTwoWay: _TwoWayRecordSem = true;

// Two-way: source.text must be string on both sides
type _TwoWayRecordSource = TwoWay<
  Pick<LunumRecord['source'], 'text'>,
  Pick<LunumRecordSchema['source'], 'text'>
>;
const _assertRecordSourceTwoWay: _TwoWayRecordSource = true;

// ══════════════════════════════════════════════════════════════════
// LunumRendering: TwoWay against expected schema-derived shape
// ══════════════════════════════════════════════════════════════════

// Two-way: public LunumRendering.code/profile/tokens must match the
// expected shape derived from the rendering schema. This ensures the
// public API contract matches what the schema expects.
type _TwoWayRendering = TwoWay<
  Pick<LunumRendering, 'code' | 'profile' | 'tokens'>,
  { code: string; profile: string; tokens: number | null }
>;
const _assertRenderingTwoWay: _TwoWayRendering = true;

// ══════════════════════════════════════════════════════════════════
// EligibilityDecision: TwoWay against expected schema-derived shape
// ══════════════════════════════════════════════════════════════════

// Two-way: public EligibilityDecision must match the expected shape
// derived from the protected-dataset schema. This ensures the public
// API contract matches what the schema expects for eligibility.
type _TwoWayEligibility = TwoWay<
  Pick<EligibilityDecision, 'eligible' | 'category' | 'risk' | 'confidence' | 'reasons'>,
  { eligible: boolean; category: string; risk: Risk; confidence: number; reasons: string[] }
>;
const _assertEligibilityTwoWay: _TwoWayEligibility = true;

// ══════════════════════════════════════════════════════════════════
// Clause: generated type TwoWay against expected schema shape
// ══════════════════════════════════════════════════════════════════

// Two-way: generated Clause type must match the expected shape derived
// from the lunum-sem schema. Clause is generated, so this check ensures
// the generated contract matches what the schema specifies.
type _TwoWayClause = TwoWay<
  Pick<Clause, 'predicate' | 'roles'>,
  { predicate: string; roles: Record<string, unknown> }
>;
const _assertClauseTwoWay: _TwoWayClause = true;

// ══ Export to prevent tree-shaking ────────────────────────────────
export const schemaConformanceChecks = [
  _assertLunumSemCoreTwoWay,
  _assertSemSchemaConst,
  _assertRecordFingerprintTwoWay,
  _assertRecordSemTwoWay,
  _assertRecordSourceTwoWay,
  _assertRenderingTwoWay,
  _assertEligibilityTwoWay,
  _assertClauseTwoWay
] as const;
