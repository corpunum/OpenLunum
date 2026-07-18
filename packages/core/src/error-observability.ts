/**
 * Error Observability types for Lunum.
 *
 * Supports observable and reversible failure modes:
 * - Error tracking with structured metadata
 * - Circuit-breaker pattern for cascading failure prevention
 * - Revert capability with snapshot/restore
 */

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type CircuitState = 'closed' | 'open' | 'half-open';
export type OperationKind = 'parse' | 'realize' | 'render' | 'classify' | 'fingerprint' | 'context' | 'unknown';

/** A structured error record. */
export interface LunumError {
  id: string;
  severity: ErrorSeverity;
  operation: OperationKind;
  message: string;
  code: string;
  timestamp: string;
  context?: Record<string, unknown>;
  recoverable: boolean;
  stackTrace?: string;
}

/** Circuit-breaker state for an operation. */
export interface CircuitBreaker {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  threshold: number;
  timeout: number;
  lastFailureAt?: string;
  lastStateChangeAt: string;
}

/** Snapshot for revert capability. */
export interface StateSnapshot {
  id: string;
  timestamp: string;
  operation: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** Observability tracker for Lunum operations. */
export interface ObservabilityTracker {
  errors: LunumError[];
  circuits: Record<string, CircuitBreaker>;
  snapshots: StateSnapshot[];
  maxErrors: number;
}

/** Create a new circuit breaker. */
export function createCircuitBreaker(
  name: string,
  options: { threshold?: number; timeout?: number } = {}
): CircuitBreaker {
  return {
    name,
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    threshold: options.threshold ?? 5,
    timeout: options.timeout ?? 30000,
    lastStateChangeAt: new Date().toISOString()
  };
}

/** Record an error in the tracker. */
export function recordError(
  tracker: ObservabilityTracker,
  error: Omit<LunumError, 'id' | 'timestamp'>
): LunumError {
  const lunumError: LunumError = {
    id: `err-${tracker.errors.length + 1}`,
    timestamp: new Date().toISOString(),
    ...error
  };
  tracker.errors.push(lunumError);
  if (tracker.errors.length > tracker.maxErrors) {
    tracker.errors.shift();
  }
  return lunumError;
}

/** Update circuit breaker state based on result. */
export function updateCircuitBreaker(
  tracker: ObservabilityTracker,
  circuitName: string,
  success: boolean
): CircuitState {
  const circuit = tracker.circuits[circuitName];
  if (!circuit) return 'closed';

  if (success) {
    circuit.successCount++;
    if (circuit.state === 'open') {
      circuit.state = 'half-open';
    } else if (circuit.state === 'half-open') {
      circuit.state = 'closed';
    }
    circuit.failureCount = 0;
  } else {
    circuit.failureCount++;
    circuit.lastFailureAt = new Date().toISOString();
    if (circuit.state === 'half-open') {
      circuit.state = 'open';
    } else if (circuit.failureCount >= circuit.threshold) {
      circuit.state = 'open';
    }
  }
  circuit.lastStateChangeAt = new Date().toISOString();
  return circuit.state;
}

/** Check if a circuit is open (should block operations). */
export function isCircuitOpen(tracker: ObservabilityTracker, circuitName: string): boolean {
  const circuit = tracker.circuits[circuitName];
  if (!circuit) return false;
  if (circuit.state === 'closed') return false;
  if (circuit.state === 'half-open') return false;
  return true;
}

/** Create a state snapshot. */
export function createSnapshot(
  tracker: ObservabilityTracker,
  operation: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): StateSnapshot {
  const snapshot: StateSnapshot = {
    id: `snap-${tracker.snapshots.length + 1}`,
    timestamp: new Date().toISOString(),
    operation,
    before,
    after
  };
  tracker.snapshots.push(snapshot);
  return snapshot;
}

/** Validate an observability tracker. */
export function validateTracker(tracker: ObservabilityTracker): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(tracker.errors)) errors.push('errors must be an array');
  if (!Array.isArray(tracker.circuits) && typeof tracker.circuits !== 'object') errors.push('circuits must be an object');
  if (!Array.isArray(tracker.snapshots)) errors.push('snapshots must be an array');
  if (tracker.maxErrors !== undefined && tracker.maxErrors <= 0) errors.push('maxErrors must be positive');

  return { ok: errors.length === 0, errors };
}

/** Create a default observability tracker. */
export function createDefaultTracker(): ObservabilityTracker {
  return {
    errors: [],
    circuits: {},
    snapshots: [],
    maxErrors: 1000
  };
}
