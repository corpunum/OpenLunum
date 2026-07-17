/**
 * Compile-time bidirectional conformance check between public SDK types
 * (packages/core/src/types.ts) and generated schema types (types-schema.ts).
 *
 * Only checks fields where BOTH a public type and a generated type exist.
 * Removes hand-written shape comparisons (rendering, eligibility, clause)
 * that do not directly compare actual public to actual generated contracts.
 */

import type {
  LunumSem,
  LunumRecord,
} from './types.js';
import type {
  LunumSemSchema,
  LunumRecordSchema,
} from './types-schema.js';

// ── Helper: two-way structural assignability ──────────────────────
type TwoWay<T, U> = T extends U ? (U extends T ? true : false) : false;

// ══════════════════════════════════════════════════════════════════
// LunumSem ↔ LunumSemSchema: shared fields
// ══════════════════════════════════════════════════════════════════

// Two-way: world and kind must be structurally compatible (both string)
type _TwoWayLunumSemCore = TwoWay<
  Pick<LunumSem, 'world' | 'kind'>,
  Pick<LunumSemSchema, 'world' | 'kind'>
>;
const _assertLunumSemCoreTwoWay: _TwoWayLunumSemCore = true;

// Schema const must match exactly: "lunum-sem/0.1-draft"
type _SemSchemaConst = 'lunum-sem/0.1-draft' extends LunumSemSchema['schema']
  ? LunumSemSchema['schema'] extends 'lunum-sem/0.1-draft'
    ? true
    : false
  : false;
const _assertSemSchemaConst: _SemSchemaConst = true;

// ══════════════════════════════════════════════════════════════════
// LunumRecord ↔ LunumRecordSchema: shared fields
// ══════════════════════════════════════════════════════════════════

// Two-way: fingerprint must be string on both sides
type _TwoWayRecordFingerprint = TwoWay<
  Pick<LunumRecord, 'fingerprint'>,
  Pick<LunumRecordSchema, 'fingerprint'>
>;
const _assertRecordFingerprintTwoWay: _TwoWayRecordFingerprint = true;

// Two-way: sem world/kind must match string types
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

// ══ Export to prevent tree-shaking ────────────────────────────────
export const schemaConformanceChecks = [
  _assertLunumSemCoreTwoWay,
  _assertSemSchemaConst,
  _assertRecordFingerprintTwoWay,
  _assertRecordSemTwoWay,
  _assertRecordSourceTwoWay
] as const;

// Import conformance tests
import { conformanceTests } from './schema-conformance.js';
export const allConformanceTests = [
  ...schemaConformanceChecks,
  ...conformanceTests
] as const;
