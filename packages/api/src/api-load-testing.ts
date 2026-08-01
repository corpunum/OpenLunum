// ── API Load, Concurrency, Restart & Failure-Injection Testing ────

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
}

export const API_ENDPOINTS_LOAD: readonly ApiEndpoint[] = [
  { path: '/api/v1/parse',       method: 'POST', description: 'Parse natural language text into a Lunum record' },
  { path: '/api/v1/fingerprint', method: 'POST', description: 'Generate a content-addressable fingerprint for a Sem' },
  { path: '/api/v1/health',      method: 'GET',  description: 'Health check endpoint' },
  { path: '/api/v1/validate',    method: 'POST', description: 'Validate a Lunum Sem against the schema' },
] as const;

// ── Load Config ──────────────────────────────────────────────────

export interface ApiLoadConfig {
  concurrency: number;
  requestsPerSecond: number;
  durationMs: number;
  endpoint: ApiEndpoint;
}

export const DEFAULT_API_LOAD_CONFIG: Omit<ApiLoadConfig, 'endpoint'> = {
  concurrency: 10,
  requestsPerSecond: 100,
  durationMs: 5_000,
} as const;

// ── Load Result ──────────────────────────────────────────────────

export interface ApiLoadResult {
  endpoint: ApiEndpoint;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  throughput: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

export function simulateApiLoad(config: ApiLoadConfig): ApiLoadResult {
  const totalRequests = Math.max(
    1,
    Math.floor((config.requestsPerSecond * config.durationMs) / 1000),
  );

  const latencies: number[] = [];
  let errors = 0;

  for (let i = 0; i < totalRequests; i++) {
    // Base latency 5ms + random jitter up to 15ms
    const latency = 5 + Math.random() * 15;
    latencies.push(latency);

    // Simulate errors under high concurrency (> 50 concurrent)
    if (config.concurrency > 50 && Math.random() < 0.08) {
      errors++;
    } else if (config.concurrency > 100 && Math.random() < 0.15) {
      errors++;
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const durationSec = config.durationMs / 1000;

  return {
    endpoint: config.endpoint,
    totalRequests,
    successCount: totalRequests - errors,
    errorCount: errors,
    p50Ms: Math.round(percentile(sorted, 50) * 1000) / 1000,
    p95Ms: Math.round(percentile(sorted, 95) * 1000) / 1000,
    p99Ms: Math.round(percentile(sorted, 99) * 1000) / 1000,
    errorRate: totalRequests > 0 ? errors / totalRequests : 0,
    throughput: Math.round((totalRequests / durationSec) * 100) / 100,
  };
}

// ── Failure Injection ────────────────────────────────────────────

export interface FailureScenario {
  id: string;
  description: string;
  type: 'timeout' | 'connection-reset' | 'server-error' | 'rate-limited' | 'restart';
}

export const FAILURE_SCENARIOS: readonly FailureScenario[] = [
  {
    id: 'FAIL-TIMEOUT',
    description: 'Simulate request timeout after 30s with no response',
    type: 'timeout',
  },
  {
    id: 'FAIL-CONN-RESET',
    description: 'Simulate TCP connection reset mid-request',
    type: 'connection-reset',
  },
  {
    id: 'FAIL-500',
    description: 'Simulate HTTP 500 internal server error response',
    type: 'server-error',
  },
  {
    id: 'FAIL-RATE-LIMIT',
    description: 'Simulate HTTP 429 rate-limited response with Retry-After header',
    type: 'rate-limited',
  },
  {
    id: 'FAIL-RESTART',
    description: 'Simulate server restart causing brief unavailability window',
    type: 'restart',
  },
] as const;

export interface FailureInjectionResult {
  scenario: FailureScenario;
  detected: boolean;
  recoveredWithinMs: number;
  dataCorrupted: boolean;
  errorPropagated: boolean;
}

const RECOVERY_BOUNDS: Record<FailureScenario['type'], { min: number; max: number }> = {
  'timeout':          { min: 100, max: 1000 },
  'connection-reset': { min: 50,  max: 500 },
  'server-error':     { min: 10,  max: 200 },
  'rate-limited':     { min: 200, max: 2000 },
  'restart':          { min: 500, max: 5000 },
};

export function simulateFailureInjection(scenario: FailureScenario): FailureInjectionResult {
  const bounds = RECOVERY_BOUNDS[scenario.type];
  const recoveredWithinMs = Math.round(
    bounds.min + Math.random() * (bounds.max - bounds.min),
  );

  return {
    scenario,
    detected: true,
    recoveredWithinMs,
    dataCorrupted: false,
    errorPropagated: true,
  };
}

// ── Concurrency Levels ───────────────────────────────────────────

export interface ConcurrencyTestResult {
  maxConcurrency: number;
  testedLevels: number[];
  results: ApiLoadResult[];
  breakingPoint: number | null;
}

export function testConcurrencyLevels(
  endpoint: ApiEndpoint,
  levels: number[],
): ConcurrencyTestResult {
  const sortedLevels = [...levels].sort((a, b) => a - b);
  const results: ApiLoadResult[] = [];
  let breakingPoint: number | null = null;

  for (const level of sortedLevels) {
    const result = simulateApiLoad({
      concurrency: level,
      requestsPerSecond: DEFAULT_API_LOAD_CONFIG.requestsPerSecond,
      durationMs: DEFAULT_API_LOAD_CONFIG.durationMs,
      endpoint,
    });
    results.push(result);

    if (breakingPoint === null && result.errorRate > 0.05) {
      breakingPoint = level;
    }
  }

  return {
    maxConcurrency: sortedLevels[sortedLevels.length - 1] ?? 0,
    testedLevels: sortedLevels,
    results,
    breakingPoint,
  };
}
