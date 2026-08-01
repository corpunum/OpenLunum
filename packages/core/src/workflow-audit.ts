/**
 * Workflow Audit — long-running workflow validation and audit reconstruction.
 *
 * Provides checkpoint creation, audit-trail building, completeness validation,
 * state reconstruction, and deterministic replay for workflow pipelines.
 */

import { createHash } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type WorkflowStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'abandoned';

export interface WorkflowCheckpoint {
  id: string;
  workflowId: string;
  stepIndex: number;
  status: WorkflowStatus;
  timestamp: string;
  stateHash: string;
  metadata: Record<string, string>;
}

export interface WorkflowAuditTrail {
  workflowId: string;
  checkpoints: WorkflowCheckpoint[];
  startedAt: string;
  completedAt: string | null;
  totalSteps: number;
  completedSteps: number;
}

export interface AuditValidation {
  complete: boolean;
  gaps: number[];
  issues: string[];
}

export interface ReconstructedState {
  found: boolean;
  checkpoint: WorkflowCheckpoint | null;
  stepIndex: number;
  stateHash: string | null;
}

export interface WorkflowReplayResult {
  workflowId: string;
  replayedSteps: number;
  hashesMatch: boolean;
  divergenceAtStep: number | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

let _counter = 0;

function generateId(): string {
  _counter += 1;
  return `chk-${Date.now()}-${_counter}`;
}

const TERMINAL_STATUSES: ReadonlySet<WorkflowStatus> = new Set([
  'completed',
  'failed',
  'abandoned',
]);

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Create a checkpoint for a workflow step.
 * Hashes the provided state string with SHA-256 and stamps an ISO timestamp.
 */
export function createCheckpoint(
  workflowId: string,
  stepIndex: number,
  status: WorkflowStatus,
  state: string,
): WorkflowCheckpoint {
  return {
    id: generateId(),
    workflowId,
    stepIndex,
    status,
    timestamp: new Date().toISOString(),
    stateHash: sha256(state),
    metadata: {},
  };
}

/**
 * Build an audit trail from an array of checkpoints.
 * Uses checkpoints belonging to the first workflowId found in the array.
 */
export function buildAuditTrail(
  checkpoints: WorkflowCheckpoint[],
): WorkflowAuditTrail {
  if (checkpoints.length === 0) {
    return {
      workflowId: '',
      checkpoints: [],
      startedAt: '',
      completedAt: null,
      totalSteps: 0,
      completedSteps: 0,
    };
  }

  const workflowId = checkpoints[0]!.workflowId;
  const filtered = checkpoints.filter((c) => c.workflowId === workflowId);

  // Sort by stepIndex for consistent ordering
  const sorted = [...filtered].sort((a, b) => a.stepIndex - b.stepIndex);

  const startedAt = sorted[0]!.timestamp;
  const last = sorted[sorted.length - 1]!;
  const completedAt = TERMINAL_STATUSES.has(last.status)
    ? last.timestamp
    : null;

  const completedSteps = sorted.filter(
    (c) => c.status === 'completed',
  ).length;

  // totalSteps = highest stepIndex + 1
  const totalSteps = last.stepIndex + 1;

  return {
    workflowId,
    checkpoints: sorted,
    startedAt,
    completedAt,
    totalSteps,
    completedSteps,
  };
}

/**
 * Validate that an audit trail is complete and internally consistent.
 */
export function validateAuditCompleteness(
  trail: WorkflowAuditTrail,
): AuditValidation {
  const issues: string[] = [];
  const gaps: number[] = [];

  if (trail.checkpoints.length === 0) {
    issues.push('No checkpoints in trail');
    return { complete: false, gaps, issues };
  }

  // First checkpoint must be 'running'
  const first = trail.checkpoints[0]!;
  if (first.status !== 'running') {
    issues.push(
      `First checkpoint status is '${first.status}', expected 'running'`,
    );
  }

  // Last checkpoint must be terminal
  const last = trail.checkpoints[trail.checkpoints.length - 1]!;
  if (!TERMINAL_STATUSES.has(last.status)) {
    issues.push(
      `Last checkpoint status is '${last.status}', expected terminal status`,
    );
  }

  // Detect step-index gaps
  const indices = new Set(trail.checkpoints.map((c) => c.stepIndex));
  const maxIndex = last.stepIndex;
  for (let i = 0; i <= maxIndex; i++) {
    if (!indices.has(i)) {
      gaps.push(i);
    }
  }
  if (gaps.length > 0) {
    issues.push(`Missing step indices: ${gaps.join(', ')}`);
  }

  // All checkpoints must have state hashes
  for (const cp of trail.checkpoints) {
    if (!cp.stateHash) {
      issues.push(`Checkpoint ${cp.id} is missing a state hash`);
    }
  }

  return {
    complete: issues.length === 0,
    gaps,
    issues,
  };
}

/**
 * Reconstruct the workflow state at (or just before) the given step index.
 */
export function reconstructWorkflowState(
  trail: WorkflowAuditTrail,
  atStep: number,
): ReconstructedState {
  if (trail.checkpoints.length === 0) {
    return { found: false, checkpoint: null, stepIndex: atStep, stateHash: null };
  }

  // Find checkpoint at or before the requested step
  let best: WorkflowCheckpoint | null = null;
  for (const cp of trail.checkpoints) {
    if (cp.stepIndex <= atStep) {
      if (best === null || cp.stepIndex > best.stepIndex) {
        best = cp;
      }
    }
  }

  if (best === null) {
    return { found: false, checkpoint: null, stepIndex: atStep, stateHash: null };
  }

  return {
    found: true,
    checkpoint: best,
    stepIndex: best.stepIndex,
    stateHash: best.stateHash,
  };
}

/**
 * Replay a workflow's checkpoints against expected hashes.
 * Compares each checkpoint hash (in step order) against the corresponding
 * entry in `expectedHashes`. Reports the first divergence, if any.
 */
export function replayWorkflow(
  trail: WorkflowAuditTrail,
  expectedHashes: string[],
): WorkflowReplayResult {
  const sorted = [...trail.checkpoints].sort(
    (a, b) => a.stepIndex - b.stepIndex,
  );

  let replayedSteps = 0;
  let divergenceAtStep: number | null = null;

  for (let i = 0; i < sorted.length && i < expectedHashes.length; i++) {
    replayedSteps++;
    if (sorted[i]!.stateHash !== expectedHashes[i]) {
      divergenceAtStep = sorted[i]!.stepIndex;
      break;
    }
  }

  return {
    workflowId: trail.workflowId,
    replayedSteps,
    hashesMatch: divergenceAtStep === null,
    divergenceAtStep,
  };
}
