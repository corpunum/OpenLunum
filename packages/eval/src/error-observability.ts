/**
 * Error observability integration for the eval runner.
 *
 * Wires circuit-breaker and revert-capability types from
 * @corpunum/lunum into the experiment runner so that
 * experiments auto-halt on repeated failures.
 */

import type {
  CircuitBreaker,
  ObservabilityTracker
} from '@corpunum/lunum';
import {
  createCircuitBreaker,
  recordError,
  updateCircuitBreaker,
  isCircuitOpen,
  createSnapshot,
  createDefaultTracker
} from '@corpunum/lunum';
import type { ItemResult, ExperimentManifest } from './types.js';

// ── Eval-Specific Types ────────────────────────────────────────────

export type EvalOperationKind = 'parse' | 'realize' | 'render' | 'context' | 'retrieval' | 'integration' | 'conformance' | 'infrastructure' | 'unknown';

// Map eval operations to core OperationKind
function toCoreOperation(op: EvalOperationKind): import('@corpunum/lunum').OperationKind {
  if (op === 'parse' || op === 'realize' || op === 'render' || op === 'context') {
    return op;
  }
  return 'unknown';
}

export interface CircuitBreakerConfig {
  /** Circuit name prefix (e.g., 'eval-parse') */
  namePrefix: string;
  /** Max failures before opening circuit */
  failureThreshold: number;
  /** Timeout in ms before half-open */
  recoveryTimeout: number;
  /** Max consecutive errors before auto-halt */
  autoHaltThreshold: number;
}

export interface EvalObservabilityResult {
  /** Whether to continue processing */
  shouldContinue: boolean;
  /** Auto-halt reason if halted */
  haltReason?: string;
  /** Updated tracker */
  tracker: ObservabilityTracker;
}

// ── Default Configuration ──────────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  namePrefix: 'eval',
  failureThreshold: 3,
  recoveryTimeout: 60000,
  autoHaltThreshold: 5
};

// ── Circuit Breaker Management ─────────────────────────────────────

/**
 * Get or create a circuit breaker for an operation.
 */
export function getOrCreateCircuit(
  tracker: ObservabilityTracker,
  operation: EvalOperationKind,
  experimentId: string,
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuitName = `${cfg.namePrefix}-${operation}`;

  if (!tracker.circuits[circuitName]) {
    tracker.circuits[circuitName] = createCircuitBreaker(circuitName, {
      threshold: cfg.failureThreshold,
      timeout: cfg.recoveryTimeout
    });
  }

  return tracker.circuits[circuitName];
}

/**
 * Check if an experiment should continue processing.
 * Returns false if circuit is open or auto-halt threshold is reached.
 */
export function checkContinuation(
  tracker: ObservabilityTracker,
  operation: EvalOperationKind,
  experimentId: string,
  config: Partial<CircuitBreakerConfig> = {}
): EvalObservabilityResult {
  const circuitName = `${config.namePrefix ?? DEFAULT_CONFIG.namePrefix}-${operation}`;
  const circuit = tracker.circuits[circuitName];

  // Check circuit state
  if (circuit && isCircuitOpen(tracker, circuitName)) {
    return {
      shouldContinue: false,
      haltReason: `Circuit breaker open for ${operation} (${circuit.failureCount}/${circuit.threshold} failures)`,
      tracker
    };
  }

  // Check auto-halt threshold
  const totalFailures = tracker.errors.filter(e =>
    e.operation === operation && e.severity === 'critical'
  ).length;
  const autoHaltThreshold = config.autoHaltThreshold ?? DEFAULT_CONFIG.autoHaltThreshold;
  if (totalFailures >= autoHaltThreshold) {
    return {
      shouldContinue: false,
      haltReason: `Auto-halt threshold reached for ${operation}: ${totalFailures} critical failures (threshold: ${autoHaltThreshold})`,
      tracker
    };
  }

  return { shouldContinue: true, tracker };
}

/**
 * Record a result and update circuit breaker state.
 */
export function recordResult(
  tracker: ObservabilityTracker,
  operation: EvalOperationKind,
  experimentId: string,
  itemId: string,
  result: ItemResult,
  config: Partial<CircuitBreakerConfig> = {}
): EvalObservabilityResult {
  const circuitName = `${config.namePrefix ?? DEFAULT_CONFIG.namePrefix}-${operation}`;

  // Take before/after snapshot
  const before: Record<string, unknown> = { itemId, attempt: (result.error as string | undefined)?.match(/attempt (\d+)/)?.[1] };
  const after: Record<string, unknown> = { itemId, status: result.status, error: result.error?.slice(0, 200) };
  createSnapshot(tracker, `${operation}:${itemId}`, before, after);

  if (result.status === 'passed') {
    // Success — update circuit
    updateCircuitBreaker(tracker, circuitName, true);
    return { shouldContinue: true, tracker };
  }

  // Failure — record error and update circuit
  const severity: import('@corpunum/lunum').ErrorSeverity = result.status === 'error' ? 'error' : 'warning';
  recordError(tracker, {
    severity,
    operation: toCoreOperation(operation),
    message: result.error ?? `${operation} failed for item ${itemId}`,
    code: result.status,
    context: { experimentId, itemId, status: result.status },
    recoverable: true
  });

  const success = (result.status as string) === 'passed';
  const newState = updateCircuitBreaker(tracker, circuitName, success);

  // Check if we should halt
  if (newState === 'open') {
    return {
      shouldContinue: false,
      haltReason: `Circuit breaker opened for ${operation} after failures`,
      tracker
    };
  }

  return { shouldContinue: true, tracker };
}

/**
 * Wrap a runner function with circuit-breaker and auto-halt.
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  tracker: ObservabilityTracker,
  operation: EvalOperationKind,
  experimentId: string,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<{ result: T | undefined; halted: boolean; haltReason?: string }> {
  const successResult = (result: T) => ({ result: result as T, halted: false });
  const errorResult = (err: unknown): { result: T; halted: boolean; haltReason: string } => {
    const circuitName = `${config.namePrefix ?? DEFAULT_CONFIG.namePrefix}-${operation}`;
    const newState = updateCircuitBreaker(tracker, circuitName, false);
    recordError(tracker, {
      severity: 'error',
      operation: toCoreOperation(operation),
      message: err instanceof Error ? err.message : String(err),
      code: 'RUNTIME_ERROR',
      context: { experimentId },
      recoverable: newState !== 'open'
    });
    return { result: undefined as T, halted: newState === 'open', haltReason: `Circuit open for ${operation}` };
  };
  return fn().then(successResult, errorResult);
}

/**
 * Create an observability-enabled runner wrapper.
 */
export function createObservabilityRunner(
  manifest: ExperimentManifest,
  config: Partial<CircuitBreakerConfig> = {}
) {
  const tracker = createDefaultTracker();
  const cfg = { ...DEFAULT_CONFIG, ...config, namePrefix: `eval` };

  return {
    tracker,
    config: cfg as CircuitBreakerConfig,
    checkContinuation: (operation: EvalOperationKind) =>
      checkContinuation(tracker, operation, manifest.id, cfg),
    recordResult: (itemId: string, result: ItemResult) =>
      recordResult(tracker, manifest.task, manifest.id, itemId, result, cfg),
    getOrCreateCircuit: (operation: EvalOperationKind) =>
      getOrCreateCircuit(tracker, operation, manifest.id, cfg)
  };
}

/**
 * Serialize observability data for reports.
 */
export function serializeObservability(tracker: ObservabilityTracker): {
  totalErrors: number;
  criticalErrors: number;
  circuitStates: Record<string, string>;
  totalSnapshots: number;
  recoveryTimeoutMs: number;
} {
  const criticalErrors = tracker.errors.filter(e => e.severity === 'critical').length;
  const circuitStates: Record<string, string> = {};
  for (const [name, circuit] of Object.entries(tracker.circuits)) {
    circuitStates[name] = circuit.state;
  }

  return {
    totalErrors: tracker.errors.length,
    criticalErrors,
    circuitStates,
    totalSnapshots: tracker.snapshots.length,
    recoveryTimeoutMs: Object.values(tracker.circuits).reduce(
      (sum, c) => sum + c.timeout, 0
    )
  };
}
