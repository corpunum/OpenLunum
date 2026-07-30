/**
 * Agent-State Tamper Evidence System (R10.3)
 *
 * Provides cryptographic identity and tamper detection for agent state.
 * Maintains SHA-256 hash chain of state transitions, authorization context,
 * and append-only audit log for integrity verification and auditing.
 */

import { createHash } from 'node:crypto';
import type {
  AgentState,
  AgentToolCall,
  AgentHandoff,
} from './agent-state.js';

/**
 * A record of an authorized action by an agent.
 * Includes tool call authorization and state transition authorization.
 */
export interface AuthorizationContext {
  /** Unique authorization ID */
  id: string;
  /** The agent that performed the action */
  agentId: string;
  /** The role of the agent when action was performed */
  agentRole: string;
  /** Type of authorization: 'tool-call' | 'state-transition' | 'handoff' */
  type: 'tool-call' | 'state-transition' | 'handoff';
  /** Timestamp of authorization */
  timestamp: string;
  /** Resource being authorized (tool name, plan ID, etc.) */
  resource: string;
  /** Permissions granted */
  permissions: string[];
  /** Whether authorization was successful */
  granted: boolean;
  /** Reason if authorization was denied */
  denialReason?: string;
}

/**
 * A single entry in the append-only audit log.
 * Records all state changes and authorizations for complete traceability.
 */
export interface AuditLogEntry {
  /** Unique ID for this audit log entry */
  id: string;
  /** Sequential index in the log */
  index: number;
  /** Timestamp when this entry was created */
  timestamp: string;
  /** The agent responsible for this action */
  agentId: string;
  /** Type of action: 'state-transition' | 'tool-call' | 'authorization' | 'verification' | 'handoff' */
  actionType: 'state-transition' | 'tool-call' | 'authorization' | 'verification' | 'handoff';
  /** Description of the action */
  description: string;
  /** Previous state hash (for state transitions) */
  previousHash?: string;
  /** Current state hash (for state transitions) */
  currentHash?: string;
  /** Authorization context if applicable */
  authorization?: AuthorizationContext;
  /** Hash of this entry for chain integrity */
  entryHash: string;
  /** Hash of the previous entry (chain link) */
  previousEntryHash?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * A record of a state transition.
 * Includes the hash chain for cryptographic verification.
 */
export interface StateTransitionRecord {
  /** Unique ID for this transition */
  id: string;
  /** Previous state's SHA-256 hash */
  previousStateHash: string;
  /** Current state's SHA-256 hash */
  currentStateHash: string;
  /** Agent that performed the transition */
  agentId: string;
  /** Role of agent at time of transition */
  agentRole: string;
  /** Timestamp of transition */
  timestamp: string;
  /** Description of what changed */
  changeDescription: string;
  /** Authorization context for this transition */
  authorization: AuthorizationContext;
  /** Hash chain validation result */
  chainValid: boolean;
  /** Related tool calls (if any) */
  toolCallIds: string[];
  /** Related handoffs (if any) */
  handoffIds: string[];
}

/**
 * The result of an integrity verification.
 * Used to detect tampering and validate state consistency.
 */
export interface IntegrityVerification {
  /** Whether the state passes all integrity checks */
  isValid: boolean;
  /** Chain of hashes is intact */
  chainIntact: boolean;
  /** All referenced tool calls exist and match */
  toolCallsValid: boolean;
  /** All handoffs are properly recorded */
  handoffsValid: boolean;
  /** Audit log is complete and unbroken */
  auditLogValid: boolean;
  /** Authorization checks passed */
  authorizationValid: boolean;
  /** Errors found during verification */
  errors: string[];
  /** Warnings about potential issues */
  warnings: string[];
  /** Timestamp of verification */
  verifiedAt: string;
  /** Agent ID that performed verification */
  verifiedBy: string;
}

/**
 * Handoff verification record.
 * Validates that handoffs are properly authorized and recorded.
 */
export interface HandoffVerification {
  /** Whether the handoff is valid */
  isValid: boolean;
  /** Handoff timestamp */
  timestamp: string;
  /** Source agent */
  fromAgent: string;
  /** Target agent */
  toAgent: string;
  /** Payload hash */
  payloadHash: string;
  /** Authorization context */
  authorization?: AuthorizationContext;
  /** Verification errors */
  errors: string[];
}

/**
 * Complete tamper evidence state containing all audit and verification data.
 */
export interface TamperEvidenceState {
  /** State version for this evidence system */
  evidenceVersion: string;
  /** The agent state being tracked */
  agentState: AgentState;
  /** Complete hash chain history */
  stateTransitionHistory: StateTransitionRecord[];
  /** Append-only audit log */
  auditLog: AuditLogEntry[];
  /** Authorization records */
  authorizations: AuthorizationContext[];
  /** Current integrity verification */
  currentVerification: IntegrityVerification;
  /** Last verified state hash */
  lastVerifiedHash: string;
  /** Timestamp when evidence system was initialized */
  initializedAt: string;
}

/**
 * Compute SHA-256 hash of agent state.
 * Used for hash chain validation.
 */
export function hashAgentState(state: AgentState): string {
  const canonicalized = JSON.stringify(state, Object.keys(state).sort());
  return createHash('sha256').update(canonicalized).digest('hex');
}

/**
 * Compute hash of an audit log entry.
 */
export function hashAuditLogEntry(entry: Omit<AuditLogEntry, 'entryHash'>): string {
  const data = JSON.stringify(entry, Object.keys(entry).sort());
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute hash of authorization context.
 */
export function hashAuthorizationContext(auth: AuthorizationContext): string {
  const data = JSON.stringify(auth, Object.keys(auth).sort());
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Check if a tool call is authorized.
 * Validates that the agent has permission to call the tool.
 */
export function authorizeToolCall(
  toolCall: AgentToolCall,
  agentRole: string,
  allowedTools: Set<string>
): AuthorizationContext {
  const id = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const granted = allowedTools.has(toolCall.name);

  const result: AuthorizationContext = {
    id,
    agentId: toolCall.agentId,
    agentRole,
    type: 'tool-call',
    timestamp: toolCall.timestamp,
    resource: toolCall.name,
    permissions: granted ? ['execute'] : [],
    granted,
  };

  if (!granted) {
    result.denialReason = `tool '${toolCall.name}' not in allowed list`;
  }

  return result;
}

/**
 * Check if a state transition is authorized.
 */
export function authorizeStateTransition(
  previousState: AgentState,
  currentState: AgentState,
  agentId: string,
  agentRole: string
): AuthorizationContext {
  const id = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Basic authorization checks
  const granted =
    agentId === currentState.agentId && // Agent can only modify own state
    currentState.stateVersion === previousState.stateVersion; // Version must match

  const result: AuthorizationContext = {
    id,
    agentId,
    agentRole,
    type: 'state-transition',
    timestamp: new Date().toISOString(),
    resource: currentState.planId,
    permissions: granted ? ['modify'] : [],
    granted,
  };

  if (!granted) {
    result.denialReason = 'agent not authorized to modify this state';
  }

  return result;
}

/**
 * Check if a handoff is authorized.
 */
export function authorizeHandoff(
  handoff: AgentHandoff,
  fromAgentRole: string,
  toAgentRole: string,
  allowedHandoffs: Map<string, Set<string>>
): AuthorizationContext {
  const id = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Check if handoff from this role to target role is allowed
  const allowedTargets = allowedHandoffs.get(fromAgentRole);
  const granted = allowedTargets ? allowedTargets.has(toAgentRole) : false;

  const result: AuthorizationContext = {
    id,
    agentId: handoff.fromAgent,
    agentRole: fromAgentRole,
    type: 'handoff',
    timestamp: handoff.timestamp,
    resource: `${handoff.fromAgent}->${handoff.toAgent}`,
    permissions: granted ? ['transfer'] : [],
    granted,
  };

  if (!granted) {
    result.denialReason = `handoff from ${fromAgentRole} to ${toAgentRole} not allowed`;
  }

  return result;
}

/**
 * Record a state transition in the hash chain.
 */
export function recordStateTransition(
  id: string,
  previousStateHash: string,
  previousState: AgentState,
  currentState: AgentState,
  authorization: AuthorizationContext
): StateTransitionRecord {
  const currentStateHash = hashAgentState(currentState);

  return {
    id,
    previousStateHash,
    currentStateHash,
    agentId: currentState.agentId,
    agentRole: currentState.role,
    timestamp: new Date().toISOString(),
    changeDescription: `State transition for plan ${currentState.planId}`,
    authorization,
    chainValid: true, // Will be validated later
    toolCallIds: currentState.steps.flatMap(s => s.toolCalls.map(tc => tc.id)),
    handoffIds: currentState.handoffs.map(h => `${h.fromAgent}-${h.toAgent}`),
  };
}

/**
 * Add an entry to the append-only audit log.
 */
export function appendAuditLogEntry(
  log: AuditLogEntry[],
  actionType: AuditLogEntry['actionType'],
  description: string,
  agentId: string,
  metadata: Record<string, unknown>,
  previousStateHash?: string,
  currentStateHash?: string,
  authorization?: AuthorizationContext
): AuditLogEntry {
  const index = log.length;
  const previousEntryHash = log.length > 0 ? log[log.length - 1]!.entryHash : undefined;

  const entry: Omit<AuditLogEntry, 'entryHash'> = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    index,
    timestamp: new Date().toISOString(),
    agentId,
    actionType,
    description,
    metadata,
  };

  // Only add optional fields if they have values
  if (previousStateHash) {
    entry.previousHash = previousStateHash;
  }
  if (currentStateHash) {
    entry.currentHash = currentStateHash;
  }
  if (authorization) {
    entry.authorization = authorization;
  }
  if (previousEntryHash) {
    entry.previousEntryHash = previousEntryHash;
  }

  const entryHash = hashAuditLogEntry(entry);
  return { ...entry, entryHash };
}

/**
 * Verify the integrity of a tamper evidence state.
 * Checks hash chain, audit log, and authorizations.
 */
export function verifyIntegrity(
  evidence: TamperEvidenceState,
  verifiedBy: string
): IntegrityVerification {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check state version
  if (!evidence.evidenceVersion) {
    errors.push('evidence version is missing');
  }

  // Verify hash chain
  let chainIntact = true;
  let previousHash = hashAgentState(evidence.agentState);

  for (let i = 0; i < evidence.stateTransitionHistory.length; i++) {
    const record = evidence.stateTransitionHistory[i]!;

    if (record.previousStateHash !== previousHash) {
      errors.push(`hash chain broken at transition ${i}: previous hash mismatch`);
      chainIntact = false;
      break;
    }
    previousHash = record.currentStateHash;
  }

  // Verify audit log is intact
  let auditLogValid = true;
  let previousEntryHash: string | undefined;

  for (let i = 0; i < evidence.auditLog.length; i++) {
    const entry = evidence.auditLog[i]!;

    // Check index
    if (entry.index !== i) {
      errors.push(`audit log entry ${i} has wrong index: ${entry.index}`);
      auditLogValid = false;
    }

    // Check chain link
    if (previousEntryHash && entry.previousEntryHash !== previousEntryHash) {
      errors.push(`audit log entry ${i} has broken chain link`);
      auditLogValid = false;
    }

    previousEntryHash = entry.entryHash;
  }

  // Verify tool calls
  let toolCallsValid = true;
  const toolCallIds = new Set(evidence.agentState.steps.flatMap(s => s.toolCalls.map(tc => tc.id)));

  for (const record of evidence.stateTransitionHistory) {
    for (const tcId of record.toolCallIds) {
      if (!toolCallIds.has(tcId)) {
        warnings.push(`tool call ${tcId} referenced in transition but not found in state`);
      }
    }
  }

  // Verify handoffs
  let handoffsValid = true;
  const handoffs = evidence.agentState.handoffs;

  for (const handoff of handoffs) {
    if (!handoff.fromAgent || !handoff.toAgent) {
      errors.push('handoff missing fromAgent or toAgent');
      handoffsValid = false;
    }
  }

  // Verify authorizations
  let authorizationValid = true;

  for (const auth of evidence.authorizations) {
    if (!auth.id || !auth.agentId) {
      errors.push('authorization missing required fields');
      authorizationValid = false;
    }
  }

  const isValid =
    chainIntact &&
    auditLogValid &&
    toolCallsValid &&
    handoffsValid &&
    authorizationValid &&
    errors.length === 0;

  return {
    isValid,
    chainIntact,
    toolCallsValid,
    handoffsValid,
    auditLogValid,
    authorizationValid,
    errors,
    warnings,
    verifiedAt: new Date().toISOString(),
    verifiedBy,
  };
}

/**
 * Verify a single handoff.
 */
export function verifyHandoff(
  handoff: AgentHandoff,
  authorization?: AuthorizationContext
): HandoffVerification {
  const errors: string[] = [];

  if (!handoff.fromAgent) {
    errors.push('handoff missing fromAgent');
  }

  if (!handoff.toAgent) {
    errors.push('handoff missing toAgent');
  }

  if (!handoff.timestamp) {
    errors.push('handoff missing timestamp');
  }

  if (!handoff.payload || typeof handoff.payload !== 'object') {
    errors.push('handoff missing or invalid payload');
  }

  const payloadHash = handoff.payload ? hashAgentState(handoff as unknown as AgentState) : '';

  const isValid =
    errors.length === 0 &&
    (!authorization || authorization.granted);

  const result: HandoffVerification = {
    isValid,
    timestamp: handoff.timestamp,
    fromAgent: handoff.fromAgent,
    toAgent: handoff.toAgent,
    payloadHash,
    errors,
  };

  if (authorization) {
    result.authorization = authorization;
  }

  return result;
}

/**
 * Detect tampering by comparing current state hash with recorded hash.
 */
export function detectTampering(
  state: AgentState,
  expectedHash: string
): { tampered: boolean; currentHash: string; mismatch: boolean } {
  const currentHash = hashAgentState(state);
  const mismatch = currentHash !== expectedHash;

  return {
    tampered: mismatch,
    currentHash,
    mismatch,
  };
}

/**
 * Initialize a tamper evidence state for tracking an agent state.
 */
export function initializeTamperEvidence(
  agentState: AgentState,
  initializedBy: string
): TamperEvidenceState {
  const stateHash = hashAgentState(agentState);

  // Create initial audit log entry
  const initialAuditEntry = appendAuditLogEntry(
    [],
    'state-transition',
    `Initial state for plan ${agentState.planId}`,
    initializedBy,
    { stateHash }
  );

  return {
    evidenceVersion: '1.0',
    agentState,
    stateTransitionHistory: [],
    auditLog: [initialAuditEntry],
    authorizations: [],
    currentVerification: {
      isValid: true,
      chainIntact: true,
      toolCallsValid: true,
      handoffsValid: true,
      auditLogValid: true,
      authorizationValid: true,
      errors: [],
      warnings: [],
      verifiedAt: new Date().toISOString(),
      verifiedBy: initializedBy,
    },
    lastVerifiedHash: stateHash,
    initializedAt: new Date().toISOString(),
  };
}
