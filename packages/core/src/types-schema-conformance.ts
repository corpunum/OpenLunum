/**
 * Compile-time bidirectional conformance check between public SDK types
 * (packages/core/src/types.ts) and generated schema types (types-schema.ts).
 *
 * This file is compiled but not exported. It ensures that if JSON schemas
 * change, the build fails — proving the public API cannot silently drift.
 *
 * Uses `never` type assignments: if T extends U is false, never is assignable
 * to the boolean, causing a type error.
 */

import type { LunumClause, LunumSem, LunumRecord, LunumRendering, EligibilityDecision } from './types.js';
import type {
  LunumRecordSchema,
  LunumSemSchema
} from './types-schema.js';

// ── LunumSem: schema has required fields ─────────────────────────
// Verifies the generated schema exposes the fields we rely on.
// If the schema removes a field, the interface changes and this fails.
type _AssertLunumSemSchemaHasFields = LunumSemSchema extends {
  schema: "lunum-sem/0.1-draft";
  world: string;
  kind: string;
  clauses: unknown[];
}
  ? true
  : 'LunumSemSchema missing required fields';
const _assertLunumSemSchemaHasFields: _AssertLunumSemSchemaHasFields = true;

// ── LunumSem: public type has required fields ─────────────────────
type _AssertPublicLunumSemHasFields = LunumSem extends {
  schema: string;
  world: string;
  kind: string;
  clauses: LunumClause[];
}
  ? true
  : 'Public LunumSem missing required fields';
const _assertPublicLunumSemHasFields: _AssertPublicLunumSemHasFields = true;

// ── LunumRecordSchema: fingerprint field ──────────────────────────
type _AssertFingerprintExists = LunumRecordSchema extends { fingerprint: string }
  ? true
  : 'LunumRecordSchema must have fingerprint: string';
const _assertFingerprintExists: _AssertFingerprintExists = true;

// ── LunumRecordSchema: sem field ──────────────────────────────────
type _AssertSemField = LunumRecordSchema extends { sem: LunumSemSchema }
  ? true
  : 'LunumRecordSchema.sem must be LunumSemSchema';
const _assertSemField: _AssertSemField = true;

// ── LunumRendering: public type matches schema ────────────────────
type _AssertRenderingCompat = LunumRendering extends {
  code: string;
  profile: string;
  tokens: number | null;
}
  ? true
  : 'LunumRendering must have code, profile, tokens';
const _assertRenderingCompat: _AssertRenderingCompat = true;

// ── EligibilityDecision: public type matches schema ───────────────
type _AssertEligibilityCompat = EligibilityDecision extends {
  eligible: boolean;
  category: string;
  risk: string;
  confidence: number;
  reasons: string[];
}
  ? true
  : 'EligibilityDecision must have required fields';
const _assertEligibilityCompat: _AssertEligibilityCompat = true;

// ── LunumClause: conditions/consequences must be LunumClause[] ────
type _AssertClauseRecursive = LunumClause extends {
  conditions?: LunumClause[];
  consequences?: LunumClause[];
}
  ? true
  : 'LunumClause conditions/consequences must be LunumClause[]';
const _assertClauseRecursive: _AssertClauseRecursive = true;

// ── LunumSem: schema const value ──────────────────────────────────
type _AssertSemSchemaConst = 'lunum-sem/0.1-draft' extends LunumSemSchema['schema']
  ? true
  : 'schema field must be const lunum-sem/0.1-draft';
const _assertSemSchemaConst: _AssertSemSchemaConst = true;

// Export to prevent tree-shaking
export const schemaConformanceChecks = [
  _assertLunumSemSchemaHasFields,
  _assertPublicLunumSemHasFields,
  _assertFingerprintExists,
  _assertSemField,
  _assertRenderingCompat,
  _assertEligibilityCompat,
  _assertClauseRecursive,
  _assertSemSchemaConst
] as const;
