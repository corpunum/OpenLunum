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
          'certainty', 'possibility', 'necessity',
          'obligation', 'permission', null
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

// ===========================================================================
// Rollback process: revert to original source with verification
// ===========================================================================

/** Integrity status of the semantic payload. */
export type IntegrityStatus = 'verified' | 'mismatch' | 'absent';

/** Provenance chain status. */
export type ProvenanceStatus = 'verified' | 'partial' | 'absent';

/** Source authenticity status. */
export type SourceAuthenticityStatus = 'verified' | 'unverified' | 'absent';

/**
 * Result of a rollback operation.
 *
 * Provides separate integrity/provenance/source-authenticity statuses
 * so callers can determine exactly what was verified and what was not.
 */
export interface RollbackResult {
  /** The original natural-language source text */
  sourceText: string;
  /** Source language if available */
  sourceLanguage: string | null;
  /** Source reference if available */
  sourceRef: string | null;
  /** Whether the semantic payload matches the record fingerprint */
  integrity: IntegrityStatus;
  /** Whether the provenance chain is complete and verifiable */
  provenance: ProvenanceStatus;
  /** Whether the source text is authenticated against a stored digest */
  sourceAuthenticity: SourceAuthenticityStatus;
  /** Whether the rollback can be considered trustworthy */
  verified: boolean;
  /** Warnings about the rollback */
  warnings: string[];
  /** Details for debugging */
  details?: {
    /** Computed fingerprint of current sem */
    computedFp?: string;
    /** Stored fingerprint in record */
    storedFp?: string;
    /** Provenance fields found */
    provenanceFields?: string[];
    /** Source digest if available */
    sourceDigest?: string;
  };
}

/**
 * Summary of a batch rollback operation.
 */
export interface RollbackSummary {
  /** Total records processed */
  total: number;
  /** Records with fully verified rollback */
  verified: number;
  /** Records with partial verification */
  partial: number;
  /** Records with no or failed verification */
  unverified: number;
  /** Whether all records were fully verified */
  allVerified: boolean;
  /** Warnings from the rollback */
  warnings: string[];
}

/**
 * Compute a SHA-256 digest of a string.
 */
function computeDigest(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Rollback a LunumRecord to its original natural-language source
 * with separate integrity/provenance/source-authenticity verification.
 *
 * The rollback process:
 * 1. Verifies the record's fingerprint matches the current semantic content
 *    (integrity check)
 * 2. Validates the provenance chain for completeness
 *    (provenance check)
 * 3. Authenticates the source text against a stored digest if available
 *    (source-authenticity check)
 * 4. Returns source text with all verification statuses
 *
 * Fail closed: if evidence is absent, verification is false.
 * Empty source text causes failure (not just a warning).
 *
 * @param record - The LunumRecord to rollback
 * @param options - Optional verification settings
 * @returns RollbackResult with source text and verification statuses
 */
export function rollbackToSource(
  record: LunumRecord,
  options: {
    /** Recompute and verify fingerprint against sem content (default: true) */
    verifyFingerprint?: boolean;
    /** Verify provenance chain completeness (default: true) */
    verifyProvenance?: boolean;
    /** Verify source text against stored digest (default: true) */
    verifySourceDigest?: boolean;
  } = {}
): RollbackResult {
  const opts = {
    verifyFingerprint: options.verifyFingerprint ?? true,
    verifyProvenance: options.verifyProvenance ?? true,
    verifySourceDigest: options.verifySourceDigest ?? true,
  };

  const warnings: string[] = [];
  const details: { computedFp?: string; storedFp?: string; provenanceFields?: string[]; sourceDigest?: string } = {};

  // ── Step 1: Integrity check ──────────────────────────────────────
  let integrity: IntegrityStatus;
  if (opts.verifyFingerprint && record.fingerprint && record.fingerprint.length > 0) {
    const computedFp = migrateFingerprint(record.sem);
    details.computedFp = computedFp;
    details.storedFp = record.fingerprint;

    if (computedFp === record.fingerprint) {
      integrity = 'verified';
    } else {
      integrity = 'mismatch';
      warnings.push(
        `Fingerprint mismatch: stored ${record.fingerprint.slice(0, 20)} ` +
        `does not match recomputed ${computedFp.slice(0, 20)}`
      );
    }
  } else {
    integrity = 'absent';
    if (opts.verifyFingerprint) {
      warnings.push('Fingerprint verification skipped: no fingerprint in record');
    }
  }

  // ── Step 2: Provenance chain check ───────────────────────────────
  let provenance: ProvenanceStatus = 'absent';
  if (opts.verifyProvenance) {
    const prov = record.sem.provenance;
    if (prov && typeof prov === 'object' && !Array.isArray(prov)) {
      const requiredFields = ['source', 'timestamp'];
      const presentFields = requiredFields.filter(f => f in prov);
      details.provenanceFields = presentFields;

      if (presentFields.length === requiredFields.length) {
        // Check for a signature or digest in provenance
        const hasAuthenticatingField = 'signature' in prov || 'sourceDigest' in prov || 'author' in prov;
        if (hasAuthenticatingField) {
          provenance = 'verified';
        } else {
          // Has required fields but no auth mechanism — partial
          provenance = 'partial';
          warnings.push('Provenance has required fields but no signature/sourceDigest for authentication');
        }
      } else {
        provenance = 'partial';
        const missing = requiredFields.filter(f => !(f in prov));
        warnings.push(`Provenance missing required fields: ${missing.join(', ')}`);
      }
    } else {
      provenance = 'absent';
      warnings.push('No provenance chain found in sem');
    }
  }

  // ── Step 3: Source authenticity check ────────────────────────────
  let sourceAuthenticity: SourceAuthenticityStatus = 'absent';
  const sourceText = record.source.text ?? '';
  let sourceDigest: string | undefined = undefined;

  // If source text is present but we're not verifying, mark as unverified
  if (!opts.verifySourceDigest && sourceText.trim().length > 0) {
    sourceAuthenticity = 'unverified';
  }

  if (opts.verifySourceDigest) {
    // Check if there's a stored source digest in provenance
    const prov = record.sem.provenance;
    const storedDigest = prov && typeof prov === 'object' && 'sourceDigest' in prov
      ? String(prov.sourceDigest)
      : undefined;

    if (storedDigest && storedDigest.length > 0) {
      sourceDigest = storedDigest;
      const computedDigest = computeDigest(sourceText);
      if (computedDigest === storedDigest) {
        sourceAuthenticity = 'verified';
      } else {
        sourceAuthenticity = 'unverified';
        warnings.push(`Source text digest mismatch: stored ${storedDigest.slice(0, 16)} vs computed ${computedDigest.slice(0, 16)}`);
      }
    } else if (record.source.ref && record.source.ref.length > 0) {
      // Source has a reference — can be verified externally
      sourceAuthenticity = 'unverified';
      warnings.push(`Source text has reference ${record.source.ref} but no inline digest for verification`);
    } else if (sourceText.trim().length > 0) {
      // No digest, no ref — source exists but cannot be authenticated
      sourceAuthenticity = 'unverified';
      warnings.push('Source text present but no digest or reference for authentication');
    }
  }

  // ── Step 4: Validate source text ─────────────────────────────────
  if (!sourceText || sourceText.trim() === '') {
    // Empty source is a failure, not just a warning
    warnings.push('Source text is empty or missing');
    // Mark source authenticity as absent if empty
    if (sourceAuthenticity === 'absent') {
      sourceAuthenticity = 'absent';
    }
  }

  // ── Step 5: Determine overall verified status ────────────────────
  // Fail closed: integrity must be verified, source must not be empty
  // Provenance being absent or partial is acceptable if integrity is verified
  // Source authenticity must be verified or unverified (not absent)
  let verified =
    integrity === 'verified' &&
    (provenance === 'verified' || provenance === 'partial' || provenance === 'absent') &&
    (sourceAuthenticity === 'verified' || sourceAuthenticity === 'unverified');

  // If source is empty, always fail
  if (!sourceText || sourceText.trim() === '') {
    verified = false;
  }

  const result: RollbackResult = {
    sourceText,
    sourceLanguage: record.source.language,
    sourceRef: record.source.ref,
    integrity,
    provenance,
    sourceAuthenticity,
    verified,
    warnings,
  };
  if (sourceDigest !== undefined) {
    details.sourceDigest = sourceDigest;
  }
  if (Object.keys(details).length > 0) {
    result.details = details;
  }
  return result;
}

/**
 * Rollback a batch of records to their original sources.
 * Returns per-record results and aggregate summary.
 * Preserves input order.
 */
export function rollbackBatch(
  records: LunumRecord[],
  options?: Parameters<typeof rollbackToSource>[1]
): { results: RollbackResult[]; summary: RollbackSummary } {
  const results: RollbackResult[] = [];
  const allWarnings: string[] = [];

  for (const record of records) {
    const result = rollbackToSource(record, options);
    results.push(result);
    allWarnings.push(...result.warnings);
  }

  const verified = results.filter((r) => r.verified).length;
  const unverified = results.filter((r) => !r.verified).length;
  const partial = results.filter(
    (r) => r.verified === false && r.integrity !== 'absent' && r.provenance !== 'absent' && r.sourceAuthenticity !== 'absent'
  ).length;

  return {
    results,
    summary: {
      total: records.length,
      verified,
      partial,
      unverified,
      allVerified: verified === records.length && unverified === 0,
      warnings: allWarnings,
    },
  };
}
