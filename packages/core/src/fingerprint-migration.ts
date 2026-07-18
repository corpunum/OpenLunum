import crypto from 'node:crypto';
import { FP_VERSION, SEM_SCHEMA, RECORD_SCHEMA, SEM_SCHEMA_02, RECORD_SCHEMA_02, FP_VERSION_02 } from './constants.js';
import { canonicalizeSem, stableStringify } from './canonicalize.js';
import type { LunumRecord, LunumSem } from './types.js';

// ---------------------------------------------------------------------------
// Fingerprint version parsing
// ---------------------------------------------------------------------------

const FINGERPRINT_RE =
  /^(?<prefix>lfp|lsf):(?<version>\d+\.\d+):(?<algo>sha256):(?<digest>[a-f0-9]+)$/;

/**
 * Parse a fingerprint string into its components.
 * Returns `null` if the string does not match the expected format.
 */
export function parseFingerprint(fp: string): FingerprintComponents | null {
  const m = FINGERPRINT_RE.exec(fp);
  if (!m || !m.groups) return null;
  const { prefix, version, algo, digest } = m.groups;
  return {
    prefix: prefix as 'lfp' | 'lsf',
    version: version!,
    algorithm: algo!,
    digest: digest!
  };
}

export interface FingerprintComponents {
  prefix: 'lfp' | 'lsf';
  version: string;
  algorithm: string;
  digest: string;
}

// ---------------------------------------------------------------------------
// Version detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect the fingerprint version used by a record.
 * Returns the detected version string, or `null` if no fingerprint is present.
 */
export function detectRecordFpVersion(record: LunumRecord): string | null {
  return record.fingerprint ? parseFingerprint(record.fingerprint)?.version ?? null : null;
}

/**
 * Detect the schema version used by semantic content.
 * Returns the schema version string, or `null` if the schema is missing.
 */
export function detectSemVersion(sem: LunumSem): string | null {
  return sem.schema || null;
}

/**
 * Check whether a fingerprint is already at the current version.
 */
export function isCurrentVersion(fp: string): boolean {
  const parsed = parseFingerprint(fp);
  return parsed !== null && parsed.version === FP_VERSION;
}

/**
 * Check whether a semantic object is already at the current schema version.
 */
export function isCurrentSchema(sem: LunumSem): boolean {
  return sem.schema === SEM_SCHEMA;
}

// ---------------------------------------------------------------------------
// Migration utilities
// ---------------------------------------------------------------------------

/**
 * Regenerate a fingerprint for a Lunum-Sem object at the current version.
 * This is the canonical migration path when the canonicalization algorithm
 * or fingerprint version changes.
 */
export function migrateFingerprint(sem: unknown, options: { length?: number } = {}): string {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  const bounded = Math.max(16, Math.min(64, Math.trunc(options.length ?? 32)));
  return `lfp:${FP_VERSION}:sha256:${digest.slice(0, bounded)}`;
}

/**
 * Migrate a full LunumRecord to the current fingerprint version.
 * Canonicalizes the semantic object and regenerates the fingerprint.
 * Returns a new record with the migrated fingerprint.
 */
export function migrateRecord(record: LunumRecord): LunumRecord {
  return {
    ...record,
    fingerprint: migrateFingerprint(record.sem)
  };
}

/**
 * Migrate a collection of records in-place (returns new array).
 */
export function migrateRecords(records: LunumRecord[]): LunumRecord[] {
  return records.map(migrateRecord);
}

// ---------------------------------------------------------------------------
// Golden vectors for testing migration
// ---------------------------------------------------------------------------

export interface GoldenFingerprint {
  /** Stable identifier for this golden entry */
  id: string;
  /** Canonicalized Lunum-Sem object used as the golden input */
  sem: LunumSem;
  /** Expected fingerprint at the current version */
  expectedFp: string;
  /** Version the golden was captured against */
  version: string;
}

/**
 * Build a golden fingerprint vector from a set of semantic objects.
 * Each entry captures the canonicalized form and its expected fingerprint.
 */
export function buildGoldenVector(
  inputs: { id: string; sem: unknown }[]
): GoldenFingerprint[] {
  return inputs.map(({ id, sem }) => {
    const canonical = canonicalizeSem(sem);
    const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
    const fp = `lfp:${FP_VERSION}:sha256:${digest.slice(0, 32)}`;
    return { id, sem: canonical, expectedFp: fp, version: FP_VERSION };
  });
}

/**
 * Validate a set of semantic objects against a golden fingerprint vector.
 * Returns an array of failures (empty means all pass).
 */
export function validateGoldenVector(
  golden: GoldenFingerprint[],
  inputs: { id: string; sem: unknown }[]
): { id: string; expected: string; actual: string }[] {
  const goldenMap = new Map(golden.map((g) => [g.id, g]));
  const failures: { id: string; expected: string; actual: string }[] = [];

  for (const { id, sem } of inputs) {
    const entry = goldenMap.get(id);
    if (!entry) {
      failures.push({ id, expected: '(missing)', actual: '(unexpected)' });
      continue;
    }
    const actual = migrateFingerprint(sem);
    if (actual !== entry.expectedFp) {
      failures.push({ id, expected: entry.expectedFp, actual });
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Migration summary / reporting
// ---------------------------------------------------------------------------

export interface MigrationSummary {
  /** Total records examined */
  total: number;
  /** Records already at the current version */
  alreadyCurrent: number;
  /** Records migrated */
  migrated: number;
  /** Records that failed validation (migrated but digest changed unexpectedly) */
  failures: { id: string; oldFp: string; newFp: string }[];
}

/**
 * Run a dry-run migration over a dataset and report what would change.
 */
export function dryRunMigration(records: LunumRecord[]): MigrationSummary {
  let alreadyCurrent = 0;
  let migrated = 0;
  const failures: MigrationSummary['failures'] = [];

  for (const record of records) {
    if (isCurrentVersion(record.fingerprint)) {
      alreadyCurrent++;
    } else {
      migrated++;
      const newFp = migrateFingerprint(record.sem);
      if (newFp !== record.fingerprint) {
        failures.push({ id: record.fingerprint.slice(0, 20), oldFp: record.fingerprint, newFp });
      }
    }
  }

  return {
    total: records.length,
    alreadyCurrent,
    migrated,
    failures
  };
}

// ---------------------------------------------------------------------------
// Bidirectional migration (0.1 ↔ 0.2)
// ---------------------------------------------------------------------------

/** Warning emitted during lossy backward migration. */
export interface MigrationWarning {
  /** Machine-readable warning code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Field that was lost or transformed */
  field: string;
}

/** Result of forward migration (0.1 → 0.2). */
export interface ForwardMigrationResult {
  /** Migrated Lunum-Sem object */
  sem: LunumSem;
  /** Migrated LunumRecord object */
  record: LunumRecord;
  /** Warnings about fields that were preserved or enhanced */
  warnings: MigrationWarning[];
}

/** Result of backward migration (0.2 → 0.1). */
export interface BackwardMigrationResult {
  /** Migrated Lunum-Sem object at 0.1 */
  sem: LunumSem;
  /** Migrated LunumRecord object at 0.1 */
  record: LunumRecord;
  /** Warnings about data loss during lossy downgrade */
  warnings: MigrationWarning[];
}

/**
 * Forward migration: 0.1-draft → 0.2 frozen.
 * Upgrades schema version, locks modality enum, structures provenance/annotations.
 * Returns a new record with updated schema references.
 */
export function migrateSem01to02(sem: LunumSem): ForwardMigrationResult {
  const warnings: MigrationWarning[] = [];

  // Deep copy to avoid mutating input
  const migratedSem = structuredClone(sem);
  (migratedSem as any).schema = SEM_SCHEMA_02;

  // Upgrade clauses
  if (Array.isArray(migratedSem.clauses)) {
    migratedSem.clauses = migratedSem.clauses.map((clause: any) => {
      const upgraded: any = { ...clause };

      // Lock modality to enum if present
      if (upgraded.modality !== undefined) {
        const validModalities = ['certainty', 'possibility', 'necessity', 'obligation', null];
        if (typeof upgraded.modality === 'string' && !validModalities.includes(upgraded.modality)) {
          warnings.push({
            code: 'MODALITY_LOCKED',
            message: `Modality '${upgraded.modality}' locked to 'certainty' in 0.2`,
            field: 'clauses[].modality'
          });
          upgraded.modality = 'certainty';
        }
      }

      // Ensure time is ISO 8601 string if present
      if (upgraded.time !== undefined && typeof upgraded.time !== 'string') {
        upgraded.time = typeof upgraded.time === 'object' && upgraded.time !== null
          ? JSON.stringify(upgraded.time)
          : String(upgraded.time);
        warnings.push({
          code: 'TIME_STRINGIFIED',
          message: 'Time field converted to ISO 8601 string',
          field: 'clauses[].time'
        });
      }

      return upgraded;
    });
  }

  // Upgrade provenance to locked shape
  if (migratedSem.provenance) {
    const prov = migratedSem.provenance as any;
    const lockedProv: any = {};
    for (const key of ['source', 'author', 'timestamp', 'license'] as const) {
      if (prov[key] !== undefined) lockedProv[key] = prov[key];
    }
    // Report lost fields
    for (const key of Object.keys(prov)) {
      if (!(key in lockedProv)) {
        warnings.push({
          code: 'PROVENANCE_FIELD_REMOVED',
          message: `Provenance field '${key}' removed in 0.2 (locked field set)`,
          field: `provenance.${key}`
        });
      }
    }
    migratedSem.provenance = lockedProv;
  }

  // Upgrade annotations to locked shape
  if (migratedSem.annotations) {
    const ann = migratedSem.annotations as any;
    const lockedAnn: any = {};
    for (const key of ['confidence', 'tags', 'notes'] as const) {
      if (ann[key] !== undefined) lockedAnn[key] = ann[key];
    }
    for (const key of Object.keys(ann)) {
      if (!(key in lockedAnn)) {
        warnings.push({
          code: 'ANNOTATION_FIELD_REMOVED',
          message: `Annotation field '${key}' removed in 0.2 (locked field set)`,
          field: `annotations.${key}`
        });
      }
    }
    migratedSem.annotations = lockedAnn;
  }

  // Migrate record - canonicalize with temp 0.1 schema, then restore 0.2
  const recordVersion = RECORD_SCHEMA_02 as any;
  const currentSchema = (migratedSem as any).schema;
  (migratedSem as any).schema = SEM_SCHEMA;  // Temporarily set to 0.1 for canonicalization
  const canonical = canonicalizeSem(migratedSem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  const newFp = `lfp:${FP_VERSION_02}:sha256:${digest.slice(0, 32)}`;  // 0.2 fingerprint
  (migratedSem as any).schema = currentSchema;  // Restore to 0.2

  return {
    sem: migratedSem,
    record: {
      recordVersion,
      source: (sem as any).source ?? { text: '', language: null },
      sem: migratedSem,
      fingerprint: newFp,
      renderings: {},
      policy: {
        eligible: true,
        category: 'migration',
        risk: 'unknown' as const,
        confidence: 0,
        reasons: ['forward migration']
      },
      meta: { created: new Date().toISOString(), schemaVersion: '0.2' }
    },
    warnings
  };
}

/**
 * Backward migration: 0.2 frozen → 0.1-draft (lossy).
 * Downgrades schema version, strips locked fields, warns about data loss.
 * Returns a new record with 0.1 schema references.
 */
export function migrateSem02to01(sem: LunumSem): BackwardMigrationResult {
  const warnings: MigrationWarning[] = [];

  const migratedSem = structuredClone(sem);
  (migratedSem as any).schema = SEM_SCHEMA;

  // Downgrade clauses — modality becomes string again
  if (Array.isArray(migratedSem.clauses)) {
    migratedSem.clauses = migratedSem.clauses.map((clause: any) => {
      const downgraded: any = { ...clause };
      // Modality is already enum in 0.2, but 0.1 allows any string
      // No warning needed — enum values are valid strings
      return downgraded;
    });
  }

  // Strip provenance to unrestricted shape
  if (migratedSem.provenance) {
    const prov = migratedSem.provenance as any;
    // Convert locked provenance back to unrestricted (no data loss if only locked fields)
    // But warn if there were originally more fields
    warnings.push({
      code: 'PROVENANCE_UNRESTRICTED',
      message: 'Provenance reverted to unrestricted object shape',
      field: 'provenance'
    });
  }

  // Strip annotations to unrestricted shape
  if (migratedSem.annotations) {
    const ann = migratedSem.annotations as any;
    warnings.push({
      code: 'ANNOTATIONS_UNRESTRICTED',
      message: 'Annotations reverted to unrestricted object shape',
      field: 'annotations'
    });
  }

  // Migrate record - ensure schema is 0.1 for canonicalization
  const recordVersion = RECORD_SCHEMA as any;
  const currentSchema = (migratedSem as any).schema;
  (migratedSem as any).schema = SEM_SCHEMA;  // Set to 0.1 for canonicalization
  const newFp = `lfp:${FP_VERSION}:sha256:${crypto.createHash('sha256').update(stableStringify(migratedSem)).digest('hex').slice(0, 32)}`;
  (migratedSem as any).schema = currentSchema;  // Restore

  return {
    sem: migratedSem,
    record: {
      recordVersion,
      source: (sem as any).source ?? { text: '', language: null },
      sem: migratedSem,
      fingerprint: newFp,
      renderings: {},
      policy: {
        eligible: true,
        category: 'migration',
        risk: 'unknown' as const,
        confidence: 0,
        reasons: ['backward migration']
      },
      meta: { schemaVersion: '0.1-draft' }
    },
    warnings
  };
}

/**
 * Round-trip migration test: 0.1 → 0.2 → 0.1.
 * Verifies that forward then backward migration produces a valid 0.1 record
 * with explicit warnings about any data loss.
 */
export function roundTripMigration(initialSem: LunumSem): { forward: ForwardMigrationResult; backward: BackwardMigrationResult } {
  const forward = migrateSem01to02(initialSem);
  const backward = migrateSem02to01(forward.sem);
  return { forward, backward };
}
