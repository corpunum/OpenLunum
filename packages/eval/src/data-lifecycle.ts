/**
 * Privacy, retention, deletion and audit requirements.
 *
 * Implements R15.7 data-lifecycle controls: sensitivity classification,
 * retention policy enforcement, deletion manifests and audit trails.
 */

import { createHash } from 'node:crypto';

// ── Data Sensitivity ──────────────────────────────────────────────

export type DataSensitivity = 'public' | 'internal' | 'sensitive' | 'restricted';

// ── Retention Policy ──────────────────────────────────────────────

export interface RetentionPolicy {
  readonly category: string;
  readonly sensitivity: DataSensitivity;
  readonly retentionDays: number;
  readonly deletionMethod: 'delete' | 'secure-delete' | 'archive';
  readonly auditRequired: boolean;
}

export const DEFAULT_RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    category: 'eval-results',
    sensitivity: 'public',
    retentionDays: 36500,
    deletionMethod: 'archive',
    auditRequired: true,
  },
  {
    category: 'model-outputs',
    sensitivity: 'internal',
    retentionDays: 90,
    deletionMethod: 'delete',
    auditRequired: true,
  },
  {
    category: 'user-inputs',
    sensitivity: 'sensitive',
    retentionDays: 30,
    deletionMethod: 'secure-delete',
    auditRequired: true,
  },
  {
    category: 'debug-logs',
    sensitivity: 'internal',
    retentionDays: 7,
    deletionMethod: 'delete',
    auditRequired: false,
  },
];

// ── Classification ────────────────────────────────────────────────

export function classifyDataSensitivity(filePath: string): DataSensitivity {
  const lower = filePath.toLowerCase();

  // Restricted patterns (check first — most restrictive wins)
  if (/secret|credential|key|\.env/.test(lower)) {
    return 'restricted';
  }

  // Sensitive patterns
  if (/user|input|pilot/.test(lower)) {
    return 'sensitive';
  }

  // Public paths
  if (/eval-results\/|datasets\/|docs\//.test(lower)) {
    return 'public';
  }

  // Internal paths
  if (/reports\/|dist\//.test(lower)) {
    return 'internal';
  }

  // Default to internal for unclassified files
  return 'internal';
}

// ── Retention Compliance ──────────────────────────────────────────

export interface ExpiredFile {
  readonly path: string;
  readonly policy: string;
  readonly ageDays: number;
  readonly retentionDays: number;
}

export interface RetentionComplianceResult {
  readonly compliant: boolean;
  readonly expired: readonly ExpiredFile[];
  readonly checked: number;
}

const MS_PER_DAY = 86_400_000;

export function auditRetentionCompliance(
  files: ReadonlyArray<{ path: string; modifiedMs: number }>,
  policies: readonly RetentionPolicy[],
  nowMs?: number,
): RetentionComplianceResult {
  const now = nowMs ?? Date.now();
  const expired: ExpiredFile[] = [];

  for (const file of files) {
    for (const policy of policies) {
      if (file.path.includes(policy.category)) {
        const ageDays = Math.floor((now - file.modifiedMs) / MS_PER_DAY);
        if (ageDays > policy.retentionDays) {
          expired.push({
            path: file.path,
            policy: policy.category,
            ageDays,
            retentionDays: policy.retentionDays,
          });
        }
        break; // first matching policy wins
      }
    }
  }

  return {
    compliant: expired.length === 0,
    expired,
    checked: files.length,
  };
}

// ── Deletion Manifest ─────────────────────────────────────────────

export interface DeletionEntry {
  readonly path: string;
  readonly sha256: string;
  readonly sensitivity: DataSensitivity;
  readonly retentionPolicy: string;
}

export interface DeletionManifest {
  readonly timestamp: string;
  readonly reason: string;
  readonly files: readonly DeletionEntry[];
  readonly approvedBy: string;
}

export function generateDeletionManifest(
  expiredFiles: readonly ExpiredFile[],
  reason: string,
  approvedBy: string,
): DeletionManifest {
  const files: DeletionEntry[] = expiredFiles.map((ef) => ({
    path: ef.path,
    sha256: createHash('sha256').update(ef.path).digest('hex'),
    sensitivity: classifyDataSensitivity(ef.path),
    retentionPolicy: ef.policy,
  }));

  return {
    timestamp: new Date().toISOString(),
    reason,
    files,
    approvedBy,
  };
}

// ── Audit Trail ───────────────────────────────────────────────────

export interface AuditEntry {
  readonly timestamp: string;
  readonly action: 'access' | 'delete' | 'archive' | 'classify';
  readonly path: string;
  readonly actor: string;
  readonly reason: string;
}

export interface AuditTrail {
  readonly entries: readonly AuditEntry[];
}
