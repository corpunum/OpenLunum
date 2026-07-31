/**
 * Incident response, rollback and compromised-evidence exercises.
 *
 * Implements R15.6 for Phase 5 security readiness: evidence tampering
 * detection, quarantine workflows, incident runbooks and dry-run
 * simulation of incident response procedures.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────

export type IncidentType =
  | 'evidence-tampering'
  | 'model-poisoning'
  | 'schema-corruption'
  | 'unauthorized-access';

export interface TamperDetectionResult {
  readonly tampered: boolean;
  readonly tamperedFiles: string[];
  readonly intactFiles: string[];
  readonly checkedCount: number;
}

export interface QuarantineEntry {
  readonly originalPath: string;
  readonly quarantinePath: string;
  readonly reason: string;
  readonly timestamp: string;
  readonly hash: string;
}

export interface QuarantineResult {
  readonly quarantined: QuarantineEntry[];
  readonly errors: string[];
  readonly manifest: string;
}

export interface RunbookStep {
  readonly order: number;
  readonly action: string;
  readonly verification: string;
  readonly automated: boolean;
}

export interface IncidentRunbook {
  readonly id: string;
  readonly incidentType: IncidentType;
  readonly steps: RunbookStep[];
  readonly escalation: string;
}

export interface SimulationResult {
  readonly type: IncidentType;
  readonly runbookId: string;
  readonly stepsValidated: number;
  readonly complete: boolean;
  readonly gaps: string[];
}

// ── Evidence Tampering Detection ───────────────────────────────────

/**
 * Compare expected vs actual file hashes and report which files have
 * been tampered with.
 */
export function detectEvidenceTampering(
  files: Array<{ path: string; expectedHash: string; actualHash: string }>,
): TamperDetectionResult {
  const tamperedFiles: string[] = [];
  const intactFiles: string[] = [];

  for (const file of files) {
    if (file.expectedHash === file.actualHash) {
      intactFiles.push(file.path);
    } else {
      tamperedFiles.push(file.path);
    }
  }

  return {
    tampered: tamperedFiles.length > 0,
    tamperedFiles,
    intactFiles,
    checkedCount: files.length,
  };
}

// ── Evidence Quarantine ────────────────────────────────────────────

/**
 * Move files to a quarantine directory with an audit trail.
 * Creates a `quarantine-manifest.json` in the quarantine dir.
 */
export async function quarantineEvidence(
  paths: string[],
  quarantineDir: string,
  reason: string,
): Promise<QuarantineResult> {
  await mkdir(quarantineDir, { recursive: true });

  const quarantined: QuarantineEntry[] = [];
  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  for (const filePath of paths) {
    try {
      const content = await readFile(filePath);
      const hash = createHash('sha256').update(content).digest('hex');
      const basename = path.basename(filePath);
      const quarantinePath = path.join(quarantineDir, basename);

      await copyFile(filePath, quarantinePath);

      quarantined.push({
        originalPath: filePath,
        quarantinePath,
        reason,
        timestamp,
        hash,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to quarantine ${filePath}: ${message}`);
    }
  }

  const manifestPath = path.join(quarantineDir, 'quarantine-manifest.json');
  const manifestData = {
    created: timestamp,
    reason,
    entries: quarantined,
    errorCount: errors.length,
  };
  await writeFile(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');

  return {
    quarantined,
    errors,
    manifest: manifestPath,
  };
}

// ── Incident Runbooks ──────────────────────────────────────────────

export const INCIDENT_RUNBOOKS: readonly IncidentRunbook[] = [
  {
    id: 'RB-TAMPER-001',
    incidentType: 'evidence-tampering',
    steps: [
      {
        order: 1,
        action: 'Identify affected evidence files via hash comparison',
        verification: 'All evidence files have been scanned and mismatches logged',
        automated: true,
      },
      {
        order: 2,
        action: 'Quarantine tampered files to isolated directory',
        verification: 'Quarantine manifest written and verified',
        automated: true,
      },
      {
        order: 3,
        action: 'Restore evidence from last known-good backup',
        verification: 'Restored file hashes match original baseline',
        automated: false,
      },
    ],
    escalation: 'Notify security team and freeze all eval pipelines',
  },
  {
    id: 'RB-POISON-001',
    incidentType: 'model-poisoning',
    steps: [
      {
        order: 1,
        action: 'Halt all model inference using suspected weights',
        verification: 'No active inference requests using affected model',
        automated: true,
      },
      {
        order: 2,
        action: 'Compare model weight hashes against trusted registry',
        verification: 'Hash comparison report generated for all weight files',
        automated: true,
      },
      {
        order: 3,
        action: 'Rollback to last verified model checkpoint',
        verification: 'Rolled-back model produces expected baseline scores',
        automated: false,
      },
    ],
    escalation: 'Notify ML security lead and initiate root-cause analysis',
  },
  {
    id: 'RB-SCHEMA-001',
    incidentType: 'schema-corruption',
    steps: [
      {
        order: 1,
        action: 'Validate all schemas against frozen baseline definitions',
        verification: 'Schema diff report generated showing all deviations',
        automated: true,
      },
      {
        order: 2,
        action: 'Isolate corrupted schema versions in version control',
        verification: 'Corrupted schemas tagged and removed from active use',
        automated: true,
      },
      {
        order: 3,
        action: 'Restore schemas from versioned backup and re-validate',
        verification: 'All restored schemas pass conformance checks',
        automated: false,
      },
    ],
    escalation: 'Notify data engineering and pause downstream consumers',
  },
  {
    id: 'RB-ACCESS-001',
    incidentType: 'unauthorized-access',
    steps: [
      {
        order: 1,
        action: 'Revoke all active sessions for compromised credentials',
        verification: 'Session revocation confirmed via audit log',
        automated: true,
      },
      {
        order: 2,
        action: 'Audit access logs for scope of unauthorized activity',
        verification: 'Access log review completed with timeline of events',
        automated: true,
      },
      {
        order: 3,
        action: 'Rotate affected credentials and update dependent services',
        verification: 'New credentials deployed and old ones invalidated',
        automated: false,
      },
    ],
    escalation: 'Notify CISO and initiate full incident response protocol',
  },
];

// ── Incident Simulation ────────────────────────────────────────────

/**
 * Validate that a runbook adequately covers a given incident type.
 * This is a dry-run validation, not an actual incident execution.
 */
export function simulateIncident(
  type: IncidentType,
  runbook: IncidentRunbook,
): SimulationResult {
  const gaps: string[] = [];

  // Check incident type match
  if (runbook.incidentType !== type) {
    gaps.push(
      `Runbook type '${runbook.incidentType}' does not match incident type '${type}'`,
    );
  }

  // Check steps exist
  if (runbook.steps.length === 0) {
    gaps.push('Runbook has no steps defined');
  }

  // Validate each step has verification
  let stepsValidated = 0;
  for (const step of runbook.steps) {
    if (!step.verification || step.verification.trim() === '') {
      gaps.push(`Step ${step.order} ('${step.action}') has no verification`);
    } else {
      stepsValidated++;
    }
  }

  // Check escalation
  if (!runbook.escalation || runbook.escalation.trim() === '') {
    gaps.push('Runbook has no escalation procedure defined');
  }

  // Check step ordering
  const orders = runbook.steps.map((s) => s.order);
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      gaps.push('Step ordering is not sequential starting from 1');
      break;
    }
  }

  return {
    type,
    runbookId: runbook.id,
    stepsValidated,
    complete: gaps.length === 0,
    gaps,
  };
}
