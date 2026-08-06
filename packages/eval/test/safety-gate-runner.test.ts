import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAFETY_GATE_TYPES,
  RISK_LEVELS,
  GATE_SCENARIOS,
  simulateGateExecution,
  runSafetyGateSuite,
} from '../src/safety-gate-runner.js';

describe('safety-gate-runner', () => {
  describe('constants', () => {
    it('SAFETY_GATE_TYPES has 7 entries', () => {
      assert.equal(SAFETY_GATE_TYPES.length, 7);
    });

    it('RISK_LEVELS has 4 entries', () => {
      assert.equal(RISK_LEVELS.length, 4);
    });

    it('GATE_SCENARIOS has 5 entries', () => {
      assert.equal(GATE_SCENARIOS.length, 5);
    });

    it('gate types are unique', () => {
      const types = SAFETY_GATE_TYPES.map(g => g.type);
      assert.equal(new Set(types).size, types.length);
    });
  });

  describe('simulateGateExecution', () => {
    it('returns valid result structure', () => {
      const result = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'clear-fail');
      assert.ok(result.confidence >= 0 && result.confidence <= 1);
      assert.ok(result.falsePositiveRisk >= 0 && result.falsePositiveRisk <= 1);
      assert.ok(result.falseNegativeRisk >= 0 && result.falseNegativeRisk <= 1);
    });

    it('is deterministic', () => {
      const a = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'clear-fail');
      const b = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'clear-fail');
      assert.deepEqual(a, b);
    });

    it('clear-fail triggers the gate', () => {
      const result = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'clear-fail');
      assert.equal(result.triggered, true);
    });

    it('valid-pass does not trigger the gate', () => {
      const result = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'valid-pass');
      assert.equal(result.triggered, false);
    });

    it('adversarial has lower confidence than clear-fail', () => {
      const adv = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'adversarial');
      const clear = simulateGateExecution(SAFETY_GATE_TYPES[0]!, 'critical', 'clear-fail');
      assert.ok(adv.confidence <= clear.confidence);
    });
  });

  describe('runSafetyGateSuite', () => {
    it('produces correct total tests', () => {
      const report = runSafetyGateSuite();
      assert.equal(report.totalTests, 7 * 4 * 5);
    });

    it('has 7 gate summaries', () => {
      const report = runSafetyGateSuite();
      assert.equal(report.gateSummaries.length, 7);
    });

    it('has 4 risk summaries', () => {
      const report = runSafetyGateSuite();
      assert.equal(report.riskSummaries.length, 4);
    });

    it('all gates have 100% detection rate', () => {
      const report = runSafetyGateSuite();
      for (const gs of report.gateSummaries) {
        assert.equal(gs.detectionRate, 1);
      }
    });

    it('critical/high pass rate is 1.0', () => {
      const report = runSafetyGateSuite();
      assert.equal(report.criticalHighPassRate, 1);
    });

    it('verdict is safe', () => {
      const report = runSafetyGateSuite();
      assert.equal(report.verdict, 'safe');
    });

    it('gate summaries have valid confidence', () => {
      const report = runSafetyGateSuite();
      for (const gs of report.gateSummaries) {
        assert.ok(gs.meanConfidence > 0 && gs.meanConfidence <= 1);
      }
    });

    it('accepts custom subset', () => {
      const report = runSafetyGateSuite(
        SAFETY_GATE_TYPES.slice(0, 2),
        RISK_LEVELS.slice(0, 2),
        GATE_SCENARIOS.slice(0, 3),
      );
      assert.equal(report.totalTests, 2 * 2 * 3);
    });
  });
});
