import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETENTION_STATE_VERSION,
  DEFAULT_RETENTION_POLICY,
  GDPR_RETENTION_POLICY,
  AUDIT_RETENTION_POLICY,
  resolveRetentionPolicy,
  listRetentionPolicyIds,
  getAllRetentionPolicies,
  computeNextPhase,
  applyRetentionTransition,
  isEligibleForPrivacyDeletion,
  redactForPrivacyClass,
  anonymizeAgentState,
  verifyDeletion,
  purgeAgentState,
  validateRetentionMetadata,
  applyBatchTransitions,
  findDeletionCandidates,
  retentionSummary,
  buildRetentionMetadata,
  type RetentionMetadata,
  type RetentionPolicy,
  type AgentState,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildMetadata(overrides: Partial<RetentionMetadata> = {}): RetentionMetadata {
  const now = new Date().toISOString();
  return {
    retentionVersion: RETENTION_STATE_VERSION,
    policy: {
      policyId: 'default',
      activeTTL: 3600,
      frozenTTL: 86400,
      warmTTL: 172800,
      coldTTL: 2592000,
      privacyClass: 'internal',
      exemptFromPrivacyRequest: false,
      description: 'default policy',
    },
    phase: 'active',
    phaseEnteredAt: now,
    createdAt: now,
    recordHandle: 'handle-123',
    planId: 'plan-1',
    agentId: 'agent-1',
    onHold: false,
    ...overrides,
  };
}

function buildAgentState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    stateVersion: 'agent-state/1.0',
    planId: 'plan-1',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agent-state-retention', () => {

  describe('RETENTION_STATE_VERSION', () => {
    it('exports "agent-retention/1.0"', () => {
      assert.strictEqual(RETENTION_STATE_VERSION, 'agent-retention/1.0');
    });
  });

  describe('built-in policies', () => {
    it('exports DEFAULT_RETENTION_POLICY', () => {
      assert.ok(DEFAULT_RETENTION_POLICY);
      assert.strictEqual(DEFAULT_RETENTION_POLICY.policyId, 'default');
      assert.strictEqual(DEFAULT_RETENTION_POLICY.exemptFromPrivacyRequest, false);
    });

    it('exports GDPR_RETENTION_POLICY', () => {
      assert.ok(GDPR_RETENTION_POLICY);
      assert.strictEqual(GDPR_RETENTION_POLICY.policyId, 'gdpr');
      assert.strictEqual(GDPR_RETENTION_POLICY.privacyClass, 'confidential');
    });

    it('exports AUDIT_RETENTION_POLICY', () => {
      assert.ok(AUDIT_RETENTION_POLICY);
      assert.strictEqual(AUDIT_RETENTION_POLICY.policyId, 'audit');
      assert.strictEqual(AUDIT_RETENTION_POLICY.exemptFromPrivacyRequest, true);
    });
  });

  describe('policy registry', () => {
    it('resolves known policy by id', () => {
      assert.ok(resolveRetentionPolicy('default'));
      assert.ok(resolveRetentionPolicy('gdpr'));
      assert.ok(resolveRetentionPolicy('audit'));
    });

    it('returns undefined for unknown policy', () => {
      assert.strictEqual(resolveRetentionPolicy('nonexistent'), undefined);
    });

    it('listRetentionPolicyIds returns all policy ids', () => {
      const ids = listRetentionPolicyIds();
      assert.ok(ids.includes('default'));
      assert.ok(ids.includes('gdpr'));
      assert.ok(ids.includes('audit'));
    });

    it('getAllRetentionPolicies returns all policies', () => {
      const policies = getAllRetentionPolicies();
      assert.strictEqual(policies.length, 3);
      assert.deepStrictEqual(
        policies.map(p => p.policyId).sort(),
        ['audit', 'default', 'gdpr']
      );
    });
  });

  describe('computeNextPhase', () => {
    it('stays in active when TTL not reached', () => {
      const m = buildMetadata({ phase: 'active', phaseEnteredAt: new Date().toISOString() });
      assert.strictEqual(computeNextPhase(m), 'active');
    });

    it('transitions active → frozen when active TTL elapsed', () => {
      const past = new Date(Date.now() - 86400_000).toISOString(); // 1 day ago
      const m = buildMetadata({
        phase: 'active',
        phaseEnteredAt: past,
      });
      // Override TTL to be very short for this test
      const shortPolicy = { ...m.policy, activeTTL: 1 };
      assert.strictEqual(computeNextPhase({ ...m, policy: shortPolicy }, new Date().toISOString()), 'frozen');
    });

    it('transitions frozen → warm when frozen TTL elapsed', () => {
      const past = new Date(Date.now() - 86400_000).toISOString(); // 1 day ago
      const m = buildMetadata({
        phase: 'frozen',
        phaseEnteredAt: past,
      });
      const shortPolicy = { ...m.policy, frozenTTL: 1 };
      assert.strictEqual(computeNextPhase({ ...m, policy: shortPolicy }, new Date().toISOString()), 'warm');
    });

    it('transitions warm → cold when warm TTL elapsed', () => {
      const past = new Date(Date.now() - 86400_000).toISOString();
      const m = buildMetadata({ phase: 'warm', phaseEnteredAt: past });
      const shortPolicy = { ...m.policy, warmTTL: 1 };
      assert.strictEqual(computeNextPhase({ ...m, policy: shortPolicy }, new Date().toISOString()), 'cold');
    });

    it('transitions cold → deleted when cold TTL elapsed', () => {
      const past = new Date(Date.now() - 86400_000).toISOString();
      const m = buildMetadata({ phase: 'cold', phaseEnteredAt: past });
      const shortPolicy = { ...m.policy, coldTTL: 1 };
      assert.strictEqual(computeNextPhase({ ...m, policy: shortPolicy }, new Date().toISOString()), 'deleted');
    });

    it('stays deleted once deleted', () => {
      const m = buildMetadata({ phase: 'deleted' });
      assert.strictEqual(computeNextPhase(m), 'deleted');
    });

    it('stays in phase when on hold', () => {
      const m = buildMetadata({ phase: 'frozen', onHold: true });
      assert.strictEqual(computeNextPhase(m), 'frozen');
    });
  });

  describe('applyRetentionTransition', () => {
    it('returns phaseChanged=false when no transition', () => {
      const m = buildMetadata({ phase: 'active' });
      const result = applyRetentionTransition(m);
      assert.strictEqual(result.phaseChanged, false);
      assert.strictEqual(result.metadata.phase, 'active');
    });

    it('transitions active → frozen when TTL elapsed', () => {
      const past = new Date(Date.now() - 86400_000).toISOString();
      const m = buildMetadata({ phase: 'active', phaseEnteredAt: past });
      const shortPolicy = { ...m.policy, activeTTL: 1 };
      const result = applyRetentionTransition({ ...m, policy: shortPolicy });
      assert.strictEqual(result.phaseChanged, true);
      assert.strictEqual(result.metadata.phase, 'frozen');
      assert.strictEqual(result.previousPhase, 'active');
    });

    it('annotates deleted phase with trigger and timestamp', () => {
      const past = new Date(Date.now() - 86400_000).toISOString();
      const m = buildMetadata({ phase: 'cold', phaseEnteredAt: past });
      const shortPolicy = { ...m.policy, coldTTL: 1 };
      const result = applyRetentionTransition({
        ...m,
        policy: shortPolicy,
        deletionTrigger: 'ttl-expires',
      });
      assert.strictEqual(result.metadata.phase, 'deleted');
      assert.ok(result.metadata.deletedAt);
    });

    it('does not mutate original metadata', () => {
      const m = buildMetadata({ phase: 'active' });
      const original = JSON.parse(JSON.stringify(m));
      applyRetentionTransition(m);
      assert.deepStrictEqual(m, original);
    });
  });

  describe('isEligibleForPrivacyDeletion', () => {
    it('returns true for active record with non-exempt policy', () => {
      const m = buildMetadata({ phase: 'active' });
      assert.strictEqual(isEligibleForPrivacyDeletion(m), true);
    });

    it('returns true for frozen/warm/cold non-exempt records', () => {
      for (const phase of ['frozen', 'warm', 'cold'] as const) {
        const m = buildMetadata({ phase });
        assert.strictEqual(isEligibleForPrivacyDeletion(m), true);
      }
    });

    it('returns false for deleted records', () => {
      const m = buildMetadata({ phase: 'deleted' });
      assert.strictEqual(isEligibleForPrivacyDeletion(m), false);
    });

    it('returns false when exemptFromPrivacyRequest is true', () => {
      const m = buildMetadata({ phase: 'active' });
      m.policy.exemptFromPrivacyRequest = true;
      assert.strictEqual(isEligibleForPrivacyDeletion(m), false);
    });

    it('returns false when onHold is true', () => {
      const m = buildMetadata({ phase: 'active', onHold: true });
      assert.strictEqual(isEligibleForPrivacyDeletion(m), false);
    });
  });

  describe('redactForPrivacyClass', () => {
    it('does not redact when record class is not stricter', () => {
      const m = buildMetadata({ phase: 'active' });
      m.policy.privacyClass = 'internal';
      const redacted = redactForPrivacyClass(m, 'restricted');
      assert.strictEqual(redacted.recordHandle, 'handle-123');
    });

    it('redacts when record class is stricter than target', () => {
      const m = buildMetadata({ phase: 'active' });
      m.policy.privacyClass = 'restricted';
      const redacted = redactForPrivacyClass(m, 'internal');
      assert.ok(redacted.recordHandle.startsWith('***'));
      assert.ok(redacted.recordHandle.endsWith('-123'));
    });
  });

  describe('anonymizeAgentState', () => {
    it('replaces agentId with hashed placeholder', () => {
      const state = buildAgentState({ agentId: 'my-agent-id' });
      const anonymized = anonymizeAgentState(state, 'salt');
      assert.notStrictEqual(anonymized.agentId, 'my-agent-id');
      assert.ok(anonymized.agentId.startsWith('anon-'));
    });

    it('anonymizes agentId in steps, tool calls, evidence, and handoffs', () => {
      const state = buildAgentState({
        agentId: 'agent-1',
        steps: [{
          id: 'step-1',
          description: 'test',
          status: 'completed',
          toolCalls: [],
          results: [],
          constraints: [],
          agentId: 'agent-1',
        }],
        evidence: [{
          type: 'observation',
          source: 's1',
          content: {},
          timestamp: new Date().toISOString(),
          agentId: 'agent-1',
        }],
        handoffs: [{
          fromAgent: 'agent-1',
          toAgent: 'agent-2',
          direction: 'outbound',
          payload: {},
          timestamp: new Date().toISOString(),
        }],
      });
      const anonymized = anonymizeAgentState(state, 'salt');
      assert.ok(anonymized.steps[0]!.agentId.startsWith('anon-'));
      assert.ok(anonymized.evidence[0]!.agentId.startsWith('anon-'));
      assert.ok(anonymized.handoffs[0]!.fromAgent.startsWith('anon-'));
      assert.ok(anonymized.handoffs[0]!.toAgent.startsWith('anon-'));
    });
  });

  describe('verifyDeletion', () => {
    it('returns clean result for deleted record', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const m = buildMetadata({
        phase: 'deleted',
        deletedAt: past,
        deletionTrigger: 'manual-purge',
      });
      const result = verifyDeletion(m);
      assert.strictEqual(result.actuallyDeleted, true);
      assert.deepStrictEqual(result.issues, []);
    });

    it('fails when phase is not deleted', () => {
      const m = buildMetadata({ phase: 'active' });
      const result = verifyDeletion(m);
      assert.strictEqual(result.actuallyDeleted, false);
      assert.ok(result.issues.some(i => i.includes('not "deleted"')));
    });

    it('fails when deletedAt is missing', () => {
      const m = buildMetadata({ phase: 'deleted' });
      const result = verifyDeletion(m);
      assert.strictEqual(result.actuallyDeleted, false);
      assert.ok(result.issues.some(i => i.includes('deletedAt')));
    });

    it('fails when deletedAt is in the future', () => {
      const future = new Date(Date.now() + 10000).toISOString();
      const m = buildMetadata({ phase: 'deleted', deletedAt: future });
      const result = verifyDeletion(m);
      assert.strictEqual(result.actuallyDeleted, false);
    });
  });

  describe('purgeAgentState', () => {
    it('returns a deleted-phase transition result', () => {
      const m = buildMetadata({ phase: 'frozen' });
      const result = purgeAgentState(m);
      assert.strictEqual(result.metadata.phase, 'deleted');
      assert.strictEqual(result.metadata.deletionTrigger, 'manual-purge');
      assert.ok(result.metadata.deletedAt);
    });
  });

  describe('validateRetentionMetadata', () => {
    it('validates correct metadata', () => {
      const m = buildMetadata();
      const result = validateRetentionMetadata(m);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('rejects non-object', () => {
      const result = validateRetentionMetadata(null as unknown as RetentionMetadata);
      assert.strictEqual(result.ok, false);
    });

    it('rejects wrong retentionVersion', () => {
      const m = buildMetadata({ retentionVersion: 'wrong/1.0' });
      const result = validateRetentionMetadata(m);
      assert.strictEqual(result.ok, false);
    });

    it('rejects missing policy', () => {
      const m = buildMetadata({ policy: undefined as unknown as RetentionPolicy });
      const result = validateRetentionMetadata(m);
      assert.strictEqual(result.ok, false);
    });

    it('rejects invalid phase', () => {
      const m = buildMetadata({ phase: 'nonexistent' as any });
      const result = validateRetentionMetadata(m);
      assert.strictEqual(result.ok, false);
    });

    it('rejects missing recordHandle', () => {
      const m = buildMetadata({ recordHandle: '' });
      const result = validateRetentionMetadata(m);
      assert.strictEqual(result.ok, false);
    });

    it('rejects missing planId', () => {
      const m = buildMetadata({ planId: '' });
      const result = validateRetentionMetadata(m);
      assert.strictEqual(result.ok, false);
    });
  });

  describe('applyBatchTransitions', () => {
    it('transitions each record independently', () => {
      const m1 = buildMetadata({ phase: 'active' });
      const m2 = buildMetadata({ phase: 'frozen' });
      const results = applyBatchTransitions([m1, m2]);
      assert.strictEqual(results.length, 2);
    });

    it('does not mutate originals', () => {
      const m = buildMetadata({ phase: 'active' });
      const original = JSON.parse(JSON.stringify(m));
      applyBatchTransitions([m]);
      assert.deepStrictEqual(m, original);
    });
  });

  describe('findDeletionCandidates', () => {
    it('finds records in cold phase with elapsed TTL', () => {
      const past = new Date(Date.now() - 86400_000).toISOString(); // 1 day ago
      const coldRecord = buildMetadata({ phase: 'cold', phaseEnteredAt: past });
      coldRecord.policy = { ...coldRecord.policy, coldTTL: 1 }; // 1 second TTL
      const activeRecord = buildMetadata({ phase: 'active' });
      const candidates = findDeletionCandidates([coldRecord, activeRecord]);
      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0]!.phase, 'cold');
    });

    it('excludes on-hold records', () => {
      const past = new Date(Date.now() - 86400_000).toISOString();
      const onHoldRecord = buildMetadata({ phase: 'cold', phaseEnteredAt: past, onHold: true });
      const candidates = findDeletionCandidates([onHoldRecord]);
      assert.strictEqual(candidates.length, 0);
    });

    it('finds records transitioning to deleted', () => {
      const past = new Date(Date.now() - 86400_000).toISOString();
      const coldRecord = buildMetadata({ phase: 'cold', phaseEnteredAt: past });
      const shortPolicy = { ...coldRecord.policy, coldTTL: 1 };
      const candidates = findDeletionCandidates([{ ...coldRecord, policy: shortPolicy }]);
      assert.strictEqual(candidates.length, 1);
    });
  });

  describe('retentionSummary', () => {
    it('returns correct counts', () => {
      const m1 = buildMetadata({ phase: 'active' });
      const m2 = buildMetadata({ phase: 'frozen' });
      const m3 = buildMetadata({ phase: 'deleted', onHold: true });
      const summary = retentionSummary([m1, m2, m3]);
      assert.strictEqual(summary.total, 3);
      assert.strictEqual(summary.byPhase.active, 1);
      assert.strictEqual(summary.byPhase.frozen, 1);
      assert.strictEqual(summary.byPhase.deleted, 1);
      assert.strictEqual(summary.onHoldCount, 1);
      assert.strictEqual(summary.deletedCount, 1);
    });
  });

  describe('buildRetentionMetadata', () => {
    it('creates metadata with defaults', () => {
      const m = buildRetentionMetadata({
        recordHandle: 'test-handle',
        planId: 'plan-1',
        agentId: 'agent-1',
      });
      assert.strictEqual(m.retentionVersion, RETENTION_STATE_VERSION);
      assert.strictEqual(m.phase, 'active');
      assert.strictEqual(m.policy, DEFAULT_RETENTION_POLICY);
      assert.strictEqual(m.recordHandle, 'test-handle');
      assert.strictEqual(m.planId, 'plan-1');
      assert.strictEqual(m.agentId, 'agent-1');
    });
  });

  describe('deletion verification integration', () => {
    it('full lifecycle: active → frozen → warm → cold → deleted', () => {
      const m = buildRetentionMetadata({
        recordHandle: 'lifecycle-test',
        planId: 'plan-lifecycle',
        agentId: 'agent-lifecycle',
      });
      // Set short TTLs for testing
      const shortPolicy: RetentionPolicy = {
        ...m.policy,
        activeTTL: 1,
        frozenTTL: 1,
        warmTTL: 1,
        coldTTL: 1,
      };

      const past = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      let current = { ...m, policy: shortPolicy, phaseEnteredAt: past };

      // active → frozen
      let r = applyRetentionTransition(current);
      assert.strictEqual(r.metadata.phase, 'frozen');
      current = r.metadata;

      // frozen → warm
      r = applyRetentionTransition({ ...current, phaseEnteredAt: past });
      assert.strictEqual(r.metadata.phase, 'warm');
      current = r.metadata;

      // warm → cold
      r = applyRetentionTransition({ ...current, phaseEnteredAt: past });
      assert.strictEqual(r.metadata.phase, 'cold');
      current = r.metadata;

      // cold → deleted
      r = applyRetentionTransition({ ...current, phaseEnteredAt: past });
      assert.strictEqual(r.metadata.phase, 'deleted');
      assert.ok(r.metadata.deletedAt);

      // Verify deletion
      const v = verifyDeletion(r.metadata);
      assert.strictEqual(v.actuallyDeleted, true);
      assert.deepStrictEqual(v.issues, []);
    });
  });
});
