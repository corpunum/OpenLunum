/**
 * Evidence supersession registry for preserving superseded evidence and
 * correction lineage without rewriting history. R13.7.
 *
 * Builds on the lineage infrastructure in evidence-lineage.ts, adding
 * higher-level supersession records, correction entries, and validation
 * to ensure history is never silently rewritten.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A record indicating that one piece of evidence has been superseded by another.
 */
export interface SupersessionRecord {
  /** Unique identifier for this supersession record. */
  id: string;
  /** ID of the evidence that was superseded. */
  supersededId: string;
  /** ID of the evidence that supersedes the old one. */
  supersededBy: string;
  /** Human-readable reason for the supersession. */
  reason: string;
  /** ISO 8601 timestamp of the supersession. */
  timestamp: string;
  /** Whether the original evidence has been preserved (not deleted). */
  preservedEvidence: boolean;
}

/**
 * A correction entry linking an original claim to its corrected version,
 * with supporting evidence IDs.
 */
export interface CorrectionEntry {
  /** Unique identifier for this correction. */
  id: string;
  /** The original claim text before correction. */
  originalClaim: string;
  /** The corrected claim text. */
  correctedClaim: string;
  /** Reason the correction was made. */
  correctionReason: string;
  /** ISO 8601 timestamp of the correction. */
  timestamp: string;
  /** Evidence IDs supporting this correction. */
  evidenceIds: string[];
}

/**
 * A registry holding all supersession records and correction entries.
 */
export interface SupersessionRegistry {
  /** All supersession records. */
  records: SupersessionRecord[];
  /** All correction entries. */
  corrections: CorrectionEntry[];
}

/**
 * Result of validating that no history rewriting has occurred.
 */
export interface HistoryValidation {
  /** Whether the registry passes all validation checks. */
  valid: boolean;
  /** List of issues found (empty when valid). */
  issues: string[];
}

/**
 * A point-in-time snapshot of an evidence entry's status.
 */
export interface EvidenceSnapshot {
  /** The evidence ID being snapshotted. */
  evidenceId: string;
  /** ISO 8601 timestamp when the snapshot was taken. */
  snapshotAt: string;
  /** The claim text at snapshot time. */
  claim: string;
  /** Current status of this evidence. */
  status: 'current' | 'superseded' | 'corrected';
  /** Full chain of supersession record IDs. */
  supersessionChain: string[];
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a supersession record with an auto-generated ID and ISO timestamp.
 * The preservedEvidence flag defaults to true (evidence must never be deleted).
 */
export function createSupersession(
  supersededId: string,
  supersededBy: string,
  reason: string,
): SupersessionRecord {
  return {
    id: randomUUID(),
    supersededId,
    supersededBy,
    reason,
    timestamp: new Date().toISOString(),
    preservedEvidence: true,
  };
}

/**
 * Create a correction entry with an auto-generated ID and ISO timestamp.
 */
export function createCorrection(
  originalClaim: string,
  correctedClaim: string,
  reason: string,
  evidenceIds: string[],
): CorrectionEntry {
  return {
    id: randomUUID(),
    originalClaim,
    correctedClaim,
    correctionReason: reason,
    timestamp: new Date().toISOString(),
    evidenceIds,
  };
}

// ---------------------------------------------------------------------------
// Chain traversal
// ---------------------------------------------------------------------------

/**
 * Build the full supersession chain starting from the given evidenceId.
 *
 * Finds all records where `supersededId` matches, then follows each
 * `supersededBy` recursively to build the complete chain. Guards against
 * cycles by tracking visited IDs.
 */
export function buildSupersessionChain(
  registry: SupersessionRegistry,
  evidenceId: string,
): SupersessionRecord[] {
  const chain: SupersessionRecord[] = [];
  const visited = new Set<string>();

  const walk = (currentId: string): void => {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const matches = registry.records.filter(
      (r) => r.supersededId === currentId,
    );
    for (const record of matches) {
      chain.push(record);
      walk(record.supersededBy);
    }
  };

  walk(evidenceId);
  return chain;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the registry has not been subjected to history rewriting.
 *
 * Checks:
 * 1. All superseded evidence is preserved (preservedEvidence === true).
 * 2. No circular supersession chains exist.
 * 3. All correction entries reference evidence IDs that appear somewhere
 *    in the registry (either as supersededId, supersededBy, or in corrections).
 */
export function validateNoHistoryRewriting(
  registry: SupersessionRegistry,
): HistoryValidation {
  const issues: string[] = [];

  // Check 1: all records have preservedEvidence === true
  for (const record of registry.records) {
    if (!record.preservedEvidence) {
      issues.push(
        `Supersession record ${record.id}: evidence ${record.supersededId} was not preserved`,
      );
    }
  }

  // Check 2: no circular supersession chains
  const allIds = new Set(registry.records.map((r) => r.supersededId));
  for (const startId of allIds) {
    const visited = new Set<string>();
    let currentId: string | undefined = startId;

    while (currentId !== undefined) {
      if (visited.has(currentId)) {
        issues.push(`Circular supersession chain detected starting from ${startId}`);
        break;
      }
      visited.add(currentId);
      const next = registry.records.find((r) => r.supersededId === currentId);
      currentId = next?.supersededBy;
    }
  }

  // Check 3: all correction evidence IDs reference known evidence
  const knownEvidenceIds = new Set<string>();
  for (const record of registry.records) {
    knownEvidenceIds.add(record.supersededId);
    knownEvidenceIds.add(record.supersededBy);
  }

  for (const correction of registry.corrections) {
    for (const evidenceId of correction.evidenceIds) {
      if (!knownEvidenceIds.has(evidenceId)) {
        issues.push(
          `Correction ${correction.id} references unknown evidence ID ${evidenceId}`,
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * Create a point-in-time snapshot showing the current status and full
 * supersession chain for a given evidence entry.
 */
export function snapshotEvidence(
  registry: SupersessionRegistry,
  evidenceId: string,
  claim: string,
): EvidenceSnapshot {
  const chain = buildSupersessionChain(registry, evidenceId);

  // Determine status
  const isSuperseded = registry.records.some(
    (r) => r.supersededId === evidenceId,
  );
  const isCorrected = registry.corrections.some((c) =>
    c.evidenceIds.includes(evidenceId),
  );

  let status: 'current' | 'superseded' | 'corrected';
  if (isSuperseded) {
    status = 'superseded';
  } else if (isCorrected) {
    status = 'corrected';
  } else {
    status = 'current';
  }

  return {
    evidenceId,
    snapshotAt: new Date().toISOString(),
    claim,
    status,
    supersessionChain: chain.map((r) => r.id),
  };
}
