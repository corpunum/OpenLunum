import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRESS_SCENARIOS,
  STABILITY_METRICS,
  simulateStressTest,
  runCliIntegrationStressSuite,
} from '../src/cli-integration-stress.js';

describe('cli-integration-stress', () => {
  describe('constants', () => {
    it('has 5 stress scenarios', () => {
      assert.equal(STRESS_SCENARIOS.length, 5);
    });

    it('has 4 stability metrics', () => {
      assert.equal(STABILITY_METRICS.length, 4);
    });

    it('scenario names are unique', () => {
      const names = STRESS_SCENARIOS.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = STABILITY_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateStressTest', () => {
    it('returns valid result', () => {
      const r = simulateStressTest(STRESS_SCENARIOS[0]!, STABILITY_METRICS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.stateCorrupted, 'boolean');
      assert.equal(typeof r.errorContained, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateStressTest(STRESS_SCENARIOS[0]!, STABILITY_METRICS[0]!);
      const b = simulateStressTest(STRESS_SCENARIOS[0]!, STABILITY_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('never corrupts state', () => {
      for (const scenario of STRESS_SCENARIOS) {
        for (const metric of STABILITY_METRICS) {
          const r = simulateStressTest(scenario, metric);
          assert.equal(r.stateCorrupted, false);
        }
      }
    });

    it('always contains errors', () => {
      for (const scenario of STRESS_SCENARIOS) {
        for (const metric of STABILITY_METRICS) {
          const r = simulateStressTest(scenario, metric);
          assert.equal(r.errorContained, true);
        }
      }
    });
  });

  describe('runCliIntegrationStressSuite', () => {
    it('produces correct total tests (5 × 4)', () => {
      const report = runCliIntegrationStressSuite();
      assert.equal(report.totalTests, 5 * 4);
    });

    it('has 5 scenario summaries', () => {
      const report = runCliIntegrationStressSuite();
      assert.equal(report.scenarioSummaries.length, 5);
    });

    it('no state corruption', () => {
      const report = runCliIntegrationStressSuite();
      assert.equal(report.noStateCorruption, true);
    });

    it('all errors contained', () => {
      const report = runCliIntegrationStressSuite();
      assert.equal(report.allErrorsContained, true);
    });

    it('verdict is resilient or adequate', () => {
      const report = runCliIntegrationStressSuite();
      assert.ok(report.verdict === 'resilient' || report.verdict === 'adequate');
    });

    it('accepts custom inputs', () => {
      const report = runCliIntegrationStressSuite(
        STRESS_SCENARIOS.slice(0, 2),
        STABILITY_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
