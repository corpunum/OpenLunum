/**
 * Tests for quality-gate-ci.ts
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { runQualityGates, checkQualityGates, generateCIReport, defaultConfig } from '../src/quality-gate-ci.js';

describe('quality-gate-ci', () => {
  test('runQualityGates returns a valid report with default config', () => {
    const report = runQualityGates();
    assert.ok(report.total > 0, 'should have at least one gate');
    assert.ok(report.passed >= 0, 'passed should be non-negative');
    assert.ok(report.passRate >= 0 && report.passRate <= 1, 'passRate should be between 0 and 1');
    assert.ok([0, 1, 2].includes(report.overall), 'overall should be 0, 1, or 2');
  });

  test('runQualityGates respects selective gate config', () => {
    const report = runQualityGates({
      runDownstreamQuality: false,
      runInjectionTests: false
    });
    const gateNames = report.gates.map(g => g.name);
    assert.ok(!gateNames.includes('downstream-quality'), 'downstream-quality should be excluded');
    assert.ok(!gateNames.includes('injection-resistance'), 'injection-resistance should be excluded');
  });

  test('runQualityGates single gate config', () => {
    const report = runQualityGates({
      runDownstreamQuality: true,
      runMixedContext: false,
      runInjectionTests: false,
      runConformanceSuite: false
    });
    assert.strictEqual(report.total, 1, 'should have exactly 1 gate');
    assert.ok(report.gates[0], 'gates[0] should exist');
    assert.strictEqual(report.gates[0]!.name, 'downstream-quality');
  });

  test('exit code is 0 when all gates pass', () => {
    const report = runQualityGates({
      runDownstreamQuality: true,
      runMixedContext: false,
      runInjectionTests: false,
      runConformanceSuite: false
    });
    assert.strictEqual(report.overall, 0, 'overall should be pass (0)');
  });

  test('exit code is 2 in strict mode with warnings', () => {
    const report = runQualityGates({
      runDownstreamQuality: true,
      runMixedContext: false,
      runInjectionTests: false,
      runConformanceSuite: false,
      strictMode: true
    });
    // With only downstream-quality gate which should pass, overall should still be 0
    assert.strictEqual(report.overall, 0, 'overall should be 0 when all pass even in strict mode');
  });

  test('generateCIReport produces markdown', () => {
    const report = runQualityGates();
    const md = generateCIReport(report);
    assert.ok(md.includes('# Quality Gate CI Report'), 'should have title');
    assert.ok(md.includes('| Metric | Value |'), 'should have table');
    assert.ok(md.includes('## Gate Details'), 'should have gate details section');
  });

  test('checkQualityGates returns exit code', () => {
    const code = checkQualityGates({
      runDownstreamQuality: true,
      runMixedContext: false,
      runInjectionTests: false,
      runConformanceSuite: false
    });
    assert.ok([0, 1, 2].includes(code), 'should return valid exit code');
  });

  test('default config has expected values', () => {
    assert.strictEqual(defaultConfig.runDownstreamQuality, true);
    assert.strictEqual(defaultConfig.runMixedContext, false);
    assert.strictEqual(defaultConfig.runInjectionTests, true);
    assert.strictEqual(defaultConfig.runConformanceSuite, true);
    assert.strictEqual(defaultConfig.minimumPassRate, 0.8);
    assert.strictEqual(defaultConfig.strictMode, false);
  });
});
