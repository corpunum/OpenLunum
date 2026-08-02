import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILURE_INJECTIONS,
  simulateDiskPressure,
  simulateCrashRecovery,
  validateRecoveryResult,
  generateRecoveryReport,
  runCrashRecoverySimulation,
  type RecoveryResult,
  type FailureScenario,
  type RecoveryOutcome,
} from '../src/crash-recovery-simulation.js';

describe('crash-recovery-simulation', () => {
  describe('FAILURE_INJECTIONS', () => {
    it('has 6 scenarios', () => {
      assert.equal(FAILURE_INJECTIONS.length, 6);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(FAILURE_INJECTIONS));
    });

    it('covers all scenario types', () => {
      const scenarios = new Set(FAILURE_INJECTIONS.map(i => i.scenario));
      assert.ok(scenarios.has('process-crash'));
      assert.ok(scenarios.has('router-restart'));
      assert.ok(scenarios.has('disk-pressure'));
      assert.ok(scenarios.has('partial-output'));
      assert.ok(scenarios.has('oom-kill'));
      assert.ok(scenarios.has('sigterm-during-write'));
    });
  });

  describe('simulateDiskPressure', () => {
    it('succeeds with sufficient space', () => {
      const result = simulateDiskPressure(1_000_000, 500_000);
      assert.ok(result.writeSucceeded);
      assert.ok(!result.fallbackUsed);
      assert.ok(result.evidenceIntact);
    });

    it('fails safely with insufficient space', () => {
      const result = simulateDiskPressure(100, 500_000);
      assert.ok(!result.writeSucceeded);
      assert.ok(result.fallbackUsed);
      assert.ok(result.evidenceIntact);
    });
  });

  describe('simulateCrashRecovery', () => {
    it('recovers from sigterm during write', () => {
      const sigterm = FAILURE_INJECTIONS.find(i => i.scenario === 'sigterm-during-write')!;
      const result = simulateCrashRecovery(sigterm);
      assert.equal(result.outcome, 'recovered');
      assert.equal(result.stateAfterRecovery, 'clean');
      assert.ok(!result.silentCorruption);
    });

    it('fails safe on process crash', () => {
      const crash = FAILURE_INJECTIONS.find(i => i.scenario === 'process-crash')!;
      const result = simulateCrashRecovery(crash);
      assert.equal(result.outcome, 'failed-safe');
      assert.equal(result.stateAfterRecovery, 'needs-rerun');
      assert.ok(result.evidencePreserved);
    });

    it('detects partial output', () => {
      const partial = FAILURE_INJECTIONS.find(i => i.scenario === 'partial-output')!;
      const result = simulateCrashRecovery(partial);
      assert.ok(result.partialOutputDetected);
      assert.ok(!result.silentCorruption);
    });

    it('never produces silent corruption', () => {
      for (const injection of FAILURE_INJECTIONS) {
        const result = simulateCrashRecovery(injection);
        assert.ok(!result.silentCorruption, `${injection.scenario} produced silent corruption`);
      }
    });
  });

  describe('validateRecoveryResult', () => {
    it('accepts clean results', () => {
      const result: RecoveryResult = {
        scenario: 'process-crash',
        outcome: 'failed-safe',
        evidencePreserved: true,
        partialOutputDetected: false,
        silentCorruption: false,
        recoveryMs: 1000,
        stateAfterRecovery: 'needs-rerun',
        notes: '',
      };
      const v = validateRecoveryResult(result);
      assert.ok(v.valid);
    });

    it('rejects silent corruption', () => {
      const result: RecoveryResult = {
        scenario: 'process-crash',
        outcome: 'recovered',
        evidencePreserved: true,
        partialOutputDetected: false,
        silentCorruption: true,
        recoveryMs: 1000,
        stateAfterRecovery: 'clean',
        notes: '',
      };
      const v = validateRecoveryResult(result);
      assert.ok(!v.valid);
      assert.ok(v.errors.some(e => e.includes('silent corruption')));
    });

    it('rejects data loss', () => {
      const result: RecoveryResult = {
        scenario: 'disk-pressure',
        outcome: 'data-loss',
        evidencePreserved: false,
        partialOutputDetected: false,
        silentCorruption: false,
        recoveryMs: 500,
        stateAfterRecovery: 'unrecoverable',
        notes: '',
      };
      const v = validateRecoveryResult(result);
      assert.ok(!v.valid);
    });
  });

  describe('runCrashRecoverySimulation', () => {
    it('runs all 6 scenarios', () => {
      const report = runCrashRecoverySimulation();
      assert.equal(report.totalScenarios, 6);
    });

    it('produces pass verdict', () => {
      const report = runCrashRecoverySimulation();
      assert.equal(report.verdict, 'pass');
    });

    it('has no silent corruption', () => {
      const report = runCrashRecoverySimulation();
      assert.ok(report.noSilentCorruption);
    });

    it('preserves all evidence', () => {
      const report = runCrashRecoverySimulation();
      assert.ok(report.allEvidencePreserved);
    });

    it('has zero corruption and data loss', () => {
      const report = runCrashRecoverySimulation();
      assert.equal(report.corruptionCount, 0);
      assert.equal(report.dataLossCount, 0);
    });

    it('has at least one recovered and multiple failed-safe', () => {
      const report = runCrashRecoverySimulation();
      assert.ok(report.recoveredCount >= 1);
      assert.ok(report.failedSafeCount >= 4);
    });
  });

  describe('generateRecoveryReport', () => {
    it('returns fail verdict on corruption', () => {
      const results: RecoveryResult[] = [{
        scenario: 'process-crash',
        outcome: 'corruption',
        evidencePreserved: false,
        partialOutputDetected: false,
        silentCorruption: true,
        recoveryMs: 0,
        stateAfterRecovery: 'unrecoverable',
        notes: '',
      }];
      const report = generateRecoveryReport(results);
      assert.equal(report.verdict, 'fail');
    });

    it('returns partial verdict on data loss without corruption', () => {
      const results: RecoveryResult[] = [{
        scenario: 'disk-pressure',
        outcome: 'data-loss',
        evidencePreserved: false,
        partialOutputDetected: false,
        silentCorruption: false,
        recoveryMs: 500,
        stateAfterRecovery: 'unrecoverable',
        notes: '',
      }];
      const report = generateRecoveryReport(results);
      assert.equal(report.verdict, 'partial');
    });
  });
});
