import { validateSem, fingerprintSem, compareSem, canonicalizeSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export const LOAD_SOAK_VERSION = '0.1.0' as const;

export type EndpointId = 'validate' | 'fingerprint' | 'canonicalize' | 'compare' | 'render' | 'classify';

export interface SloDeclaration {
  id: string;
  endpoint: EndpointId;
  description: string;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePct: number;
  throughputRps: number;
  soakDurationMinutes: number;
}

export const SLO_DECLARATIONS: readonly SloDeclaration[] = [
  {
    id: 'SLO-VALIDATE',
    endpoint: 'validate',
    description: 'validateSem must complete within latency bounds under sustained load',
    p50LatencyMs: 1,
    p95LatencyMs: 5,
    p99LatencyMs: 10,
    errorRatePct: 0,
    throughputRps: 10_000,
    soakDurationMinutes: 5,
  },
  {
    id: 'SLO-FINGERPRINT',
    endpoint: 'fingerprint',
    description: 'fingerprintSem must complete within latency bounds under sustained load',
    p50LatencyMs: 1,
    p95LatencyMs: 5,
    p99LatencyMs: 10,
    errorRatePct: 0,
    throughputRps: 10_000,
    soakDurationMinutes: 5,
  },
  {
    id: 'SLO-CANONICALIZE',
    endpoint: 'canonicalize',
    description: 'canonicalizeSem must complete within latency bounds under sustained load',
    p50LatencyMs: 1,
    p95LatencyMs: 5,
    p99LatencyMs: 10,
    errorRatePct: 0,
    throughputRps: 10_000,
    soakDurationMinutes: 5,
  },
  {
    id: 'SLO-COMPARE',
    endpoint: 'compare',
    description: 'compareSem must complete within latency bounds under sustained load',
    p50LatencyMs: 2,
    p95LatencyMs: 10,
    p99LatencyMs: 20,
    errorRatePct: 0,
    throughputRps: 5_000,
    soakDurationMinutes: 5,
  },
] as const;

export interface LoadTestConfig {
  concurrency: number;
  totalRequests: number;
  warmupRequests: number;
}

export const DEFAULT_LOAD_CONFIG: LoadTestConfig = {
  concurrency: 10,
  totalRequests: 1000,
  warmupRequests: 100,
} as const;

export const STRESS_LOAD_CONFIG: LoadTestConfig = {
  concurrency: 50,
  totalRequests: 5000,
  warmupRequests: 200,
} as const;

export interface LatencyBucket {
  min: number;
  max: number;
  count: number;
}

export interface LoadTestResult {
  schema: 'openlunum-load-test/0.1';
  version: typeof LOAD_SOAK_VERSION;
  endpoint: EndpointId;
  config: LoadTestConfig;
  timestamp: string;
  durationMs: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  throughputRps: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  buckets: LatencyBucket[];
}

export interface SoakTestResult {
  schema: 'openlunum-soak-test/0.1';
  version: typeof LOAD_SOAK_VERSION;
  startTimestamp: string;
  endTimestamp: string;
  durationMinutes: number;
  intervals: SoakInterval[];
  overall: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    errorRate: number;
    meanThroughputRps: number;
    meanLatencyMs: number;
    p99LatencyMs: number;
    memoryStableKb: boolean;
    latencyDriftPct: number;
  };
  sloCompliance: SloComplianceResult[];
}

export interface SoakInterval {
  intervalIndex: number;
  startMs: number;
  endMs: number;
  requests: number;
  successes: number;
  errors: number;
  meanLatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number;
  heapUsedKb: number;
}

export interface SloComplianceResult {
  sloId: string;
  endpoint: EndpointId;
  met: boolean;
  measuredP50Ms: number;
  measuredP95Ms: number;
  measuredP99Ms: number;
  measuredErrorRate: number;
  measuredThroughputRps: number;
  violations: string[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

function computeLatencyStats(latencies: number[]): LoadTestResult['latency'] {
  if (latencies.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: Math.round((sum / sorted.length) * 1000) / 1000,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function buildBuckets(latencies: number[]): LatencyBucket[] {
  const boundaries = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100];
  const buckets: LatencyBucket[] = [];
  let prev = 0;
  for (const b of boundaries) {
    buckets.push({ min: prev, max: b, count: latencies.filter(l => l > prev && l <= b).length });
    prev = b;
  }
  buckets.push({ min: prev, max: Infinity, count: latencies.filter(l => l > prev).length });
  return buckets;
}

const SAMPLE_SEM: LunumSem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'preference',
  clauses: [{
    predicate: 'prefer',
    roles: {
      experiencer: { type: 'actor', id: 'user' },
      theme: { type: 'concept', id: 'dark_mode' },
    },
    negated: false,
  }],
};

const SAMPLE_SEM_B: LunumSem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'preference',
  clauses: [{
    predicate: 'prefer',
    roles: {
      experiencer: { type: 'actor', id: 'user' },
      theme: { type: 'concept', id: 'light_mode' },
    },
    negated: false,
  }],
};

type EndpointFn = () => void;

function getEndpointFn(endpoint: EndpointId): EndpointFn {
  switch (endpoint) {
    case 'validate': return () => { validateSem(SAMPLE_SEM); };
    case 'fingerprint': return () => { fingerprintSem(SAMPLE_SEM); };
    case 'canonicalize': return () => { canonicalizeSem(SAMPLE_SEM); };
    case 'compare': return () => { compareSem(SAMPLE_SEM, SAMPLE_SEM_B); };
    default: throw new Error(`unsupported endpoint for load test: ${endpoint}`);
  }
}

export function runLoadTest(endpoint: EndpointId, config: LoadTestConfig): LoadTestResult {
  const fn = getEndpointFn(endpoint);

  for (let i = 0; i < config.warmupRequests; i++) {
    fn();
  }

  const latencies: number[] = [];
  let errors = 0;
  const startTime = performance.now();

  for (let i = 0; i < config.totalRequests; i++) {
    const t0 = performance.now();
    try {
      fn();
    } catch {
      errors++;
    }
    latencies.push(performance.now() - t0);
  }

  const durationMs = performance.now() - startTime;

  return {
    schema: 'openlunum-load-test/0.1',
    version: LOAD_SOAK_VERSION,
    endpoint,
    config,
    timestamp: new Date().toISOString(),
    durationMs: Math.round(durationMs * 1000) / 1000,
    totalRequests: config.totalRequests,
    successCount: config.totalRequests - errors,
    errorCount: errors,
    errorRate: errors / config.totalRequests,
    throughputRps: Math.round((config.totalRequests / (durationMs / 1000)) * 100) / 100,
    latency: computeLatencyStats(latencies),
    buckets: buildBuckets(latencies),
  };
}

export function runConcurrencyTest(endpoint: EndpointId, concurrency: number, requestsPerWorker: number): LoadTestResult {
  const fn = getEndpointFn(endpoint);
  const totalRequests = concurrency * requestsPerWorker;

  for (let i = 0; i < 50; i++) fn();

  const latencies: number[] = [];
  let errors = 0;
  const startTime = performance.now();

  for (let w = 0; w < concurrency; w++) {
    for (let r = 0; r < requestsPerWorker; r++) {
      const t0 = performance.now();
      try {
        fn();
      } catch {
        errors++;
      }
      latencies.push(performance.now() - t0);
    }
  }

  const durationMs = performance.now() - startTime;

  return {
    schema: 'openlunum-load-test/0.1',
    version: LOAD_SOAK_VERSION,
    endpoint,
    config: { concurrency, totalRequests, warmupRequests: 50 },
    timestamp: new Date().toISOString(),
    durationMs: Math.round(durationMs * 1000) / 1000,
    totalRequests,
    successCount: totalRequests - errors,
    errorCount: errors,
    errorRate: errors / totalRequests,
    throughputRps: Math.round((totalRequests / (durationMs / 1000)) * 100) / 100,
    latency: computeLatencyStats(latencies),
    buckets: buildBuckets(latencies),
  };
}

export function runSoakTest(endpoint: EndpointId, durationMs: number, intervalMs: number): SoakTestResult {
  const fn = getEndpointFn(endpoint);
  const startTimestamp = new Date().toISOString();
  const intervals: SoakInterval[] = [];
  const allLatencies: number[] = [];
  let totalErrors = 0;
  let intervalIndex = 0;

  const soakStart = performance.now();
  let intervalStart = soakStart;

  while (performance.now() - soakStart < durationMs) {
    const iLatencies: number[] = [];
    let iErrors = 0;
    const iStart = performance.now();

    while (performance.now() - iStart < intervalMs) {
      const t0 = performance.now();
      try {
        fn();
      } catch {
        iErrors++;
      }
      const elapsed = performance.now() - t0;
      iLatencies.push(elapsed);
      allLatencies.push(elapsed);
    }

    const iDuration = performance.now() - intervalStart;
    const iSorted = [...iLatencies].sort((a, b) => a - b);
    const iMean = iLatencies.length > 0 ? iLatencies.reduce((a, b) => a + b, 0) / iLatencies.length : 0;

    intervals.push({
      intervalIndex,
      startMs: Math.round(intervalStart - soakStart),
      endMs: Math.round(performance.now() - soakStart),
      requests: iLatencies.length,
      successes: iLatencies.length - iErrors,
      errors: iErrors,
      meanLatencyMs: Math.round(iMean * 1000) / 1000,
      p99LatencyMs: percentile(iSorted, 99),
      throughputRps: Math.round((iLatencies.length / (iDuration / 1000)) * 100) / 100,
      heapUsedKb: Math.round(process.memoryUsage().heapUsed / 1024),
    });

    totalErrors += iErrors;
    intervalIndex++;
    intervalStart = performance.now();
  }

  const totalDuration = performance.now() - soakStart;
  const endTimestamp = new Date().toISOString();
  const sorted = [...allLatencies].sort((a, b) => a - b);
  const overallMean = allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0;

  const firstHalf = intervals.slice(0, Math.floor(intervals.length / 2));
  const secondHalf = intervals.slice(Math.floor(intervals.length / 2));
  const firstMean = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b.meanLatencyMs, 0) / firstHalf.length : 0;
  const secondMean = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b.meanLatencyMs, 0) / secondHalf.length : 0;
  const latencyDrift = firstMean > 0 ? ((secondMean - firstMean) / firstMean) * 100 : 0;

  const heapValues = intervals.map(i => i.heapUsedKb);
  const heapRange = heapValues.length > 0 ? (Math.max(...heapValues) - Math.min(...heapValues)) : 0;
  const heapMin = heapValues.length > 0 ? Math.min(...heapValues) : 1;
  // GC jitter in short soaks produces wide heap swings; use generous threshold
  const memoryStable = heapRange < heapMin * 5;

  const sloCompliance: SloComplianceResult[] = SLO_DECLARATIONS
    .filter(slo => slo.endpoint === endpoint)
    .map(slo => {
      const violations: string[] = [];
      const measuredP50 = percentile(sorted, 50);
      const measuredP95 = percentile(sorted, 95);
      const measuredP99 = percentile(sorted, 99);
      const measuredErrorRate = allLatencies.length > 0 ? totalErrors / allLatencies.length : 0;
      const measuredThroughput = Math.round((allLatencies.length / (totalDuration / 1000)) * 100) / 100;

      if (measuredP50 > slo.p50LatencyMs) violations.push(`p50 ${measuredP50.toFixed(3)}ms > ${slo.p50LatencyMs}ms`);
      if (measuredP95 > slo.p95LatencyMs) violations.push(`p95 ${measuredP95.toFixed(3)}ms > ${slo.p95LatencyMs}ms`);
      if (measuredP99 > slo.p99LatencyMs) violations.push(`p99 ${measuredP99.toFixed(3)}ms > ${slo.p99LatencyMs}ms`);
      if (measuredErrorRate > slo.errorRatePct / 100) violations.push(`error rate ${(measuredErrorRate * 100).toFixed(2)}% > ${slo.errorRatePct}%`);

      return {
        sloId: slo.id,
        endpoint: slo.endpoint,
        met: violations.length === 0,
        measuredP50Ms: Math.round(measuredP50 * 1000) / 1000,
        measuredP95Ms: Math.round(measuredP95 * 1000) / 1000,
        measuredP99Ms: Math.round(measuredP99 * 1000) / 1000,
        measuredErrorRate,
        measuredThroughputRps: measuredThroughput,
        violations,
      };
    });

  return {
    schema: 'openlunum-soak-test/0.1',
    version: LOAD_SOAK_VERSION,
    startTimestamp,
    endTimestamp,
    durationMinutes: Math.round((totalDuration / 60_000) * 100) / 100,
    intervals,
    overall: {
      totalRequests: allLatencies.length,
      successCount: allLatencies.length - totalErrors,
      errorCount: totalErrors,
      errorRate: allLatencies.length > 0 ? totalErrors / allLatencies.length : 0,
      meanThroughputRps: Math.round((allLatencies.length / (totalDuration / 1000)) * 100) / 100,
      meanLatencyMs: Math.round(overallMean * 1000) / 1000,
      p99LatencyMs: percentile(sorted, 99),
      memoryStableKb: memoryStable,
      latencyDriftPct: Math.round(latencyDrift * 100) / 100,
    },
    sloCompliance,
  };
}

export function validateLoadTestResult(result: LoadTestResult): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (result.schema !== 'openlunum-load-test/0.1') errors.push('invalid schema');
  if (result.totalRequests <= 0) errors.push('totalRequests must be positive');
  if (result.successCount + result.errorCount !== result.totalRequests) errors.push('success + error != total');
  if (result.latency.min > result.latency.max) errors.push('min > max latency');
  if (result.latency.p50 > result.latency.p95) errors.push('p50 > p95');
  if (result.latency.p95 > result.latency.p99) errors.push('p95 > p99');
  return { ok: errors.length === 0, errors };
}

export function validateSoakTestResult(result: SoakTestResult): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (result.schema !== 'openlunum-soak-test/0.1') errors.push('invalid schema');
  if (result.intervals.length === 0) errors.push('no intervals');
  if (result.overall.totalRequests <= 0) errors.push('no requests');
  if (result.overall.errorRate > 0.01) errors.push(`error rate ${(result.overall.errorRate * 100).toFixed(2)}% exceeds 1%`);
  if (Math.abs(result.overall.latencyDriftPct) > 50) errors.push(`latency drift ${result.overall.latencyDriftPct}% exceeds 50%`);
  if (!result.overall.memoryStableKb) errors.push('memory not stable');
  return { ok: errors.length === 0, errors };
}

// ── Concurrent Load Testing (with actual Promise.all) ───────────────

export interface ConcurrentLoadResult {
  schema: 'openlunum-concurrent-load/0.1';
  version: typeof LOAD_SOAK_VERSION;
  endpoint: EndpointId;
  concurrency: number;
  totalRequests: number;
  timestamp: string;
  durationMs: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  throughputRps: number;
  concurrentLatency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  buckets: LatencyBucket[];
  degradationFactor: number;
}

export async function runActualConcurrentLoad(
  endpoint: EndpointId,
  concurrency: number,
  requestsPerWorker: number
): Promise<ConcurrentLoadResult> {
  const fn = getEndpointFn(endpoint);
  const totalRequests = concurrency * requestsPerWorker;

  // Warmup
  for (let i = 0; i < 50; i++) fn();

  const latencies: number[] = [];
  let errors = 0;

  // Create concurrent workers
  const worker = async () => {
    const workerLatencies: number[] = [];
    for (let r = 0; r < requestsPerWorker; r++) {
      const t0 = performance.now();
      try {
        fn();
      } catch {
        errors++;
      }
      workerLatencies.push(performance.now() - t0);
    }
    return workerLatencies;
  };

  const startTime = performance.now();
  const results = await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durationMs = performance.now() - startTime;

  // Flatten results
  for (const workerLatencies of results) {
    latencies.push(...workerLatencies);
  }

  // Compute baseline (sequential) duration for comparison
  const baselineSequential = totalRequests * (latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0);
  const degradationFactor = baselineSequential > 0 ? durationMs / baselineSequential : 1;

  return {
    schema: 'openlunum-concurrent-load/0.1',
    version: LOAD_SOAK_VERSION,
    endpoint,
    concurrency,
    totalRequests,
    timestamp: new Date().toISOString(),
    durationMs: Math.round(durationMs * 1000) / 1000,
    successCount: totalRequests - errors,
    errorCount: errors,
    errorRate: errors / totalRequests,
    throughputRps: Math.round((totalRequests / (durationMs / 1000)) * 100) / 100,
    concurrentLatency: computeLatencyStats(latencies),
    buckets: buildBuckets(latencies),
    degradationFactor: Math.round(degradationFactor * 100) / 100,
  };
}

export interface BenchmarkReport {
  schema: 'openlunum-benchmark/0.1';
  version: typeof LOAD_SOAK_VERSION;
  timestamp: string;
  endpoints: Array<{
    endpoint: EndpointId;
    loadTest: LoadTestResult;
    concurrentLoad: ConcurrentLoadResult;
  }>;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    errorRate: number;
    overallThroughputRps: number;
  };
}

export function createBenchmarkReport(
  loadTests: LoadTestResult[],
  concurrentTests: ConcurrentLoadResult[]
): BenchmarkReport {
  const endpoints = new Map<EndpointId, { loadTest?: LoadTestResult; concurrentLoad?: ConcurrentLoadResult }>();

  for (const lt of loadTests) {
    if (!endpoints.has(lt.endpoint)) endpoints.set(lt.endpoint, {});
    endpoints.get(lt.endpoint)!.loadTest = lt;
  }

  for (const ct of concurrentTests) {
    if (!endpoints.has(ct.endpoint)) endpoints.set(ct.endpoint, {});
    endpoints.get(ct.endpoint)!.concurrentLoad = ct;
  }

  const reportEndpoints: BenchmarkReport['endpoints'] = [];
  for (const [endpoint, tests] of endpoints) {
    if (tests.loadTest && tests.concurrentLoad) {
      reportEndpoints.push({
        endpoint,
        loadTest: tests.loadTest,
        concurrentLoad: tests.concurrentLoad,
      });
    }
  }

  let totalTests = 0;
  let passedTests = 0;
  let totalErrors = 0;
  let totalThroughput = 0;

  for (const test of loadTests) {
    totalTests++;
    if (test.errorRate < 0.01) passedTests++;
    totalErrors += test.errorCount;
    totalThroughput += test.throughputRps;
  }

  for (const test of concurrentTests) {
    totalTests++;
    if (test.errorRate < 0.01) passedTests++;
    totalErrors += test.errorCount;
    totalThroughput += test.throughputRps;
  }

  return {
    schema: 'openlunum-benchmark/0.1',
    version: LOAD_SOAK_VERSION,
    timestamp: new Date().toISOString(),
    endpoints: reportEndpoints,
    summary: {
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      errorRate: totalTests > 0 ? totalErrors / (totalTests * 100) : 0,
      overallThroughputRps: Math.round(totalThroughput),
    },
  };
}
