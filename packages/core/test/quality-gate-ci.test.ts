/**
 * Quality Gate CI Integration tests
 *
 * Tests for the unified gate runner that ties downstream-quality,
 * prompt-gates, and conformance gates together for CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runQualityGates,
  checkQualityGates,
  runGate,
  validateCIConfig
} from '../src/quality-gate-ci.js';
import { createDefaultEvaluator } from '../src/downstream-quality.js';
import type { DownstreamTaskResult, QualityGate } from '../src/downstream-quality.js';

// ── Test Fixtures ──────────────────────────────────────────────────

function buildTaskResult(overrides: Partial<DownstreamTaskResult> = {}): DownstreamTaskResult {
  return {
    taskId: 'test-task',
    taskType: 'qa',
    quality: [
      { metric: 'accuracy', value: 0.9, baseline: 0.8, delta: 0.1, unit: 'ratio' },
      { metric: 'semantic_similarity', value: 0.85, baseline: 0.8, delta: 0.05, unit: 'ratio' }
    ],
    overallScore: 0.9,
    gateResult: 'pass',
    warnings: [],
    ...overrides
  };
}

function buildFailingResult(): DownstreamTaskResult {
  return {
    taskId: 'fail-task',
    taskType: 'qa',
    quality: [
      { metric: 'accuracy', value: 0.4, baseline: 0.8, delta: -0.4, unit: 'ratio' }
    ],
    overallScore: 0.4,
    gateResult: 'fail',
    warnings: ['Score below fail threshold']
  };
}

// ── runQualityGates ────────────────────────────────────────────────

test('runQualityGates: all pass produces exit code 0', () => {
  const results = [
    buildTaskResult({ taskId: 't1', overallScore: 0.95 }),
    buildTaskResult({ taskId: 't2', overallScore: 0.9 })
  ];
  const report = runQualityGates(results);
  assert.strictEqual(report.total, 2);
  assert.strictEqual(report.passed, 2);
  assert.strictEqual(report.warned, 0);
  assert.strictEqual(report.failed, 0);
  assert.strictEqual(report.exitCode, 0);
  assert.strictEqual(report.ok, true);
});

test('runQualityGates: all fail produces exit code 2', () => {
  const results = [buildFailingResult()];
  const report = runQualityGates(results);
  assert.strictEqual(report.total, 1);
  assert.strictEqual(report.failed, 1);
  assert.strictEqual(report.exitCode, 2);
  assert.strictEqual(report.ok, false);
});

test('runQualityGates: mixed results with high pass rate gives exit code 1', () => {
  const results = [
    buildTaskResult({ taskId: 'pass', overallScore: 0.9 }),
    buildTaskResult({ taskId: 'pass', overallScore: 0.85 }),
    buildTaskResult({ taskId: 'warn', overallScore: 0.7 })
  ];
  const report = runQualityGates(results, { minimumPassRate: 0.5 });
  // Two pass, one warn → pass rate 0.67 >= 0.5, exit code 1
  assert.ok(report.gates.some(g => g.result === 'pass'));
  assert.ok(report.gates.some(g => g.result === 'warn'));
  assert.strictEqual(report.exitCode, 1);
});

test('runQualityGates: below minimum pass rate gives exit code 2', () => {
  const results = [
    buildTaskResult({ taskId: 'pass', overallScore: 0.9 }),
    buildTaskResult({ taskId: 'pass', overallScore: 0.85 }),
    buildTaskResult({ taskId: 'pass', overallScore: 0.3 })
  ];
  const report = runQualityGates(results, { minimumPassRate: 0.9 });
  // 2/3 = 0.67 pass rate, below 0.9 threshold
  assert.strictEqual(report.exitCode, 2);
  assert.strictEqual(report.ok, false);
});

test('runQualityGates: strict mode converts warnings to failures', () => {
  const results = [
    buildTaskResult({ taskId: 'pass', overallScore: 0.9 }),
    buildTaskResult({ taskId: 'warn', overallScore: 0.7 })
  ];
  const report = runQualityGates(results, { strictMode: true });
  assert.ok(report.gates.some(g => g.result === 'fail'));
  assert.strictEqual(report.exitCode, 2);
});

test('runQualityGates: empty results returns ok with exit code 0', () => {
  const report = runQualityGates([]);
  assert.strictEqual(report.total, 0);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.exitCode, 0);
});

test('runQualityGates: gates array has correct structure', () => {
  const results = [buildTaskResult()];
  const report = runQualityGates(results);
  assert.strictEqual(report.gates.length, 1);
  assert.strictEqual(report.gates[0]!.name, 'gate-0');
  assert.strictEqual(typeof report.gates[0]!.score, 'number');
  assert.strictEqual(Array.isArray(report.gates[0]!.warnings), true);
});

// ── checkQualityGates ──────────────────────────────────────────────

test('checkQualityGates: returns 0 on all pass', () => {
  const results = [buildTaskResult()];
  const code = checkQualityGates(results);
  assert.strictEqual(code, 0);
});

test('checkQualityGates: throws on exit code 2', () => {
  const results = [buildFailingResult()];
  assert.throws(() => checkQualityGates(results), { message: /Quality gates failed/ });
});

test('checkQualityGates: returns 1 on warnings (no throw)', () => {
  const results = [
    buildTaskResult({ taskId: 'pass', overallScore: 0.95 }),
    buildTaskResult({ taskId: 'pass', overallScore: 0.9 }),
    buildTaskResult({ taskId: 'warn', overallScore: 0.65 })
  ];
  const code = checkQualityGates(results, { minimumPassRate: 0.5 });
  assert.strictEqual(code, 1);
});

// ── runGate ────────────────────────────────────────────────────────

test('runGate: passes when score meets threshold', () => {
  const result = runGate('test-gate', buildTaskResult());
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.result, 'pass');
});

test('runGate: fails when score below threshold', () => {
  const result = runGate('test-gate', buildFailingResult());
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.result, 'fail');
});

test('runGate: warns when no matching gate', () => {
  const result = runGate('test-gate', {
    taskId: 'unknown',
    taskType: 'unknown_type' as any,
    quality: [],
    overallScore: 0.5,
    gateResult: 'fail',
    warnings: []
  });
  assert.strictEqual(result.result, 'warn');
  assert.ok(result.warnings.some(w => w.includes('No matching gate')));
});

test('runGate: uses custom gates when provided', () => {
  const customGate: QualityGate = {
    name: 'custom',
    taskType: 'qa',
    minimumScore: 0.5,
    minimumMetrics: {},
    warnThreshold: 0.7,
    failThreshold: 0.3
  };
  const result = runGate('test-gate', buildTaskResult(), [customGate]);
  assert.strictEqual(result.passed, true);
});

// ── validateCIConfig ───────────────────────────────────────────────

test('validateCIConfig: valid config returns ok', () => {
  const result = validateCIConfig({ minimumPassRate: 0.8, strictMode: false });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateCIConfig: rejects invalid minimumPassRate', () => {
  const result = validateCIConfig({ minimumPassRate: 1.5 });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('minimumPassRate')));
});

test('validateCIConfig: rejects invalid gate config', () => {
  const invalidGate: QualityGate = {
    name: 'bad',
    taskType: 'qa',
    minimumScore: 1.5,  // > 1
    minimumMetrics: {},
    warnThreshold: 0.8,
    failThreshold: 0.6
  };
  const result = validateCIConfig({ gates: [invalidGate] });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('bad')));
});
