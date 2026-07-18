import crypto from 'node:crypto';
import { FP_VERSION, SEM_SCHEMA, RECORD_SCHEMA } from './constants.js';
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
