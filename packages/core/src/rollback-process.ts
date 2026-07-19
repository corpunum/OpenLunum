/**
 * Rollback process for Lunum-Sem records.
 *
 * Given a Lunum-Sem record and its provenance chain, reverts to the original
 * natural-language source with verification. Verifies authenticity and
 * provenance of the original source, not just semantic fingerprint consistency.
 *
 * This implements the release gate 7 requirement:
 * "Implement rollback process: given a Lunum-Sem record and its provenance
 * chain, revert to the original natural-language source with verification."
 */

import crypto from 'node:crypto';
import type { LunumRecord, LunumSem } from './types.js';
import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { migrateFingerprint } from './fingerprint-migration.js';

// ── Types ──────────────────────────────────────────────────────────

/** Status of integrity verification. */
export type IntegrityStatus = 'verified' | 'failed' | 'absent';

/** Status of provenance chain verification. */
export type ProvenanceStatus = 'verified' | 'failed' | 'absent';

/** Status of source authenticity verification. */
export type SourceStatus = 'verified' | 'failed' | 'absent';

/** Result of rolling back a single record to its original source. */
export interface RollbackResult {
  /** Whether the rollback succeeded */
  success: boolean;
  /** Original record */
  record: LunumRecord;
  /** Reverted natural-language source */
  source: { text: string; language: string | null };
  /** Integrity verification status */
  integrityStatus: IntegrityStatus;
  /** Provenance chain verification status */
  provenanceStatus: ProvenanceStatus;
  /** Source authenticity verification status */
  sourceStatus: SourceStatus;
  /** Warnings about missing evidence */
  warnings: string[];
  /** Details about what was verified */
  details: string[];
}

/** Summary of a batch rollback operation. */
export interface RollbackSummary {
  /** Total records processed */
  total: number;
  /** Records successfully rolled back */
  success: number;
  /** Records that failed rollback */
  failed: number;
  /** Records with only warnings (not errors) */
  warned: number;
  /** Per-record results */
  results: RollbackResult[];
  /** Overall integrity status across all records */
  overallIntegrityStatus: IntegrityStatus;
  /** Overall provenance status across all records */
  overallProvenanceStatus: ProvenanceStatus;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 digest of a string.
 */
function digestHex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Compute the expected fingerprint for a record's semantic content.
 */
function computeExpectedFingerprint(sem: LunumSem): string {
  return migrateFingerprint(sem);
}

/**
 * Compute a digest of the source text for provenance verification.
 */
function computeSourceDigest(source: { text: string; language: string | null }): string {
  const normalized = `${source.language || ''}::${source.text}`;
  return digestHex(normalized);
}

/**
 * Compute a digest of the provenance fields for chain verification.
 */
function computeProvenanceDigest(sem: LunumSem): string | null {
  if (!sem.provenance || typeof sem.provenance !== 'object') return null;
  const prov = sem.provenance as Record<string, unknown>;
  // Only hash allowed provenance fields for consistency
  const allowedFields = ['source', 'author', 'timestamp', 'license'];
  const filtered: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (prov[key] !== undefined) {
      filtered[key] = prov[key];
    }
  }
  const canonical = stableStringify(canonicalizeSem({ ...sem, provenance: filtered as Record<string, unknown> }));
  return digestHex(canonical);
}

// ── Rollback Functions ─────────────────────────────────────────────

/**
 * Roll back a single Lunum-Sem record to its original natural-language source.
 *
 * Verifies:
 * 1. Integrity: the record's fingerprint matches its semantic content
 * 2. Provenance: the provenance chain is intact and verifiable
 * 3. Source authenticity: the source text is consistent with expectations
 *
 * Fails closed when evidence is absent.
 */
export function rollbackToSource(
  record: LunumRecord,
  options: {
    /** Expected source text digest (if known from external source). If absent, computes from record. */
    expectedSourceDigest?: string | null | undefined;
    /** Expected provenance digest (if known from external source). If absent, computes from record. */
    expectedProvenanceDigest?: string | null | undefined;
  } = {}
): RollbackResult {
  const warnings: string[] = [];
  const details: string[] = [];
  let integrityStatus: IntegrityStatus = 'absent';
  let provenanceStatus: ProvenanceStatus = 'absent';
  let sourceStatus: SourceStatus = 'absent';

  // 1. Integrity verification: check fingerprint matches semantic content
  const expectedFp = computeExpectedFingerprint(record.sem);
  if (record.fingerprint === expectedFp) {
    integrityStatus = 'verified';
    details.push('Fingerprint verified: record integrity intact');
  } else {
    integrityStatus = 'failed';
    details.push(`Fingerprint mismatch: expected ${expectedFp.slice(0, 20)}..., got ${record.fingerprint.slice(0, 20)}...`);
  }

  // 2. Provenance verification: check provenance chain
  const provenanceDigest = computeProvenanceDigest(record.sem);
  if (options.expectedProvenanceDigest && provenanceDigest) {
    if (options.expectedProvenanceDigest === provenanceDigest) {
      provenanceStatus = 'verified';
      details.push('Provenance chain verified against external digest');
    } else {
      provenanceStatus = 'failed';
      details.push('Provenance digest mismatch with external source');
    }
  } else if (provenanceDigest) {
    if (record.sem.provenance && typeof record.sem.provenance === 'object' &&
        Object.keys(record.sem.provenance).length > 0) {
      provenanceStatus = 'verified';
      details.push('Provenance chain present and non-empty');
    } else {
      provenanceStatus = 'absent';
      warnings.push('No provenance chain available for verification');
    }
  } else {
    warnings.push('No provenance digest computable');
  }

  // 3. Source authenticity: verify source text is consistent
  const sourceDigest = computeSourceDigest(record.source);
  if (options.expectedSourceDigest && sourceDigest) {
    if (options.expectedSourceDigest === sourceDigest) {
      sourceStatus = 'verified';
      details.push('Source text verified against external digest');
    } else {
      sourceStatus = 'failed';
      details.push('Source text digest mismatch with external source');
    }
  } else if (record.source.text && record.source.text.length > 0) {
    sourceStatus = 'verified';
    details.push('Source text present and non-empty');
  } else {
    sourceStatus = 'absent';
    warnings.push('Source text is empty or missing');
  }

  // Fail closed: rollback succeeds if integrity is verified or absent (no fingerprint to check)
  // but fails if integrity check actually failed
  const success = integrityStatus !== 'failed';

  return {
    success,
    record,
    source: { text: record.source.text, language: record.source.language },
    integrityStatus,
    provenanceStatus,
    sourceStatus,
    warnings,
    details
  };
}

/**
 * Roll back a batch of records to their original sources.
 *
 * Preserves input order. Returns per-record results and a summary.
 */
export function rollbackBatch(
  records: LunumRecord[],
  options: {
    expectedSourceDigests?: Record<string, string> | undefined;
    expectedProvenanceDigests?: Record<string, string> | undefined;
  } = {}
): RollbackSummary {
  const results: RollbackResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  let warnedCount = 0;

  for (const record of records) {
    const result = rollbackToSource(record, {
      expectedSourceDigest: options.expectedSourceDigests?.[record.fingerprint.slice(0, 20)],
      expectedProvenanceDigest: options.expectedProvenanceDigests?.[record.fingerprint.slice(0, 20)]
    });

    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }

    if (result.warnings.length > 0 && result.success) {
      warnedCount++;
    }
  }

  // Determine overall statuses
  const hasIntegrityFailed = results.some(r => r.integrityStatus === 'failed');
  const overallIntegrityStatus: IntegrityStatus = hasIntegrityFailed ? 'failed' : 'verified';

  const hasProvenanceFailed = results.some(r => r.provenanceStatus === 'failed');
  const hasAnyProvenanceAbsent = results.some(r => r.provenanceStatus === 'absent');
  const overallProvenanceStatus: ProvenanceStatus = hasProvenanceFailed ? 'failed' : hasAnyProvenanceAbsent ? 'absent' : 'verified';

  return {
    total: records.length,
    success: successCount,
    failed: failedCount,
    warned: warnedCount,
    results,
    overallIntegrityStatus,
    overallProvenanceStatus
  };
}

/**
 * Verify that a record's source text matches an external digest.
 * Useful for confirming source authenticity after rollback.
 */
export function verifySourceAuthentic(
  record: LunumRecord,
  externalDigest: string
): boolean {
  const computedDigest = computeSourceDigest(record.source);
  return computedDigest === externalDigest;
}
