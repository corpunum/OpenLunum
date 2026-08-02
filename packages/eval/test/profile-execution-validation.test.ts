import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_CONFIGS,
  simulateExecution,
  checkCompatibility,
  runProfileValidation,
} from '../src/profile-execution-validation.js';

describe('profile-execution-validation', () => {
  describe('PROFILE_CONFIGS', () => {
    it('has 8 profiles', () => {
      assert.equal(PROFILE_CONFIGS.length, 8);
    });

    it('covers 3 model families', () => {
      const families = new Set(PROFILE_CONFIGS.map(p => p.modelFamily));
      assert.equal(families.size, 3);
    });

    it('covers 3 render modes', () => {
      const modes = new Set(PROFILE_CONFIGS.map(p => p.renderMode));
      assert.equal(modes.size, 3);
    });
  });

  describe('simulateExecution', () => {
    it('safe mode has highest quality', () => {
      const safe = simulateExecution(PROFILE_CONFIGS[0]!);
      const tight = simulateExecution(PROFILE_CONFIGS[2]!);
      assert.ok(safe.metrics['semantic-retention'] > tight.metrics['semantic-retention']);
    });

    it('tight mode has best compression', () => {
      const safe = simulateExecution(PROFILE_CONFIGS[0]!);
      const tight = simulateExecution(PROFILE_CONFIGS[2]!);
      assert.ok(tight.metrics['compression-ratio'] < safe.metrics['compression-ratio']);
    });

    it('returns failures for metrics below threshold', () => {
      const result = simulateExecution(PROFILE_CONFIGS[0]!);
      for (const f of result.failures) {
        assert.ok(typeof f === 'string');
      }
    });

    it('render time varies by mode', () => {
      const safe = simulateExecution(PROFILE_CONFIGS[0]!);
      const tight = simulateExecution(PROFILE_CONFIGS[2]!);
      assert.ok(tight.renderTimeMs < safe.renderTimeMs);
    });

    it('metrics are in valid range', () => {
      const result = simulateExecution(PROFILE_CONFIGS[0]!);
      for (const v of Object.values(result.metrics)) {
        assert.ok(v >= 0 && v <= 1);
      }
    });
  });

  describe('checkCompatibility', () => {
    it('same-family profiles are compatible', () => {
      const a = simulateExecution(PROFILE_CONFIGS[0]!);
      const b = simulateExecution(PROFILE_CONFIGS[1]!);
      const check = checkCompatibility(a, b);
      assert.equal(check.compatible, true);
    });

    it('reports preservation loss', () => {
      const a = simulateExecution(PROFILE_CONFIGS[0]!);
      const b = simulateExecution(PROFILE_CONFIGS[2]!);
      const check = checkCompatibility(a, b);
      assert.ok(check.preservationLoss >= 0);
    });

    it('migration safety is stricter than compatibility', () => {
      const a = simulateExecution(PROFILE_CONFIGS[0]!);
      const b = simulateExecution(PROFILE_CONFIGS[2]!);
      const check = checkCompatibility(a, b);
      if (check.migrationSafe) {
        assert.equal(check.compatible, true);
      }
    });
  });

  describe('runProfileValidation', () => {
    it('validates all 8 profiles', () => {
      const report = runProfileValidation();
      assert.equal(report.totalProfiles, 8);
    });

    it('identifies best profile', () => {
      const report = runProfileValidation();
      assert.ok(report.bestProfile.length > 0);
      assert.ok(report.bestScore > 0);
    });

    it('counts pass/fail correctly', () => {
      const report = runProfileValidation();
      assert.equal(report.passedProfiles + report.failedProfiles, report.totalProfiles);
    });

    it('builds compatibility matrix', () => {
      const report = runProfileValidation();
      const n = report.totalProfiles;
      assert.equal(report.compatibilityMatrix.length, (n * (n - 1)) / 2);
    });

    it('produces a valid verdict', () => {
      const report = runProfileValidation();
      assert.ok(['all-pass', 'partial', 'all-fail'].includes(report.verdict));
    });
  });
});
