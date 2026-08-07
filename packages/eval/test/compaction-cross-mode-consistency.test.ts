import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPACTION_MODES,
  CONSISTENCY_DIMENSIONS,
  simulateCrossModeConsistency,
  runCompactionCrossModeConsistencySuite,
} from '../src/compaction-cross-mode-consistency.js';

describe('compaction-cross-mode-consistency', () => {
  describe('constants', () => {
    it('has 5 compaction modes', () => {
      assert.equal(COMPACTION_MODES.length, 5);
    });

    it('has 6 consistency dimensions', () => {
      assert.equal(CONSISTENCY_DIMENSIONS.length, 6);
    });

    it('mode names are unique', () => {
      const names = COMPACTION_MODES.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('dimension names are unique', () => {
      const names = CONSISTENCY_DIMENSIONS.map(d => d.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateCrossModeConsistency', () => {
    it('returns valid result', () => {
      const r = simulateCrossModeConsistency(COMPACTION_MODES[0]!, COMPACTION_MODES[1]!, CONSISTENCY_DIMENSIONS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.consistent, 'boolean');
      assert.equal(typeof r.semanticEquivalent, 'boolean');
      assert.equal(typeof r.informationLost, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateCrossModeConsistency(COMPACTION_MODES[0]!, COMPACTION_MODES[1]!, CONSISTENCY_DIMENSIONS[0]!);
      const b = simulateCrossModeConsistency(COMPACTION_MODES[0]!, COMPACTION_MODES[1]!, CONSISTENCY_DIMENSIONS[0]!);
      assert.deepEqual(a, b);
    });

    it('always semantically equivalent', () => {
      for (let i = 0; i < COMPACTION_MODES.length; i++) {
        for (let j = i + 1; j < COMPACTION_MODES.length; j++) {
          for (const dim of CONSISTENCY_DIMENSIONS) {
            const r = simulateCrossModeConsistency(COMPACTION_MODES[i]!, COMPACTION_MODES[j]!, dim);
            assert.equal(r.semanticEquivalent, true);
          }
        }
      }
    });

    it('never loses information', () => {
      for (let i = 0; i < COMPACTION_MODES.length; i++) {
        for (let j = i + 1; j < COMPACTION_MODES.length; j++) {
          for (const dim of CONSISTENCY_DIMENSIONS) {
            const r = simulateCrossModeConsistency(COMPACTION_MODES[i]!, COMPACTION_MODES[j]!, dim);
            assert.equal(r.informationLost, false);
          }
        }
      }
    });
  });

  describe('runCompactionCrossModeConsistencySuite', () => {
    it('produces correct total tests (C(5,2) × 6 = 60)', () => {
      const report = runCompactionCrossModeConsistencySuite();
      assert.equal(report.totalTests, 10 * 6);
    });

    it('has 10 pair summaries', () => {
      const report = runCompactionCrossModeConsistencySuite();
      assert.equal(report.pairSummaries.length, 10);
    });

    it('all semantically equivalent', () => {
      const report = runCompactionCrossModeConsistencySuite();
      assert.equal(report.allSemanticallyEquivalent, true);
    });

    it('no information loss', () => {
      const report = runCompactionCrossModeConsistencySuite();
      assert.equal(report.noInformationLoss, true);
    });

    it('verdict is consistent or partial-drift', () => {
      const report = runCompactionCrossModeConsistencySuite();
      assert.ok(report.verdict === 'consistent' || report.verdict === 'partial-drift');
    });

    it('accepts custom inputs', () => {
      const report = runCompactionCrossModeConsistencySuite(
        COMPACTION_MODES.slice(0, 3),
        CONSISTENCY_DIMENSIONS.slice(0, 2),
      );
      assert.equal(report.totalTests, 3 * 2);
    });
  });
});
