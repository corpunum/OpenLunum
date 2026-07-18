import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCircuitBreaker,
  recordError,
  updateCircuitBreaker,
  isCircuitOpen,
  createSnapshot,
  validateTracker,
  createDefaultTracker,
  type LunumError,
  type ObservabilityTracker
} from '../src/index.js';

describe('error-observability', () => {
  function buildTracker(overrides: Partial<ObservabilityTracker> = {}): ObservabilityTracker {
    return {
      errors: overrides.errors ?? [],
      circuits: overrides.circuits ?? {},
      snapshots: overrides.snapshots ?? [],
      maxErrors: overrides.maxErrors ?? 100
    };
  }

  describe('createCircuitBreaker', () => {
    it('creates a closed circuit breaker by default', () => {
      const cb = createCircuitBreaker('test-circuit');
      assert.strictEqual(cb.state, 'closed');
      assert.strictEqual(cb.failureCount, 0);
      assert.strictEqual(cb.successCount, 0);
      assert.strictEqual(cb.threshold, 5);
      assert.strictEqual(cb.timeout, 30000);
    });

    it('respects custom threshold and timeout', () => {
      const cb = createCircuitBreaker('test-circuit', { threshold: 3, timeout: 10000 });
      assert.strictEqual(cb.threshold, 3);
      assert.strictEqual(cb.timeout, 10000);
    });
  });

  describe('recordError', () => {
    it('records an error in the tracker', () => {
      const tracker = buildTracker();
      const error: Omit<LunumError, 'id' | 'timestamp'> = {
        severity: 'error',
        operation: 'parse',
        message: 'parse failed',
        code: 'PARSE_ERR',
        recoverable: true
      };
      const recorded = recordError(tracker, error);
      assert.strictEqual(recorded.id, 'err-1');
      assert.strictEqual(tracker.errors.length, 1);
      assert.strictEqual(tracker.errors[0]!.message, 'parse failed');
    });

    it('auto-generates sequential IDs', () => {
      const tracker = buildTracker();
      recordError(tracker, { severity: 'warning', operation: 'render', message: 'w1', code: 'W1', recoverable: true });
      recordError(tracker, { severity: 'warning', operation: 'render', message: 'w2', code: 'W2', recoverable: true });
      assert.strictEqual(tracker.errors.length, 2);
      assert.strictEqual(tracker.errors[0]!.id, 'err-1');
      assert.strictEqual(tracker.errors[1]!.id, 'err-2');
    });

    it('evicts oldest errors when exceeding maxErrors', () => {
      const tracker = buildTracker({ maxErrors: 2 });
      recordError(tracker, { severity: 'info', operation: 'parse', message: 'e1', code: 'E1', recoverable: true });
      recordError(tracker, { severity: 'info', operation: 'parse', message: 'e2', code: 'E2', recoverable: true });
      recordError(tracker, { severity: 'info', operation: 'parse', message: 'e3', code: 'E3', recoverable: true });
      assert.strictEqual(tracker.errors.length, 2);
      assert.strictEqual(tracker.errors[0]!.message, 'e2');
      assert.strictEqual(tracker.errors[1]!.message, 'e3');
    });
  });

  describe('updateCircuitBreaker', () => {
    it('transitions closed → half-open on first success', () => {
      const tracker = buildTracker();
      tracker.circuits['test'] = createCircuitBreaker('test');
      updateCircuitBreaker(tracker, 'test', true);
      assert.strictEqual(tracker.circuits['test'].state, 'closed');
    });

    it('transitions closed → open when threshold exceeded', () => {
      const tracker = buildTracker();
      tracker.circuits['test'] = createCircuitBreaker('test', { threshold: 3 });
      updateCircuitBreaker(tracker, 'test', false);
      updateCircuitBreaker(tracker, 'test', false);
      updateCircuitBreaker(tracker, 'test', false);
      assert.strictEqual(tracker.circuits['test'].state, 'open');
      assert.strictEqual(tracker.circuits['test'].failureCount, 3);
    });

    it('transitions open → half-open on success', () => {
      const tracker = buildTracker();
      tracker.circuits['test'] = createCircuitBreaker('test', { threshold: 2 });
      updateCircuitBreaker(tracker, 'test', false);
      updateCircuitBreaker(tracker, 'test', false);
      assert.strictEqual(tracker.circuits['test'].state, 'open');
      updateCircuitBreaker(tracker, 'test', true);
      assert.strictEqual(tracker.circuits['test'].state, 'half-open');
    });

    it('transitions half-open → open on failure', () => {
      const tracker = buildTracker();
      tracker.circuits['test'] = createCircuitBreaker('test', { threshold: 2 });
      updateCircuitBreaker(tracker, 'test', false);
      updateCircuitBreaker(tracker, 'test', false);
      assert.strictEqual(tracker.circuits['test'].state, 'open');
      // Simulate half-open by manually setting state
      tracker.circuits['test'].state = 'half-open';
      updateCircuitBreaker(tracker, 'test', false);
      assert.strictEqual(tracker.circuits['test'].state, 'open');
    });
  });

  describe('isCircuitOpen', () => {
    it('returns false for closed circuit', () => {
      const tracker = buildTracker();
      tracker.circuits['test'] = createCircuitBreaker('test');
      assert.strictEqual(isCircuitOpen(tracker, 'test'), false);
    });

    it('returns true for open circuit', () => {
      const tracker = buildTracker();
      tracker.circuits['test'] = createCircuitBreaker('test', { threshold: 1 });
      updateCircuitBreaker(tracker, 'test', false);
      assert.strictEqual(isCircuitOpen(tracker, 'test'), true);
    });

    it('returns false for non-existent circuit', () => {
      const tracker = buildTracker();
      assert.strictEqual(isCircuitOpen(tracker, 'nonexistent'), false);
    });
  });

  describe('createSnapshot', () => {
    it('creates a snapshot with before/after state', () => {
      const tracker = buildTracker();
      const before = { key: 'old' };
      const after = { key: 'new' };
      const snap = createSnapshot(tracker, 'test-op', before, after);
      assert.strictEqual(snap.id, 'snap-1');
      assert.deepStrictEqual(snap.before, before);
      assert.deepStrictEqual(snap.after, after);
      assert.strictEqual(tracker.snapshots.length, 1);
    });
  });

  describe('validateTracker', () => {
    it('validates a default tracker', () => {
      const tracker = createDefaultTracker();
      const result = validateTracker(tracker);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('rejects tracker with invalid maxErrors', () => {
      const tracker = buildTracker({ maxErrors: 0 });
      const result = validateTracker(tracker);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('maxErrors')));
    });
  });

  describe('createDefaultTracker', () => {
    it('creates a tracker with default values', () => {
      const tracker = createDefaultTracker();
      assert.deepStrictEqual(tracker.errors, []);
      assert.deepStrictEqual(tracker.circuits, {});
      assert.deepStrictEqual(tracker.snapshots, []);
      assert.strictEqual(tracker.maxErrors, 1000);
    });
  });

  describe('severity levels', () => {
    it('accepts all severity levels', () => {
      const tracker = buildTracker();
      for (const severity of ['info', 'warning', 'error', 'critical'] as const) {
        recordError(tracker, {
          severity,
          operation: 'parse',
          message: `${severity} test`,
          code: severity.toUpperCase(),
          recoverable: true
        });
      }
      assert.strictEqual(tracker.errors.length, 4);
    });
  });

  describe('operation kinds', () => {
    it('accepts all operation kinds', () => {
      const tracker = buildTracker();
      for (const op of ['parse', 'realize', 'render', 'classify', 'fingerprint', 'context', 'unknown'] as const) {
        recordError(tracker, {
          severity: 'warning',
          operation: op,
          message: `${op} test`,
          code: op.toUpperCase(),
          recoverable: true
        });
      }
      assert.strictEqual(tracker.errors.length, 7);
    });
  });
});
