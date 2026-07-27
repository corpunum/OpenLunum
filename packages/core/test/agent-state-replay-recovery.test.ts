import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_STATE_SCHEMA,
  AGENT_STATE_SUPPORTED_VERSIONS,
  isAgentStateVersionSupported,
  migrateAgentState,
  replaySteps,
  recoverFromInterruption,
  validateAgentState,
  type AgentState,
  type AgentPlanStep,
  type AgentToolCall,
  type AgentToolResult,
  type ReplayResult,
} from '../src/index.js';

function makeToolCall(id: string, name: string): AgentToolCall {
  return { kind: 'function', id, name, arguments: {}, timestamp: '2026-07-20T00:00:00Z', agentId: 'agent-1' };
}

function makeResult(callId: string, success: boolean): AgentToolResult {
  const r: AgentToolResult = { callId, success, value: success ? 'ok' : null, timestamp: '2026-07-20T00:00:01Z' };
  if (!success) r.error = 'failed';
  return r;
}

function makeStep(id: string, status: AgentPlanStep['status'], toolCalls: AgentToolCall[] = [], results: AgentToolResult[] = []): AgentPlanStep {
  const step: AgentPlanStep = { id, description: `Step ${id}`, status, toolCalls, results, constraints: [], agentId: 'agent-1', startedAt: '2026-07-20T00:00:00Z' };
  if (status === 'completed') step.completedAt = '2026-07-20T00:00:02Z';
  return step;
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
    updatedAt: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

describe('agent-state schema version', () => {
  it('AGENT_STATE_SCHEMA is frozen at agent-state/0.1', () => {
    assert.strictEqual(AGENT_STATE_SCHEMA, 'agent-state/0.1');
  });

  it('supported versions list includes the frozen schema', () => {
    assert.ok(AGENT_STATE_SUPPORTED_VERSIONS.includes('agent-state/0.1'));
  });

  it('isAgentStateVersionSupported returns true for 0.1', () => {
    assert.strictEqual(isAgentStateVersionSupported('agent-state/0.1'), true);
  });

  it('isAgentStateVersionSupported returns false for unknown versions', () => {
    assert.strictEqual(isAgentStateVersionSupported('agent-state/0.2'), false);
    assert.strictEqual(isAgentStateVersionSupported('agent-state/1.0'), false);
    assert.strictEqual(isAgentStateVersionSupported('unknown'), false);
  });
});

describe('agent-state migration', () => {
  it('passes through a state with the current version unchanged', () => {
    const state = makeState([makeStep('s1', 'completed')]);
    const result = migrateAgentState(state);
    assert.strictEqual(result.migrated, false);
    assert.strictEqual(result.fromVersion, AGENT_STATE_SCHEMA);
    assert.strictEqual(result.toVersion, AGENT_STATE_SCHEMA);
    assert.deepStrictEqual(result.state, state);
  });

  it('throws for an unsupported version', () => {
    const state = makeState([], { stateVersion: 'agent-state/99.0' });
    assert.throws(() => migrateAgentState(state), /unsupported agent-state version/u);
  });

  it('migrated state still validates', () => {
    const state = makeState([makeStep('s1', 'completed')]);
    const { state: migrated } = migrateAgentState(state);
    const validation = validateAgentState(migrated);
    assert.strictEqual(validation.ok, true);
  });
});

describe('agent-state replay', () => {
  it('replays completed steps', () => {
    const state = makeState([
      makeStep('s1', 'completed', [makeToolCall('tc1', 'build')], [makeResult('tc1', true)]),
      makeStep('s2', 'completed', [makeToolCall('tc2', 'test')], [makeResult('tc2', true)]),
    ]);
    const results = replaySteps(state);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0]!.status, 'replayed');
    assert.strictEqual(results[1]!.status, 'replayed');
  });

  it('skips failed steps', () => {
    const state = makeState([
      makeStep('s1', 'completed'),
      makeStep('s2', 'failed', [makeToolCall('tc2', 'test')], [makeResult('tc2', false)]),
    ]);
    const results = replaySteps(state);
    assert.strictEqual(results[0]!.status, 'replayed');
    assert.strictEqual(results[1]!.status, 'skipped');
    assert.strictEqual(results[1]!.originalStatus, 'failed');
  });

  it('skips abandoned steps', () => {
    const state = makeState([makeStep('s1', 'abandoned')]);
    const results = replaySteps(state);
    assert.strictEqual(results[0]!.status, 'skipped');
    assert.strictEqual(results[0]!.originalStatus, 'abandoned');
  });

  it('skips running (in-flight) steps', () => {
    const state = makeState([makeStep('s1', 'running')]);
    const results = replaySteps(state);
    assert.strictEqual(results[0]!.status, 'skipped');
    assert.strictEqual(results[0]!.originalStatus, 'running');
  });

  it('skips pending steps', () => {
    const state = makeState([makeStep('s1', 'pending')]);
    const results = replaySteps(state);
    assert.strictEqual(results[0]!.status, 'skipped');
    assert.strictEqual(results[0]!.originalStatus, 'pending');
  });

  it('handles mixed status sequence: completed, failed, pending, running, abandoned', () => {
    const state = makeState([
      makeStep('s1', 'completed'),
      makeStep('s2', 'failed'),
      makeStep('s3', 'pending'),
      makeStep('s4', 'running'),
      makeStep('s5', 'abandoned'),
    ]);
    const results = replaySteps(state);
    assert.strictEqual(results.length, 5);
    assert.deepStrictEqual(results.map(r => r.status), ['replayed', 'skipped', 'skipped', 'skipped', 'skipped']);
  });

  it('returns empty array for state with no steps', () => {
    const state = makeState([]);
    const results = replaySteps(state);
    assert.strictEqual(results.length, 0);
  });

  it('preserves step IDs in results', () => {
    const state = makeState([makeStep('alpha', 'completed'), makeStep('beta', 'failed')]);
    const results = replaySteps(state);
    assert.strictEqual(results[0]!.stepId, 'alpha');
    assert.strictEqual(results[1]!.stepId, 'beta');
  });
});

describe('agent-state recovery from interruption', () => {
  it('recovers interrupted running steps with successful last result to pending', () => {
    const state = makeState([
      makeStep('s1', 'completed'),
      makeStep('s2', 'running', [makeToolCall('tc2', 'deploy')], [makeResult('tc2', true)]),
    ]);
    const { result, recoveredState } = recoverFromInterruption(state);
    assert.strictEqual(result.recovered, true);
    assert.deepStrictEqual(result.interruptedSteps, ['s2']);
    assert.deepStrictEqual(result.resumableSteps, ['s2']);
    assert.deepStrictEqual(result.abandonedSteps, []);
    assert.strictEqual(recoveredState.steps[1]!.status, 'pending');
  });

  it('abandons interrupted running steps with failed last result', () => {
    const state = makeState([
      makeStep('s1', 'running', [makeToolCall('tc1', 'build')], [makeResult('tc1', false)]),
    ]);
    const { result, recoveredState } = recoverFromInterruption(state);
    assert.strictEqual(result.recovered, true);
    assert.deepStrictEqual(result.interruptedSteps, ['s1']);
    assert.deepStrictEqual(result.resumableSteps, []);
    assert.deepStrictEqual(result.abandonedSteps, ['s1']);
    assert.strictEqual(recoveredState.steps[0]!.status, 'abandoned');
  });

  it('abandons interrupted running steps with no results', () => {
    const state = makeState([
      makeStep('s1', 'running', [makeToolCall('tc1', 'test')], []),
    ]);
    const { result, recoveredState } = recoverFromInterruption(state);
    assert.strictEqual(result.recovered, true);
    assert.deepStrictEqual(result.abandonedSteps, ['s1']);
    assert.strictEqual(recoveredState.steps[0]!.status, 'abandoned');
  });

  it('does not modify completed/failed/pending/abandoned steps', () => {
    const state = makeState([
      makeStep('s1', 'completed'),
      makeStep('s2', 'failed'),
      makeStep('s3', 'pending'),
      makeStep('s4', 'abandoned'),
    ]);
    const { result, recoveredState } = recoverFromInterruption(state);
    assert.strictEqual(result.recovered, false);
    assert.strictEqual(result.interruptedSteps.length, 0);
    assert.strictEqual(recoveredState.steps[0]!.status, 'completed');
    assert.strictEqual(recoveredState.steps[1]!.status, 'failed');
    assert.strictEqual(recoveredState.steps[2]!.status, 'pending');
    assert.strictEqual(recoveredState.steps[3]!.status, 'abandoned');
  });

  it('handles multiple interrupted steps', () => {
    const state = makeState([
      makeStep('s1', 'running', [makeToolCall('tc1', 'a')], [makeResult('tc1', true)]),
      makeStep('s2', 'running', [makeToolCall('tc2', 'b')], [makeResult('tc2', false)]),
      makeStep('s3', 'running', [], []),
    ]);
    const { result, recoveredState } = recoverFromInterruption(state);
    assert.strictEqual(result.recovered, true);
    assert.strictEqual(result.interruptedSteps.length, 3);
    assert.deepStrictEqual(result.resumableSteps, ['s1']);
    assert.deepStrictEqual(result.abandonedSteps, ['s2', 's3']);
    assert.strictEqual(recoveredState.steps[0]!.status, 'pending');
    assert.strictEqual(recoveredState.steps[1]!.status, 'abandoned');
    assert.strictEqual(recoveredState.steps[2]!.status, 'abandoned');
  });

  it('recovered state validates', () => {
    const state = makeState([
      makeStep('s1', 'running', [makeToolCall('tc1', 'x')], [makeResult('tc1', true)]),
    ]);
    const { recoveredState } = recoverFromInterruption(state);
    const validation = validateAgentState(recoveredState);
    assert.strictEqual(validation.ok, true);
  });

  it('recovered state has updated timestamp', () => {
    const state = makeState([makeStep('s1', 'running')]);
    const { recoveredState } = recoverFromInterruption(state);
    assert.notStrictEqual(recoveredState.updatedAt, state.updatedAt);
  });

  it('replay after recovery: interrupted steps that became pending are still skipped, completed are replayed', () => {
    const state = makeState([
      makeStep('s1', 'completed'),
      makeStep('s2', 'running', [makeToolCall('tc2', 'x')], [makeResult('tc2', true)]),
      makeStep('s3', 'running', [], []),
    ]);
    const { recoveredState } = recoverFromInterruption(state);
    const replayResults = replaySteps(recoveredState);
    assert.strictEqual(replayResults[0]!.status, 'replayed');
    assert.strictEqual(replayResults[1]!.status, 'skipped');
    assert.strictEqual(replayResults[2]!.status, 'skipped');
  });
});
