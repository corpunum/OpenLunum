/**
 * Agent-State Idempotency and Dedup (R10.4)
 *
 * Defines idempotency and duplicate-delivery behaviour for agent state
 * operations. State transitions are delivered under an at-least-once
 * guarantee (a caller, retry proxy, or queue may redeliver the same
 * logical operation more than once). This module makes redelivery safe:
 *
 * - Every state-transition attempt carries an idempotency key, either
 *   supplied by the caller or derived deterministically from the stable
 *   content of the request (`deriveIdempotencyKey` /
 *   `deriveStateTransitionKey`).
 * - A dedup store (`IdempotencyStore`) remembers, per key, whether the
 *   operation has already completed, is currently in flight, or failed.
 * - `submitIdempotent` is the generic at-least-once-safe submission
 *   primitive: a first submission under a key executes the operation
 *   exactly once; every subsequent submission under the same key is a
 *   *replay* that returns the original result without re-executing any
 *   side effect.
 * - Concurrent duplicate submissions (two callers racing on the same key
 *   before the first has completed) are coalesced: the second caller
 *   awaits the first caller's in-flight promise rather than starting a
 *   second execution.
 * - `applyIdempotentStepTransition` specializes this to agent-state step
 *   transitions.
 */

import { createHash } from 'node:crypto';
import type { AgentState, AgentPlanStep, AgentToolResult, StepStatus } from './agent-state.js';

/** Status of a dedup record tracked for a given idempotency key. */
export type DedupRecordStatus = 'in-flight' | 'completed' | 'failed';

/** Outcome classification returned to every caller of `submitIdempotent`. */
export type DedupOutcome =
  /** First successful execution for this key. */
  | 'applied'
  /** A prior execution for this key already completed; result replayed from cache. */
  | 'duplicate-replayed'
  /** A concurrent execution for this key is currently in flight; result awaited and shared. */
  | 'duplicate-in-flight';

/** Per-key bookkeeping record held in an `IdempotencyStore`. */
export interface DedupRecord<T> {
  key: string;
  status: DedupRecordStatus;
  result?: T;
  error?: string;
  firstSeenAt: string;
  completedAt?: string;
  /** Number of submission attempts observed for this key (including the original). */
  attempts: number;
}

/**
 * A dedup store for idempotent operations of result type `T`.
 *
 * `records` holds the durable outcome per key (what a replay returns).
 * `inFlight` holds live promises for keys whose first execution has not
 * yet settled, so concurrent duplicates can be coalesced onto it.
 */
export interface IdempotencyStore<T> {
  records: Map<string, DedupRecord<T>>;
  inFlight: Map<string, Promise<T>>;
}

/** Create a fresh, empty idempotency store. */
export function createIdempotencyStore<T>(): IdempotencyStore<T> {
  return { records: new Map(), inFlight: new Map() };
}

/** Result of a single `submitIdempotent` call. */
export interface SubmitResult<T> {
  key: string;
  outcome: DedupOutcome;
  result: T;
  attempts: number;
}

/**
 * Submit an operation under an idempotency key with at-least-once-safe
 * dedup semantics.
 *
 * - If a completed record exists for `key`, the operation is NOT
 *   re-invoked; the cached result is replayed (`duplicate-replayed`).
 * - If an in-flight execution exists for `key`, the caller awaits that
 *   execution's shared promise rather than starting a new one
 *   (`duplicate-in-flight`). This is what makes concurrent duplicate
 *   submissions safe: only one execution of `operation` ever runs for a
 *   given key at a given time.
 * - If a prior attempt for `key` failed, a new attempt is allowed to run
 *   (failed attempts do not poison the key forever), incrementing the
 *   attempt counter.
 * - Otherwise this is the first attempt: it registers itself as in
 *   flight synchronously (before any `await`), so that any concurrent
 *   caller invoked in the same microtask turn (e.g. via `Promise.all`)
 *   is guaranteed to observe the in-flight registration rather than
 *   racing a second execution.
 */
export async function submitIdempotent<T>(
  store: IdempotencyStore<T>,
  key: string,
  operation: () => Promise<T> | T,
): Promise<SubmitResult<T>> {
  const completed = store.records.get(key);
  if (completed && completed.status === 'completed') {
    return {
      key,
      outcome: 'duplicate-replayed',
      result: completed.result as T,
      attempts: completed.attempts,
    };
  }

  const inFlight = store.inFlight.get(key);
  if (inFlight) {
    const result = await inFlight;
    const rec = store.records.get(key);
    return {
      key,
      outcome: 'duplicate-in-flight',
      result,
      attempts: rec ? rec.attempts : 1,
    };
  }

  const prior = store.records.get(key);
  const record: DedupRecord<T> = prior
    ? { ...prior, status: 'in-flight', attempts: prior.attempts + 1 }
    : { key, status: 'in-flight', firstSeenAt: new Date().toISOString(), attempts: 1 };
  store.records.set(key, record);

  let resolveFn!: (value: T) => void;
  let rejectFn!: (reason: unknown) => void;
  const pending = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  // Registered synchronously, before any await below, so a concurrent
  // duplicate submitted in the same synchronous turn always finds it.
  store.inFlight.set(key, pending);

  void (async () => {
    try {
      const result = await operation();
      store.records.set(key, {
        ...record,
        status: 'completed',
        result,
        completedAt: new Date().toISOString(),
      });
      resolveFn(result);
    } catch (err) {
      store.records.set(key, {
        ...record,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      rejectFn(err);
    } finally {
      store.inFlight.delete(key);
    }
  })();

  const result = await pending;
  return { key, outcome: 'applied', result, attempts: record.attempts };
}

/** Look up the current dedup record for a key without submitting anything. */
export function getIdempotencyRecord<T>(store: IdempotencyStore<T>, key: string): DedupRecord<T> | undefined {
  return store.records.get(key);
}

/** Remove records older than `ttlMs` (relative to `now`) that are not in flight. Returns the number pruned. */
export function pruneIdempotencyStore<T>(store: IdempotencyStore<T>, now: number, ttlMs: number): number {
  let pruned = 0;
  for (const [key, record] of store.records.entries()) {
    if (store.inFlight.has(key)) continue;
    const anchor = record.completedAt ?? record.firstSeenAt;
    const age = now - new Date(anchor).getTime();
    if (age > ttlMs) {
      store.records.delete(key);
      pruned += 1;
    }
  }
  return pruned;
}

/**
 * Derive a deterministic idempotency key from the stable (non-volatile)
 * fields of an operation's content. Two logically identical requests
 * (e.g. the same state transition redelivered by an at-least-once
 * transport) always hash to the same key, so dedup works even when the
 * caller does not supply an explicit key/nonce.
 */
export function deriveIdempotencyKey(parts: Record<string, unknown>): string {
  const sortedKeys = Object.keys(parts).sort();
  const stable = JSON.stringify(parts, sortedKeys);
  return createHash('sha256').update(stable).digest('hex');
}

/** Stable identifying fields of a step-transition request, used to derive a content-based idempotency key. */
export interface StateTransitionKeyParts {
  planId: string;
  agentId: string;
  stepId: string;
  targetStatus: StepStatus;
  /** Distinguishes otherwise-identical transitions, e.g. the tool-call id whose result triggered it. */
  causeId?: string;
}

/** Derive a content-based idempotency key for a step transition. */
export function deriveStateTransitionKey(parts: StateTransitionKeyParts): string {
  return deriveIdempotencyKey({
    planId: parts.planId,
    agentId: parts.agentId,
    stepId: parts.stepId,
    targetStatus: parts.targetStatus,
    causeId: parts.causeId ?? null,
  });
}

/** A request to transition a single step of an agent plan, submitted under an idempotency key. */
export interface StateTransitionRequest {
  /**
   * Idempotency key for this request. If omitted, one is derived
   * deterministically from `planId`/`agentId`/`stepId`/`targetStatus`/
   * `causeId` via `deriveStateTransitionKey`.
   */
  idempotencyKey?: string;
  planId: string;
  agentId: string;
  stepId: string;
  targetStatus: StepStatus;
  /** Optional tool result to append to the step's result list. */
  result?: AgentToolResult;
  causeId?: string;
  timestamp?: string;
}

/** Outcome of applying a `StateTransitionRequest` through the idempotency store. */
export interface StateTransitionOutcome {
  state: AgentState;
  key: string;
  outcome: DedupOutcome;
  attempts: number;
  /** True only when this call actually executed the transition (outcome === 'applied'). */
  applied: boolean;
}

function resolveTransitionKey(request: StateTransitionRequest): string {
  if (request.idempotencyKey) return request.idempotencyKey;
  const parts: StateTransitionKeyParts = {
    planId: request.planId,
    agentId: request.agentId,
    stepId: request.stepId,
    targetStatus: request.targetStatus,
  };
  if (request.causeId !== undefined) parts.causeId = request.causeId;
  return deriveStateTransitionKey(parts);
}

function computeTransition(state: AgentState, request: StateTransitionRequest): AgentState {
  const timestamp = request.timestamp ?? new Date().toISOString();
  let found = false;
  const steps: AgentPlanStep[] = state.steps.map((step) => {
    if (step.id !== request.stepId) return step;
    found = true;
    const results = request.result ? [...step.results, request.result] : step.results;
    const next: AgentPlanStep = {
      ...step,
      status: request.targetStatus,
      results,
    };
    if (request.targetStatus === 'running' && !next.startedAt) {
      next.startedAt = timestamp;
    }
    if (request.targetStatus === 'completed' || request.targetStatus === 'failed' || request.targetStatus === 'abandoned') {
      next.completedAt = timestamp;
    }
    return next;
  });

  if (!found) {
    throw new Error(`state transition references unknown step: ${request.stepId}`);
  }

  return { ...state, steps, updatedAt: timestamp };
}

/**
 * Apply a state transition request to `state` in an idempotent,
 * at-least-once-safe manner.
 *
 * The FIRST submission under the request's idempotency key (explicit or
 * derived) computes and returns the transitioned state. Every
 * subsequent submission under the same key — whether a true duplicate
 * redelivery or a concurrent race — is a safe replay: it returns the
 * exact state object produced by the first application, without
 * re-deriving or re-mutating anything, so retried deliveries can never
 * double-apply a transition (e.g. append a result twice, or double
 * fire a downstream side effect keyed off "applied").
 */
export async function applyIdempotentStepTransition(
  store: IdempotencyStore<AgentState>,
  state: AgentState,
  request: StateTransitionRequest,
): Promise<StateTransitionOutcome> {
  const key = resolveTransitionKey(request);
  const submitted = await submitIdempotent(store, key, () => computeTransition(state, request));
  return {
    state: submitted.result,
    key,
    outcome: submitted.outcome,
    attempts: submitted.attempts,
    applied: submitted.outcome === 'applied',
  };
}
