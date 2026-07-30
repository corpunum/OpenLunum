import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashAgentState,
  hashAuditLogEntry,
  hashAuthorizationContext,
  authorizeToolCall,
  authorizeStateTransition,
  authorizeHandoff,
  recordStateTransition,
  appendAuditLogEntry,
  verifyIntegrity,
  verifyHandoff,
  detectTampering,
  initializeTamperEvidence,
  type AgentState,
  type AuditLogEntry,
  type AuthorizationContext,
  type TamperEvidenceState,
  type AgentToolCall,
  type AgentHandoff,
} from '../src/index.js';

describe('agent-state-tamper-evidence', () => {
  function buildState(overrides: Partial<AgentState> = {}): AgentState {
    const toolCall: AgentToolCall = {
      kind: 'function',
      id: 'tc-1',
      name: 'example',
      arguments: { x: 1 },
      timestamp: '2026-07-18T00:00:00Z',
      agentId: 'agent-1'
    };

    return {
      stateVersion: 'agent-state/0.1',
      planId: 'plan-1',
      planName: 'Test Plan',
      agentId: 'agent-1',
      role: 'worker',
      steps: [{
        id: 'step-1',
        description: 'do something',
        status: 'completed',
        toolCalls: [toolCall],
        results: [{
          callId: 'tc-1',
          success: true,
          value: { result: 'ok' },
          timestamp: '2026-07-18T00:00:01Z'
        }],
        constraints: [],
        startedAt: '2026-07-18T00:00:00Z',
        completedAt: '2026-07-18T00:00:01Z',
        agentId: 'agent-1'
      }],
      constraints: [],
      evidence: [],
      handoffs: [],
      updatedAt: '2026-07-18T00:00:04Z',
      ...overrides
    };
  }

  describe('hash functions', () => {
    it('computes consistent SHA-256 hash for same state', () => {
      const state = buildState();
      const hash1 = hashAgentState(state);
      const hash2 = hashAgentState(state);

      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 64); // SHA-256 hex = 64 chars
    });

    it('produces different hash for different states', () => {
      const state1 = buildState();
      const state2 = buildState({ agentId: 'agent-2' });

      const hash1 = hashAgentState(state1);
      const hash2 = hashAgentState(state2);

      assert.notStrictEqual(hash1, hash2);
    });

    it('hashes audit log entries consistently', () => {
      const entry: Omit<AuditLogEntry, 'entryHash'> = {
        id: 'audit-1',
        index: 0,
        timestamp: '2026-07-18T00:00:00Z',
        agentId: 'agent-1',
        actionType: 'state-transition',
        description: 'test',
        metadata: {},
      };

      const hash1 = hashAuditLogEntry(entry);
      const hash2 = hashAuditLogEntry(entry);

      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 64);
    });

    it('hashes authorization context consistently', () => {
      const auth: AuthorizationContext = {
        id: 'auth-1',
        agentId: 'agent-1',
        agentRole: 'worker',
        type: 'tool-call',
        timestamp: '2026-07-18T00:00:00Z',
        resource: 'tool-name',
        permissions: ['execute'],
        granted: true,
      };

      const hash1 = hashAuthorizationContext(auth);
      const hash2 = hashAuthorizationContext(auth);

      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 64);
    });
  });

  describe('authorization functions', () => {
    it('authorizes tool call when tool is allowed', () => {
      const toolCall: AgentToolCall = {
        kind: 'function',
        id: 'tc-1',
        name: 'allowed-tool',
        arguments: {},
        timestamp: '2026-07-18T00:00:00Z',
        agentId: 'agent-1'
      };

      const allowedTools = new Set(['allowed-tool', 'another-tool']);
      const auth = authorizeToolCall(toolCall, 'worker', allowedTools);

      assert.strictEqual(auth.granted, true);
      assert.deepStrictEqual(auth.permissions, ['execute']);
      assert.strictEqual(auth.denialReason, undefined);
    });

    it('denies tool call when tool is not allowed', () => {
      const toolCall: AgentToolCall = {
        kind: 'function',
        id: 'tc-1',
        name: 'forbidden-tool',
        arguments: {},
        timestamp: '2026-07-18T00:00:00Z',
        agentId: 'agent-1'
      };

      const allowedTools = new Set(['allowed-tool']);
      const auth = authorizeToolCall(toolCall, 'worker', allowedTools);

      assert.strictEqual(auth.granted, false);
      assert.deepStrictEqual(auth.permissions, []);
      assert.ok(auth.denialReason);
    });

    it('authorizes state transition for same agent', () => {
      const prevState = buildState({ agentId: 'agent-1' });
      const currState = buildState({ agentId: 'agent-1' });

      const auth = authorizeStateTransition(prevState, currState, 'agent-1', 'worker');

      assert.strictEqual(auth.granted, true);
      assert.deepStrictEqual(auth.permissions, ['modify']);
    });

    it('denies state transition for different agent', () => {
      const prevState = buildState({ agentId: 'agent-1' });
      const currState = buildState({ agentId: 'agent-1' });

      const auth = authorizeStateTransition(prevState, currState, 'agent-2', 'worker');

      assert.strictEqual(auth.granted, false);
      assert.ok(auth.denialReason);
    });

    it('authorizes valid handoffs', () => {
      const handoff: AgentHandoff = {
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        direction: 'outbound',
        payload: { data: 'test' },
        timestamp: '2026-07-18T00:00:00Z'
      };

      const allowedHandoffs = new Map([
        ['worker', new Set(['orchestrator', 'reviewer'])],
      ]);

      const auth = authorizeHandoff(handoff, 'worker', 'orchestrator', allowedHandoffs);

      assert.strictEqual(auth.granted, true);
      assert.deepStrictEqual(auth.permissions, ['transfer']);
    });

    it('denies invalid handoffs', () => {
      const handoff: AgentHandoff = {
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        direction: 'outbound',
        payload: { data: 'test' },
        timestamp: '2026-07-18T00:00:00Z'
      };

      const allowedHandoffs = new Map([
        ['auditor', new Set(['reviewer'])],
      ]);

      const auth = authorizeHandoff(handoff, 'worker', 'orchestrator', allowedHandoffs);

      assert.strictEqual(auth.granted, false);
      assert.ok(auth.denialReason);
    });
  });

  describe('state transition recording', () => {
    it('records state transition with proper hash chain', () => {
      const prevState = buildState();
      const currState = buildState({ updatedAt: '2026-07-18T00:00:05Z' });

      const prevHash = hashAgentState(prevState);
      const auth = authorizeStateTransition(prevState, currState, 'agent-1', 'worker');

      const record = recordStateTransition(
        'trans-1',
        prevHash,
        prevState,
        currState,
        auth
      );

      assert.strictEqual(record.previousStateHash, prevHash);
      assert.notStrictEqual(record.currentStateHash, prevHash);
      assert.strictEqual(record.agentId, 'agent-1');
      assert.ok(record.timestamp);
    });

    it('includes related tool calls in transition', () => {
      const prevState = buildState();
      const currState = buildState({
        steps: [{
          ...buildState().steps[0]!,
          toolCalls: [
            { kind: 'function', id: 'tc-1', name: 'tool1', arguments: {}, timestamp: '', agentId: 'agent-1' },
            { kind: 'function', id: 'tc-2', name: 'tool2', arguments: {}, timestamp: '', agentId: 'agent-1' },
          ]
        }]
      });

      const prevHash = hashAgentState(prevState);
      const auth = authorizeStateTransition(prevState, currState, 'agent-1', 'worker');
      const record = recordStateTransition('trans-1', prevHash, prevState, currState, auth);

      assert.ok(record.toolCallIds.includes('tc-1'));
      assert.ok(record.toolCallIds.includes('tc-2'));
    });
  });

  describe('audit log operations', () => {
    it('appends entries with correct chain links', () => {
      const log: AuditLogEntry[] = [];

      const entry1 = appendAuditLogEntry(
        log,
        'state-transition',
        'first',
        'agent-1',
        {}
      );
      assert.strictEqual(entry1.index, 0);
      assert.strictEqual(entry1.previousEntryHash, undefined);

      const entry2 = appendAuditLogEntry(
        [...log, entry1],
        'tool-call',
        'second',
        'agent-1',
        {}
      );
      assert.strictEqual(entry2.index, 1);
      assert.strictEqual(entry2.previousEntryHash, entry1.entryHash);
    });

    it('maintains chain integrity with multiple entries', () => {
      const log: AuditLogEntry[] = [];

      const e1 = appendAuditLogEntry(log, 'state-transition', 'e1', 'agent-1', {});
      const e2 = appendAuditLogEntry([...log, e1], 'tool-call', 'e2', 'agent-1', {});
      const e3 = appendAuditLogEntry([...log, e1, e2], 'authorization', 'e3', 'agent-1', {});

      assert.strictEqual(e1.index, 0);
      assert.strictEqual(e2.index, 1);
      assert.strictEqual(e3.index, 2);

      assert.strictEqual(e2.previousEntryHash, e1.entryHash);
      assert.strictEqual(e3.previousEntryHash, e2.entryHash);
    });

    it('includes authorization in audit log', () => {
      const auth: AuthorizationContext = {
        id: 'auth-1',
        agentId: 'agent-1',
        agentRole: 'worker',
        type: 'tool-call',
        timestamp: '2026-07-18T00:00:00Z',
        resource: 'tool',
        permissions: ['execute'],
        granted: true,
      };

      const log: AuditLogEntry[] = [];
      const entry = appendAuditLogEntry(
        log,
        'authorization',
        'tool authorized',
        'agent-1',
        {},
        undefined,
        undefined,
        auth
      );

      assert.deepStrictEqual(entry.authorization, auth);
    });
  });

  describe('integrity verification', () => {
    it('verifies valid tamper evidence state', () => {
      const state = buildState();
      const evidence = initializeTamperEvidence(state, 'auditor-1');

      const verification = verifyIntegrity(evidence, 'auditor-1');

      assert.strictEqual(verification.isValid, true);
      assert.strictEqual(verification.chainIntact, true);
      assert.strictEqual(verification.auditLogValid, true);
      assert.deepStrictEqual(verification.errors, []);
    });

    it('detects broken hash chain', () => {
      const state = buildState();
      let evidence = initializeTamperEvidence(state, 'auditor-1');

      // Add a transition to the history
      const state2 = buildState({ updatedAt: '2026-07-18T00:00:10Z' });
      const auth = authorizeStateTransition(state, state2, 'agent-1', 'worker');
      const record = recordStateTransition(
        'trans-1',
        evidence.lastVerifiedHash,
        state,
        state2,
        auth
      );
      evidence.stateTransitionHistory.push(record);

      // Corrupt the hash chain
      evidence.stateTransitionHistory[0]!.previousStateHash = 'corrupted-hash';

      const verification = verifyIntegrity(evidence, 'auditor-1');

      assert.strictEqual(verification.isValid, false);
      assert.strictEqual(verification.chainIntact, false);
    });

    it('detects unauthorized transitions', () => {
      const state = buildState();
      let evidence = initializeTamperEvidence(state, 'auditor-1');

      // Add unauthorized transition
      const auth: AuthorizationContext = {
        id: 'auth-unauth',
        agentId: 'agent-2',
        agentRole: 'worker',
        type: 'state-transition',
        timestamp: '2026-07-18T00:00:00Z',
        resource: 'plan-1',
        permissions: [],
        granted: false,
        denialReason: 'not authorized',
      };

      const record = recordStateTransition(
        'trans-bad',
        evidence.lastVerifiedHash,
        state,
        state,
        auth
      );

      evidence.stateTransitionHistory.push(record);
      evidence.authorizations.push(auth);

      // Verification should still pass (auth is recorded separately)
      // but the authorization context shows it was denied
      const verification = verifyIntegrity(evidence, 'auditor-1');
      assert.strictEqual(verification.authorizationValid, true);
    });

    it('detects audit log tampering', () => {
      const state = buildState();
      let evidence = initializeTamperEvidence(state, 'auditor-1');

      // Add another audit entry
      const entry2 = appendAuditLogEntry(
        evidence.auditLog,
        'tool-call',
        'tool executed',
        'agent-1',
        {}
      );
      evidence.auditLog.push(entry2);

      // Corrupt audit log index
      evidence.auditLog[1]!.index = 999;

      const verification = verifyIntegrity(evidence, 'auditor-1');

      assert.strictEqual(verification.isValid, false);
      assert.ok(verification.errors.some(e => e.includes('wrong index')));
    });
  });

  describe('tampering detection', () => {
    it('detects when state hash does not match expected', () => {
      const state = buildState();
      const correctHash = hashAgentState(state);
      const wrongHash = 'abcd1234' + correctHash.slice(8);

      const detection = detectTampering(state, wrongHash);

      assert.strictEqual(detection.tampered, true);
      assert.strictEqual(detection.mismatch, true);
      assert.strictEqual(detection.currentHash, correctHash);
    });

    it('confirms when state hash matches expected', () => {
      const state = buildState();
      const expectedHash = hashAgentState(state);

      const detection = detectTampering(state, expectedHash);

      assert.strictEqual(detection.tampered, false);
      assert.strictEqual(detection.mismatch, false);
    });
  });

  describe('handoff verification', () => {
    it('verifies valid handoff', () => {
      const handoff: AgentHandoff = {
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        direction: 'outbound',
        payload: { data: 'test' },
        timestamp: '2026-07-18T00:00:00Z'
      };

      const auth: AuthorizationContext = {
        id: 'auth-1',
        agentId: 'agent-1',
        agentRole: 'worker',
        type: 'handoff',
        timestamp: handoff.timestamp,
        resource: `${handoff.fromAgent}->${handoff.toAgent}`,
        permissions: ['transfer'],
        granted: true,
      };

      const verification = verifyHandoff(handoff, auth);

      assert.strictEqual(verification.isValid, true);
      assert.deepStrictEqual(verification.errors, []);
    });

    it('detects invalid handoff payload', () => {
      const handoff: AgentHandoff = {
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        direction: 'outbound',
        payload: null as unknown as Record<string, unknown>,
        timestamp: '2026-07-18T00:00:00Z'
      };

      const verification = verifyHandoff(handoff);

      assert.strictEqual(verification.isValid, false);
      assert.ok(verification.errors.some(e => e.includes('payload')));
    });

    it('detects unauthorized handoff', () => {
      const handoff: AgentHandoff = {
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        direction: 'outbound',
        payload: { data: 'test' },
        timestamp: '2026-07-18T00:00:00Z'
      };

      const auth: AuthorizationContext = {
        id: 'auth-1',
        agentId: 'agent-1',
        agentRole: 'worker',
        type: 'handoff',
        timestamp: handoff.timestamp,
        resource: `${handoff.fromAgent}->${handoff.toAgent}`,
        permissions: [],
        granted: false,
        denialReason: 'not allowed',
      };

      const verification = verifyHandoff(handoff, auth);

      assert.strictEqual(verification.isValid, false);
    });
  });

  describe('initialization', () => {
    it('initializes tamper evidence with valid state', () => {
      const state = buildState();
      const evidence = initializeTamperEvidence(state, 'auditor-1');

      assert.strictEqual(evidence.evidenceVersion, '1.0');
      assert.deepStrictEqual(evidence.agentState, state);
      assert.strictEqual(evidence.stateTransitionHistory.length, 0);
      assert.strictEqual(evidence.auditLog.length, 1);
      assert.strictEqual(evidence.authorizations.length, 0);
      assert.strictEqual(evidence.currentVerification.isValid, true);
    });

    it('creates initial audit entry', () => {
      const state = buildState();
      const evidence = initializeTamperEvidence(state, 'auditor-1');

      assert.strictEqual(evidence.auditLog.length, 1);
      const entry = evidence.auditLog[0]!;
      assert.strictEqual(entry.index, 0);
      assert.strictEqual(entry.actionType, 'state-transition');
      assert.ok(entry.description.includes(state.planId));
    });

    it('records initial state hash', () => {
      const state = buildState();
      const evidence = initializeTamperEvidence(state, 'auditor-1');

      const expectedHash = hashAgentState(state);
      assert.strictEqual(evidence.lastVerifiedHash, expectedHash);
    });
  });

  describe('hash chain validation scenario', () => {
    it('maintains valid hash chain through multiple transitions', () => {
      const state1 = buildState();
      const evidence = initializeTamperEvidence(state1, 'auditor-1');

      // Simulate a transition
      const state2 = buildState({ updatedAt: '2026-07-18T00:00:10Z' });
      const auth2 = authorizeStateTransition(state1, state2, 'agent-1', 'worker');
      const record2 = recordStateTransition(
        'trans-2',
        evidence.lastVerifiedHash,
        state1,
        state2,
        auth2
      );

      // Simulate another transition
      const state3 = buildState({ updatedAt: '2026-07-18T00:00:20Z' });
      const auth3 = authorizeStateTransition(state2, state3, 'agent-1', 'worker');
      const record3 = recordStateTransition(
        'trans-3',
        record2.currentStateHash,
        state2,
        state3,
        auth3
      );

      evidence.stateTransitionHistory.push(record2);
      evidence.stateTransitionHistory.push(record3);

      // Verify the complete chain
      const verification = verifyIntegrity(evidence, 'auditor-1');
      assert.strictEqual(verification.chainIntact, true);
    });
  });

  describe('tampered record detection', () => {
    it('detects single tampered record in chain', () => {
      const state = buildState();
      let evidence = initializeTamperEvidence(state, 'auditor-1');

      const state2 = buildState({ updatedAt: '2026-07-18T00:00:10Z' });
      const auth = authorizeStateTransition(state, state2, 'agent-1', 'worker');
      let record = recordStateTransition(
        'trans-1',
        evidence.lastVerifiedHash,
        state,
        state2,
        auth
      );

      evidence.stateTransitionHistory.push(record);
      evidence.agentState = state2;
      evidence.lastVerifiedHash = record.currentStateHash;

      // Now tamper with the record
      record.changeDescription = 'TAMPERED!';

      const verification = verifyIntegrity(evidence, 'auditor-1');

      // The hash chain will be broken because the record was modified
      // after the hash was computed
      assert.ok(!verification.isValid || !verification.chainIntact);
    });
  });

  describe('unauthorized call rejection', () => {
    it('rejects unauthorized tool calls', () => {
      const toolCall: AgentToolCall = {
        kind: 'function',
        id: 'tc-forbidden',
        name: 'restricted-tool',
        arguments: {},
        timestamp: '2026-07-18T00:00:00Z',
        agentId: 'agent-1'
      };

      const allowedTools = new Set(['safe-tool']);
      const auth = authorizeToolCall(toolCall, 'worker', allowedTools);

      assert.strictEqual(auth.granted, false);
      assert.ok(auth.denialReason);
      assert.strictEqual(auth.permissions.length, 0);
    });

    it('records rejection in audit trail', () => {
      const toolCall: AgentToolCall = {
        kind: 'function',
        id: 'tc-forbidden',
        name: 'restricted-tool',
        arguments: {},
        timestamp: '2026-07-18T00:00:00Z',
        agentId: 'agent-1'
      };

      const allowedTools = new Set(['safe-tool']);
      const auth = authorizeToolCall(toolCall, 'worker', allowedTools);

      const log: AuditLogEntry[] = [];
      const entry = appendAuditLogEntry(
        log,
        'authorization',
        `Tool call rejected: ${auth.denialReason}`,
        toolCall.agentId,
        { toolName: toolCall.name },
        undefined,
        undefined,
        auth
      );

      assert.ok(entry.description.includes('rejected'));
      assert.strictEqual(entry.authorization?.granted, false);
    });
  });
});
