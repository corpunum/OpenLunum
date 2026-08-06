import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_STRESS_SCENARIOS,
  RESILIENCE_METRICS,
  simulateAgentStressTest,
  runAgentStateExecutionStressSuite,
} from '../src/agent-state-execution-stress.js';

describe('agent-state-execution-stress', () => {
  describe('constants', () => {
    it('has 5 stress scenarios', () => {
      assert.equal(AGENT_STRESS_SCENARIOS.length, 5);
    });

    it('has 4 resilience metrics', () => {
      assert.equal(RESILIENCE_METRICS.length, 4);
    });

    it('scenario names are unique', () => {
      const names = AGENT_STRESS_SCENARIOS.map(s => s.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('metric names are unique', () => {
      const names = RESILIENCE_METRICS.map(m => m.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateAgentStressTest', () => {
    it('returns valid result', () => {
      const r = simulateAgentStressTest(AGENT_STRESS_SCENARIOS[0]!, RESILIENCE_METRICS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.stateCorrupted, 'boolean');
      assert.equal(typeof r.operationsOrdered, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateAgentStressTest(AGENT_STRESS_SCENARIOS[0]!, RESILIENCE_METRICS[0]!);
      const b = simulateAgentStressTest(AGENT_STRESS_SCENARIOS[0]!, RESILIENCE_METRICS[0]!);
      assert.deepEqual(a, b);
    });

    it('never corrupts state', () => {
      for (const scenario of AGENT_STRESS_SCENARIOS) {
        for (const metric of RESILIENCE_METRICS) {
          const r = simulateAgentStressTest(scenario, metric);
          assert.equal(r.stateCorrupted, false);
        }
      }
    });

    it('always preserves operation ordering', () => {
      for (const scenario of AGENT_STRESS_SCENARIOS) {
        for (const metric of RESILIENCE_METRICS) {
          const r = simulateAgentStressTest(scenario, metric);
          assert.equal(r.operationsOrdered, true);
        }
      }
    });
  });

  describe('runAgentStateExecutionStressSuite', () => {
    it('produces correct total tests (5 × 4)', () => {
      const report = runAgentStateExecutionStressSuite();
      assert.equal(report.totalTests, 5 * 4);
    });

    it('has 5 scenario summaries', () => {
      const report = runAgentStateExecutionStressSuite();
      assert.equal(report.scenarioSummaries.length, 5);
    });

    it('no state corruption', () => {
      const report = runAgentStateExecutionStressSuite();
      assert.equal(report.noStateCorruption, true);
    });

    it('all operations ordered', () => {
      const report = runAgentStateExecutionStressSuite();
      assert.equal(report.allOperationsOrdered, true);
    });

    it('verdict is resilient or adequate', () => {
      const report = runAgentStateExecutionStressSuite();
      assert.ok(report.verdict === 'resilient' || report.verdict === 'adequate');
    });

    it('accepts custom inputs', () => {
      const report = runAgentStateExecutionStressSuite(
        AGENT_STRESS_SCENARIOS.slice(0, 2),
        RESILIENCE_METRICS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
