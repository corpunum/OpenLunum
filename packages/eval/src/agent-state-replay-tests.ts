/**
 * Agent-State Replay Tests
 *
 * Test fixtures and runner for replay/recovery scenarios.
 * Covers: partial execution, all-complete, all-failed, mixed states,
 * mid-step interruption, and multi-agent handoff during replay.
 */

import {
  replaySteps,
  recoverFromInterruption,
  validateAgentState,
  type AgentState,
  type AgentPlanStep,
} from '@corpunum/lunum';

export const REPLAY_TEST_VERSION = '0.1.0' as const;

export interface ReplayTestScenario {
  name: string;
  state: AgentState;
  expectedReplayable: number;
  expectedRecoverable: number;
  expectedAbandoned: number;
}

export interface ReplayTestReport {
  version: string;
  timestamp: string;
  scenarios: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

function buildTestState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    stateVersion: 'agent-state/0.1',
    planId: 'test-plan-' + Date.now(),
    planName: 'Test Plan',
    agentId: 'test-agent',
    role: 'worker',
    steps: [],
    constraints: [],
    evidence: [],
    handoffs: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildStep(overrides: Partial<AgentPlanStep> = {}): AgentPlanStep {
  return {
    id: 'step-' + Math.random().toString(36).slice(2),
    description: 'test step',
    status: 'pending',
    toolCalls: [],
    results: [],
    constraints: [],
    agentId: 'test-agent',
    ...overrides,
  };
}

/**
 * Test scenario: Partial execution - some steps completed, some pending
 */
export const SCENARIO_PARTIAL_EXECUTION: ReplayTestScenario = {
  name: 'Partial Execution',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'completed' }),
      buildStep({ id: 'step-2', status: 'completed' }),
      buildStep({ id: 'step-3', status: 'pending' }),
      buildStep({ id: 'step-4', status: 'pending' }),
    ],
  }),
  expectedReplayable: 2,
  expectedRecoverable: 0,
  expectedAbandoned: 0,
};

/**
 * Test scenario: All steps completed
 */
export const SCENARIO_ALL_COMPLETE: ReplayTestScenario = {
  name: 'All Complete',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'completed' }),
      buildStep({ id: 'step-2', status: 'completed' }),
      buildStep({ id: 'step-3', status: 'completed' }),
    ],
  }),
  expectedReplayable: 3,
  expectedRecoverable: 0,
  expectedAbandoned: 0,
};

/**
 * Test scenario: All steps failed
 */
export const SCENARIO_ALL_FAILED: ReplayTestScenario = {
  name: 'All Failed',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'failed' }),
      buildStep({ id: 'step-2', status: 'failed' }),
      buildStep({ id: 'step-3', status: 'failed' }),
    ],
  }),
  expectedReplayable: 0,
  expectedRecoverable: 0,
  expectedAbandoned: 0,
};

/**
 * Test scenario: Mixed step statuses
 */
export const SCENARIO_MIXED_STATES: ReplayTestScenario = {
  name: 'Mixed States',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'completed' }),
      buildStep({ id: 'step-2', status: 'failed' }),
      buildStep({ id: 'step-3', status: 'pending' }),
      buildStep({ id: 'step-4', status: 'abandoned' }),
      buildStep({ id: 'step-5', status: 'completed' }),
    ],
  }),
  expectedReplayable: 2,
  expectedRecoverable: 0,
  expectedAbandoned: 0,
};

/**
 * Test scenario: Mid-step interruption - running step with successful results
 */
export const SCENARIO_MID_STEP_WITH_RESULTS: ReplayTestScenario = {
  name: 'Mid-Step Interruption With Results',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'completed' }),
      buildStep({
        id: 'step-2',
        status: 'running',
        results: [
          {
            callId: 'tc-1',
            success: true,
            value: { ok: true },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      buildStep({ id: 'step-3', status: 'pending' }),
    ],
  }),
  expectedReplayable: 1,
  expectedRecoverable: 1,
  expectedAbandoned: 0,
};

/**
 * Test scenario: Mid-step interruption - running step without results
 */
export const SCENARIO_MID_STEP_NO_RESULTS: ReplayTestScenario = {
  name: 'Mid-Step Interruption No Results',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'completed' }),
      buildStep({ id: 'step-2', status: 'running', results: [] }),
      buildStep({ id: 'step-3', status: 'pending' }),
    ],
  }),
  expectedReplayable: 1,
  expectedRecoverable: 0,
  expectedAbandoned: 1,
};

/**
 * Test scenario: Multi-agent handoff during replay
 */
export const SCENARIO_MULTI_AGENT_HANDOFF: ReplayTestScenario = {
  name: 'Multi-Agent Handoff',
  state: buildTestState({
    steps: [
      buildStep({ id: 'step-1', status: 'completed', agentId: 'agent-1' }),
      buildStep({ id: 'step-2', status: 'completed', agentId: 'agent-2' }),
      buildStep({ id: 'step-3', status: 'pending', agentId: 'agent-3' }),
    ],
    handoffs: [
      {
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        direction: 'outbound',
        payload: { handoff_data: 'transfer1' },
        timestamp: new Date().toISOString(),
      },
      {
        fromAgent: 'agent-2',
        toAgent: 'agent-3',
        direction: 'outbound',
        payload: { handoff_data: 'transfer2' },
        timestamp: new Date().toISOString(),
      },
    ],
  }),
  expectedReplayable: 2,
  expectedRecoverable: 0,
  expectedAbandoned: 0,
};

/**
 * Test scenario: Empty state
 */
export const SCENARIO_EMPTY: ReplayTestScenario = {
  name: 'Empty State',
  state: buildTestState({ steps: [] }),
  expectedReplayable: 0,
  expectedRecoverable: 0,
  expectedAbandoned: 0,
};

/**
 * Run all replay test scenarios
 */
export function runReplayTests(): ReplayTestReport {
  const scenarios: ReplayTestScenario[] = [
    SCENARIO_PARTIAL_EXECUTION,
    SCENARIO_ALL_COMPLETE,
    SCENARIO_ALL_FAILED,
    SCENARIO_MIXED_STATES,
    SCENARIO_MID_STEP_WITH_RESULTS,
    SCENARIO_MID_STEP_NO_RESULTS,
    SCENARIO_MULTI_AGENT_HANDOFF,
    SCENARIO_EMPTY,
  ];

  const results: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }> = [];

  for (const scenario of scenarios) {
    try {
      // Validate state
      const validation = validateAgentState(scenario.state);
      if (!validation.ok) {
        results.push({
          name: scenario.name,
          passed: false,
          error: `State validation failed: ${validation.errors.join('; ')}`,
        });
        continue;
      }

      // Test replay
      const replayResults = replaySteps(scenario.state);
      const replayableCount = replayResults.filter(r => r.status === 'replayed').length;

      if (replayableCount !== scenario.expectedReplayable) {
        results.push({
          name: scenario.name,
          passed: false,
          error: `Expected ${scenario.expectedReplayable} replayable steps, got ${replayableCount}`,
        });
        continue;
      }

      // Test recovery
      const { result: recoveryResult, recoveredState } = recoverFromInterruption(scenario.state);
      const recoverableCount = recoveryResult.resumableSteps.length;
      const abandonedCount = recoveryResult.abandonedSteps.length;

      if (recoverableCount !== scenario.expectedRecoverable) {
        results.push({
          name: scenario.name,
          passed: false,
          error: `Expected ${scenario.expectedRecoverable} recoverable steps, got ${recoverableCount}`,
        });
        continue;
      }

      if (abandonedCount !== scenario.expectedAbandoned) {
        results.push({
          name: scenario.name,
          passed: false,
          error: `Expected ${scenario.expectedAbandoned} abandoned steps, got ${abandonedCount}`,
        });
        continue;
      }

      // Validate recovered state
      const recoveredValidation = validateAgentState(recoveredState);
      if (!recoveredValidation.ok) {
        results.push({
          name: scenario.name,
          passed: false,
          error: `Recovered state validation failed: ${recoveredValidation.errors.join('; ')}`,
        });
        continue;
      }

      results.push({
        name: scenario.name,
        passed: true,
      });
    } catch (error) {
      results.push({
        name: scenario.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  return {
    version: REPLAY_TEST_VERSION,
    timestamp: new Date().toISOString(),
    scenarios: results,
    summary: {
      total: results.length,
      passed,
      failed,
    },
  };
}
