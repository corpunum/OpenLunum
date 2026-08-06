import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACK_VECTORS,
  SAFETY_GATES,
  simulateBypassTest,
  runAdversarialBypassSuite,
} from '../src/adversarial-bypass-resistance.js';

describe('adversarial-bypass-resistance', () => {
  describe('constants', () => {
    it('has 6 attack vectors', () => {
      assert.equal(ATTACK_VECTORS.length, 6);
    });

    it('has 5 safety gates', () => {
      assert.equal(SAFETY_GATES.length, 5);
    });

    it('attack names are unique', () => {
      const names = ATTACK_VECTORS.map(a => a.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('gate names are unique', () => {
      const names = SAFETY_GATES.map(g => g.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateBypassTest', () => {
    it('returns valid result', () => {
      const r = simulateBypassTest(ATTACK_VECTORS[0]!, SAFETY_GATES[0]!);
      assert.equal(typeof r.detected, 'boolean');
      assert.equal(typeof r.prevented, 'boolean');
      assert.equal(typeof r.confidenceScore, 'number');
      assert.equal(typeof r.falseNegative, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateBypassTest(ATTACK_VECTORS[0]!, SAFETY_GATES[0]!);
      const b = simulateBypassTest(ATTACK_VECTORS[0]!, SAFETY_GATES[0]!);
      assert.deepEqual(a, b);
    });

    it('undetected implies false negative', () => {
      for (const attack of ATTACK_VECTORS) {
        for (const gate of SAFETY_GATES) {
          const r = simulateBypassTest(attack, gate);
          if (!r.detected) {
            assert.equal(r.falseNegative, true);
          }
        }
      }
    });

    it('undetected implies not prevented', () => {
      for (const attack of ATTACK_VECTORS) {
        for (const gate of SAFETY_GATES) {
          const r = simulateBypassTest(attack, gate);
          if (!r.detected) {
            assert.equal(r.prevented, false);
          }
        }
      }
    });
  });

  describe('runAdversarialBypassSuite', () => {
    it('produces correct total tests (6 × 5)', () => {
      const report = runAdversarialBypassSuite();
      assert.equal(report.totalTests, 6 * 5);
    });

    it('has 5 gate summaries', () => {
      const report = runAdversarialBypassSuite();
      assert.equal(report.gateSummaries.length, 5);
    });

    it('detection rate between 0 and 1', () => {
      const report = runAdversarialBypassSuite();
      assert.ok(report.overallDetectionRate >= 0 && report.overallDetectionRate <= 1);
    });

    it('prevention rate between 0 and 1', () => {
      const report = runAdversarialBypassSuite();
      assert.ok(report.overallPreventionRate >= 0 && report.overallPreventionRate <= 1);
    });

    it('verdict is resistant or partially-resistant', () => {
      const report = runAdversarialBypassSuite();
      assert.ok(report.verdict === 'resistant' || report.verdict === 'partially-resistant');
    });

    it('accepts custom inputs', () => {
      const report = runAdversarialBypassSuite(
        ATTACK_VECTORS.slice(0, 2),
        SAFETY_GATES.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
