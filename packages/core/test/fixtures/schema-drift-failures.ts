/**
 * Compile-time regression fixtures: these files are designed to FAIL compilation
 * when the public types or generated schema types change in incompatible ways.
 *
 * Each test verifies that a specific field exists with the expected type.
 * If the field is removed or changed, the test fails at compile time.
 *
 * To use: run `tsc --noEmit --skipLibCheck false` on this file.
 * Expected: compilation errors when types drift.
 */

import type {
  LunumSem,
  LunumRecord,
  LunumRendering,
  EligibilityDecision
} from '../../src/types.js';
import type {
  LunumSemSchema,
  LunumRecordSchema,
  Clause
} from '../../src/types-schema.js';

// ══════════════════════════════════════════════════════════════════
// Fixture 1: LunumSem must have world (string) and kind (string)
// If either field is removed or changed type, this fails.
// ══════════════════════════════════════════════════════════════════
function _assertLunumSemWorldKind(sem: LunumSem): void {
  // These assignments must compile — proves world and kind exist
  const world: string = sem.world;
  const kind: string = sem.kind;
  // Unused variables to avoid warnings
  void world;
  void kind;
}

// ══════════════════════════════════════════════════════════════════
// Fixture 2: LunumRecord must have fingerprint (string) and source.text (string)
// ══════════════════════════════════════════════════════════════════
function _assertLunumRecordFingerprintSource(rec: LunumRecord): void {
  const fp: string = rec.fingerprint;
  const text: string = rec.source.text;
  void fp;
  void text;
}

// ══════════════════════════════════════════════════════════════════
// Fixture 3: LunumRendering must have code (string), profile (string), tokens (number | null)
// ══════════════════════════════════════════════════════════════════
function _assertLunumRenderingFields(render: LunumRendering): void {
  const code: string = render.code;
  const profile: string = render.profile;
  const tokens: number | null = render.tokens;
  void code;
  void profile;
  void tokens;
}

// ══════════════════════════════════════════════════════════════════
// Fixture 4: EligibilityDecision must have all required fields
// ══════════════════════════════════════════════════════════════════
function _assertEligibilityFields(decision: EligibilityDecision): void {
  const eligible: boolean = decision.eligible;
  const category: string = decision.category;
  const risk: string = decision.risk; // Risk is 'low'|'medium'|'high'|'unknown' which extends string
  const confidence: number = decision.confidence;
  const reasons: string[] = decision.reasons;
  void eligible;
  void category;
  void risk;
  void confidence;
  void reasons;
}

// ══════════════════════════════════════════════════════════════════
// Fixture 5: LunumSemSchema must have schema (literal), world, kind
// ══════════════════════════════════════════════════════════════════
function _assertLunumSemSchemaFields(schema: LunumSemSchema): void {
  // Schema must be the exact literal
  const schemaLit: 'lunum-sem/0.1-draft' = schema.schema;
  const world: string = schema.world;
  const kind: string = schema.kind;
  void schemaLit;
  void world;
  void kind;
}

// ══════════════════════════════════════════════════════════════════
// Fixture 6: LunumRecordSchema must have fingerprint, sem, source
// ══════════════════════════════════════════════════════════════════
function _assertLunumRecordSchemaFields(schema: LunumRecordSchema): void {
  const fp: string = schema.fingerprint;
  const semSchema: string = schema.sem.schema;
  const sourceText: string = schema.source.text;
  void fp;
  void semSchema;
  void sourceText;
}

// ══════════════════════════════════════════════════════════════════
// Fixture 7: Clause must have predicate (string) and roles (Record<string, unknown>)
// ══════════════════════════════════════════════════════════════════
function _assertClauseFields(clause: Clause): void {
  const predicate: string = clause.predicate;
  const roles: Record<string, unknown> = clause.roles;
  void predicate;
  void roles;
}

// ══ Export to prevent tree-shaking ────────────────────────────────
export const fixtures = [
  _assertLunumSemWorldKind,
  _assertLunumRecordFingerprintSource,
  _assertLunumRenderingFields,
  _assertEligibilityFields,
  _assertLunumSemSchemaFields,
  _assertLunumRecordSchemaFields,
  _assertClauseFields
] as const;
