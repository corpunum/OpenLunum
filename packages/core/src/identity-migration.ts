import {
  migrateForward01to02,
  migrateBackward02to01,
  migrateFingerprint,
  parseFingerprint,
  type ForwardMigrationResult,
  type BackwardMigrationResult,
  type MigrationWarning
} from './fingerprint-migration.js';
import type { LunumRecord } from './types.js';

/**
 * Identity behaviour across schema migration (R4.5)
 *
 * ---------------------------------------------------------------------------
 * What "identity" means
 * ---------------------------------------------------------------------------
 * A record's *identity* is the digest portion of its semantic fingerprint —
 * the `DIGEST` in `lfp:VERSION:sha256:DIGEST` — computed by canonicalizing
 * the semantic content and hashing the canonical form (see fingerprint.ts /
 * canonicalize.ts). The `VERSION` segment tags the algorithm/schema the
 * digest was computed under; it changes on every schema migration by
 * construction, even when the underlying semantic content is unchanged.
 *
 * Therefore: crossing a schema migration ALWAYS changes the fingerprint
 * *string* (the version segment differs), but it does not necessarily change
 * the record's *identity*. Two records have the same identity across a
 * migration boundary when their canonical digests match, independent of the
 * version tag.
 *
 * ---------------------------------------------------------------------------
 * Prerequisite: canonicalization must already treat equivalent inputs alike
 * ---------------------------------------------------------------------------
 * Before migration semantics can be defined, canonicalization itself must be
 * internally consistent about "no value" vs "value present". Two constructs
 * are explicitly in scope (tracked as #360):
 *
 *   1. `clause.time: null` vs `clause.time` omitted entirely.
 *   2. A role key explicitly set to `undefined` (e.g. `roles: { theme:
 *      undefined }`) vs the role key omitted from `roles` entirely.
 *
 * `canonicalizeSem` (canonicalize.ts) already normalizes both pairs to the
 * identical canonical form:
 *   - `canonicalClause` only copies `time` when `clause.time != null`
 *     (loose inequality — catches both `null` and `undefined`).
 *   - `canonicalClause`'s role loop skips any role whose value is
 *     `undefined` (`if (item === undefined) continue;`), regardless of
 *     whether the key was present with an `undefined` value or absent.
 * So within a single schema version, both pairs are already
 * identity-equivalent.
 *
 * The migration path (`fingerprint-migration.ts`) must preserve that
 * equivalence. It previously did not: `migrateForward01to02` stringified
 * `clause.time` whenever it was `!== undefined`, which caught `null` and
 * turned it into the literal string `"null"` — a real value that differs
 * from an omitted `time` field after canonicalization. That divergence is
 * fixed in `migrateForward01to02` (see fingerprint-migration.ts): the
 * stringification guard now reads `clause.time != null`, so `null` and
 * omission both remain "no time" after migration, matching
 * `canonicalizeSem`. The role-omission case never had this bug — role keys
 * with an `undefined` value are already skipped identically to omitted keys
 * during migration (verified by golden vectors below).
 *
 * ---------------------------------------------------------------------------
 * Which migrations preserve identity
 * ---------------------------------------------------------------------------
 * A migration is IDENTITY-PRESERVING when the canonical digest computed from
 * the pre-migration content equals the canonical digest computed from the
 * post-migration content. This holds when:
 *
 *   - `time: null` vs `time` omitted (forward and backward; #360 case 1).
 *   - A role key explicitly `undefined` vs omitted (forward and backward;
 *     #360 case 2).
 *   - `clauses[].modality` is already a valid 0.2 enum value, or absent/null.
 *   - `provenance` / `annotations` contain only fields already inside the
 *     0.2 locked field sets (`source`, `author`, `timestamp`, `license` for
 *     provenance; `confidence`, `tags`, `notes` for annotations), or are
 *     absent.
 *   - `time`, when present, is already a string.
 *   - ALL backward migrations (0.2 → 0.1-draft) of content that only uses
 *     fields already valid in 0.1: 0.1 is a strict superset schema (any
 *     modality string, unrestricted provenance/annotations), so downgrading
 *     never removes or rewrites a field. `migrateBackward02to01` only
 *     re-tags the schema/version; every field value is carried through
 *     byte-for-byte, so the canonical digest is unchanged.
 *
 * ---------------------------------------------------------------------------
 * Which migrations create a new identity
 * ---------------------------------------------------------------------------
 * A migration is IDENTITY-CREATING (produces content-level data loss, not
 * just a version-tag change) when the forward migration must rewrite or drop
 * a field to satisfy the 0.2 frozen schema's stricter constraints:
 *
 *   - `clauses[].modality` is a string outside the locked 0.2 enum — it is
 *     force-set to `'certainty'` (`MODALITY_LOCKED`).
 *   - `provenance` / `annotations` contain a field outside the 0.2 locked
 *     field set — that field is dropped (`PROVENANCE_FIELD_REMOVED`,
 *     `ANNOTATION_FIELD_REMOVED`).
 *   - `time` is present, non-null, and not already a string — it is
 *     stringified (`TIME_STRINGIFIED`). (Note: `null` no longer triggers
 *     this — see the fix above.)
 *
 * In every identity-creating case, `migrateForward01to02` emits at least one
 * `MigrationWarning` explaining exactly what changed, and `classifyForward`
 * below reports `identityPreserved: false` with those warnings attached.
 * Identity-creating migrations are lossy but explicit: nothing is silently
 * dropped without a warning.
 */

export type MigrationDirection = 'forward-0.1-to-0.2' | 'backward-0.2-to-0.1';

export interface IdentityMigrationReport {
  direction: MigrationDirection;
  /** Canonical digest (hash portion only, ignoring the version segment) before migration. */
  beforeDigest: string;
  /** Canonical digest (hash portion only, ignoring the version segment) after migration. */
  afterDigest: string;
  /** Fingerprint string before migration (recomputed fresh from the source sem). */
  beforeFingerprint: string;
  /** Fingerprint string after migration, as produced by the migration function. */
  afterFingerprint: string;
  /** True when beforeDigest === afterDigest: the migration preserved identity. */
  identityPreserved: boolean;
  /** Field-level warnings emitted by the migration (empty when lossless). */
  warnings: MigrationWarning[];
  /** Human-readable explanation of the classification. */
  reason: string;
}

function digestOf(fp: string): string {
  return parseFingerprint(fp)?.digest ?? fp;
}

function explain(warnings: MigrationWarning[], identityPreserved: boolean): string {
  if (identityPreserved) {
    return warnings.length === 0
      ? 'No lossy field transformations; canonical digest unchanged across migration.'
      : 'Only non-lossy re-tagging occurred; canonical digest unchanged despite warnings.';
  }
  const codes = [...new Set(warnings.map((w) => w.code))].join(', ');
  return `Lossy field transformation(s) changed canonical content: ${codes || 'unknown'}.`;
}

/**
 * Classify a forward migration (0.1-draft → 0.2) by whether it preserves the
 * record's semantic identity (canonical digest) or creates a new one.
 *
 * The "before" digest is recomputed fresh from `record.sem` (not read from
 * `record.fingerprint`, which may be stale or use a different length), so
 * this function is safe to call on any well-formed 0.1-draft record.
 */
export function classifyForwardMigration(record: LunumRecord): IdentityMigrationReport & {
  result: ForwardMigrationResult;
} {
  const beforeFingerprint = migrateFingerprint(record.sem);
  const result = migrateForward01to02(record);
  const beforeDigest = digestOf(beforeFingerprint);
  const afterDigest = digestOf(result.record.fingerprint);
  const identityPreserved = beforeDigest === afterDigest;
  return {
    direction: 'forward-0.1-to-0.2',
    beforeDigest,
    afterDigest,
    beforeFingerprint,
    afterFingerprint: result.record.fingerprint,
    identityPreserved,
    warnings: result.warnings,
    reason: explain(result.warnings, identityPreserved),
    result
  };
}

/**
 * Classify a backward migration (0.2 → 0.1-draft) by whether it preserves
 * the record's semantic identity (canonical digest) or creates a new one.
 *
 * 0.1-draft is a strict superset schema of 0.2, so backward migration is
 * always identity-preserving for well-formed 0.2 input: no field is ever
 * dropped or rewritten, only the schema/version tag is downgraded.
 */
export function classifyBackwardMigration(record: LunumRecord): IdentityMigrationReport & {
  result: BackwardMigrationResult;
} {
  const beforeFingerprint = migrateFingerprint(record.sem);
  const result = migrateBackward02to01(record);
  const beforeDigest = digestOf(beforeFingerprint);
  const afterDigest = digestOf(result.record.fingerprint);
  const identityPreserved = beforeDigest === afterDigest;
  return {
    direction: 'backward-0.2-to-0.1',
    beforeDigest,
    afterDigest,
    beforeFingerprint,
    afterFingerprint: result.record.fingerprint,
    identityPreserved,
    warnings: result.warnings,
    reason: explain(result.warnings, identityPreserved),
    result
  };
}

// ---------------------------------------------------------------------------
// Golden vectors: identity-preserving and identity-creating migrations
// ---------------------------------------------------------------------------

export interface IdentityGoldenVector {
  /** Stable identifier for this golden entry. */
  id: string;
  /** What this vector demonstrates. */
  description: string;
  direction: MigrationDirection;
  /** The record to migrate. */
  record: LunumRecord;
  /** Expected classification. */
  expectedIdentityPreserved: boolean;
  /** Expected warning codes (order-independent, exact set). Empty array means no warnings expected. */
  expectedWarningCodes: string[];
}

function baseRecord(overrides: Partial<LunumRecord['sem']> = {}, clauseExtra: Record<string, unknown> = {}): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'the meeting occurs', language: 'en', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [
        {
          predicate: 'occur',
          roles: { subject: { type: 'event', id: 'meeting' } },
          ...clauseExtra
        }
      ],
      ...overrides
    },
    fingerprint: 'lfp:0.1:sha256:0000000000000000',
    renderings: {},
    policy: { eligible: true, category: 'fact', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
}

function roleRecord(roles: Record<string, unknown>): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'the meeting occurs', language: 'en', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'occur', roles: roles as Record<string, never> }]
    },
    fingerprint: 'lfp:0.1:sha256:0000000000000000',
    renderings: {},
    policy: { eligible: true, category: 'fact', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
}

/**
 * Golden vectors proving identity behaviour across schema migration.
 *
 * Pairs 'time-null-...' and 'time-omitted-...' MUST classify identically
 * (both identity-preserved, no warnings) — this is the #360 fix. Same for
 * the 'role-undefined-...' / 'role-omitted-...' pair. The lossy vectors
 * prove the converse: real content changes DO create a new identity, with
 * an explicit warning attached.
 */
export const IDENTITY_GOLDEN_VECTORS: IdentityGoldenVector[] = [
  {
    id: 'time-null-forward',
    description: 'clause.time explicitly null migrates forward with identity preserved (no TIME_STRINGIFIED).',
    direction: 'forward-0.1-to-0.2',
    record: baseRecord({}, { time: null }),
    expectedIdentityPreserved: true,
    expectedWarningCodes: []
  },
  {
    id: 'time-omitted-forward',
    description: 'clause.time omitted migrates forward with identity preserved.',
    direction: 'forward-0.1-to-0.2',
    record: baseRecord({}, {}),
    expectedIdentityPreserved: true,
    expectedWarningCodes: []
  },
  {
    id: 'role-undefined-forward',
    description: 'A role key explicitly set to undefined migrates forward with identity preserved.',
    direction: 'forward-0.1-to-0.2',
    record: roleRecord({ subject: { type: 'event', id: 'meeting' }, theme: undefined }),
    expectedIdentityPreserved: true,
    expectedWarningCodes: []
  },
  {
    id: 'role-omitted-forward',
    description: 'The same role key entirely omitted migrates forward with identity preserved.',
    direction: 'forward-0.1-to-0.2',
    record: roleRecord({ subject: { type: 'event', id: 'meeting' } }),
    expectedIdentityPreserved: true,
    expectedWarningCodes: []
  },
  {
    id: 'time-object-forward-lossy',
    description: 'A real (non-null, non-string) clause.time value is stringified — creates a new identity.',
    direction: 'forward-0.1-to-0.2',
    record: baseRecord({}, { time: { type: 'instant', value: '2026-01-01' } }),
    expectedIdentityPreserved: false,
    expectedWarningCodes: ['TIME_STRINGIFIED']
  },
  {
    id: 'modality-out-of-enum-forward-lossy',
    description: 'A modality outside the 0.2 locked enum is force-relocked to certainty — creates a new identity.',
    direction: 'forward-0.1-to-0.2',
    record: baseRecord({}, { modality: 'speculative' }),
    expectedIdentityPreserved: false,
    expectedWarningCodes: ['MODALITY_LOCKED']
  },
  {
    id: 'provenance-extra-field-forward-lossy',
    description: 'A provenance field outside the 0.2 locked set is dropped — creates a new identity.',
    direction: 'forward-0.1-to-0.2',
    record: baseRecord({ provenance: { source: 'chat', extra_tracking_field: 'x' } }),
    expectedIdentityPreserved: false,
    expectedWarningCodes: ['PROVENANCE_FIELD_REMOVED']
  },
  {
    id: 'time-null-backward',
    description: 'A 0.2 record with clause.time null migrates backward with identity preserved.',
    direction: 'backward-0.2-to-0.1',
    record: { ...baseRecord({ schema: 'lunum-sem/0.2' }, { time: null }), recordVersion: 'lunum-record/0.2' },
    expectedIdentityPreserved: true,
    expectedWarningCodes: []
  },
  {
    id: 'role-undefined-backward',
    description: 'A 0.2 record with a role key explicitly undefined migrates backward with identity preserved.',
    direction: 'backward-0.2-to-0.1',
    record: (() => {
      const roles: Record<string, unknown> = { subject: { type: 'event', id: 'meeting' }, theme: undefined };
      return {
        recordVersion: 'lunum-record/0.2',
        source: { text: 'the meeting occurs', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.2',
          world: 'real',
          kind: 'fact',
          clauses: [{ predicate: 'occur', roles: roles as Record<string, never> }]
        },
        fingerprint: 'lfp:0.2:sha256:0000000000000000',
        renderings: {},
        policy: { eligible: true, category: 'fact', risk: 'low', confidence: 1, reasons: [] },
        meta: {}
      };
    })(),
    expectedIdentityPreserved: true,
    expectedWarningCodes: []
  }
];

/**
 * Run every golden vector through its declared migration direction and
 * return the mismatches (empty array means the whole golden set passes).
 */
export function validateIdentityGoldenVectors(
  vectors: IdentityGoldenVector[] = IDENTITY_GOLDEN_VECTORS
): { id: string; expected: boolean; actual: boolean; expectedWarnings: string[]; actualWarnings: string[] }[] {
  const failures: { id: string; expected: boolean; actual: boolean; expectedWarnings: string[]; actualWarnings: string[] }[] = [];

  for (const vector of vectors) {
    const report =
      vector.direction === 'forward-0.1-to-0.2'
        ? classifyForwardMigration(vector.record)
        : classifyBackwardMigration(vector.record);

    const actualWarnings = [...new Set(report.warnings.map((w) => w.code))].sort();
    const expectedWarnings = [...vector.expectedWarningCodes].sort();
    const warningsMatch =
      actualWarnings.length === expectedWarnings.length &&
      actualWarnings.every((code, i) => code === expectedWarnings[i]);

    if (report.identityPreserved !== vector.expectedIdentityPreserved || !warningsMatch) {
      failures.push({
        id: vector.id,
        expected: vector.expectedIdentityPreserved,
        actual: report.identityPreserved,
        expectedWarnings,
        actualWarnings
      });
    }
  }

  return failures;
}
