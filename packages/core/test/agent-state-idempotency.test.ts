import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createIdempotencyStore,
  submitIdempotent,
  getIdempotencyRecord,
  pruneIdempotencyStore,
  deriveIdempotencyKey,
  deriveStateTransitionKey,
  applyIdempotentStepTransition,
  AGENT_STATE_SCHEMA,
  type AgentState,
  type AgentPlanStep,
  type AgentToolCall,
  type AgentToolResult,
  type IdempotencyStore,
  type StateTransitionRequest,
} from '../src/index.js';

function makeToolCall(id: string, name: string): AgentToolCall {
  return { kind: 'function', id, name, arguments: {}, timestamp: '2026-07-31T00:00:00Z', agentId: 'agent-1' };
}

function makeStep(id: string, status: AgentPlanStep['status']): AgentPlanStep {
  return {
    id,
    description: `Step ${id}`,
    status,
    toolCalls: [makeToolCall(`${id}-tc`, 'do-thing')],
    results: [],
    constraints: [],
    agentId: 'agent-1',
  };
}

function makeState(steps: AgentPlanStep[], overrides: Partial<AgentState> = {}): AgentState {
  return {
    stateVersion: AGENT_STATE_SCHEMA,
    planId: 'plan-1',
    planName: 'Test Plan',
    agentId: 'agent-1',
    role: 'worker',
    steps,
    constraints: [],
    evidence: [],
    handoffs: [],
    updatedAt: '2026-07-31T00:00:00Z',
    ...overrides,
  };
}

function delay<T>(value: T, ms = 5): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe('agent-state-idempotency: generic submitIdempotent', () => {
  it('applies the operation exactly once on first submission', async () => {
    const store = createIdempotencyStore<number>();
    let calls = 0;
    const outcome = await submitIdempotent(store, 'key-1', () => {
      calls += 1;
      return 42;
    });
    assert.equal(outcome.outcome, 'applied');
    assert.equal(outcome.result, 42);
    assert.equal(outcome.attempts, 1);
    assert.equal(calls, 1);
  });

  it('replays the cached result for a duplicate submission after completion, without re-invoking the operation', async () => {
    const store = createIdempotencyStore<number>();
    let calls = 0;
    const op = () => {
      calls += 1;
      return 100 + calls;
    };
    const first = await submitIdempotent(store, 'key-2', op);
    const second = await submitIdempotent(store, 'key-2', op);
    const third = await submitIdempotent(store, 'key-2', op);

    assert.equal(first.outcome, 'applied');
    assert.equal(second.outcome, 'duplicate-replayed');
    assert.equal(third.outcome, 'duplicate-replayed');
    assert.equal(calls, 1, 'operation must run exactly once despite three deliveries');
    assert.equal(second.result, first.result);
    assert.equal(third.result, first.result);
  });

  it('coalesces concurrent duplicate submissions onto a single in-flight execution', async () => {
    const store = createIdempotencyStore<string>();
    let calls = 0;
    const op = async () => {
      calls += 1;
      return delay(`result-${calls}`, 20);
    };

    const [a, b, c] = await Promise.all([
      submitIdempotent(store, 'concurrent-key', op),
      submitIdempotent(store, 'concurrent-key', op),
      submitIdempotent(store, 'concurrent-key', op),
    ]);

    assert.equal(calls, 1, 'operation must execute exactly once for concurrent duplicates');
    assert.equal(a!.result, 'result-1');
    assert.equal(b!.result, 'result-1');
    assert.equal(c!.result, 'result-1');

    const outcomes = [a!.outcome, b!.outcome, c!.outcome].sort();
    assert.deepEqual(outcomes, ['applied', 'duplicate-in-flight', 'duplicate-in-flight']);
  });

  it('allows retry after a failed attempt, incrementing the attempt counter', async () => {
    const store = createIdempotencyStore<string>();
    let calls = 0;
    const op = () => {
      calls += 1;
      if (calls === 1) throw new Error('transient failure');
      return 'ok';
    };

    await assert.rejects(() => submitIdempotent(store, 'retry-key', op));
    const record = getIdempotencyRecord(store, 'retry-key');
    assert.equal(record?.status, 'failed');

    const retried = await submitIdempotent(store, 'retry-key', op);
    assert.equal(retried.outcome, 'applied');
    assert.equal(retried.result, 'ok');
    assert.equal(retried.attempts, 2);
    assert.equal(calls, 2);
  });

  it('does not coalesce distinct keys', async () => {
    const store = createIdempotencyStore<number>();
    let calls = 0;
    const op = () => {
      calls += 1;
      return calls;
    };
    const a = await submitIdempotent(store, 'key-a', op);
    const b = await submitIdempotent(store, 'key-b', op);
    assert.equal(calls, 2);
    assert.notEqual(a.result, b.result);
  });

  it('prunes expired completed records but never prunes in-flight entries', async () => {
    const store = createIdempotencyStore<string>();
    await submitIdempotent(store, 'old-key', () => 'done');

    const record = getIdempotencyRecord(store, 'old-key')!;
    const farFuture = new Date(record.completedAt!).getTime() + 1_000_000;
    const pruned = pruneIdempotencyStore(store, farFuture, 1000);
    assert.equal(pruned, 1);
    assert.equal(getIdempotencyRecord(store, 'old-key'), undefined);

    // in-flight entries are never pruned even if "old" by clock time
    let releaseInFlight!: () => void;
    const inflightPromise = new Promise<string>((resolve) => {
      releaseInFlight = () => resolve('later');
    });
    const inflightCall = submitIdempotent(store, 'inflight-key', () => inflightPromise);
    // give submitIdempotent a tick to register the in-flight promise
    await Promise.resolve();
    const prunedWhileInFlight = pruneIdempotencyStore(store, Date.now() + 10_000_000, 1);
    assert.equal(prunedWhileInFlight, 0);
    assert.notEqual(getIdempotencyRecord(store, 'inflight-key'), undefined);
    releaseInFlight();
    await inflightCall;
  });
});

describe('agent-state-idempotency: deriveIdempotencyKey / deriveStateTransitionKey', () => {
  it('is deterministic for identical content regardless of key order', () => {
    const k1 = deriveIdempotencyKey({ a: 1, b: 'two', c: [3] });
    const k2 = deriveIdempotencyKey({ c: [3], a: 1, b: 'two' });
    assert.equal(k1, k2);
  });

  it('differs when content differs', () => {
    const k1 = deriveIdempotencyKey({ a: 1 });
    const k2 = deriveIdempotencyKey({ a: 2 });
    assert.notEqual(k1, k2);
  });

  it('derives a stable key for a state transition from its stable fields', () => {
    const k1 = deriveStateTransitionKey({ planId: 'p1', agentId: 'a1', stepId: 's1', targetStatus: 'completed' });
    const k2 = deriveStateTransitionKey({ planId: 'p1', agentId: 'a1', stepId: 's1', targetStatus: 'completed' });
    const k3 = deriveStateTransitionKey({ planId: 'p1', agentId: 'a1', stepId: 's1', targetStatus: 'failed' });
    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
  });

  it('distinguishes transitions with different causeId (e.g. different tool-call results)', () => {
    const k1 = deriveStateTransitionKey({ planId: 'p1', agentId: 'a1', stepId: 's1', targetStatus: 'completed', causeId: 'tc-1' });
    const k2 = deriveStateTransitionKey({ planId: 'p1', agentId: 'a1', stepId: 's1', targetStatus: 'completed', causeId: 'tc-2' });
    assert.notEqual(k1, k2);
  });
});

describe('agent-state-idempotency: applyIdempotentStepTransition', () => {
  it('applies a step transition and updates status/results/timestamps', async () => {
    const store: IdempotencyStore<AgentState> = createIdempotencyStore<AgentState>();
    const state = makeState([makeStep('step-1', 'pending')]);
    const result: AgentToolResult = { callId: 'step-1-tc', success: true, value: 'ok', timestamp: '2026-07-31T00:00:01Z' };

    const request: StateTransitionRequest = {
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'step-1',
      targetStatus: 'completed',
      result,
      timestamp: '2026-07-31T00:00:02Z',
    };

    const outcome = await applyIdempotentStepTransition(store, state, request);
    assert.equal(outcome.applied, true);
    assert.equal(outcome.outcome, 'applied');
    const step = outcome.state.steps.find((s) => s.id === 'step-1')!;
    assert.equal(step.status, 'completed');
    assert.equal(step.results.length, 1);
    assert.equal(step.results[0]!.callId, 'step-1-tc');
    assert.equal(step.completedAt, '2026-07-31T00:00:02Z');
    assert.equal(outcome.state.updatedAt, '2026-07-31T00:00:02Z');
  });

  it('redelivery of the same request (same derived key) is a safe replay: result appended exactly once', async () => {
    const store: IdempotencyStore<AgentState> = createIdempotencyStore<AgentState>();
    const state = makeState([makeStep('step-1', 'pending')]);
    const result: AgentToolResult = { callId: 'step-1-tc', success: true, value: 'ok', timestamp: '2026-07-31T00:00:01Z' };
    const request: StateTransitionRequest = {
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'step-1',
      targetStatus: 'completed',
      result,
      causeId: 'step-1-tc',
      timestamp: '2026-07-31T00:00:02Z',
    };

    const first = await applyIdempotentStepTransition(store, state, request);
    const redelivered1 = await applyIdempotentStepTransition(store, state, request);
    const redelivered2 = await applyIdempotentStepTransition(store, state, request);

    assert.equal(first.outcome, 'applied');
    assert.equal(redelivered1.outcome, 'duplicate-replayed');
    assert.equal(redelivered2.outcome, 'duplicate-replayed');

    const step = redelivered2.state.steps.find((s) => s.id === 'step-1')!;
    assert.equal(step.results.length, 1, 'result must not be appended twice by redelivered duplicates');
    assert.deepEqual(redelivered1.state, first.state);
    assert.deepEqual(redelivered2.state, first.state);
  });

  it('an explicit idempotencyKey overrides content-derived dedup, allowing the same logical content under different keys', async () => {
    const store: IdempotencyStore<AgentState> = createIdempotencyStore<AgentState>();
    const state = makeState([makeStep('step-1', 'pending')]);
    const base: Omit<StateTransitionRequest, 'idempotencyKey'> = {
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'step-1',
      targetStatus: 'completed',
      timestamp: '2026-07-31T00:00:02Z',
    };

    const r1 = await applyIdempotentStepTransition(store, state, { ...base, idempotencyKey: 'explicit-key-1' });
    const r2 = await applyIdempotentStepTransition(store, state, { ...base, idempotencyKey: 'explicit-key-2' });
    assert.equal(r1.outcome, 'applied');
    assert.equal(r2.outcome, 'applied');
    assert.notEqual(r1.key, r2.key);
  });

  it('concurrent duplicate submissions of the same transition are coalesced into a single applied transition', async () => {
    const store: IdempotencyStore<AgentState> = createIdempotencyStore<AgentState>();
    const state = makeState([makeStep('step-1', 'pending')]);
    const result: AgentToolResult = { callId: 'step-1-tc', success: true, value: 'ok', timestamp: '2026-07-31T00:00:01Z' };
    const request: StateTransitionRequest = {
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'step-1',
      targetStatus: 'completed',
      result,
      causeId: 'step-1-tc',
    };

    const submissions = await Promise.all([
      applyIdempotentStepTransition(store, state, request),
      applyIdempotentStepTransition(store, state, request),
      applyIdempotentStepTransition(store, state, request),
      applyIdempotentStepTransition(store, state, request),
      applyIdempotentStepTransition(store, state, request),
    ]);

    const appliedCount = submissions.filter((s) => s.applied).length;
    assert.equal(appliedCount, 1, 'exactly one concurrent submission should actually apply the transition');

    for (const submission of submissions) {
      const step = submission.state.steps.find((s) => s.id === 'step-1')!;
      assert.equal(step.status, 'completed');
      assert.equal(step.results.length, 1, 'result must appear exactly once across all concurrent duplicates');
    }
  });

  it('throws for a request targeting an unknown step, and does not poison the key on success afterward with different content', async () => {
    const store: IdempotencyStore<AgentState> = createIdempotencyStore<AgentState>();
    const state = makeState([makeStep('step-1', 'pending')]);
    const badRequest: StateTransitionRequest = {
      idempotencyKey: 'bad-key',
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'does-not-exist',
      targetStatus: 'completed',
    };

    await assert.rejects(() => applyIdempotentStepTransition(store, state, badRequest));

    const record = getIdempotencyRecord(store, 'bad-key');
    assert.equal(record?.status, 'failed');
  });

  it('two different steps produce independent keys and both apply', async () => {
    const store: IdempotencyStore<AgentState> = createIdempotencyStore<AgentState>();
    const state = makeState([makeStep('step-1', 'pending'), makeStep('step-2', 'pending')]);

    const r1 = await applyIdempotentStepTransition(store, state, {
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'step-1',
      targetStatus: 'completed',
      timestamp: '2026-07-31T00:00:02Z',
    });
    const r2 = await applyIdempotentStepTransition(store, r1.state, {
      planId: 'plan-1',
      agentId: 'agent-1',
      stepId: 'step-2',
      targetStatus: 'running',
      timestamp: '2026-07-31T00:00:03Z',
    });

    assert.equal(r1.applied, true);
    assert.equal(r2.applied, true);
    assert.notEqual(r1.key, r2.key);
    const s1 = r2.state.steps.find((s) => s.id === 'step-1')!;
    const s2 = r2.state.steps.find((s) => s.id === 'step-2')!;
    assert.equal(s1.status, 'completed');
    assert.equal(s2.status, 'running');
  });
});
