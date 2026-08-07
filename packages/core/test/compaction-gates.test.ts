import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPACTION_THRESHOLDS,
  evaluateCompactionGates,
  isCompactionSafe,
  compactionGatePolicyFromHardGates,
  type FallbackQualityInput,
  type CompactionGateThresholds,
} from '../src/compaction-gates.js';
import { DEFAULT_HARD_GATE_POLICY } from '../src/hard-gates.js';

const PERFECT_INPUT: FallbackQualityInput = {
  semanticPreservationScore: 1.0,
  literalPreservationRate: 1.0,
  rolePreservationRate: 1.0,
  safetyInvariantPassRate: 1.0,
};

describe('compaction-gates', () => {
  describe('DEFAULT_COMPACTION_THRESHOLDS', () => {
    it('has four thresholds', () => {
      assert.equal(Object.keys(DEFAULT_COMPACTION_THRESHOLDS).length, 4);
    });

    it('all thresholds are between 0 and 1', () => {
      for (const v of Object.values(DEFAULT_COMPACTION_THRESHOLDS)) {
        assert.ok(v >= 0 && v <= 1, `threshold ${v} out of range`);
      }
    });

    it('safety invariant pass rate is 1.0', () => {
      assert.equal(DEFAULT_COMPACTION_THRESHOLDS.safetyInvariantPassRate, 1.0);
    });
  });

  describe('evaluateCompactionGates', () => {
    it('returns compact verdict when all gates pass', () => {
      const report = evaluateCompactionGates(PERFECT_INPUT);
      assert.equal(report.verdict, 'compact');
      assert.equal(report.allPassed, true);
      assert.equal(report.fallbackRequired, false);
      assert.equal(report.results.length, 4);
    });

    it('returns fallback-natural when semantic preservation fails', () => {
      const input: FallbackQualityInput = { ...PERFECT_INPUT, semanticPreservationScore: 0.5 };
      const report = evaluateCompactionGates(input);
      assert.equal(report.verdict, 'fallback-natural');
      assert.equal(report.allPassed, false);
      assert.equal(report.fallbackRequired, true);
    });

    it('returns fallback-natural when literal preservation fails', () => {
      const input: FallbackQualityInput = { ...PERFECT_INPUT, literalPreservationRate: 0.5 };
      const report = evaluateCompactionGates(input);
      assert.equal(report.verdict, 'fallback-natural');
    });

    it('returns fallback-natural when role preservation fails', () => {
      const input: FallbackQualityInput = { ...PERFECT_INPUT, rolePreservationRate: 0.5 };
      const report = evaluateCompactionGates(input);
      assert.equal(report.verdict, 'fallback-natural');
    });

    it('returns blocked when safety invariant fails', () => {
      const input: FallbackQualityInput = { ...PERFECT_INPUT, safetyInvariantPassRate: 0.9 };
      const report = evaluateCompactionGates(input);
      assert.equal(report.verdict, 'blocked');
      assert.equal(report.allPassed, false);
    });

    it('blocked takes priority over fallback-natural', () => {
      const input: FallbackQualityInput = {
        semanticPreservationScore: 0.5,
        literalPreservationRate: 0.5,
        rolePreservationRate: 0.5,
        safetyInvariantPassRate: 0.5,
      };
      const report = evaluateCompactionGates(input);
      assert.equal(report.verdict, 'blocked');
    });

    it('accepts custom thresholds', () => {
      const lenient: CompactionGateThresholds = {
        semanticPreservation: 0.5,
        literalPreservation: 0.5,
        rolePreservation: 0.5,
        safetyInvariantPassRate: 0.5,
      };
      const input: FallbackQualityInput = {
        semanticPreservationScore: 0.6,
        literalPreservationRate: 0.6,
        rolePreservationRate: 0.6,
        safetyInvariantPassRate: 0.6,
      };
      const report = evaluateCompactionGates(input, lenient);
      assert.equal(report.verdict, 'compact');
      assert.equal(report.allPassed, true);
    });

    it('each result has gate name, threshold, actual, and passed', () => {
      const report = evaluateCompactionGates(PERFECT_INPUT);
      for (const r of report.results) {
        assert.equal(typeof r.gate, 'string');
        assert.equal(typeof r.threshold, 'number');
        assert.equal(typeof r.actual, 'number');
        assert.equal(typeof r.passed, 'boolean');
      }
    });

    it('boundary: exactly at threshold passes', () => {
      const input: FallbackQualityInput = {
        semanticPreservationScore: DEFAULT_COMPACTION_THRESHOLDS.semanticPreservation,
        literalPreservationRate: DEFAULT_COMPACTION_THRESHOLDS.literalPreservation,
        rolePreservationRate: DEFAULT_COMPACTION_THRESHOLDS.rolePreservation,
        safetyInvariantPassRate: DEFAULT_COMPACTION_THRESHOLDS.safetyInvariantPassRate,
      };
      const report = evaluateCompactionGates(input);
      assert.equal(report.verdict, 'compact');
    });
  });

  describe('isCompactionSafe', () => {
    it('returns true for perfect input', () => {
      assert.equal(isCompactionSafe(PERFECT_INPUT), true);
    });

    it('returns false when any gate fails', () => {
      assert.equal(isCompactionSafe({ ...PERFECT_INPUT, semanticPreservationScore: 0.1 }), false);
    });
  });

  describe('compactionGatePolicyFromHardGates', () => {
    it('derives thresholds from hard gate policy', () => {
      const thresholds = compactionGatePolicyFromHardGates(DEFAULT_HARD_GATE_POLICY);
      assert.equal(typeof thresholds.semanticPreservation, 'number');
      assert.equal(thresholds.safetyInvariantPassRate, 1.0);
      assert.ok(thresholds.semanticPreservation > 0);
    });

    it('semantic preservation uses min of recall and precision', () => {
      const thresholds = compactionGatePolicyFromHardGates({
        featureRecallThreshold: 0.80,
        featurePrecisionThreshold: 0.90,
        enforcedInvariantCodes: [],
      });
      assert.equal(thresholds.semanticPreservation, 0.80);
    });
  });
});
