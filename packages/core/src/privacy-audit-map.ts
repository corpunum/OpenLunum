/**
 * Privacy, retention, deletion and audit requirement mapping.
 *
 * Implements R15.7: data sensitivity classification, retention policies,
 * deletion manifests with audit trail for production deployments.
 *
 * Key concerns:
 * - What is PII vs. semantic content vs. metadata
 * - Retention periods per data type
 * - Audit trail: what must be logged, retention, tamper protection
 */

import { createHash } from 'node:crypto';

// ── Data Classification ───────────────────────────────────────────

/**
 * Broad data category: what kind of data this record represents.
 */
export type DataCategory =
  | 'pii'                // Personally identifiable information
  | 'semantic-content'   // Lunum-Sem records, parsed/realized content
  | 'metadata'           // Operational metadata (timestamps, IDs, provenance)
  | 'evidence'           // Evaluation results, benchmarks, test data
  | 'audit-log'          // Structured audit trail entries
  | 'correlation-trace'  // Correlation IDs, trace contexts, spans
  | 'model-output'       // Raw model completions and intermediate outputs
  | 'user-input'         // Natural-language input from users
  | 'configuration'      // System configuration and feature flags
  | 'credential';        // Secrets, tokens, keys

/**
 * Sensitivity levels for data classification.
 * Higher levels imply stricter retention and deletion requirements.
 */
export type DataSensitivity = 'public' | 'internal' | 'sensitive' | 'restricted';

/**
 * Maps each data category to its default sensitivity level.
 */
export const DATA_SENSITIVITY_MAP: Readonly<Record<DataCategory, DataSensitivity>> = Object.freeze({
  'pii': 'sensitive',
  'semantic-content': 'internal',
  'metadata': 'internal',
  'evidence': 'public',
  'audit-log': 'sensitive',
  'correlation-trace': 'internal',
  'model-output': 'internal',
  'user-input': 'sensitive',
  'configuration': 'internal',
  'credential': 'restricted',
} as const);

/**
 * PII field patterns that trigger elevated sensitivity.
 */
export const PII_PATTERNS: Readonly<RegExp[]> = Object.freeze([
  /email/i,
  /phone|tel|mobile/i,
  /address|location/i,
  /name\s*(first|last|full)?/i,
  /ssn|social[_\s]*security/i,
  /credit\s*card|card\s*number|cc/i,
  /date\s*of\s*birth|dob/i,
  /gender|sex/i,
  /nationality|citizenship/i,
  /ip[_\s]*address|ipaddr/i,
  /geolocation|gps|lat.*lon/i,
  /biometric|fingerprint|face\s*id/i,
] as const);

/**
 * Classify a data category into its sensitivity level.
 */
export function classifyDataCategory(category: DataCategory): DataSensitivity {
  return DATA_SENSITIVITY_MAP[category] ?? 'internal';
}

/**
 * Check whether a field name or description likely contains PII.
 */
export function isLikelyPii(field: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(field));
}

// ── Retention Requirements ────────────────────────────────────────

/**
 * Privacy retention policy for a given data category.
 * Renamed from RetentionPolicy to avoid collision with agent-state-retention.ts.
 */
export interface PrivacyRetentionPolicy {
  /** Data category this policy applies to */
  readonly category: DataCategory;
  /** How long to retain before deletion or archival (days) */
  readonly retentionDays: number;
  /** Deletion method: plain delete, secure wipe, or archival */
  readonly deletionMethod: 'delete' | 'secure-delete' | 'archive';
  /** Whether an audit entry is required when this data is deleted */
  readonly auditRequired: boolean;
  /** Human-readable reason for the retention period */
  readonly reason: string;
}

/**
 * Default retention policies for all data categories produced by the system.
 */
export const DEFAULT_RETENTION_POLICIES: Readonly<PrivacyRetentionPolicy[]> = Object.freeze([
  {
    category: 'pii',
    retentionDays: 90,
    deletionMethod: 'secure-delete',
    auditRequired: true,
    reason: 'PII must be removed promptly per privacy regulations (GDPR/CCPA)',
  },
  {
    category: 'semantic-content',
    retentionDays: 365,
    deletionMethod: 'delete',
    auditRequired: true,
    reason: 'Semantic records retained for one year for audit and verification',
  },
  {
    category: 'metadata',
    retentionDays: 365,
    deletionMethod: 'delete',
    auditRequired: false,
    reason: 'Operational metadata retained for a year for debugging and compliance',
  },
  {
    category: 'evidence',
    retentionDays: 3650,
    deletionMethod: 'archive',
    auditRequired: true,
    reason: 'Evidence retained for 10 years for long-term verification and review',
  },
  {
    category: 'audit-log',
    retentionDays: 3650,
    deletionMethod: 'archive',
    auditRequired: true,
    reason: 'Audit logs retained for 10 years for compliance and forensic review',
  },
  {
    category: 'correlation-trace',
    retentionDays: 30,
    deletionMethod: 'delete',
    auditRequired: false,
    reason: 'Correlation traces are operational, needed for at-most 30 days',
  },
  {
    category: 'model-output',
    retentionDays: 90,
    deletionMethod: 'delete',
    auditRequired: false,
    reason: 'Model outputs retained for 90 days for debugging and quality review',
  },
  {
    category: 'user-input',
    retentionDays: 90,
    deletionMethod: 'secure-delete',
    auditRequired: true,
    reason: 'User input may contain PII; deleted after 90 days with secure wipe',
  },
  {
    category: 'configuration',
    retentionDays: 3650,
    deletionMethod: 'archive',
    auditRequired: false,
    reason: 'Configuration retained for 10 years for reproducibility',
  },
  {
    category: 'credential',
    retentionDays: 1,
    deletionMethod: 'secure-delete',
    auditRequired: true,
    reason: 'Credentials short-lived; deleted after rotation',
  },
] as const);

/**
 * Look up the retention policy for a given data category.
 * Returns `undefined` if no policy is defined for the category.
 */
export function getRetentionPolicy(category: DataCategory): PrivacyRetentionPolicy | undefined {
  return DEFAULT_RETENTION_POLICIES.find((p) => p.category === category) as PrivacyRetentionPolicy | undefined;
}

/**
 * Check whether all known data categories have a defined retention policy.
 */
export function retentionPoliciesAreComplete(): boolean {
  const definedCategories = new Set(DEFAULT_RETENTION_POLICIES.map((p) => p.category));
  return ALL_DATA_CATEGORIES.every((cat) => definedCategories.has(cat));
}

// ── Audit Trail Requirements ──────────────────────────────────────

/**
 * Audit event types that must be logged.
 */
export type AuditEventType =
  | 'access'            // Data was read
  | 'create'            // Data was created
  | 'update'            // Data was modified
  | 'delete'            // Data was deleted
  | 'export'            // Data was exported
  | 'classify'          // Data classification changed
  | 'retention-expiry'  // Retention period expired
  | 'deletion'          // Data was deleted (permanent)
  | 'tamper-detect'     // Tamper evidence detected
  | 'policy-change';    // Retention or classification policy changed

/**
 * Required fields that every audit event must include.
 */
export interface AuditEvent {
  /** Monotonic timestamp in ISO 8601 format */
  readonly timestamp: string;
  /** Event type */
  readonly eventType: AuditEventType;
  /** Data category affected */
  readonly dataCategory: DataCategory;
  /** Unique identifier for the affected record */
  readonly recordId: string;
  /** Actor: system component, user, or agent that performed the action */
  readonly actor: string;
  /** Human-readable reason for the action */
  readonly reason: string;
  /** Previous sensitivity (if classification changed) */
  readonly previousSensitivity?: DataSensitivity;
  /** New sensitivity (if classification changed) */
  readonly newSensitivity?: DataSensitivity;
  /** Deletion method used (if applicable) */
  readonly deletionMethod?: 'delete' | 'secure-delete' | 'archive';
  /** SHA-256 hash of the record content before the action (for tamper detection) */
  readonly contentHash?: string;
  /** Correlation ID threading the event through the request lifecycle */
  readonly correlationId?: string;
  /** Trace context for distributed tracing */
  readonly traceId?: string;
}

/**
 * Tamper-evidence parameters for audit entries.
 */
export interface AuditTamperConfig {
  /** Whether to include content hash for tamper detection */
  readonly hashContent: boolean;
  /** Whether to include previous-entry hash for chain integrity */
  readonly chainIntegrity: boolean;
  /** Retention period for the audit chain itself (days) */
  readonly chainRetentionDays: number;
}

/**
 * Default tamper-evidence configuration for audit trails.
 */
export const DEFAULT_AUDIT_TAMPER_CONFIG: Readonly<AuditTamperConfig> = Object.freeze({
  hashContent: true,
  chainIntegrity: true,
  chainRetentionDays: 3650,
} as const);

/**
 * All audit event types that must be covered by the audit system.
 */
export const ALL_AUDIT_EVENT_TYPES: readonly AuditEventType[] = Object.freeze([
  'access',
  'create',
  'update',
  'delete',
  'export',
  'classify',
  'retention-expiry',
  'deletion',
  'tamper-detect',
  'policy-change',
] as const);

// ── Data Type Coverage ────────────────────────────────────────────

/**
 * All data categories produced by the Lunum system.
 */
export const ALL_DATA_CATEGORIES: readonly DataCategory[] = Object.freeze([
  'pii',
  'semantic-content',
  'metadata',
  'evidence',
  'audit-log',
  'correlation-trace',
  'model-output',
  'user-input',
  'configuration',
  'credential',
] as const);

/**
 * Verify that the audit map covers all data categories produced by the system.
 * Returns true if every category in ALL_DATA_CATEGORIES has a retention policy.
 */
export function verifyDataCategoryCoverage(): boolean {
  const covered = new Set(
    DEFAULT_RETENTION_POLICIES.map((p) => p.category),
  );
  return ALL_DATA_CATEGORIES.every((cat) => covered.has(cat));
}

/**
 * Verify that all audit event types are covered by at least one retention policy
 * that requires auditing.
 */
export function verifyAuditTrailCompleteness(): boolean {
  const auditCategories = new Set(
    DEFAULT_RETENTION_POLICIES
      .filter((p) => p.auditRequired)
      .map((p) => p.category),
  );
  // At minimum, we need audit logging for pii, semantic-content, evidence, audit-log,
  // user-input, and credential — the categories that matter most for privacy/compliance.
  const criticalCategories: DataCategory[] = [
    'pii',
    'semantic-content',
    'evidence',
    'audit-log',
    'user-input',
    'credential',
  ];
  return criticalCategories.every((cat) => auditCategories.has(cat));
}

/**
 * Full audit map: combines classification, retention, and audit requirements
 * into a single view for a given data category.
 */
export interface AuditMapEntry {
  /** Data category */
  readonly category: DataCategory;
  /** Sensitivity level */
  readonly sensitivity: DataSensitivity;
  /** Retention policy */
  readonly retention: PrivacyRetentionPolicy;
  /** Whether audit events are required for this category */
  readonly auditRequired: boolean;
  /** All audit event types applicable */
  readonly applicableAuditEvents: AuditEventType[];
}

/**
 * Build the complete audit map for all data categories.
 */
export function buildAuditMap(): ReadonlyArray<AuditMapEntry> {
  return ALL_DATA_CATEGORIES.map((category) => {
    const policy = getRetentionPolicy(category)!;
    const sensitivity = classifyDataCategory(category);
    const applicableAuditEvents: AuditEventType[] = policy.auditRequired
      ? ['access', 'create', 'update', 'delete', 'export', 'deletion']
      : ['create', 'delete'];

    return {
      category,
      sensitivity,
      retention: policy,
      auditRequired: policy.auditRequired,
      applicableAuditEvents,
    };
  });
}

/**
 * Verify that the audit map includes every data category with non-empty policies.
 */
export function verifyAuditMapCompleteness(): boolean {
  const map = buildAuditMap();
  if (map.length !== ALL_DATA_CATEGORIES.length) return false;
  return map.every(
    (entry) =>
      entry.sensitivity !== undefined &&
      entry.retention.retentionDays > 0 &&
      entry.applicableAuditEvents.length > 0,
  );
}
