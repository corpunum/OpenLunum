import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_THRESHOLD_DECISIONS,
  buildThresholdRegistry,
  computeRegistryHash,
  getActiveThreshold,
  validateDecisionChain,
  canSupersede,
  type ThresholdDecision,
} from '../src/threshold-calibration.js';

describe('threshold-calibration', () => {
  describe('CURRENT_THRESHOLD_DECISIONS', () => {
    it('has at least one frozen decision', () => {
      const frozen = CURRENT_THRESHOLD_DECISIONS.filter(d => d.status === 'frozen');
      assert.ok(frozen.length >= 1);
    });

    it('similarity-default is frozen at 0.8', () => {
      const d = CURRENT_THRESHOLD_DECISIONS.find(d => d.thresholdId === 'similarity-default');
      assert.ok(d);
      assert.equal(d.value, 0.8);
      assert.equal(d.status, 'frozen');
    });

    it('all decisions have evidence sources', () => {
      for (const d of CURRENT_THRESHOLD_DECISIONS) {
        assert.ok(d.evidenceSources.length > 0, `${d.thresholdId} has no evidence`);
      }
    });

    it('all decisions have constraints', () => {
      for (const d of CURRENT_THRESHOLD_DECISIONS) {
        assert.ok(d.constraints.length > 0, `${d.thresholdId} has no constraints`);
      }
    });
  });

  describe('buildThresholdRegistry', () => {
    it('creates a registry with integrity hash', () => {
      const registry = buildThresholdRegistry(CURRENT_THRESHOLD_DECISIONS);
      assert.equal(registry.version, '1.0');
      assert.ok(registry.integrityHash.length > 0);
      assert.ok(registry.frozenAt);
    });

    it('hash is deterministic', () => {
      const h1 = computeRegistryHash(CURRENT_THRESHOLD_DECISIONS);
      const h2 = computeRegistryHash(CURRENT_THRESHOLD_DECISIONS);
      assert.equal(h1, h2);
    });
  });

  describe('getActiveThreshold', () => {
    it('returns frozen decision for similarity-default', () => {
      const result = getActiveThreshold(CURRENT_THRESHOLD_DECISIONS, 'similarity-default');
      assert.ok(result);
      assert.equal(result.value, 0.8);
      assert.equal(result.status, 'frozen');
    });

    it('returns null for unknown threshold', () => {
      const result = getActiveThreshold(CURRENT_THRESHOLD_DECISIONS, 'nonexistent');
      assert.equal(result, null);
    });

    it('prefers frozen over accepted', () => {
      const decisions: ThresholdDecision[] = [
        {
          thresholdId: 'test',
          value: 0.5,
          status: 'accepted',
          rationale: 'test',
          evidenceSources: ['a'],
          decisionDate: '2026-01-01',
          decisionOwner: 'test',
          supersedes: null,
          constraints: ['none'],
        },
        {
          thresholdId: 'test',
          value: 0.6,
          status: 'frozen',
          rationale: 'test',
          evidenceSources: ['b'],
          decisionDate: '2026-02-01',
          decisionOwner: 'test',
          supersedes: null,
          constraints: ['none'],
        },
      ];
      const result = getActiveThreshold(decisions, 'test');
      assert.ok(result);
      assert.equal(result.value, 0.6);
    });
  });

  describe('validateDecisionChain', () => {
    it('current decisions are valid', () => {
      const result = validateDecisionChain(CURRENT_THRESHOLD_DECISIONS);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('rejects out-of-range values', () => {
      const bad: ThresholdDecision[] = [{
        thresholdId: 'bad',
        value: 1.5,
        status: 'proposed',
        rationale: 'bad',
        evidenceSources: ['x'],
        decisionDate: '2026-01-01',
        decisionOwner: 'test',
        supersedes: null,
        constraints: ['none'],
      }];
      const result = validateDecisionChain(bad);
      assert.equal(result.valid, false);
    });

    it('rejects missing evidence', () => {
      const bad: ThresholdDecision[] = [{
        thresholdId: 'bad',
        value: 0.5,
        status: 'proposed',
        rationale: 'bad',
        evidenceSources: [],
        decisionDate: '2026-01-01',
        decisionOwner: 'test',
        supersedes: null,
        constraints: ['none'],
      }];
      const result = validateDecisionChain(bad);
      assert.equal(result.valid, false);
    });
  });

  describe('canSupersede', () => {
    const existing: ThresholdDecision = {
      thresholdId: 'similarity-default',
      value: 0.8,
      status: 'frozen',
      rationale: 'original',
      evidenceSources: ['a'],
      decisionDate: '2026-01-01',
      decisionOwner: 'test',
      supersedes: null,
      constraints: ['none'],
    };

    it('allows frozen-to-frozen supersession', () => {
      const replacement: ThresholdDecision = {
        ...existing,
        value: 0.85,
        decisionDate: '2026-06-01',
        supersedes: '2026-01-01',
        evidenceSources: ['b'],
      };
      const result = canSupersede(existing, replacement);
      assert.equal(result.allowed, true);
    });

    it('rejects frozen-to-proposed supersession', () => {
      const replacement: ThresholdDecision = {
        ...existing,
        value: 0.85,
        status: 'proposed',
        decisionDate: '2026-06-01',
        supersedes: '2026-01-01',
        evidenceSources: ['b'],
      };
      const result = canSupersede(existing, replacement);
      assert.equal(result.allowed, false);
    });

    it('rejects different threshold IDs', () => {
      const replacement: ThresholdDecision = {
        ...existing,
        thresholdId: 'other',
        supersedes: '2026-01-01',
      };
      const result = canSupersede(existing, replacement);
      assert.equal(result.allowed, false);
    });

    it('rejects missing supersedes reference', () => {
      const replacement: ThresholdDecision = {
        ...existing,
        value: 0.85,
        decisionDate: '2026-06-01',
        supersedes: '2026-02-01',
        evidenceSources: ['b'],
      };
      const result = canSupersede(existing, replacement);
      assert.equal(result.allowed, false);
    });
  });
});
