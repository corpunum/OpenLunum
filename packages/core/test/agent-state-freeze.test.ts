import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_STATE_FROZEN_VERSION,
  validateAgentStateSchema,
  migrateAgentState01to10,
  replaySteps,
  recoverFromInterruption,
  type AgentState,
  type AgentToolCall,
  type AgentToolResult,
  type AgentPlanStep,
  type AgentEvidence,
  type AgentHandoff,
  type AgentConstraint,
} from '../src/index.js';

describe('agent-state-freeze', () => {
  function buildState(overrides: Partial<AgentState> = {}): AgentState {
    const toolCall: AgentToolCall = {
      kind: 'function',
      id: 'tc-1',
      name: 'example',
      arguments: { x: 1 },
      timestamp: '2026-07-18T00:00:00Z',
      agentId: 'agent-1',
    };

    const toolResult: AgentToolResult = {
      callId: 'tc-1',
      success: true,
      value: { result: 'ok' },
      timestamp: '2026-07-18T00:00:01Z',
    };

    const step: AgentPlanStep = {
      id: 'step-1',
      description: 'do something',
      status: 'completed',
      toolCalls: [toolCall],
      results: [toolResult],
      constraints: [],
      startedAt: '2026-07-18T00:00:00Z',
      completedAt: '2026-07-18T00:00:01Z',
      agentId: 'agent-1',
    };

    const evidence: AgentEvidence = {
      type: 'observation',
      source: 'sensor-1',
      content: { reading: 42 },
      timestamp: '2026-07-18T00:00:02Z',
      agentId: 'agent-1',
    };

    const handoff: AgentHandoff = {
      fromAgent: 'agent-1',
      toAgent: 'agent-2',
      direction: 'outbound',
      payload: { data: 'transfer' },
      timestamp: '2026-07-18T00:00:03Z',
    };

    const constraint: AgentConstraint = {
      kind: 'budget',
      description: 'max cost',
      value: 100,
    };

    return {
      stateVersion: 'agent-state/0.1',
      planId: 'plan-1',
      planName: 'Test Plan',
      agentId: 'agent-1',
      role: 'worker',
      steps: [step],
      constraints: [constraint],
      evidence: [evidence],
      handoffs: [handoff],
      updatedAt: '2026-07-18T00:00:04Z',
      ...overrides,
    };
  }

  describe('frozen version constant', () => {
    it('exports AGENT_STATE_FROZEN_VERSION = "agent-state/1.0"', () => {
      assert.strictEqual(AGENT_STATE_FROZEN_VERSION, 'agent-state/1.0');
    });
  });

  describe('validateAgentStateSchema', () => {
    it('validates a complete valid agent state (v0.1)', () => {
      const state = buildState({ stateVersion: 'agent-state/0.1' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('validates a complete valid agent state (v1.0)', () => {
      const state = buildState({ stateVersion: 'agent-state/1.0' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('rejects state with invalid stateVersion', () => {
      const state = buildState({ stateVersion: 'agent-state/2.0' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('stateVersion')));
    });

    it('rejects state missing stateVersion', () => {
      const state = buildState({ stateVersion: undefined as unknown as string });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('stateVersion')));
    });

    it('rejects state missing planId', () => {
      const state = buildState({ planId: '' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('planId')));
    });

    it('rejects state missing agentId', () => {
      const state = buildState({ agentId: '' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('agentId')));
    });

    it('rejects state with invalid role', () => {
      const state = buildState({ role: 'unknown-role' as 'orchestrator' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('role')));
    });

    it('rejects state missing updatedAt', () => {
      const state = buildState({ updatedAt: '' });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('updatedAt')));
    });

    it('rejects state missing constraints array', () => {
      const state = buildState({ constraints: undefined as unknown as any[] });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('constraints')));
    });

    it('rejects state missing evidence array', () => {
      const state = buildState({ evidence: undefined as unknown as any[] });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('evidence')));
    });

    it('rejects state missing handoffs array', () => {
      const state = buildState({ handoffs: undefined as unknown as any[] });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('handoffs')));
    });

    it('rejects step with invalid status', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'test',
            status: 'invalid' as 'pending',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('status')));
    });

    it('rejects step missing id', () => {
      const state = buildState({
        steps: [
          {
            id: '',
            description: 'test',
            status: 'pending',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('step')));
    });

    it('validates all five step statuses', () => {
      for (const status of ['pending', 'running', 'completed', 'failed', 'abandoned'] as const) {
        const state = buildState({
          steps: [
            {
              id: 'step-1',
              description: 'test',
              status,
              toolCalls: [],
              results: [],
              constraints: [],
              agentId: 'agent-1',
            },
          ],
        });
        const result = validateAgentStateSchema(state);
        assert.strictEqual(result.ok, true, `status ${status} should be valid`);
      }
    });

    it('rejects toolCall with invalid kind', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'test',
            status: 'completed',
            toolCalls: [
              {
                kind: 'invalid' as any,
                id: 'tc-1',
                name: 'example',
                arguments: {},
                timestamp: '2026-07-18T00:00:00Z',
                agentId: 'agent-1',
              },
            ],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });
      const result = validateAgentStateSchema(state);
      assert.strictEqual(result.ok, false);
    });

    it('rejects state when not an object', () => {
      const result = validateAgentStateSchema('not an object');
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('object')));
    });

    it('rejects state when null', () => {
      const result = validateAgentStateSchema(null);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('object')));
    });
  });

  describe('migrateAgentState01to10', () => {
    it('updates stateVersion from 0.1 to 1.0', () => {
      const state = buildState({ stateVersion: 'agent-state/0.1' });
      const migrated = migrateAgentState01to10(state);
      assert.strictEqual(migrated.stateVersion, 'agent-state/1.0');
    });

    it('preserves all other fields during migration', () => {
      const state = buildState({ stateVersion: 'agent-state/0.1' });
      const migrated = migrateAgentState01to10(state);

      assert.strictEqual(migrated.planId, state.planId);
      assert.strictEqual(migrated.planName, state.planName);
      assert.strictEqual(migrated.agentId, state.agentId);
      assert.strictEqual(migrated.role, state.role);
      assert.deepStrictEqual(migrated.steps, state.steps);
      assert.deepStrictEqual(migrated.constraints, state.constraints);
      assert.deepStrictEqual(migrated.evidence, state.evidence);
      assert.deepStrictEqual(migrated.handoffs, state.handoffs);
      assert.strictEqual(migrated.updatedAt, state.updatedAt);
    });

    it('is idempotent - migrating twice gives same result', () => {
      const state = buildState({ stateVersion: 'agent-state/0.1' });
      const migrated1 = migrateAgentState01to10(state);
      const migrated2 = migrateAgentState01to10(migrated1);

      assert.deepStrictEqual(migrated1, migrated2);
    });

    it('works with complex states', () => {
      const state = buildState({
        stateVersion: 'agent-state/0.1',
        steps: [
          {
            id: 'step-1',
            description: 'first step',
            status: 'completed',
            toolCalls: [
              {
                kind: 'function',
                id: 'tc-1',
                name: 'tool1',
                arguments: { a: 1 },
                timestamp: '2026-07-18T00:00:00Z',
                agentId: 'agent-1',
              },
            ],
            results: [
              {
                callId: 'tc-1',
                success: true,
                value: { ok: true },
                timestamp: '2026-07-18T00:00:01Z',
              },
            ],
            constraints: [],
            agentId: 'agent-1',
          },
          {
            id: 'step-2',
            description: 'second step',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const migrated = migrateAgentState01to10(state);
      assert.strictEqual(migrated.stateVersion, 'agent-state/1.0');
      assert.strictEqual(migrated.steps.length, 2);
      assert.strictEqual(migrated.steps[0]!.status, 'completed');
      assert.strictEqual(migrated.steps[1]!.status, 'running');
    });
  });

  describe('replaySteps', () => {
    it('replays completed steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'completed step',
            status: 'completed',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const results = replaySteps(state);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.stepId, 'step-1');
      assert.strictEqual(results[0]!.status, 'replayed');
      assert.strictEqual(results[0]!.originalStatus, 'completed');
    });

    it('skips failed steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'failed step',
            status: 'failed',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const results = replaySteps(state);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.status, 'skipped');
      assert.strictEqual(results[0]!.originalStatus, 'failed');
    });

    it('skips abandoned steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'abandoned step',
            status: 'abandoned',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const results = replaySteps(state);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.status, 'skipped');
      assert.strictEqual(results[0]!.originalStatus, 'abandoned');
    });

    it('skips running steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'running step',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const results = replaySteps(state);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.status, 'skipped');
      assert.strictEqual(results[0]!.originalStatus, 'running');
    });

    it('skips pending steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'pending step',
            status: 'pending',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const results = replaySteps(state);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.status, 'skipped');
      assert.strictEqual(results[0]!.originalStatus, 'pending');
    });

    it('handles mixed step statuses', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'completed',
            status: 'completed',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
          {
            id: 'step-2',
            description: 'failed',
            status: 'failed',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
          {
            id: 'step-3',
            description: 'running',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const results = replaySteps(state);
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0]!.status, 'replayed');
      assert.strictEqual(results[1]!.status, 'skipped');
      assert.strictEqual(results[2]!.status, 'skipped');
    });
  });

  describe('recoverFromInterruption', () => {
    it('identifies running steps as interrupted', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'interrupted step',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { result } = recoverFromInterruption(state);
      assert.strictEqual(result.recovered, true);
      assert.deepStrictEqual(result.interruptedSteps, ['step-1']);
    });

    it('marks running steps with successful results as resumable', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'interrupted with success',
            status: 'running',
            toolCalls: [],
            results: [
              {
                callId: 'tc-1',
                success: true,
                value: { ok: true },
                timestamp: '2026-07-18T00:00:00Z',
              },
            ],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { result } = recoverFromInterruption(state);
      assert.deepStrictEqual(result.resumableSteps, ['step-1']);
      assert.deepStrictEqual(result.abandonedSteps, []);
    });

    it('marks running steps without results as abandoned', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'interrupted no results',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { result } = recoverFromInterruption(state);
      assert.deepStrictEqual(result.abandonedSteps, ['step-1']);
      assert.deepStrictEqual(result.resumableSteps, []);
    });

    it('marks running steps with failed results as abandoned', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'interrupted with failure',
            status: 'running',
            toolCalls: [],
            results: [
              {
                callId: 'tc-1',
                success: false,
                value: undefined,
                error: 'tool failed',
                timestamp: '2026-07-18T00:00:00Z',
              },
            ],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { result } = recoverFromInterruption(state);
      assert.deepStrictEqual(result.abandonedSteps, ['step-1']);
      assert.deepStrictEqual(result.resumableSteps, []);
    });

    it('resumes resumable steps by changing status to pending', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'resumable',
            status: 'running',
            toolCalls: [],
            results: [
              {
                callId: 'tc-1',
                success: true,
                value: { ok: true },
                timestamp: '2026-07-18T00:00:00Z',
              },
            ],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { recoveredState } = recoverFromInterruption(state);
      assert.strictEqual(recoveredState.steps[0]!.status, 'pending');
    });

    it('abandons abandoned steps by changing status to abandoned', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'to be abandoned',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { recoveredState } = recoverFromInterruption(state);
      assert.strictEqual(recoveredState.steps[0]!.status, 'abandoned');
    });

    it('preserves non-running steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'already completed',
            status: 'completed',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
          {
            id: 'step-2',
            description: 'interrupted',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { recoveredState } = recoverFromInterruption(state);
      assert.strictEqual(recoveredState.steps[0]!.status, 'completed');
      assert.strictEqual(recoveredState.steps[1]!.status, 'abandoned');
    });

    it('returns false for recovered when no running steps', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'completed',
            status: 'completed',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const { result } = recoverFromInterruption(state);
      assert.strictEqual(result.recovered, false);
    });

    it('updates recoveredState.updatedAt', () => {
      const state = buildState({
        steps: [
          {
            id: 'step-1',
            description: 'interrupted',
            status: 'running',
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: 'agent-1',
          },
        ],
      });

      const original = state.updatedAt;
      const { recoveredState } = recoverFromInterruption(state);
      assert.notStrictEqual(recoveredState.updatedAt, original);
    });
  });
});
