/**
 * Agent-State Protocol types.
 *
 * Encodes plans, steps, tool calls, results, constraints, evidence,
 * and inter-agent handoffs in a format that can be validated, versioned,
 * inspected, and rendered.
 */

export type AgentRole = 'orchestrator' | 'worker' | 'reviewer' | 'auditor';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'abandoned';

export type ToolCallKind = 'function' | 'http' | 'rpc' | 'local' | 'unknown';

export type ConstraintKind = 'budget' | 'deadline' | 'precedence' | 'auth' | 'custom';

export type HandoffDirection = 'outbound' | 'inbound';

/** A single tool call made by an agent. */
export interface AgentToolCall {
  kind: ToolCallKind;
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  timestamp: string;
  agentId: string;
}

/** Result of a tool call. */
export interface AgentToolResult {
  callId: string;
  success: boolean;
  value: unknown;
  error?: string;
  timestamp: string;
}

/** A step in an agent plan. */
export interface AgentPlanStep {
  id: string;
  description: string;
  status: StepStatus;
  toolCalls: AgentToolCall[];
  results: AgentToolResult[];
  constraints: AgentConstraint[];
  startedAt?: string;
  completedAt?: string;
  agentId: string;
}

/** A constraint on an agent or step. */
export interface AgentConstraint {
  kind: ConstraintKind;
  description: string;
  value: unknown;
}

/** Evidence attached to a plan or step. */
export interface AgentEvidence {
  type: string;
  source: string;
  content: unknown;
  timestamp: string;
  agentId: string;
}

/** An inter-agent handoff record. */
export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  direction: HandoffDirection;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** A complete agent state snapshot. */
export interface AgentState {
  stateVersion: string;
  planId: string;
  planName: string;
  agentId: string;
  role: AgentRole;
  steps: AgentPlanStep[];
  constraints: AgentConstraint[];
  evidence: AgentEvidence[];
  handoffs: AgentHandoff[];
  updatedAt: string;
}

export const AGENT_STATE_SCHEMA = 'agent-state/0.1' as const;

export const AGENT_STATE_SUPPORTED_VERSIONS = ['agent-state/0.1'] as const;

export type AgentStateVersion = typeof AGENT_STATE_SUPPORTED_VERSIONS[number];

export interface AgentStateMigrationResult {
  state: AgentState;
  migrated: boolean;
  fromVersion: string;
  toVersion: AgentStateVersion;
}

export function migrateAgentState(state: AgentState): AgentStateMigrationResult {
  const from = state.stateVersion;
  if ((AGENT_STATE_SUPPORTED_VERSIONS as readonly string[]).includes(from)) {
    return { state, migrated: false, fromVersion: from, toVersion: from as AgentStateVersion };
  }
  throw new Error(`unsupported agent-state version: ${from}; supported: ${AGENT_STATE_SUPPORTED_VERSIONS.join(', ')}`);
}

export function isAgentStateVersionSupported(version: string): version is AgentStateVersion {
  return (AGENT_STATE_SUPPORTED_VERSIONS as readonly string[]).includes(version);
}

export type ReplayStatus = 'replayed' | 'skipped' | 'error';

export interface ReplayResult {
  stepId: string;
  status: ReplayStatus;
  originalStatus: StepStatus;
  error?: string;
}

export function replaySteps(state: AgentState): ReplayResult[] {
  const results: ReplayResult[] = [];
  for (const step of state.steps) {
    if (step.status === 'completed') {
      results.push({ stepId: step.id, status: 'replayed', originalStatus: step.status });
    } else if (step.status === 'failed' || step.status === 'abandoned') {
      results.push({ stepId: step.id, status: 'skipped', originalStatus: step.status });
    } else if (step.status === 'running') {
      results.push({ stepId: step.id, status: 'skipped', originalStatus: step.status });
    } else {
      results.push({ stepId: step.id, status: 'skipped', originalStatus: step.status });
    }
  }
  return results;
}

export interface RecoveryResult {
  recovered: boolean;
  interruptedSteps: string[];
  resumableSteps: string[];
  abandonedSteps: string[];
}

export function recoverFromInterruption(state: AgentState): { result: RecoveryResult; recoveredState: AgentState } {
  const interrupted: string[] = [];
  const resumable: string[] = [];
  const abandoned: string[] = [];
  const recoveredSteps: AgentPlanStep[] = [];

  for (const step of state.steps) {
    if (step.status === 'running') {
      interrupted.push(step.id);
      if (step.results.length > 0 && step.results[step.results.length - 1]!.success) {
        resumable.push(step.id);
        recoveredSteps.push({ ...step, status: 'pending' });
      } else {
        abandoned.push(step.id);
        recoveredSteps.push({ ...step, status: 'abandoned' });
      }
    } else {
      recoveredSteps.push(step);
    }
  }

  const recoveredState: AgentState = {
    ...state,
    steps: recoveredSteps,
    updatedAt: new Date().toISOString(),
  };

  return {
    result: {
      recovered: interrupted.length > 0,
      interruptedSteps: interrupted,
      resumableSteps: resumable,
      abandonedSteps: abandoned,
    },
    recoveredState,
  };
}

/** Validate an agent state snapshot. */
export function validateAgentState(state: AgentState): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!state.stateVersion) errors.push('missing stateVersion');
  if (!state.planId) errors.push('missing planId');
  if (!state.agentId) errors.push('missing agentId');
  if (!state.role) errors.push('missing role');
  if (!state.updatedAt) errors.push('missing updatedAt');

  const validRoles = new Set<AgentRole>(['orchestrator', 'worker', 'reviewer', 'auditor']);
  if (!validRoles.has(state.role)) errors.push(`invalid role: ${state.role}`);

  const validStatuses = new Set<StepStatus>(['pending', 'running', 'completed', 'failed', 'abandoned']);
  for (const step of state.steps) {
    if (!step.id) errors.push('step missing id');
    if (!step.description) errors.push(`step ${step.id} missing description`);
    if (!step.agentId) errors.push(`step ${step.id} missing agentId`);
    if (!step.status) errors.push(`step ${step.id} missing status`);
    if (!validStatuses.has(step.status)) errors.push(`step ${step.id} has invalid status: ${step.status}`);
    for (const tc of step.toolCalls) {
      if (!tc.id) errors.push(`toolCall on step ${step.id} missing id`);
      if (!tc.name) errors.push(`toolCall on step ${step.id} missing name`);
    }
    for (const r of step.results) {
      if (!r.callId) errors.push(`result on step ${step.id} missing callId`);
    }
  }

  return { ok: errors.length === 0, errors };
}
