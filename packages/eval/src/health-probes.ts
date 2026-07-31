/**
 * Health/readiness probes and failover procedures.
 *
 * Implements R14.6 for Phase 5 operational readiness: health checks,
 * readiness gates, and documented failover procedures.
 */

import { validateSem, fingerprintSem, SEM_SCHEMA } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

// ── Types ──────────────────────────────────────────────────────────

export interface HealthProbe {
  readonly name: string;
  readonly check: () => boolean;
  readonly timeoutMs: number;
  readonly critical: boolean;
}

export interface ProbeResult {
  readonly name: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly critical: boolean;
  readonly error?: string;
}

export interface HealthReport {
  readonly timestamp: string;
  readonly probes: readonly ProbeResult[];
  readonly healthy: boolean;
  readonly ready: boolean;
}

export interface FailoverProcedure {
  readonly id: string;
  readonly trigger: string;
  readonly steps: readonly string[];
  readonly verification: string;
}

// ── checkHealth ────────────────────────────────────────────────────

/**
 * Run all probes synchronously and return an aggregate health report.
 *
 * - `healthy` is true only when every probe passes.
 * - `ready` is true when all *critical* probes pass (non-critical failures
 *   do not block readiness).
 */
export function checkHealth(probes: readonly HealthProbe[]): HealthReport {
  const results: ProbeResult[] = [];

  for (const probe of probes) {
    const start = performance.now();
    let passed = false;
    let error: string | undefined;

    try {
      passed = probe.check();
    } catch (err: unknown) {
      passed = false;
      error = err instanceof Error ? err.message : String(err);
    }

    const durationMs = performance.now() - start;

    const result: ProbeResult = {
      name: probe.name,
      passed,
      durationMs,
      critical: probe.critical,
      ...(error !== undefined ? { error } : {}),
    };
    results.push(result);
  }

  const healthy = results.every((r) => r.passed);
  const ready = results.filter((r) => r.critical).every((r) => r.passed);

  return {
    timestamp: new Date().toISOString(),
    probes: results,
    healthy,
    ready,
  };
}

// ── Built-in probes ────────────────────────────────────────────────

/** A minimal valid sem used by built-in probes. */
const PROBE_SEM: LunumSem = {
  schema: SEM_SCHEMA,
  world: 'probe',
  kind: 'health-check',
  clauses: [{ predicate: 'alive', roles: { subject: 'system' } }],
};

/** Validates a known-good sem via `validateSem`. */
export const semValidationProbe: HealthProbe = {
  name: 'sem-validation',
  check(): boolean {
    const result = validateSem(PROBE_SEM);
    return result.ok;
  },
  timeoutMs: 1000,
  critical: true,
};

/** Fingerprints a known-good sem and checks the result is non-empty. */
export const fingerprintProbe: HealthProbe = {
  name: 'fingerprint',
  check(): boolean {
    const fp = fingerprintSem(PROBE_SEM);
    return typeof fp === 'string' && fp.length > 0;
  },
  timeoutMs: 1000,
  critical: true,
};

/** Checks that the known schema string is recognised. */
export const schemaRegistryProbe: HealthProbe = {
  name: 'schema-registry',
  check(): boolean {
    // Validate a sem that uses the known schema — if the schema string is
    // unrecognised validateSem would report errors.
    const result = validateSem({
      schema: SEM_SCHEMA,
      world: 'probe',
      kind: 'registry-check',
      clauses: [{ predicate: 'exists', roles: { subject: 'schema' } }],
    });
    return result.ok;
  },
  timeoutMs: 1000,
  critical: false,
};

// ── Failover Procedures ───────────────────────────────────────────

export const FAILOVER_PROCEDURES: readonly FailoverProcedure[] = [
  {
    id: 'router-restart',
    trigger: 'router unresponsive',
    steps: [
      'Detect unresponsive router via consecutive health-check failures (>3)',
      'Log incident with timestamp and last-known state',
      'Gracefully stop the router process (SIGTERM, 10 s timeout)',
      'Force-kill if the process does not exit (SIGKILL)',
      'Clear stale PID and socket files',
      'Restart the router service',
      'Wait for readiness probe to pass',
    ],
    verification: 'Router readiness probe passes within 30 seconds of restart',
  },
  {
    id: 'model-eviction',
    trigger: 'memory pressure >90%',
    steps: [
      'Monitor memory usage via system probes',
      'Identify least-recently-used model in the model cache',
      'Evict the identified model from memory',
      'Run garbage collection / release buffers',
      'Verify memory usage drops below 80% threshold',
      'Reload the evicted model on next request if needed',
    ],
    verification: 'Memory usage below 80% and primary model responds within latency SLA',
  },
  {
    id: 'disk-full',
    trigger: 'disk usage >95%',
    steps: [
      'Alert on disk usage crossing 95% threshold',
      'Identify and remove stale temporary files (>24h old)',
      'Rotate and compress log files',
      'Purge old evidence/artifact caches beyond retention window',
      'Verify disk usage drops below 85%',
    ],
    verification: 'Disk usage below 85% and write operations succeed without ENOSPC',
  },
];

// ── Readiness Gate ─────────────────────────────────────────────────

export const ReadinessGate = {
  /**
   * Check readiness: returns `ready: true` only when all critical probes pass.
   * Lists the names of any failing critical probes in `failures`.
   */
  check(probes: readonly HealthProbe[]): { ready: boolean; failures: string[] } {
    const report = checkHealth(probes);
    const failures = report.probes
      .filter((r) => r.critical && !r.passed)
      .map((r) => r.name);
    return { ready: failures.length === 0, failures };
  },
};
