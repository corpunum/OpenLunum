// agent-state-retention.ts — Product-level retention, privacy, and deletion
// policies for agent state. Integrates with the agent-state-freeze module
// (agent-state.ts) and exposes a unified public API.

import {
  type AgentState,
  type AgentPlanStep,
} from './agent-state.js';

// ---------------------------------------------------------------------------
// Frozen version for retention schemas
// ---------------------------------------------------------------------------

/**
 * The immutable frozen version label for retention-state records.
 */
export const RETENTION_STATE_VERSION = 'agent-retention/1.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle phase of an agent-state record from a retention perspective.
 */
export type RetentionPhase =
  | 'active'           // still in use
  | 'frozen'           // persisted, immutable
  | 'warm'             // eligible for warm-delete after TTL
  | 'cold'             // eligible for cold-delete after TTL
  | 'deleted';         // purged

/**
 * Privacy classification for the data held in a record.
 */
export type PrivacyClass = 'public' | 'internal' | 'confidential' | 'restricted';

/**
 * Deletion trigger that caused (or will cause) the transition to `deleted`.
 */
export type DeletionTrigger =
  | 'ttl-expires'       // retention TTL expired
  | 'manual-purge'      // operator-initiated
  | 'privacy-request'   // GDPR / data-subject request
  | 'plan-completion';  // plan finished and all TTLs cleared

/**
 * Retention policy that governs how long a record lives before deletion.
 */
export interface RetentionPolicy {
  /**
   * Identifier for this policy (e.g. `default`, `gdpr`, `audit`).
   */
  policyId: string;
  /**
   * Max seconds a record may stay in `active` phase.
   */
  activeTTL: number;
  /**
   * Max seconds a record may stay in `frozen` phase before moving to `warm`.
   */
  frozenTTL: number;
  /**
   * Max seconds a record may stay in `warm` phase before moving to `cold`.
   */
  warmTTL: number;
  /**
   * Max seconds a record may stay in `cold` phase before moving to `deleted`.
   */
  coldTTL: number;
  /**
   * Privacy class for data held under this policy.
   */
  privacyClass: PrivacyClass;
  /**
   * Whether the record is exempt from privacy-request deletion
   * (e.g. regulatory hold).
   */
  exemptFromPrivacyRequest: boolean;
  /**
   * Human-readable description of the policy.
   */
  description: string;
}

/**
 * A single record's retention metadata attached alongside its frozen state.
 */
export interface RetentionMetadata {
  /**
   * The retention schema version.
   */
  retentionVersion: string;
  /**
   * The policy governing this record.
   */
  policy: RetentionPolicy;
  /**
   * Phase this record is currently in.
   */
  phase: RetentionPhase;
  /**
   * ISO-8601 timestamp when the record entered the current phase.
   */
  phaseEnteredAt: string;
  /**
   * ISO-8601 timestamp when the record was created.
   */
  createdAt: string;
  /**
   * ISO-8601 timestamp when the record was frozen (entered `frozen` phase).
   */
  frozenAt?: string;
  /**
   * ISO-8601 timestamp of the last access (read / replay).
   */
  lastAccessedAt?: string;
  /**
   * If in `deleted` phase, the trigger that caused deletion.
   */
  deletionTrigger?: DeletionTrigger;
  /**
   * If deleted, the ISO-8601 timestamp of deletion.
   */
  deletedAt?: string;
  /**
   * Opaque handle to the persisted frozen record (URI, hash, or id).
   */
  recordHandle: string;
  /**
   * Plan ID this record belongs to.
   */
  planId: string;
  /**
   * Agent ID this record belongs to.
   */
  agentId: string;
  /**
   * Whether the record is currently held by a legal/regulatory hold.
   */
  onHold: boolean;
}

/**
 * Result of applying a retention lifecycle transition to a record.
 */
export interface RetentionTransitionResult {
  /**
   * The updated retention metadata.
   */
  metadata: RetentionMetadata;
  /**
   * Whether a phase transition occurred.
   */
  phaseChanged: boolean;
  /**
   * Previous phase before transition (undefined if no change).
   */
  previousPhase?: RetentionPhase;
  /**
   * Human-readable explanation of the transition.
   */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Default policies
// ---------------------------------------------------------------------------

/**
 * Built-in default retention policy for general-use agent state.
 */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  policyId: 'default',
  activeTTL: 3600,          // 1 hour
  frozenTTL: 2592000,       // 30 days
  warmTTL: 7776000,         // 90 days
  coldTTL: 31536000,        // 365 days
  privacyClass: 'internal',
  exemptFromPrivacyRequest: false,
  description: 'Default retention policy for agent state records.',
};

/**
 * Built-in policy for records under GDPR / privacy-request deletion.
 */
export const GDPR_RETENTION_POLICY: RetentionPolicy = {
  policyId: 'gdpr',
  activeTTL: 3600,          // 1 hour
  frozenTTL: 86400,         // 1 day (faster rotation to allow deletion)
  warmTTL: 172800,          // 2 days
  coldTTL: 2592000,         // 30 days
  privacyClass: 'confidential',
  exemptFromPrivacyRequest: false,
  description: 'Policy for records subject to privacy-request deletion.',
};

/**
 * Built-in policy for audit-grade records (regulatory hold).
 */
export const AUDIT_RETENTION_POLICY: RetentionPolicy = {
  policyId: 'audit',
  activeTTL: 3600,          // 1 hour
  frozenTTL: 31536000,      // 365 days
  warmTTL: 63072000,        // 730 days
  coldTTL: 630720000,       // 20 years
  privacyClass: 'restricted',
  exemptFromPrivacyRequest: true,
  description: 'Audit-grade retention policy for regulatory compliance.',
};

// ---------------------------------------------------------------------------
// Policy registry
// ---------------------------------------------------------------------------

const POLICY_MAP: ReadonlyMap<string, RetentionPolicy> = new Map([
  [DEFAULT_RETENTION_POLICY.policyId, DEFAULT_RETENTION_POLICY],
  [GDPR_RETENTION_POLICY.policyId, GDPR_RETENTION_POLICY],
  [AUDIT_RETENTION_POLICY.policyId, AUDIT_RETENTION_POLICY],
]);

/**
 * Resolve a policy by `policyId`. Returns undefined for unknown IDs.
 */
export function resolveRetentionPolicy(
  policyId: string
): RetentionPolicy | undefined {
  return POLICY_MAP.get(policyId);
}

/**
 * Return all registered policy IDs.
 */
export function listRetentionPolicyIds(): readonly string[] {
  return [...POLICY_MAP.keys()];
}

/**
 * Return all registered policies as a frozen array.
 */
export function getAllRetentionPolicies(): readonly RetentionPolicy[] {
  return [...POLICY_MAP.values()];
}

// ---------------------------------------------------------------------------
// Lifecycle transition logic
// ---------------------------------------------------------------------------

/**
 * Compute the next phase for a record based on elapsed time since the
 * last phase entry and the policy's TTLs.  Does not mutate `metadata`.
 */
export function computeNextPhase(
  metadata: RetentionMetadata,
  now: string = new Date().toISOString()
): RetentionPhase {
  const { policy, phase, phaseEnteredAt } = metadata;

  // Already deleted — no further transitions.
  if (phase === 'deleted') return 'deleted';

  // On hold — no transitions while on regulatory hold.
  if (metadata.onHold) return phase;

  const entered = new Date(phaseEnteredAt).getTime();
  const nowMs = new Date(now).getTime();
  const elapsed = (nowMs - entered) / 1000; // seconds

  switch (phase) {
    case 'active':
      if (elapsed >= policy.activeTTL) return 'frozen';
      break;
    case 'frozen':
      if (elapsed >= policy.frozenTTL) return 'warm';
      break;
    case 'warm':
      if (elapsed >= policy.warmTTL) return 'cold';
      break;
    case 'cold':
      if (elapsed >= policy.coldTTL) return 'deleted';
      break;
    default:
      break;
  }
  return phase;
}

/**
 * Apply the next phase transition to a retention metadata record.
 * Returns a new object (immutable).  Does not mutate the original.
 */
export function applyRetentionTransition(
  metadata: RetentionMetadata,
  now: string = new Date().toISOString()
): RetentionTransitionResult {
  const previousPhase = metadata.phase;
  const nextPhase = computeNextPhase(metadata, now);

  if (previousPhase === nextPhase) {
    return {
      metadata,
      phaseChanged: false,
      explanation: `Record remains in "${previousPhase}" — TTL not yet reached.`,
    };
  }

  const updated: RetentionMetadata = {
    ...metadata,
    phase: nextPhase,
    phaseEnteredAt: now,
  };

  // If entering `deleted`, annotate trigger and timestamp.
  if (nextPhase === 'deleted') {
    updated.deletionTrigger = metadata.deletionTrigger ?? 'ttl-expires';
    updated.deletedAt = now;
  }

  return {
    metadata: updated,
    phaseChanged: true,
    previousPhase,
    explanation: `Transitioned from "${previousPhase}" → "${nextPhase}".`,
  };
}

// ---------------------------------------------------------------------------
// Privacy helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a record is eligible for privacy-request deletion.
 */
export function isEligibleForPrivacyDeletion(
  metadata: RetentionMetadata
): boolean {
  const policy = metadata.policy;
  if (policy.exemptFromPrivacyRequest) return false;
  if (metadata.onHold) return false;
  if (metadata.phase === 'active') return true;
  // Frozen, warm, cold — all eligible except exempt/on-hold.
  if (metadata.phase === 'deleted') return false;
  return true;
}

/**
 * Produce a privacy-classified snapshot of a retention metadata record,
 * redacting sensitive fields when the class warrants it.
 */
export function redactForPrivacyClass(
  metadata: RetentionMetadata,
  targetClass: PrivacyClass = 'internal'
): RetentionMetadata {
  const classOrder: PrivacyClass[] = ['public', 'internal', 'confidential', 'restricted'];
  const targetIdx = classOrder.indexOf(targetClass);
  if (targetIdx < 0) return metadata;

  const isRedacted =
    classOrder.indexOf(metadata.policy.privacyClass) > targetIdx;
  if (!isRedacted) return metadata;

  return {
    ...metadata,
    // Redact the handle and planId when target is stricter than record class.
    recordHandle: `***${metadata.recordHandle.slice(-8)}`,
  };
}

/**
 * Anonymize PII fields from an AgentState snapshot, returning a new object.
 * Strips agentId, replaces identifiable strings with hashed placeholders.
 */
export function anonymizeAgentState(
  state: AgentState,
  salt?: string
): AgentState {
  const hash = (input: string, s?: string): string => {
    let h = 0;
    const text = s ? `${s}:${input}` : input;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return `anon-${Math.abs(h).toString(16).padStart(8, '0')}`;
  };

  return {
    ...state,
    agentId: hash(state.agentId, salt),
    steps: state.steps.map(step => ({
      ...step,
      agentId: hash(step.agentId, salt),
      toolCalls: step.toolCalls.map(tc => ({
        ...tc,
        agentId: hash(tc.agentId, salt),
      })),
      results: step.results.map(r => ({
        ...r,
        // callId is kept but the agent link is anonymized.
      })),
    })),
    evidence: state.evidence.map(e => ({
      ...e,
      agentId: hash(e.agentId, salt),
    })),
    handoffs: state.handoffs.map(h => ({
      ...h,
      fromAgent: hash(h.fromAgent, salt),
      toAgent: hash(h.toAgent, salt),
    })),
  };
}

// ---------------------------------------------------------------------------
// Deletion verification
// ---------------------------------------------------------------------------

/**
 * Result of a deletion verification pass.
 */
export interface DeletionVerificationResult {
  /**
   * Whether the record was actually removed (or marked deleted).
   */
  actuallyDeleted: boolean;
  /**
   * The metadata after the verification attempt.
   */
  metadata: RetentionMetadata;
  /**
   * List of issues found (empty if clean).
   */
  issues: string[];
}

/**
 * Verify that a deletion was correctly applied.
 * Checks that the record's phase is `deleted`, the deletion timestamp
 * is present and non-future, and no residual active references exist.
 */
export function verifyDeletion(
  metadata: RetentionMetadata,
  now: string = new Date().toISOString()
): DeletionVerificationResult {
  const issues: string[] = [];
  let actuallyDeleted = metadata.phase === 'deleted';

  if (metadata.phase !== 'deleted') {
    issues.push(`Record is in phase "${metadata.phase}", not "deleted".`);
    actuallyDeleted = false;
  }

  if (!metadata.deletedAt) {
    issues.push('deletedAt timestamp is missing.');
    actuallyDeleted = false;
  } else {
    const deletedTime = new Date(metadata.deletedAt).getTime();
    const nowTime = new Date(now).getTime();
    if (deletedTime > nowTime) {
      issues.push('deletedAt is in the future.');
      actuallyDeleted = false;
    }
  }

  if (!metadata.deletionTrigger) {
    issues.push('deletionTrigger is missing.');
  }

  if (metadata.onHold) {
    issues.push('Record is on regulatory hold but was deleted.');
  }

  return {
    actuallyDeleted,
    metadata,
    issues,
  };
};

/**
 * Purge a frozen AgentState and its retention metadata, returning a new
 * metadata record in `deleted` phase.
 */
export function purgeAgentState(
  metadata: RetentionMetadata,
  now: string = new Date().toISOString()
): RetentionTransitionResult {
  return applyRetentionTransition({
    ...metadata,
    phase: 'deleted',
    phaseEnteredAt: now,
    deletionTrigger: 'manual-purge',
    deletedAt: now,
  }, now);
}

// ---------------------------------------------------------------------------
// Frozen-version validation for retention records
// ---------------------------------------------------------------------------

/**
 * Validate that a RetentionMetadata record's phaseEnteredAt is within
 * a reasonable window relative to the frozen version timestamp.
 */
export function validateRetentionMetadata(
  metadata: RetentionMetadata,
  maxAgeSeconds: number = 63072000 // ~2 years
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof metadata !== 'object' || metadata === null) {
    errors.push('RetentionMetadata must be an object.');
    return { ok: false, errors };
  }

  if (metadata.retentionVersion !== RETENTION_STATE_VERSION) {
    errors.push(
      `retentionVersion must be "${RETENTION_STATE_VERSION}", got "${metadata.retentionVersion}"`
    );
  }

  if (!metadata.policy) {
    errors.push('policy is required.');
  } else if (!metadata.policy.policyId) {
    errors.push('policy.policyId is required.');
  }

  if (!metadata.phase) {
    errors.push('phase is required.');
  } else if (!['active', 'frozen', 'warm', 'cold', 'deleted'].includes(metadata.phase)) {
    errors.push(`Invalid phase: "${metadata.phase}".`);
  }

  if (!metadata.phaseEnteredAt) {
    errors.push('phaseEnteredAt is required.');
  } else {
    const entered = new Date(metadata.phaseEnteredAt).getTime();
    const now = new Date().getTime();
    if (entered > now) errors.push('phaseEnteredAt is in the future.');
    if (now - entered > maxAgeSeconds * 1000) {
      errors.push('phaseEnteredAt exceeds maximum age.');
    }
  }

  if (!metadata.createdAt) errors.push('createdAt is required.');

  if (!metadata.recordHandle) errors.push('recordHandle is required.');

  if (!metadata.planId) errors.push('planId is required.');

  if (!metadata.agentId) errors.push('agentId is required.');

  return {
    ok: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

/**
 * Apply retention transitions to a list of metadata records.
 * Returns per-record results.
 */
export function applyBatchTransitions(
  metadatas: RetentionMetadata[],
  now: string = new Date().toISOString()
): RetentionTransitionResult[] {
  return metadatas.map(m => applyRetentionTransition(m, now));
}

/**
 * Find all records eligible for deletion (phase is `cold` and TTL has
 * elapsed, or phase is `deleted` but not yet purged).
 */
export function findDeletionCandidates(
  metadatas: RetentionMetadata[],
  now: string = new Date().toISOString()
): RetentionMetadata[] {
  return metadatas.filter(m => {
    const next = computeNextPhase(m, now);
    if (next === 'deleted') return true;
    if (m.phase === 'cold') {
      // Check if cold TTL has elapsed
      const entered = new Date(m.phaseEnteredAt).getTime();
      const nowMs = new Date(now).getTime();
      const elapsed = (nowMs - entered) / 1000;
      return elapsed >= m.policy.coldTTL && !m.onHold;
    }
    return false;
  });
}

/**
 * Produce a summary of the retention status across a set of records.
 */
export function retentionSummary(
  metadatas: RetentionMetadata[]
): {
  total: number;
  byPhase: Record<RetentionPhase, number>;
  byPolicy: Record<string, number>;
  onHoldCount: number;
  deletedCount: number;
} {
  const byPhase: Record<string, number> = {};
  const byPolicy: Record<string, number> = {};
  let onHoldCount = 0;
  let deletedCount = 0;

  for (const m of metadatas) {
    byPhase[m.phase] = (byPhase[m.phase] ?? 0) + 1;
    byPolicy[m.policy.policyId] = (byPolicy[m.policy.policyId] ?? 0) + 1;
    if (m.onHold) onHoldCount++;
    if (m.phase === 'deleted') deletedCount++;
  }

  return {
    total: metadatas.length,
    byPhase,
    byPolicy,
    onHoldCount,
    deletedCount,
  };
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/**
 * Create a new RetentionMetadata record for a freshly frozen agent state.
 */
export function buildRetentionMetadata(
  overrides: Partial<RetentionMetadata>
): RetentionMetadata {
  const now = new Date().toISOString();
  return {
    retentionVersion: RETENTION_STATE_VERSION,
    policy: DEFAULT_RETENTION_POLICY,
    phase: 'active',
    phaseEnteredAt: now,
    createdAt: now,
    recordHandle: '',
    planId: '',
    agentId: '',
    onHold: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// R10.6 — Product-level retention, privacy and deletion policies
// ---------------------------------------------------------------------------

/**
 * Categories of data produced by agents during plan execution.
 */
export type AgentDataCategory =
  | 'plan'
  | 'step-result'
  | 'tool-call'
  | 'evidence'
  | 'handoff'
  | 'constraint';

/**
 * Retention policy for a specific agent data category.
 */
export interface AgentRetentionPolicy {
  category: AgentDataCategory;
  retentionDays: number;
  personalDataPresent: boolean;
  deletionMethod: 'soft-delete' | 'hard-delete' | 'anonymize';
  auditRequired: boolean;
}

/**
 * Default retention policies for all agent data categories.
 */
export const DEFAULT_AGENT_RETENTION_POLICIES: readonly AgentRetentionPolicy[] = [
  { category: 'plan',        retentionDays: 365,  personalDataPresent: false, deletionMethod: 'soft-delete', auditRequired: true  },
  { category: 'step-result', retentionDays: 90,   personalDataPresent: false, deletionMethod: 'hard-delete', auditRequired: true  },
  { category: 'tool-call',   retentionDays: 30,   personalDataPresent: true,  deletionMethod: 'anonymize',   auditRequired: true  },
  { category: 'evidence',    retentionDays: 3650, personalDataPresent: false, deletionMethod: 'soft-delete', auditRequired: true  },
  { category: 'handoff',     retentionDays: 180,  personalDataPresent: true,  deletionMethod: 'anonymize',   auditRequired: true  },
  { category: 'constraint',  retentionDays: 365,  personalDataPresent: false, deletionMethod: 'soft-delete', auditRequired: false },
] as const;

/**
 * Privacy classification result for a piece of agent data.
 */
export interface PrivacyClassification {
  category: AgentDataCategory;
  containsPII: boolean;
  containsSensitive: boolean;
  dataSubjectRights: boolean;
  crossBorderRestrictions: boolean;
}

/**
 * Scan content for PII indicators and return a privacy classification.
 *
 * Checks for email patterns, phone patterns, and honorific-prefixed names.
 */
export function classifyAgentPrivacy(
  category: AgentDataCategory,
  content: string,
): PrivacyClassification {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;
  const namePattern = /\b(?:Mr|Ms|Mrs|Dr|Prof)\b\.?\s+[A-Z][a-z]+/;

  const containsPII =
    emailPattern.test(content) ||
    phonePattern.test(content) ||
    namePattern.test(content);

  return {
    category,
    containsPII,
    containsSensitive: containsPII,
    dataSubjectRights: containsPII,
    crossBorderRestrictions: containsPII,
  };
}

/**
 * A request to delete agent data for a specific category.
 */
export interface DeletionRequest {
  id: string;
  category: AgentDataCategory;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  method: 'soft-delete' | 'hard-delete' | 'anonymize';
}

let deletionRequestCounter = 0;

/**
 * Create a deletion request using the matching retention policy's method.
 */
export function processDeletionRequest(
  category: AgentDataCategory,
  reason: string,
): DeletionRequest {
  const policy = DEFAULT_AGENT_RETENTION_POLICIES.find(p => p.category === category);
  if (!policy) {
    throw new Error(`No retention policy found for category: ${category}`);
  }

  deletionRequestCounter++;
  return {
    id: `del-${deletionRequestCounter}-${Date.now()}`,
    category,
    reason,
    requestedAt: new Date().toISOString(),
    completedAt: null,
    method: policy.deletionMethod,
  };
}

/**
 * A single retention violation found during an audit.
 */
export interface RetentionViolation {
  category: AgentDataCategory;
  issue: string;
  severity: 'warning' | 'error';
}

/**
 * Result of auditing agent data retention compliance.
 */
export interface AgentRetentionAudit {
  timestamp: string;
  policiesChecked: number;
  compliant: number;
  violations: RetentionViolation[];
}

/**
 * Audit agent data ages against retention policies.
 *
 * Each item in `dataAges` is checked against the matching policy's
 * `retentionDays`. Items exceeding their retention period are flagged
 * as violations.
 */
export function auditAgentRetention(
  dataAges: Array<{ category: AgentDataCategory; ageDays: number }>,
  policies: AgentRetentionPolicy[] = [...DEFAULT_AGENT_RETENTION_POLICIES],
): AgentRetentionAudit {
  const violations: RetentionViolation[] = [];
  let compliant = 0;

  for (const item of dataAges) {
    const policy = policies.find(p => p.category === item.category);
    if (!policy) {
      violations.push({
        category: item.category,
        issue: `No retention policy found for category "${item.category}"`,
        severity: 'error',
      });
      continue;
    }

    if (item.ageDays > policy.retentionDays) {
      violations.push({
        category: item.category,
        issue: `Data age (${item.ageDays} days) exceeds retention limit (${policy.retentionDays} days)`,
        severity: 'error',
      });
    } else {
      compliant++;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    policiesChecked: dataAges.length,
    compliant,
    violations,
  };
}
