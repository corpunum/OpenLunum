import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPACTION_QUALITY_GATES,
  CONTEXT_MODES,
  evaluateGate,
  runCompactionGateValidation,
  type CompactionQualityGate,
} from '../src/compaction-gate-validation.js';

describe('compaction-gate-validation', () => {
  describe('COMPACTION_QUALITY_GATES', () => {
    it('has 5 entries', () => {
      assert.equal(COMPACTION_QUALITY_GATES.length, 5);
    });

    it('has the expected gate ids', () => {
      const ids = COMPACTION_QUALITY_GATES.map(g => g.id).sort();
      assert.deepEqual(ids, [
        'cost-efficiency',
        'latency-budget',
        'minimum-compression',
        'preservation-floor',
        'regression-guard',
      ]);
    });

    it('minimum-compression gate requires at least 30% savings', () => {
      const gate = COMPACTION_QUALITY_GATES.find(g => g.id === 'minimum-compression')!;
      assert.equal(gate.threshold, 0.30);
      assert.equal(gate.direction, 'gte');
    });

    it('preservation-floor gate requires at least 90% preservation', () => {
      const gate = COMPACTION_QUALITY_GATES.find(g => g.id === 'preservation-floor')!;
      assert.equal(gate.threshold, 0.90);
      assert.equal(gate.direction, 'gte');
    });

    it('latency-budget gate caps at 2x natural mode', () => {
      const gate = COMPACTION_QUALITY_GATES.find(g => g.id === 'latency-budget')!;
      assert.equal(gate.threshold, 2.0);
      assert.equal(gate.direction, 'lte');
    });
  });

  describe('CONTEXT_MODES', () => {
    it('has 3 entries', () => {
      assert.equal(CONTEXT_MODES.length, 3);
    });

    it('has natural, lunum, mixed modes', () => {
      const modes = CONTEXT_MODES.map(m => m.mode).sort();
      assert.deepEqual(modes, ['lunum', 'mixed', 'natural']);
    });

    it('natural mode has compactionApplied false, others true', () => {
      const natural = CONTEXT_MODES.find(m => m.mode === 'natural')!;
      const lunum = CONTEXT_MODES.find(m => m.mode === 'lunum')!;
      const mixed = CONTEXT_MODES.find(m => m.mode === 'mixed')!;
      assert.equal(natural.compactionApplied, false);
      assert.equal(lunum.compactionApplied, true);
      assert.equal(mixed.compactionApplied, true);
    });
  });

  describe('evaluateGate', () => {
    it('returns a valid result with margin for every gate/mode pair', () => {
      for (const gate of COMPACTION_QUALITY_GATES) {
        for (const modeDescriptor of CONTEXT_MODES) {
          const result = evaluateGate(gate, modeDescriptor.mode);
          assert.equal(result.gateId, gate.id);
          assert.equal(result.mode, modeDescriptor.mode);
          assert.equal(typeof result.score, 'number');
          assert.equal(result.threshold, gate.threshold);
          assert.equal(result.direction, gate.direction);
          assert.equal(typeof result.passed, 'boolean');
          assert.equal(typeof result.margin, 'number');
          assert.ok(Number.isFinite(result.margin));
        }
      }
    });

    it('is deterministic across repeated calls', () => {
      const gate = COMPACTION_QUALITY_GATES.find(g => g.id === 'preservation-floor')!;
      const first = evaluateGate(gate, 'lunum');
      const second = evaluateGate(gate, 'lunum');
      assert.equal(first.score, second.score);
      assert.equal(first.passed, second.passed);
      assert.equal(first.margin, second.margin);
    });

    it('margin is positive when passing and negative when failing', () => {
      const gate = COMPACTION_QUALITY_GATES.find(g => g.id === 'minimum-compression')!;
      const naturalResult = evaluateGate(gate, 'natural');
      assert.equal(naturalResult.passed, false);
      assert.ok(naturalResult.margin < 0, `Expected negative margin, got ${naturalResult.margin}`);

      const lunumResult = evaluateGate(gate, 'lunum');
      assert.equal(lunumResult.passed, true);
      assert.ok(lunumResult.margin > 0, `Expected positive margin, got ${lunumResult.margin}`);
    });

    it('does not use Math.random (scores match across fresh evaluation)', () => {
      const gate = COMPACTION_QUALITY_GATES.find(g => g.id === 'cost-efficiency')!;
      const scores = new Set<number>();
      for (let i = 0; i < 5; i++) {
        scores.add(evaluateGate(gate, 'mixed').score);
      }
      assert.equal(scores.size, 1, 'Expected identical score across repeated evaluations');
    });
  });

  describe('runCompactionGateValidation', () => {
    it('produces the correct structure', () => {
      const report = runCompactionGateValidation();
      assert.ok(typeof report.timestamp === 'string' && report.timestamp.length > 0);
      assert.equal(report.gates.length, 5);
      assert.equal(report.modes.length, 3);
      assert.equal(report.results.length, 15); // 5 gates x 3 modes
      assert.equal(report.modeSummaries.length, 3);
      assert.equal(report.totalEvaluations, 15);
      assert.equal(report.totalPassed + report.totalFailed, report.totalEvaluations);
      assert.ok(['ready', 'partial', 'not-ready'].includes(report.verdict));
    });

    it('accepts custom gates and modes', () => {
      const customGates: readonly CompactionQualityGate[] = [
        COMPACTION_QUALITY_GATES.find(g => g.id === 'preservation-floor')!,
      ];
      const customModes = CONTEXT_MODES.filter(m => m.mode !== 'mixed');
      const report = runCompactionGateValidation(customGates, customModes);
      assert.equal(report.gates.length, 1);
      assert.equal(report.modes.length, 2);
      assert.equal(report.results.length, 2);
    });

    it('lunum and mixed modes pass the minimum-compression gate', () => {
      const report = runCompactionGateValidation();
      const lunumCompression = report.results.find(
        r => r.mode === 'lunum' && r.gateId === 'minimum-compression',
      )!;
      const mixedCompression = report.results.find(
        r => r.mode === 'mixed' && r.gateId === 'minimum-compression',
      )!;
      assert.equal(lunumCompression.passed, true, `lunum compression should pass, margin=${lunumCompression.margin}`);
      assert.equal(mixedCompression.passed, true, `mixed compression should pass, margin=${mixedCompression.margin}`);
    });

    it('natural mode shows no compression benefit and fails the compression gate', () => {
      const report = runCompactionGateValidation();
      const naturalCompression = report.results.find(
        r => r.mode === 'natural' && r.gateId === 'minimum-compression',
      )!;
      assert.equal(naturalCompression.score, 0);
      assert.equal(naturalCompression.passed, false);
    });

    it('per-mode summaries have correct gate counts', () => {
      const report = runCompactionGateValidation();
      for (const summary of report.modeSummaries) {
        assert.equal(summary.totalGates, 5);
        assert.equal(summary.passedGates + summary.failedGates, summary.totalGates);
        assert.equal(summary.failingGateIds.length, summary.failedGates);
        assert.equal(summary.allPassed, summary.failedGates === 0);
      }
    });

    it('overall verdict reflects mode summaries for compaction-applying modes', () => {
      const report = runCompactionGateValidation();
      const lunumSummary = report.modeSummaries.find(s => s.mode === 'lunum')!;
      const mixedSummary = report.modeSummaries.find(s => s.mode === 'mixed')!;

      if (lunumSummary.allPassed && mixedSummary.allPassed) {
        assert.equal(report.verdict, 'ready');
      } else if (!lunumSummary.allPassed && !mixedSummary.allPassed) {
        assert.equal(report.verdict, 'not-ready');
      } else {
        assert.equal(report.verdict, 'partial');
      }
    });
  });
});
