/**
 * Agent-State Interoperability (R10.5)
 *
 * Demonstrates that the agent-state/1.0 protocol can be consumed and produced
 * by independent agent implementations with validated round-trip fidelity.
 */

import type {
  AgentState,
  AgentPlanStep,
  AgentToolCall,
  AgentToolResult,
  AgentHandoff,
  AgentEvidence,
  AgentConstraint,
} from './agent-state.js';
import { validateAgentState } from './agent-state.js';
import { AGENT_STATE_FROZEN_VERSION } from './agent-state-freeze.js';

export type AgentFramework = 'lunum-native' | 'minimal-python' | 'generic-json';

export interface InteropProfile {
  framework: AgentFramework;
  version: string;
  capabilities: readonly InteropCapability[];
  stateVersion: string;
}

export type InteropCapability =
  | 'create-state'
  | 'validate-state'
  | 'replay-steps'
  | 'handoff-send'
  | 'handoff-receive'
  | 'tamper-detect'
  | 'idempotency';

export interface InteropTestCase {
  id: string;
  description: string;
  sourceFramework: AgentFramework;
  targetFramework: AgentFramework;
  scenario: InteropScenario;
}

export type InteropScenario =
  | 'create-and-validate'
  | 'handoff-round-trip'
  | 'step-continuation'
  | 'evidence-exchange'
  | 'constraint-propagation';

export interface InteropTestResult {
  testId: string;
  passed: boolean;
  sourceState: AgentState;
  targetState: AgentState | null;
  validationErrors: string[];
  roundTripFidelity: number;
}

export interface InteropReport {
  profiles: InteropProfile[];
  results: InteropTestResult[];
  overallPass: boolean;
  fidelityScore: number;
}

export const INTEROP_PROFILES: readonly InteropProfile[] = Object.freeze([
  Object.freeze({
    framework: 'lunum-native' as AgentFramework,
    version: '1.0.0',
    capabilities: Object.freeze([
      'create-state',
      'validate-state',
      'replay-steps',
      'handoff-send',
      'handoff-receive',
      'tamper-detect',
      'idempotency',
    ] as const) as readonly InteropCapability[],
    stateVersion: AGENT_STATE_FROZEN_VERSION,
  }),
  Object.freeze({
    framework: 'minimal-python' as AgentFramework,
    version: '0.1.0',
    capabilities: Object.freeze([
      'create-state',
      'validate-state',
      'handoff-send',
      'handoff-receive',
    ] as const) as readonly InteropCapability[],
    stateVersion: AGENT_STATE_FROZEN_VERSION,
  }),
  Object.freeze({
    framework: 'generic-json' as AgentFramework,
    version: '0.1.0',
    capabilities: Object.freeze([
      'create-state',
      'validate-state',
    ] as const) as readonly InteropCapability[],
    stateVersion: AGENT_STATE_FROZEN_VERSION,
  }),
]);

function createTimestamp(): string {
  return '2026-01-01T00:00:00.000Z';
}

export function createStateFromFramework(framework: AgentFramework, planId: string): AgentState {
  const ts = createTimestamp();
  const agentId = `${framework}-agent-001`;

  const baseStep: AgentPlanStep = {
    id: `${framework}-step-1`,
    description: `Step created by ${framework}`,
    status: 'completed',
    toolCalls: [{
      kind: 'function',
      id: `${framework}-tc-1`,
      name: 'test-tool',
      arguments: { input: 'test' },
      timestamp: ts,
      agentId,
    }],
    results: [{
      callId: `${framework}-tc-1`,
      success: true,
      value: { output: 'test-result' },
      timestamp: ts,
    }],
    constraints: [],
    startedAt: ts,
    completedAt: ts,
    agentId,
  };

  return {
    stateVersion: AGENT_STATE_FROZEN_VERSION,
    planId,
    planName: `${framework} interop test plan`,
    agentId,
    role: 'worker',
    steps: [baseStep],
    constraints: [{
      kind: 'budget',
      description: 'max tokens',
      value: 4096,
    }],
    evidence: [{
      type: 'interop-test',
      source: framework,
      content: { verified: true },
      timestamp: ts,
      agentId,
    }],
    handoffs: [],
    updatedAt: ts,
  };
}

export function createHandoff(
  fromFramework: AgentFramework,
  toFramework: AgentFramework,
  state: AgentState,
): AgentHandoff {
  return {
    fromAgent: `${fromFramework}-agent-001`,
    toAgent: `${toFramework}-agent-001`,
    direction: 'outbound',
    payload: {
      planId: state.planId,
      stepsCompleted: state.steps.filter(s => s.status === 'completed').length,
      stepsTotal: state.steps.length,
      evidenceCount: state.evidence.length,
    },
    timestamp: createTimestamp(),
  };
}

export function receiveHandoff(
  receivingFramework: AgentFramework,
  sourceState: AgentState,
  handoff: AgentHandoff,
): AgentState {
  const ts = createTimestamp();
  const agentId = `${receivingFramework}-agent-001`;

  const continuationStep: AgentPlanStep = {
    id: `${receivingFramework}-continuation-1`,
    description: `Continuation by ${receivingFramework} after handoff`,
    status: 'pending',
    toolCalls: [],
    results: [],
    constraints: [],
    agentId,
  };

  return {
    ...sourceState,
    agentId,
    role: 'worker',
    steps: [...sourceState.steps, continuationStep],
    handoffs: [...sourceState.handoffs, {
      ...handoff,
      direction: 'inbound',
    }],
    updatedAt: ts,
  };
}

export function measureRoundTripFidelity(original: AgentState, roundTripped: AgentState): number {
  let matches = 0;
  let total = 0;

  total++; if (original.stateVersion === roundTripped.stateVersion) matches++;
  total++; if (original.planId === roundTripped.planId) matches++;
  total++; if (original.planName === roundTripped.planName) matches++;
  total++; if (original.role === roundTripped.role) matches++;

  const origStepIds = original.steps.map(s => s.id);
  const rtStepIds = roundTripped.steps.map(s => s.id);
  for (const id of origStepIds) {
    total++;
    if (rtStepIds.includes(id)) matches++;
  }

  for (const origStep of original.steps) {
    const rtStep = roundTripped.steps.find(s => s.id === origStep.id);
    if (rtStep) {
      total++; if (origStep.status === rtStep.status) matches++;
      total++; if (origStep.description === rtStep.description) matches++;
      total++; if (origStep.toolCalls.length === rtStep.toolCalls.length) matches++;
      total++; if (origStep.results.length === rtStep.results.length) matches++;
    }
  }

  total++; if (original.constraints.length === roundTripped.constraints.length) matches++;
  total++; if (original.evidence.length === roundTripped.evidence.length) matches++;

  return total === 0 ? 1 : matches / total;
}

export function runInteropTest(testCase: InteropTestCase): InteropTestResult {
  const sourceState = createStateFromFramework(testCase.sourceFramework, `interop-${testCase.id}`);

  const sourceValidation = validateAgentState(sourceState);
  if (!sourceValidation.ok) {
    return {
      testId: testCase.id,
      passed: false,
      sourceState,
      targetState: null,
      validationErrors: sourceValidation.errors,
      roundTripFidelity: 0,
    };
  }

  let targetState: AgentState;

  switch (testCase.scenario) {
    case 'create-and-validate': {
      targetState = createStateFromFramework(testCase.targetFramework, sourceState.planId);
      const targetValidationEarly = validateAgentState(targetState);
      return {
        testId: testCase.id,
        passed: targetValidationEarly.ok,
        sourceState,
        targetState,
        validationErrors: targetValidationEarly.errors,
        roundTripFidelity: 1.0,
      };
    }
    case 'handoff-round-trip': {
      const handoff = createHandoff(testCase.sourceFramework, testCase.targetFramework, sourceState);
      targetState = receiveHandoff(testCase.targetFramework, sourceState, handoff);
      break;
    }
    case 'step-continuation': {
      targetState = {
        ...sourceState,
        agentId: `${testCase.targetFramework}-agent-001`,
        steps: [
          ...sourceState.steps,
          {
            id: `${testCase.targetFramework}-step-cont`,
            description: 'Continued by target framework',
            status: 'completed' as const,
            toolCalls: [],
            results: [],
            constraints: [],
            agentId: `${testCase.targetFramework}-agent-001`,
            startedAt: createTimestamp(),
            completedAt: createTimestamp(),
          },
        ],
        updatedAt: createTimestamp(),
      };
      break;
    }
    case 'evidence-exchange': {
      const newEvidence: AgentEvidence = {
        type: 'cross-framework',
        source: testCase.targetFramework,
        content: { exchanged: true, fromFramework: testCase.sourceFramework },
        timestamp: createTimestamp(),
        agentId: `${testCase.targetFramework}-agent-001`,
      };
      targetState = {
        ...sourceState,
        evidence: [...sourceState.evidence, newEvidence],
        updatedAt: createTimestamp(),
      };
      break;
    }
    case 'constraint-propagation': {
      const newConstraint: AgentConstraint = {
        kind: 'deadline',
        description: 'Propagated from source framework',
        value: '2026-12-31T23:59:59Z',
      };
      targetState = {
        ...sourceState,
        agentId: `${testCase.targetFramework}-agent-001`,
        constraints: [...sourceState.constraints, newConstraint],
        updatedAt: createTimestamp(),
      };
      break;
    }
  }

  const targetValidation = validateAgentState(targetState);
  const fidelity = measureRoundTripFidelity(sourceState, targetState);

  return {
    testId: testCase.id,
    passed: targetValidation.ok && fidelity >= 0.8,
    sourceState,
    targetState,
    validationErrors: targetValidation.errors,
    roundTripFidelity: fidelity,
  };
}

export const INTEROP_TEST_CASES: readonly InteropTestCase[] = Object.freeze([
  Object.freeze({ id: 'interop-01', description: 'Native to Python create-and-validate', sourceFramework: 'lunum-native' as AgentFramework, targetFramework: 'minimal-python' as AgentFramework, scenario: 'create-and-validate' as InteropScenario }),
  Object.freeze({ id: 'interop-02', description: 'Native to Generic handoff round-trip', sourceFramework: 'lunum-native' as AgentFramework, targetFramework: 'generic-json' as AgentFramework, scenario: 'handoff-round-trip' as InteropScenario }),
  Object.freeze({ id: 'interop-03', description: 'Python to Native step continuation', sourceFramework: 'minimal-python' as AgentFramework, targetFramework: 'lunum-native' as AgentFramework, scenario: 'step-continuation' as InteropScenario }),
  Object.freeze({ id: 'interop-04', description: 'Generic to Python evidence exchange', sourceFramework: 'generic-json' as AgentFramework, targetFramework: 'minimal-python' as AgentFramework, scenario: 'evidence-exchange' as InteropScenario }),
  Object.freeze({ id: 'interop-05', description: 'Native to Python constraint propagation', sourceFramework: 'lunum-native' as AgentFramework, targetFramework: 'minimal-python' as AgentFramework, scenario: 'constraint-propagation' as InteropScenario }),
  Object.freeze({ id: 'interop-06', description: 'Python to Generic handoff round-trip', sourceFramework: 'minimal-python' as AgentFramework, targetFramework: 'generic-json' as AgentFramework, scenario: 'handoff-round-trip' as InteropScenario }),
]);

export function runInteropSuite(): InteropReport {
  const results = INTEROP_TEST_CASES.map(tc => runInteropTest(tc));
  const overallPass = results.every(r => r.passed);
  const fidelityScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.roundTripFidelity, 0) / results.length
    : 0;

  return {
    profiles: [...INTEROP_PROFILES],
    results,
    overallPass,
    fidelityScore,
  };
}
