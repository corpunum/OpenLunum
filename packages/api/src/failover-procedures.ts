/**
 * Failover procedures for the Lunum API service.
 *
 * Implements the failover procedures required by R14.6.
 * Each procedure defines a trigger condition, recovery steps,
 * and a verification step to confirm successful failover.
 */

// ── Types ──────────────────────────────────────────────────────────

/** Status of a dependency or component. */
export type ComponentStatus = 'ok' | 'degraded' | 'unhealthy';

/** Per-component health state for failover decision-making. */
export interface ComponentHealth {
  /** Component identifier (e.g. 'core', 'datastore', 'model') */
  readonly name: string;
  /** Current health status */
  readonly status: ComponentStatus;
  /** Last successful check timestamp (ISO string, or null if never checked) */
  readonly lastCheckedAt: string | null;
  /** Error message if unhealthy, or null */
  readonly error?: string;
}

/** A documented failover procedure. */
export interface FailoverProcedure {
  /** Unique procedure identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Condition that triggers this procedure (e.g. 'model-unhealthy') */
  readonly trigger: string;
  /** Ordered list of recovery steps */
  readonly steps: readonly string[];
  /** How to verify successful failover */
  readonly verification: string;
  /** Maximum expected recovery time in milliseconds */
  readonly maxRecoveryMs: number;
}

/** Result of executing a failover procedure. */
export interface FailoverResult {
  /** The procedure that was executed */
  readonly procedureId: string;
  /** Whether the procedure completed successfully */
  readonly success: boolean;
  /** Recovery time in milliseconds */
  readonly recoveryMs: number;
  /** Verification result */
  readonly verificationPassed: boolean;
  /** Error message if failed */
  readonly error?: string;
}

// ── Default Failover Procedures ────────────────────────────────────

/**
 * Standard failover procedures for the API service.
 *
 * These cover the primary failure modes:
 * 1. Model endpoint down — retry with backoff, then route to fallback
 * 2. Datastore connection lost — reconnect, validate schema
 * 3. Core library error — restart with clean state
 * 4. Auth service unavailable — degrade to cached auth, alert
 * 5. Full system restart — stop, clean shutdown, restart
 */
export const DEFAULT_FAILOVER_PROCEDURES: readonly FailoverProcedure[] = [
  {
    id: 'model-recovery',
    name: 'Model endpoint recovery',
    trigger: 'model-unhealthy',
    steps: [
      '1. Log the model health check failure with timestamp and error detail.',
      '2. Attempt first retry after 1 second.',
      '3. Attempt second retry after 2 seconds (exponential backoff).',
      '4. Attempt third retry after 4 seconds.',
      '5. If all retries fail, mark model as unavailable and route parse/realize requests to queue.',
      '6. Send alert to operations channel with model endpoint and error details.',
      '7. Continue serving /health and /ready with degraded status.',
    ],
    verification: 'Confirm model health check passes and queued requests are processed.',
    maxRecoveryMs: 10_000,
  },
  {
    id: 'datastore-recovery',
    name: 'Datastore connection recovery',
    trigger: 'datastore-unhealthy',
    steps: [
      '1. Log the datastore connection failure.',
      '2. Close the existing connection and clear any pending transactions.',
      '3. Re-establish connection with new parameters.',
      '4. Run schema version check to ensure compatibility.',
      '5. Verify read/write with a test record.',
      '6. If recovery fails, mark datastore as unavailable and return 503 on data-dependent endpoints.',
    ],
    verification: 'Confirm datastore health check passes and test read/write succeeds.',
    maxRecoveryMs: 15_000,
  },
  {
    id: 'core-restart',
    name: 'Core library restart',
    trigger: 'core-unhealthy',
    steps: [
      '1. Log the core library error with stack trace.',
      '2. Trigger a graceful shutdown of the current process.',
      '3. Wait up to 5 seconds for active requests to complete.',
      '4. Restart the process with clean state.',
      '5. Run startup health checks on all dependencies.',
      '6. If startup fails, retry once more before declaring outage.',
    ],
    verification: 'Confirm all health checks pass after restart and uptime resets.',
    maxRecoveryMs: 10_000,
  },
  {
    id: 'auth-degrade',
    name: 'Authentication degradation',
    trigger: 'auth-unavailable',
    steps: [
      '1. Log the auth service failure.',
      '2. Switch to cached authentication mode (last known valid tokens).',
      '3. Return 200 with cached auth for existing tenants.',
      '4. Return 401 for new tenants until auth is restored.',
      '5. Send alert to operations channel.',
      '6. Resume normal auth when service recovers.',
    ],
    verification: 'Confirm cached auth works for existing tenants and new tenant requests return 401.',
    maxRecoveryMs: 5_000,
  },
  {
    id: 'full-restart',
    name: 'Full system restart',
    trigger: 'multiple-unhealthy',
    steps: [
      '1. Log all unhealthy components and their status.',
      '2. Initiate graceful shutdown: stop accepting new requests, complete in-flight requests.',
      '3. Wait up to 10 seconds for graceful shutdown.',
      '4. Force shutdown if graceful period expires.',
      '5. Restart the process.',
      '6. Run all health checks on startup.',
      '7. Verify each dependency before marking service ready.',
      '8. If any critical dependency fails, report specific failure and keep process running.',
    ],
    verification: 'Confirm all components report ok status and service responds on /health and /ready.',
    maxRecoveryMs: 20_000,
  },
] as const;

// ── Failover Decision Logic ────────────────────────────────────────

/**
 * Determine which failover procedure(s) to execute based on current
 * component health states.
 *
 * Returns procedures ordered by priority: individual component failures
 * first, then multi-component full restart if needed.
 */
export function determineFailoverProcedures(
  components: readonly ComponentHealth[]
): readonly FailoverProcedure[] {
  const unhealthyComponents = components.filter(
    (c) => c.status === 'unhealthy'
  );
  const degradedComponents = components.filter(
    (c) => c.status === 'degraded'
  );

  // Empty or no unhealthy components
  if (components.length === 0 || unhealthyComponents.length === 0) {
    return [];
  }

  // If more than half the components are unhealthy, trigger full restart
  if (unhealthyComponents.length >= Math.ceil(components.length / 2)) {
    return [DEFAULT_FAILOVER_PROCEDURES[4]!]; // full-restart
  }

  // Otherwise, return procedures for each unhealthy component
  const procedures: FailoverProcedure[] = [];
  for (const comp of unhealthyComponents) {
    // Try the standard trigger pattern first, then fall back to exact match
    let proc = DEFAULT_FAILOVER_PROCEDURES.find(
      (p) => p.trigger === `${comp.name}-unhealthy`
    );
    if (!proc) {
      proc = DEFAULT_FAILOVER_PROCEDURES.find(
        (p) => p.trigger.includes(comp.name)
      );
    }
    if (proc) {
      procedures.push(proc);
    }
  }

  return procedures;
}

/**
 * Check if the current component states indicate a recoverable condition.
 *
 * A condition is recoverable when:
 * - At most one component is unhealthy, AND
 * - No component has been in an unhealthy state for more than max downtime
 */
export function isRecoverable(
  components: readonly ComponentHealth[],
  maxDowntimeMs: number
): boolean {
  const unhealthyComponents = components.filter(
    (c) => c.status === 'unhealthy'
  );

  // More than one unhealthy component is unrecoverable
  if (unhealthyComponents.length > 1) {
    return false;
  }

  // Check if the single unhealthy component has been down too long
  if (unhealthyComponents.length === 1) {
    const comp = unhealthyComponents[0]!;
    if (
      comp.lastCheckedAt !== null &&
      Date.now() - new Date(comp.lastCheckedAt).getTime() > maxDowntimeMs
    ) {
      return false;
    }
  }

  return true;
}

// ── Failover Procedure Runner ──────────────────────────────────────

/**
 * Simulate executing a failover procedure and return the result.
 *
 * In a real implementation, this would execute the actual steps
 * and verify recovery. For testing purposes, it simulates the
 * procedure with configurable outcomes.
 */
export async function executeFailoverProcedure(
  procedure: FailoverProcedure,
  simulateDelayMs: number = 100,
  simulateSuccess: boolean = true,
  simulateError?: string
): Promise<FailoverResult> {
  const start = Date.now();

  // Simulate running the procedure steps
  await new Promise((resolve) =>
    setTimeout(resolve, simulateDelayMs)
  );

  const recoveryMs = Date.now() - start;
  const success = simulateSuccess;
  const verificationPassed = success;

  return {
    procedureId: procedure.id,
    success,
    recoveryMs,
    verificationPassed,
    ...(success
      ? {}
      : {
          error:
            simulateError ??
            `Procedure ${procedure.id} failed to recover ${procedure.trigger}`,
        }),
  };
}

/**
 * Run all applicable failover procedures for the given component states.
 * Returns results for each procedure executed.
 */
export async function runFailover(
  components: readonly ComponentHealth[],
  options: {
    simulateDelayMs?: number;
    simulateSuccess?: boolean;
    simulateError?: string;
  } = {}
): Promise<readonly FailoverResult[]> {
  const { simulateDelayMs = 100, simulateSuccess = true, simulateError } =
    options;
  const procedures = determineFailoverProcedures(components);

  const results: FailoverResult[] = [];
  for (const proc of procedures) {
    const result = await executeFailoverProcedure(
      proc,
      simulateDelayMs,
      simulateSuccess,
      simulateError
    );
    results.push(result);
  }

  return results;
}
