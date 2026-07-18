import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAgentState,
  type AgentState,
  type AgentToolCall,
  type AgentToolResult,
  type AgentPlanStep,
  type AgentEvidence,
  type AgentHandoff,
  type AgentConstraint
} from '../src/index.js';

describe('agent-state', () => {
  function buildState(overrides: Partial<AgentState> = {}): AgentState {
    const toolCall: AgentToolCall = {
      kind: 'function',
      id: 'tc-1',
      name: 'example',
      arguments: { x: 1 },
      timestamp: '2026-07-18T00:00:00Z',
      agentId: 'agent-1'
    };

    const toolResult: AgentToolResult = {
      callId: 'tc-1',
      success: true,
      value: { result: 'ok' },
      timestamp: '2026-07-18T00:00:01Z'
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
      agentId: 'agent-1'
    };

    const evidence: AgentEvidence = {
      type: 'observation',
      source: 'sensor-1',
      content: { reading: 42 },
      timestamp: '2026-07-18T00:00:02Z',
      agentId: 'agent-1'
    };

    const handoff: AgentHandoff = {
      fromAgent: 'agent-1',
      toAgent: 'agent-2',
      direction: 'outbound',
      payload: { data: 'transfer' },
      timestamp: '2026-07-18T00:00:03Z'
    };

    const constraint: AgentConstraint = {
      kind: 'budget',
      description: 'max cost',
      value: 100
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
      ...overrides
    };
  }

  it('validates a complete agent state successfully', () => {
    const state = buildState();
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('rejects state missing stateVersion', () => {
    const state = buildState({ stateVersion: undefined as unknown as string });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('stateVersion')));
  });

  it('rejects state missing planId', () => {
    const state = buildState({ planId: '' });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('planId')));
  });

  it('rejects state missing agentId', () => {
    const state = buildState({ agentId: '' });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('agentId')));
  });

  it('rejects state with invalid role', () => {
    const state = buildState({ role: 'unknown-role' as 'orchestrator' });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('role')));
  });

  it('rejects state missing updatedAt', () => {
    const state = buildState({ updatedAt: '' });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('updatedAt')));
  });

  it('rejects step with invalid status', () => {
    const state = buildState({
      steps: [{
        id: 'step-1',
        description: 'test',
        status: 'invalid' as 'pending',
        toolCalls: [],
        results: [],
        constraints: [],
        agentId: 'agent-1'
      }]
    });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('status')));
  });

  it('rejects step missing id', () => {
    const state = buildState({
      steps: [{
        id: '',
        description: 'test',
        status: 'pending',
        toolCalls: [],
        results: [],
        constraints: [],
        agentId: 'agent-1'
      }]
    });
    const result = validateAgentState(state);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('step') && e.includes('id')));
  });

  it('validates all four roles', () => {
    for (const role of ['orchestrator', 'worker', 'reviewer', 'auditor'] as const) {
      const state = buildState({ role });
      const result = validateAgentState(state);
      assert.strictEqual(result.ok, true, `role ${role} should be valid`);
    }
  });

  it('validates all five step statuses', () => {
    for (const status of ['pending', 'running', 'completed', 'failed', 'abandoned'] as const) {
      const state = buildState({
        steps: [{
          id: 'step-1',
          description: 'test',
          status,
          toolCalls: [],
          results: [],
          constraints: [],
          agentId: 'agent-1'
        }]
      });
      const result = validateAgentState(state);
      assert.strictEqual(result.ok, true, `status ${status} should be valid`);
    }
  });
});
