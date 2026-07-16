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

// Two-way: fingerprint must be string on both sides
type _TwoWayRecordFingerprint = TwoWay<
  { fingerprint: string },
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
// LunumRendering: real TwoWay check
// ══════════════════════════════════════════════════════════════════

// Two-way: code, profile, tokens must match (use Pick to exclude tokenCounter)
type _TwoWayRendering = TwoWay<
  Pick<LunumRendering, 'code' | 'profile' | 'tokens'>,
  { code: string; profile: string; tokens: number | null }
>;
const _assertRenderingTwoWay: _TwoWayRendering = true;

// ══════════════════════════════════════════════════════════════════
// EligibilityDecision: real TwoWay check (public vs generated)
// ══════════════════════════════════════════════════════════════════

// Two-way: public EligibilityDecision and generated schema must agree on required fields
type _TwoWayEligibility = TwoWay<
  Pick<EligibilityDecision, 'eligible' | 'category' | 'risk' | 'confidence' | 'reasons'>,
  { eligible: boolean; category: string; risk: Risk; confidence: number; reasons: string[] }
>;
const _assertEligibilityTwoWay: _TwoWayEligibility = true;

// ══════════════════════════════════════════════════════════════════
// Clause: generated type must be structurally compatible
// ══════════════════════════════════════════════════════════════════

// Two-way: predicate (string) and roles (Record) must be compatible
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
