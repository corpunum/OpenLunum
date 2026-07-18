/**
 * Error observability integration tests for the eval runner.
 *
 * Tests circuit-breaker wiring, auto-halting, snapshot capture,
 * and observability serialization.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateCircuit,
  checkContinuation,
  recordResult,
  withCircuitBreaker,
  createObservabilityRunner,
  serializeObservability
} from '../src/error-observability.js';
import type { ExperimentManifest } from '../src/types.js';
import { createDefaultTracker, createSnapshot } from '@corpunum/lunum';

// ── Helpers ────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<ExperimentManifest> = {}): ExperimentManifest {
  return {
    schema: 'openlunum-experiment/0.1',
    id: 'test-observability-001',
    area: 'infrastructure',
    task: 'parse',
    deterministic: false,
    hypothesis: 'Test hypothesis',
    baselineCommit: 'abc123',
    limits: { maxItems: 10, maxAttemptsPerItem: 3, maxModelCalls: 100 },
    gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.9, requireProtectedLiteralCoverage: false },
    outputDirectory: '/tmp/test-output',
    ...overrides
  };
}

function makeResult(status: 'passed' | 'failed' | 'error', error?: string) {
  return {
    id: `item-${status}`,
    status,
    rawOutput: error ? `Error: ${error}` : 'output',
    error,
    latencyMs: 10
  };
}

// ── Test: Circuit Breaker Creation ─────────────────────────────────

test('error observability: creates circuit breaker on first access', () => {
  const tracker = createDefaultTracker();
  const circuit = getOrCreateCircuit(tracker, 'parse', 'test-exp');

  assert.ok(circuit, 'circuit should be created');
  assert.strictEqual(circuit.name, 'eval-parse');
  assert.strictEqual(circuit.state, 'closed');
  assert.strictEqual(circuit.failureCount, 0);
});

test('error observability: reuses existing circuit breaker', () => {
  const tracker = createDefaultTracker();
  const circuit1 = getOrCreateCircuit(tracker, 'parse', 'test-exp');
  const circuit2 = getOrCreateCircuit(tracker, 'parse', 'test-exp');

  assert.strictEqual(circuit1, circuit2, 'same circuit instance returned');
});

test('error observability: creates separate circuits per operation', () => {
  const tracker = createDefaultTracker();
  const parseCircuit = getOrCreateCircuit(tracker, 'parse', 'test-exp');
  const realizeCircuit = getOrCreateCircuit(tracker, 'realize', 'test-exp');

  assert.notStrictEqual(parseCircuit, realizeCircuit, 'different operations have different circuits');
  assert.strictEqual(parseCircuit.name, 'eval-parse');
  assert.strictEqual(realizeCircuit.name, 'eval-realize');
});

// ── Test: Continuation Check ───────────────────────────────────────

test('error observability: continuation true when circuit closed', () => {
  const tracker = createDefaultTracker();
  const circuit = getOrCreateCircuit(tracker, 'parse', 'test-exp');
  const result = checkContinuation(tracker, 'parse', 'test-exp');

  assert.strictEqual(result.shouldContinue, true);
  assert.strictEqual(result.haltReason, undefined);
});

test('error observability: continuation false when circuit open', () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'parse', 'test-exp');

  // Manually set circuit to open
  const circuit = tracker.circuits['eval-parse']!;
  circuit.state = 'open';
  circuit.failureCount = 3;

  const result = checkContinuation(tracker, 'parse', 'test-exp');

  assert.strictEqual(result.shouldContinue, false);
  assert.ok(result.haltReason?.includes('Circuit breaker open'), 'should have halt reason');
});

test('error observability: continuation false when auto-halt threshold reached', () => {
  const tracker = createDefaultTracker();
  tracker.maxErrors = 10;

  // Add critical errors to reach threshold
  for (let i = 0; i < 5; i++) {
    tracker.errors.push({
      id: `err-${i}`,
      severity: 'critical' as const,
      operation: 'parse',
      message: `Critical error ${i}`,
      code: 'CRITICAL',
      timestamp: new Date().toISOString(),
      recoverable: false
    });
  }

  const result = checkContinuation(tracker, 'parse', 'test-exp');

  assert.strictEqual(result.shouldContinue, false);
  assert.ok(result.haltReason?.includes('Auto-halt threshold'), 'should mention auto-halt');
});

// ── Test: Result Recording ─────────────────────────────────────────

test('error observability: records passed result and closes circuit', () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'parse', 'test-exp');
  tracker.circuits['eval-parse']!.state = 'half-open';

  const result = recordResult(tracker, 'parse', 'test-exp', 'item-1', makeResult('passed'));

  assert.strictEqual(result.shouldContinue, true);
  assert.strictEqual(tracker.circuits['eval-parse']!.state, 'closed', 'circuit should close on success');
});

test('error observability: records failed result', () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'parse', 'test-exp');

  const result = recordResult(tracker, 'parse', 'test-exp', 'item-1', makeResult('failed', 'Low coverage'));

  assert.strictEqual(result.shouldContinue, true);
  assert.strictEqual(tracker.errors.length, 1, 'error should be recorded');
  assert.ok(tracker.errors[0], 'first error should exist');
  assert.strictEqual(tracker.errors[0].message, 'Low coverage');
});

test('error observability: records error result with error severity', () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'parse', 'test-exp');

  const result = recordResult(tracker, 'parse', 'test-exp', 'item-1', makeResult('error', 'Timeout'));

  assert.strictEqual(result.shouldContinue, true);
  const err = tracker.errors[0];
  assert.ok(err, 'error should be recorded');
  assert.strictEqual(err!.severity, 'error');
});

test('error observability: opens circuit after threshold failures', () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'parse', 'test-exp', { failureThreshold: 3 });

  recordResult(tracker, 'parse', 'test-exp', 'item-1', makeResult('failed', 'Error 1'));
  recordResult(tracker, 'parse', 'test-exp', 'item-2', makeResult('failed', 'Error 2'));
  recordResult(tracker, 'parse', 'test-exp', 'item-3', makeResult('failed', 'Error 3'));
  assert.strictEqual(tracker.circuits['eval-parse']!.state, 'open', 'circuit should be open after 3 failures');
});

// ── Test: Circuit Breaker Wrapper ──────────────────────────────────

test('error observability: withCircuitBreaker wraps async function', async () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'render', 'test-exp');

  const { result, halted } = await withCircuitBreaker(
    async () => 'success',
    tracker,
    'render',
    'test-exp'
  );

  assert.strictEqual(result, 'success');
  assert.strictEqual(halted, false);
});

test('error observability: withCircuitBreaker catches errors', async () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'render', 'test-exp');

  const res = await withCircuitBreaker(
    async () => { throw new Error('Render failed'); },
    tracker,
    'render',
    'test-exp'
  );

  assert.strictEqual(res.result, undefined);
  assert.ok(tracker.errors.length >= 1, 'should have at least one error');
});

// ── Test: Observability Runner Factory ─────────────────────────────

test('error observability: creates observability runner with tracker', () => {
  const manifest = makeManifest({ task: 'parse' });
  const runner = createObservabilityRunner(manifest);

  assert.ok(runner.tracker);
  assert.strictEqual(runner.tracker.maxErrors, 1000);
  assert.strictEqual(typeof runner.checkContinuation, 'function');
  assert.strictEqual(typeof runner.recordResult, 'function');
  assert.strictEqual(typeof runner.getOrCreateCircuit, 'function');
});

test('error observability: runner uses experiment-specific circuit names', () => {
  const manifest = makeManifest({ task: 'retrieval', id: 'ret-exp-42' });
  const runner = createObservabilityRunner(manifest);

  const circuit = runner.getOrCreateCircuit('retrieval');
  assert.strictEqual(circuit.name, 'eval-retrieval');
});

// ── Test: Serialization ────────────────────────────────────────────

test('error observability: serializes observability data', () => {
  const tracker = createDefaultTracker();
  getOrCreateCircuit(tracker, 'parse', 'test-exp');
  const circuit = tracker.circuits['eval-parse']!;
  circuit.state = 'open';
  circuit.failureCount = 5;

  tracker.errors.push({
    id: 'err-1',
    severity: 'critical',
    operation: 'parse',
    message: 'Critical failure',
    code: 'CRITICAL',
    timestamp: new Date().toISOString(),
    recoverable: false
  });

  const snapBefore: Record<string, unknown> = { before: 1 };
  const snapAfter: Record<string, unknown> = { after: 2 };
  createSnapshot(tracker, 'test', snapBefore, snapAfter);

  const serialized = serializeObservability(tracker);

  assert.strictEqual(serialized.totalErrors, 1);
  assert.strictEqual(serialized.criticalErrors, 1);
  assert.strictEqual(serialized.circuitStates['eval-parse'], 'open');
  assert.strictEqual(serialized.totalSnapshots, 1);
  assert.strictEqual(serialized.recoveryTimeoutMs, 60000);
});

test('error observability: serializes empty tracker', () => {
  const tracker = createDefaultTracker();
  const serialized = serializeObservability(tracker);

  assert.strictEqual(serialized.totalErrors, 0);
  assert.strictEqual(serialized.criticalErrors, 0);
  assert.deepStrictEqual(serialized.circuitStates, {});
  assert.strictEqual(serialized.totalSnapshots, 0);
  assert.strictEqual(serialized.recoveryTimeoutMs, 0);
});

// ── Test: End-to-End: Run → Fail → Halt ────────────────────────────

test('error observability: end-to-end — run until auto-halt', () => {
  const manifest = makeManifest({ task: 'parse' });
  const runner = createObservabilityRunner(manifest, { autoHaltThreshold: 3 });

  // Add 3 critical errors directly
  for (let i = 1; i <= 3; i++) {
    runner.tracker.errors.push({
      id: `err-critical-${i}`,
      severity: 'critical',
      operation: 'parse',
      message: `Critical error ${i}`,
      code: 'CRITICAL',
      timestamp: new Date().toISOString(),
      recoverable: false
    });
  }

  const haltResult = runner.checkContinuation('parse');
  assert.strictEqual(haltResult.shouldContinue, false, 'should halt after 3 critical errors');
  assert.ok(haltResult.haltReason?.includes('Auto-halt'), 'should mention auto-halt in reason');
});
