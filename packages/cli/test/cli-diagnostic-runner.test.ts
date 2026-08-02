import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAGNOSTIC_CHECKS,
  runDiagnosticCheck,
  runDiagnostics,
} from '../src/cli-diagnostic-runner.js';

describe('cli-diagnostic-runner', () => {
  describe('DIAGNOSTIC_CHECKS', () => {
    it('has 10 checks', () => {
      assert.equal(DIAGNOSTIC_CHECKS.length, 10);
    });

    it('covers all categories', () => {
      const categories = new Set(DIAGNOSTIC_CHECKS.map(c => c.category));
      assert.ok(categories.has('environment'));
      assert.ok(categories.has('configuration'));
      assert.ok(categories.has('dependencies'));
      assert.ok(categories.has('permissions'));
      assert.ok(categories.has('runtime'));
    });

    it('has unique ids', () => {
      const ids = DIAGNOSTIC_CHECKS.map(c => c.id);
      assert.equal(new Set(ids).size, ids.length);
    });
  });

  describe('runDiagnosticCheck', () => {
    it('node version check returns ok on supported version', () => {
      const check = DIAGNOSTIC_CHECKS.find(c => c.id === 'env-node-version')!;
      const result = runDiagnosticCheck(check);
      assert.ok(['ok', 'warning'].includes(result.severity));
    });

    it('platform check returns a result', () => {
      const check = DIAGNOSTIC_CHECKS.find(c => c.id === 'env-platform')!;
      const result = runDiagnosticCheck(check);
      assert.ok(result.message.length > 0);
    });

    it('memory check returns a result', () => {
      const check = DIAGNOSTIC_CHECKS.find(c => c.id === 'env-memory')!;
      const result = runDiagnosticCheck(check);
      assert.ok(result.message.includes('MB'));
    });

    it('records duration', () => {
      const check = DIAGNOSTIC_CHECKS[0]!;
      const result = runDiagnosticCheck(check);
      assert.ok(result.durationMs >= 0);
    });

    it('all checks produce valid results', () => {
      for (const check of DIAGNOSTIC_CHECKS) {
        const result = runDiagnosticCheck(check);
        assert.ok(['ok', 'warning', 'error', 'fatal'].includes(result.severity));
        assert.ok(result.message.length > 0);
        assert.equal(result.check.id, check.id);
      }
    });
  });

  describe('runDiagnostics', () => {
    it('runs all checks', () => {
      const report = runDiagnostics();
      assert.equal(report.totalChecks, 10);
    });

    it('counts match total', () => {
      const report = runDiagnostics();
      assert.equal(
        report.okCount + report.warningCount + report.errorCount + report.fatalCount,
        report.totalChecks,
      );
    });

    it('reports healthy when no errors', () => {
      const report = runDiagnostics();
      if (report.errorCount === 0 && report.fatalCount === 0) {
        assert.equal(report.healthy, true);
      }
    });

    it('computes total duration', () => {
      const report = runDiagnostics();
      assert.ok(report.totalDurationMs >= 0);
    });

    it('accepts custom check list', () => {
      const subset = DIAGNOSTIC_CHECKS.slice(0, 3);
      const report = runDiagnostics(subset);
      assert.equal(report.totalChecks, 3);
    });
  });
});
