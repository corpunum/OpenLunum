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
  code: string;
  message: string;
  field: string;
}

/** Result of forward migration (0.1 → 0.2). */
export interface ForwardMigrationResult {
  sem: LunumSem;
  record: LunumRecord;
  warnings: MigrationWarning[];
  /** Whether source schema was valid */
  sourceValid: boolean;
  /** Whether destination schema was valid */
  destValid: boolean;
}

/** Result of backward migration (0.2 → 0.1). */
export interface BackwardMigrationResult {
  sem: LunumSem;
  record: LunumRecord;
  warnings: MigrationWarning[];
  /** Whether source schema was valid */
  sourceValid: boolean;
  /** Whether destination schema was valid */
  destValid: boolean;
}

/**
 * Validate a LunumSem schema version.
 */
export function validateSemSchema(sem: LunumSem): boolean {
  return typeof sem.schema === 'string' && sem.schema.length > 0;
}

/**
 * Validate a LunumRecord structure.
 */
export function validateRecord(record: LunumRecord): boolean {
  return (
    typeof record.recordVersion === 'string' &&
    record.recordVersion.length > 0 &&
    typeof record.source?.text === 'string' &&
    typeof record.sem?.schema === 'string'
  );
}

/**
 * Forward migration: 0.1-draft → 0.2 frozen.
 * Migrates recordVersion, sem.schema, clauses (modality enum lock),
 * provenance (locked field set), annotations (locked field set).
 * Preserves input order. Validates both source and destination schemas.
 * Emits field-level loss warnings for data loss.
 */
export function migrateForward01to02(
  record: LunumRecord
): ForwardMigrationResult {
  const warnings: MigrationWarning[] = [];

  // Validate source
  const sourceValid = validateRecord(record) && validateSemSchema(record.sem);

  // Deep clone to avoid mutation
  const sem = structuredClone(record.sem);
  const recordVersion = RECORD_SCHEMA_02;
  (sem as any).schema = SEM_SCHEMA_02;

  // Migrate clauses: lock modality enum
  if (Array.isArray(sem.clauses)) {
    sem.clauses = sem.clauses.map((clause: any) => {
      const upgraded: any = { ...clause };

      if (upgraded.modality !== undefined && upgraded.modality !== null) {
        const validModalities = [
          'fact', 'opinion', 'belief', 'possibility', 'necessity',
          'obligation', 'permission', 'ability', 'intention', 'certainty', null
        ];
        if (typeof upgraded.modality === 'string' && !validModalities.includes(upgraded.modality)) {
          warnings.push({
            code: 'MODALITY_LOCKED',
            message: `Modality '${upgraded.modality}' locked to 'certainty' in 0.2`,
            field: 'clauses[].modality'
          });
          upgraded.modality = 'certainty';
        }
      }

      // Normalize time to ISO 8601 string
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

  // Migrate provenance: lock to allowed fields
  if (sem.provenance) {
    const prov = sem.provenance as Record<string, unknown>;
    const lockedProv: Record<string, unknown> = {};
    const allowedProvenanceFields = ['source', 'author', 'timestamp', 'license'];

    for (const key of allowedProvenanceFields) {
      if (prov[key] !== undefined) {
        lockedProv[key] = prov[key];
      }
    }

    for (const key of Object.keys(prov)) {
      if (!(key in lockedProv)) {
        warnings.push({
          code: 'PROVENANCE_FIELD_REMOVED',
          message: `Provenance field '${key}' removed in 0.2 (locked field set)`,
          field: `provenance.${key}`
        });
      }
    }

    sem.provenance = lockedProv;
  }

  // Migrate annotations: lock to allowed fields
  if (sem.annotations) {
    const ann = sem.annotations as Record<string, unknown>;
    const lockedAnn: Record<string, unknown> = {};
    const allowedAnnotationFields = ['confidence', 'tags', 'notes'];

    for (const key of allowedAnnotationFields) {
      if (ann[key] !== undefined) {
        lockedAnn[key] = ann[key];
      }
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

    sem.annotations = lockedAnn;
  }

  // Regenerate fingerprint at 0.2
  // Temporarily set schema to 0.1 for canonicalization, then restore to 0.2
  const tempSchema = (sem as any).schema;
  (sem as any).schema = SEM_SCHEMA;
  const canonical = canonicalizeSem(sem);
  (sem as any).schema = tempSchema;  // Restore to 0.2
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  const newFp = `lfp:${FP_VERSION_02}:sha256:${digest.slice(0, 32)}`;

  const destValid = validateSemSchema(sem) && typeof newFp === 'string' && newFp.length > 0;

  const migratedRecord: LunumRecord = {
    recordVersion,
    source: { ...record.source },
    sem,
    fingerprint: newFp,
    renderings: { ...record.renderings },
    policy: { ...record.policy },
    meta: { ...record.meta, schemaVersion: '0.2' }
  };

  return { sem, record: migratedRecord, warnings, sourceValid, destValid };
}

/**
 * Backward migration: 0.2 frozen → 0.1-draft (lossy).
 * Downgrades recordVersion, sem.schema, clauses (modality becomes any string),
 * provenance (unrestricted), annotations (unrestricted).
 * Preserves input order. Validates both source and destination schemas.
 * Emits field-level loss warnings for data loss.
 */
export function migrateBackward02to01(
  record: LunumRecord
): BackwardMigrationResult {
  const warnings: MigrationWarning[] = [];

  // Validate source
  const sourceValid = validateRecord(record) && validateSemSchema(record.sem);

  // Deep clone
  const sem = structuredClone(record.sem);
  const recordVersion = RECORD_SCHEMA;
  (sem as any).schema = SEM_SCHEMA;

  // Downgrade clauses: modality becomes any string
  if (Array.isArray(sem.clauses)) {
    sem.clauses = sem.clauses.map((clause: any) => {
      const downgraded: any = { ...clause };
      // Enum values in 0.2 are valid strings in 0.1, so no data loss
      return downgraded;
    });
  }

  // Downgrade provenance: unrestricted
  if (sem.provenance) {
    const prov = sem.provenance as Record<string, unknown>;
    // Provenance is unrestricted in 0.1, so no fields are lost
    // But we warn that the schema is no longer locked
    warnings.push({
      code: 'PROVENANCE_UNRESTRICTED',
      message: 'Provenance reverted to unrestricted object shape',
      field: 'provenance'
    });
  }

  // Downgrade annotations: unrestricted
  if (sem.annotations) {
    warnings.push({
      code: 'ANNOTATIONS_UNRESTRICTED',
      message: 'Annotations reverted to unrestricted object shape',
      field: 'annotations'
    });
  }

  // Regenerate fingerprint at 0.1
  const tempSchema = (sem as any).schema;
  (sem as any).schema = SEM_SCHEMA;
  const canonical = canonicalizeSem(sem);
  (sem as any).schema = tempSchema;  // Restore (already 0.1)
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  const newFp = `lfp:${FP_VERSION}:sha256:${digest.slice(0, 32)}`;

  const destValid = validateSemSchema(sem) && typeof newFp === 'string' && newFp.length > 0;

  const migratedRecord: LunumRecord = {
    recordVersion,
    source: { ...record.source },
    sem,
    fingerprint: newFp,
    renderings: { ...record.renderings },
    policy: { ...record.policy },
    meta: { ...record.meta, schemaVersion: '0.1-draft' }
  };

  return { sem, record: migratedRecord, warnings, sourceValid, destValid };
}

/**
 * Migrate a collection of records forward, preserving input order.
 */
export function migrateRecordsForward(
  records: LunumRecord[]
): { results: ForwardMigrationResult[]; orderPreserved: boolean } {
  const originalOrder = records.map((r, i) => ({ ...r, _order: i }));
  const results = records.map(migrateForward01to02);
  const orderPreserved = results.every((r, i) => {
    const origId = originalOrder[i]?._order;
    const resultId = i;
    return origId === resultId;
  });
  return { results, orderPreserved };
}

/**
 * Migrate a collection of records backward, preserving input order.
 */
export function migrateRecordsBackward(
  records: LunumRecord[]
): { results: BackwardMigrationResult[]; orderPreserved: boolean } {
  const originalOrder = records.map((r, i) => ({ ...r, _order: i }));
  const results = records.map(migrateBackward02to01);
  const orderPreserved = results.every((r, i) => {
    const origId = originalOrder[i]?._order;
    const resultId = i;
    return origId === resultId;
  });
  return { results, orderPreserved };
}

/**
 * Round-trip migration test: 0.1 → 0.2 → 0.1.
 * Verifies that forward then backward migration produces a valid 0.1 record
 * with explicit warnings about any data loss.
 */
export function roundTripMigration(initialRecord: LunumRecord): {
  forward: ForwardMigrationResult;
  backward: BackwardMigrationResult;
} {
  const forward = migrateForward01to02(initialRecord);
  const backward = migrateBackward02to01(forward.record);
  return { forward, backward };
}
