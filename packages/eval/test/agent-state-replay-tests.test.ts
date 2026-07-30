import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runReplayTests,
  REPLAY_TEST_VERSION,
  SCENARIO_PARTIAL_EXECUTION,
  SCENARIO_ALL_COMPLETE,
  SCENARIO_ALL_FAILED,
  SCENARIO_MIXED_STATES,
  SCENARIO_MID_STEP_WITH_RESULTS,
  SCENARIO_MID_STEP_NO_RESULTS,
  SCENARIO_MULTI_AGENT_HANDOFF,
  SCENARIO_EMPTY,
} from '../src/agent-state-replay-tests.js';

describe('agent-state-replay-tests', () => {
  describe('version', () => {
    it('exports REPLAY_TEST_VERSION = "0.1.0"', () => {
      assert.strictEqual(REPLAY_TEST_VERSION, '0.1.0');
    });
  });

  describe('scenarios', () => {
    it('SCENARIO_PARTIAL_EXECUTION has correct structure', () => {
      assert.ok(SCENARIO_PARTIAL_EXECUTION.name);
      assert.ok(SCENARIO_PARTIAL_EXECUTION.state);
      assert.strictEqual(typeof SCENARIO_PARTIAL_EXECUTION.expectedReplayable, 'number');
      assert.strictEqual(typeof SCENARIO_PARTIAL_EXECUTION.expectedRecoverable, 'number');
      assert.strictEqual(typeof SCENARIO_PARTIAL_EXECUTION.expectedAbandoned, 'number');
    });

    it('SCENARIO_ALL_COMPLETE has correct structure', () => {
      assert.ok(SCENARIO_ALL_COMPLETE.name);
      assert.ok(SCENARIO_ALL_COMPLETE.state);
      assert.strictEqual(SCENARIO_ALL_COMPLETE.state.steps.length, 3);
    });

    it('SCENARIO_ALL_FAILED has correct structure', () => {
      assert.ok(SCENARIO_ALL_FAILED.name);
      assert.ok(SCENARIO_ALL_FAILED.state);
      assert.strictEqual(SCENARIO_ALL_FAILED.state.steps.length, 3);
    });

    it('SCENARIO_MIXED_STATES has correct structure', () => {
      assert.ok(SCENARIO_MIXED_STATES.name);
      assert.ok(SCENARIO_MIXED_STATES.state);
      assert.strictEqual(SCENARIO_MIXED_STATES.state.steps.length, 5);
    });

    it('SCENARIO_MID_STEP_WITH_RESULTS has correct structure', () => {
      assert.ok(SCENARIO_MID_STEP_WITH_RESULTS.name);
      assert.ok(SCENARIO_MID_STEP_WITH_RESULTS.state);
      assert.strictEqual(SCENARIO_MID_STEP_WITH_RESULTS.state.steps.length, 3);
    });

    it('SCENARIO_MID_STEP_NO_RESULTS has correct structure', () => {
      assert.ok(SCENARIO_MID_STEP_NO_RESULTS.name);
      assert.ok(SCENARIO_MID_STEP_NO_RESULTS.state);
      assert.strictEqual(SCENARIO_MID_STEP_NO_RESULTS.state.steps.length, 3);
    });

    it('SCENARIO_MULTI_AGENT_HANDOFF has correct structure', () => {
      assert.ok(SCENARIO_MULTI_AGENT_HANDOFF.name);
      assert.ok(SCENARIO_MULTI_AGENT_HANDOFF.state);
      assert.strictEqual(SCENARIO_MULTI_AGENT_HANDOFF.state.steps.length, 3);
      assert.strictEqual(SCENARIO_MULTI_AGENT_HANDOFF.state.handoffs.length, 2);
    });

    it('SCENARIO_EMPTY has correct structure', () => {
      assert.ok(SCENARIO_EMPTY.name);
      assert.ok(SCENARIO_EMPTY.state);
      assert.strictEqual(SCENARIO_EMPTY.state.steps.length, 0);
    });
  });

  describe('runReplayTests', () => {
    it('returns a ReplayTestReport', () => {
      const report = runReplayTests();
      assert.ok(report);
      assert.ok(report.version);
      assert.ok(report.timestamp);
      assert.ok(Array.isArray(report.scenarios));
      assert.ok(report.summary);
    });

    it('runs all scenarios', () => {
      const report = runReplayTests();
      assert.strictEqual(report.scenarios.length, 8);
    });

    it('all scenarios pass', () => {
      const report = runReplayTests();
      assert.strictEqual(report.summary.failed, 0, `${report.summary.failed} scenarios failed`);
      assert.strictEqual(report.summary.passed, report.summary.total);

      for (const scenario of report.scenarios) {
        assert.strictEqual(scenario.passed, true, `Scenario "${scenario.name}" failed: ${scenario.error}`);
      }
    });

    it('correctly identifies passed scenarios', () => {
      const report = runReplayTests();
      for (const scenario of report.scenarios) {
        assert.strictEqual(typeof scenario.passed, 'boolean');
        assert.ok(scenario.name);
        if (!scenario.passed) {
          assert.ok(scenario.error);
        }
      }
    });

    it('summary has correct totals', () => {
      const report = runReplayTests();
      assert.strictEqual(report.summary.total, report.scenarios.length);
      assert.strictEqual(report.summary.passed + report.summary.failed, report.summary.total);
    });

    it('version matches REPLAY_TEST_VERSION', () => {
      const report = runReplayTests();
      assert.strictEqual(report.version, REPLAY_TEST_VERSION);
    });

    it('timestamp is a valid ISO string', () => {
      const report = runReplayTests();
      const date = new Date(report.timestamp);
      assert.ok(!isNaN(date.getTime()));
    });

    it('partial execution scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'Partial Execution');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('all complete scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'All Complete');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('all failed scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'All Failed');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('mixed states scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'Mixed States');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('mid-step interruption with results scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'Mid-Step Interruption With Results');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('mid-step interruption no results scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'Mid-Step Interruption No Results');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('multi-agent handoff scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'Multi-Agent Handoff');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });

    it('empty state scenario works correctly', () => {
      const report = runReplayTests();
      const scenario = report.scenarios.find(s => s.name === 'Empty State');
      assert.ok(scenario);
      assert.strictEqual(scenario.passed, true);
    });
  });
});
