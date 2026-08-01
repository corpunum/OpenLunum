import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTEROP_PROFILES,
  INTEROP_TEST_CASES,
  createStateFromFramework,
  createHandoff,
  receiveHandoff,
  measureRoundTripFidelity,
  runInteropTest,
  runInteropSuite,
} from '../src/agent-interop.js';
import { validateAgentState } from '../src/agent-state.js';
import { AGENT_STATE_FROZEN_VERSION } from '../src/agent-state-freeze.js';

describe('agent-interop', () => {
  describe('INTEROP_PROFILES', () => {
    it('defines at least two independent frameworks', () => {
      const frameworks = new Set(INTEROP_PROFILES.map(p => p.framework));
      assert.ok(frameworks.size >= 2);
    });

    it('all profiles target the frozen state version', () => {
      for (const profile of INTEROP_PROFILES) {
        assert.equal(profile.stateVersion, AGENT_STATE_FROZEN_VERSION);
      }
    });

    it('lunum-native supports all capabilities', () => {
      const native = INTEROP_PROFILES.find(p => p.framework === 'lunum-native');
      assert.ok(native);
      assert.ok(native.capabilities.includes('create-state'));
      assert.ok(native.capabilities.includes('validate-state'));
      assert.ok(native.capabilities.includes('handoff-send'));
      assert.ok(native.capabilities.includes('handoff-receive'));
      assert.ok(native.capabilities.includes('tamper-detect'));
      assert.ok(native.capabilities.includes('idempotency'));
    });
  });

  describe('createStateFromFramework', () => {
    it('creates valid state for each framework', () => {
      for (const profile of INTEROP_PROFILES) {
        const state = createStateFromFramework(profile.framework, 'test-plan');
        const validation = validateAgentState(state);
        assert.ok(validation.ok, `Framework ${profile.framework} produced invalid state: ${validation.errors.join(', ')}`);
        assert.equal(state.stateVersion, AGENT_STATE_FROZEN_VERSION);
      }
    });

    it('uses framework-specific agent IDs', () => {
      const native = createStateFromFramework('lunum-native', 'p1');
      const python = createStateFromFramework('minimal-python', 'p1');
      assert.notEqual(native.agentId, python.agentId);
      assert.ok(native.agentId.includes('lunum-native'));
      assert.ok(python.agentId.includes('minimal-python'));
    });
  });

  describe('handoff round-trip', () => {
    it('produces valid state after handoff', () => {
      const source = createStateFromFramework('lunum-native', 'handoff-test');
      const handoff = createHandoff('lunum-native', 'minimal-python', source);
      const received = receiveHandoff('minimal-python', source, handoff);
      const validation = validateAgentState(received);
      assert.ok(validation.ok, `Validation errors: ${validation.errors.join(', ')}`);
    });

    it('preserves original steps in the received state', () => {
      const source = createStateFromFramework('lunum-native', 'handoff-test');
      const handoff = createHandoff('lunum-native', 'minimal-python', source);
      const received = receiveHandoff('minimal-python', source, handoff);
      assert.equal(received.steps.length, source.steps.length + 1);
      assert.equal(received.steps[0]!.id, source.steps[0]!.id);
    });

    it('records the handoff as inbound on receiver', () => {
      const source = createStateFromFramework('lunum-native', 'handoff-test');
      const handoff = createHandoff('lunum-native', 'minimal-python', source);
      const received = receiveHandoff('minimal-python', source, handoff);
      assert.ok(received.handoffs.length > 0);
      assert.equal(received.handoffs[received.handoffs.length - 1]!.direction, 'inbound');
    });
  });

  describe('measureRoundTripFidelity', () => {
    it('returns 1.0 for identical states', () => {
      const state = createStateFromFramework('lunum-native', 'fidelity-test');
      assert.equal(measureRoundTripFidelity(state, state), 1);
    });

    it('returns < 1.0 when fields differ', () => {
      const original = createStateFromFramework('lunum-native', 'fidelity-test');
      const modified = { ...original, planName: 'different name' };
      assert.ok(measureRoundTripFidelity(original, modified) < 1);
    });

    it('returns >= 0.8 for handoff-received state', () => {
      const source = createStateFromFramework('lunum-native', 'fidelity-test');
      const handoff = createHandoff('lunum-native', 'minimal-python', source);
      const received = receiveHandoff('minimal-python', source, handoff);
      assert.ok(measureRoundTripFidelity(source, received) >= 0.8);
    });
  });

  describe('runInteropTest', () => {
    it('passes all defined test cases', () => {
      for (const tc of INTEROP_TEST_CASES) {
        const result = runInteropTest(tc);
        assert.ok(result.passed, `Test ${tc.id} (${tc.description}) failed: ${result.validationErrors.join(', ')}`);
        assert.equal(result.validationErrors.length, 0);
        assert.ok(result.roundTripFidelity >= 0.8, `Fidelity ${result.roundTripFidelity} < 0.8`);
      }
    });
  });

  describe('runInteropSuite', () => {
    it('produces passing suite with high fidelity', () => {
      const report = runInteropSuite();
      assert.ok(report.overallPass);
      assert.ok(report.fidelityScore >= 0.8);
      assert.equal(report.results.length, INTEROP_TEST_CASES.length);
      assert.equal(report.profiles.length, INTEROP_PROFILES.length);
    });
  });
});
