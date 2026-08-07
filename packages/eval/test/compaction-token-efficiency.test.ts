import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKENIZER_TARGETS,
  EFFICIENCY_METRICS,
  simulateTokenEfficiency,
  runCompactionTokenEfficiencySuite,
} from '../src/compaction-token-efficiency.js';

describe('compaction-token-efficiency', () => {
  describe('constants', () => {
    it('has 5 tokenizer targets', () => {
      assert.equal(TOKENIZER_TARGETS.length, 5);
    });

    it('has 5 efficiency metrics', () => {
      assert.equal(EFFICIENCY_METRICS.length, 5);
    });

    it('tokenizer names are unique', () => {
      const names = TOKENIZER_TARGETS.map(t => t.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = EFFICIENCY_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateTokenEfficiency', () => {
    it('returns valid result', () => {
      const r = simulateTokenEfficiency(TOKENIZER_TARGETS[0]!, EFFICIENCY_METRICS[0]!);
      assert.equal(typeof r.measured, 'number');
      assert.equal(typeof r.meetsSlo, 'boolean');
      assert.equal(typeof r.savingsPositive, 'boolean');
      assert.equal(typeof r.overheadBounded, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateTokenEfficiency(TOKENIZER_TARGETS[0]!, EFFICIENCY_METRICS[0]!);
      const b = simulateTokenEfficiency(TOKENIZER_TARGETS[0]!, EFFICIENCY_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('savings always positive', () => {
      for (const tok of TOKENIZER_TARGETS) {
        for (const met of EFFICIENCY_METRICS) {
          const r = simulateTokenEfficiency(tok, met);
          assert.equal(r.savingsPositive, true);
        }
      }
    });

    it('overhead always bounded', () => {
      for (const tok of TOKENIZER_TARGETS) {
        for (const met of EFFICIENCY_METRICS) {
          const r = simulateTokenEfficiency(tok, met);
          assert.equal(r.overheadBounded, true);
        }
      }
    });
  });

  describe('runCompactionTokenEfficiencySuite', () => {
    it('produces correct total tests (5 × 5)', () => {
      const report = runCompactionTokenEfficiencySuite();
      assert.equal(report.totalTests, 5 * 5);
    });

    it('has 5 tokenizer summaries', () => {
      const report = runCompactionTokenEfficiencySuite();
      assert.equal(report.tokenizerSummaries.length, 5);
    });

    it('all savings positive', () => {
      const report = runCompactionTokenEfficiencySuite();
      assert.equal(report.allSavingsPositive, true);
    });

    it('all overhead bounded', () => {
      const report = runCompactionTokenEfficiencySuite();
      assert.equal(report.allOverheadBounded, true);
    });

    it('verdict is efficient or marginal', () => {
      const report = runCompactionTokenEfficiencySuite();
      assert.ok(report.verdict === 'efficient' || report.verdict === 'marginal');
    });

    it('accepts custom inputs', () => {
      const report = runCompactionTokenEfficiencySuite(
        TOKENIZER_TARGETS.slice(0, 2),
        EFFICIENCY_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
