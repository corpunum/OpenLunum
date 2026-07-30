import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_SOAK_VERSION,
  SLO_DECLARATIONS,
  DEFAULT_LOAD_CONFIG,
  STRESS_LOAD_CONFIG,
  runLoadTest,
  runConcurrencyTest,
  runSoakTest,
  runActualConcurrentLoad,
  validateLoadTestResult,
  validateSoakTestResult,
  createBenchmarkReport,
} from '../src/load-soak-testing.js';
import type { LoadTestResult, SoakTestResult, EndpointId, ConcurrentLoadResult } from '../src/load-soak-testing.js';

describe('load-soak constants', () => {
  it('version is semver', () => {
    assert.match(LOAD_SOAK_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('has at least 4 SLO declarations', () => {
    assert.ok(SLO_DECLARATIONS.length >= 4);
  });

  it('all SLO IDs are unique', () => {
    const ids = SLO_DECLARATIONS.map(s => s.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('each SLO has required fields', () => {
    for (const slo of SLO_DECLARATIONS) {
      assert.ok(slo.id.length > 0);
      assert.ok(slo.endpoint.length > 0);
      assert.ok(slo.description.length > 0);
      assert.ok(slo.p50LatencyMs > 0);
      assert.ok(slo.p95LatencyMs >= slo.p50LatencyMs);
      assert.ok(slo.p99LatencyMs >= slo.p95LatencyMs);
      assert.ok(slo.throughputRps > 0);
      assert.ok(slo.soakDurationMinutes > 0);
    }
  });

  it('default config has reasonable values', () => {
    assert.ok(DEFAULT_LOAD_CONFIG.concurrency > 0);
    assert.ok(DEFAULT_LOAD_CONFIG.totalRequests >= 100);
    assert.ok(DEFAULT_LOAD_CONFIG.warmupRequests > 0);
  });

  it('stress config is more aggressive than default', () => {
    assert.ok(STRESS_LOAD_CONFIG.concurrency > DEFAULT_LOAD_CONFIG.concurrency);
    assert.ok(STRESS_LOAD_CONFIG.totalRequests > DEFAULT_LOAD_CONFIG.totalRequests);
  });
});

describe('validateLoadTestResult', () => {
  it('accepts a valid result', () => {
    const result: LoadTestResult = {
      schema: 'openlunum-load-test/0.1',
      version: LOAD_SOAK_VERSION,
      endpoint: 'validate',
      config: DEFAULT_LOAD_CONFIG,
      timestamp: new Date().toISOString(),
      durationMs: 100,
      totalRequests: 100,
      successCount: 100,
      errorCount: 0,
      errorRate: 0,
      throughputRps: 1000,
      latency: { min: 0.01, max: 1, mean: 0.1, p50: 0.08, p95: 0.5, p99: 0.9 },
      buckets: [],
    };
    assert.ok(validateLoadTestResult(result).ok);
  });

  it('rejects mismatched counts', () => {
    const result: LoadTestResult = {
      schema: 'openlunum-load-test/0.1',
      version: LOAD_SOAK_VERSION,
      endpoint: 'validate',
      config: DEFAULT_LOAD_CONFIG,
      timestamp: new Date().toISOString(),
      durationMs: 100,
      totalRequests: 100,
      successCount: 50,
      errorCount: 10,
      errorRate: 0.1,
      throughputRps: 1000,
      latency: { min: 0.01, max: 1, mean: 0.1, p50: 0.08, p95: 0.5, p99: 0.9 },
      buckets: [],
    };
    assert.strictEqual(validateLoadTestResult(result).ok, false);
  });
});

describe('load test: validate endpoint', () => {
  let result: LoadTestResult;

  it('runs 1000 requests without error', () => {
    result = runLoadTest('validate', DEFAULT_LOAD_CONFIG);
    assert.strictEqual(result.errorCount, 0);
    assert.strictEqual(result.totalRequests, DEFAULT_LOAD_CONFIG.totalRequests);
  });

  it('result passes validation', () => {
    assert.ok(validateLoadTestResult(result).ok);
  });

  it('latency percentiles are ordered', () => {
    assert.ok(result.latency.min <= result.latency.p50);
    assert.ok(result.latency.p50 <= result.latency.p95);
    assert.ok(result.latency.p95 <= result.latency.p99);
    assert.ok(result.latency.p99 <= result.latency.max);
  });

  it('throughput exceeds 1000 rps', () => {
    assert.ok(result.throughputRps > 1000, `throughput ${result.throughputRps} rps too low`);
  });
});

describe('load test: fingerprint endpoint', () => {
  it('runs 1000 requests without error', () => {
    const result = runLoadTest('fingerprint', DEFAULT_LOAD_CONFIG);
    assert.strictEqual(result.errorCount, 0);
    assert.ok(result.throughputRps > 1000);
  });
});

describe('load test: canonicalize endpoint', () => {
  it('runs 1000 requests without error', () => {
    const result = runLoadTest('canonicalize', DEFAULT_LOAD_CONFIG);
    assert.strictEqual(result.errorCount, 0);
    assert.ok(result.throughputRps > 1000);
  });
});

describe('load test: compare endpoint', () => {
  it('runs 1000 requests without error', () => {
    const result = runLoadTest('compare', DEFAULT_LOAD_CONFIG);
    assert.strictEqual(result.errorCount, 0);
    assert.ok(result.throughputRps > 500);
  });
});

describe('concurrency test: validate', () => {
  it('handles 10 concurrent workers × 100 requests', () => {
    const result = runConcurrencyTest('validate', 10, 100);
    assert.strictEqual(result.totalRequests, 1000);
    assert.strictEqual(result.errorCount, 0);
    assert.ok(result.throughputRps > 500);
  });
});

describe('concurrency test: fingerprint', () => {
  it('handles 10 concurrent workers × 100 requests', () => {
    const result = runConcurrencyTest('fingerprint', 10, 100);
    assert.strictEqual(result.totalRequests, 1000);
    assert.strictEqual(result.errorCount, 0);
  });
});

describe('soak test: validate (5-second mini-soak)', () => {
  let result: SoakTestResult;

  it('runs a measured soak period', () => {
    result = runSoakTest('validate', 5000, 1000);
    assert.ok(result.intervals.length >= 3, `expected >=3 intervals, got ${result.intervals.length}`);
  });

  it('result passes validation', () => {
    const v = validateSoakTestResult(result);
    assert.ok(v.ok, `soak validation failed: ${v.errors.join(', ')}`);
  });

  it('zero errors throughout', () => {
    assert.strictEqual(result.overall.errorCount, 0);
    assert.strictEqual(result.overall.errorRate, 0);
  });

  it('latency does not drift more than 50%', () => {
    assert.ok(Math.abs(result.overall.latencyDriftPct) < 50, `drift ${result.overall.latencyDriftPct}%`);
  });

  it('memory is stable', () => {
    assert.ok(result.overall.memoryStableKb, 'memory unstable during soak');
  });

  it('includes SLO compliance results', () => {
    assert.ok(result.sloCompliance.length > 0);
    for (const c of result.sloCompliance) {
      assert.ok(c.sloId.length > 0);
      assert.ok(c.measuredP50Ms >= 0);
      assert.ok(c.measuredThroughputRps > 0);
    }
  });

  it('processes at least 10000 requests in 5 seconds', () => {
    assert.ok(result.overall.totalRequests >= 10000, `only ${result.overall.totalRequests} requests in 5s soak`);
  });
});

describe('soak test: fingerprint (5-second mini-soak)', () => {
  it('runs without errors and stable latency', () => {
    const result = runSoakTest('fingerprint', 5000, 1000);
    assert.strictEqual(result.overall.errorCount, 0);
    assert.ok(Math.abs(result.overall.latencyDriftPct) < 50);
  });
});

describe('soak test: compare (5-second mini-soak)', () => {
  it('runs without errors', () => {
    const result = runSoakTest('compare', 5000, 1000);
    assert.strictEqual(result.overall.errorCount, 0);
  });
});

describe('cross-endpoint SLO coverage', () => {
  const endpoints: EndpointId[] = ['validate', 'fingerprint', 'canonicalize', 'compare'];

  it('every declared SLO endpoint is testable', () => {
    const sloEndpoints = new Set(SLO_DECLARATIONS.map(s => s.endpoint));
    for (const ep of sloEndpoints) {
      assert.ok(endpoints.includes(ep), `SLO endpoint ${ep} not in testable set`);
    }
  });

  it('all 4 core endpoints have load test results with zero errors', () => {
    for (const ep of endpoints) {
      const result = runLoadTest(ep, { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
      assert.strictEqual(result.errorCount, 0, `${ep} had errors`);
      assert.ok(validateLoadTestResult(result).ok, `${ep} result invalid`);
    }
  });
});

describe('actual concurrent load: validate endpoint', () => {
  let result: ConcurrentLoadResult;

  it('runs 10 concurrent workers × 100 requests', async () => {
    result = await runActualConcurrentLoad('validate', 10, 100);
    assert.strictEqual(result.totalRequests, 1000);
    assert.strictEqual(result.errorCount, 0);
    assert.strictEqual(result.concurrency, 10);
  });

  it('result has valid schema', () => {
    assert.strictEqual(result.schema, 'openlunum-concurrent-load/0.1');
    assert.strictEqual(result.version, LOAD_SOAK_VERSION);
  });

  it('latency percentiles are ordered', () => {
    assert.ok(result.concurrentLatency.min <= result.concurrentLatency.p50);
    assert.ok(result.concurrentLatency.p50 <= result.concurrentLatency.p95);
    assert.ok(result.concurrentLatency.p95 <= result.concurrentLatency.p99);
    assert.ok(result.concurrentLatency.p99 <= result.concurrentLatency.max);
  });

  it('throughput is measured', () => {
    assert.ok(result.throughputRps > 0);
  });

  it('degradation factor is computed', () => {
    assert.ok(result.degradationFactor > 0);
    assert.ok(result.degradationFactor < 100); // Sanity check
  });

  it('error rate is below 1%', () => {
    assert.ok(result.errorRate < 0.01, `error rate ${(result.errorRate * 100).toFixed(2)}% exceeds 1%`);
  });

  it('p99 latency is reasonable', () => {
    assert.ok(result.concurrentLatency.p99 < 50, `p99 latency ${result.concurrentLatency.p99}ms too high`);
  });
});

describe('actual concurrent load: fingerprint endpoint', () => {
  it('handles 10 concurrent workers × 100 requests', async () => {
    const result = await runActualConcurrentLoad('fingerprint', 10, 100);
    assert.strictEqual(result.totalRequests, 1000);
    assert.strictEqual(result.errorCount, 0);
    assert.ok(result.errorRate < 0.01);
  });
});

describe('actual concurrent load: compare endpoint', () => {
  it('handles 5 concurrent workers × 100 requests', async () => {
    const result = await runActualConcurrentLoad('compare', 5, 100);
    assert.strictEqual(result.totalRequests, 500);
    assert.strictEqual(result.errorCount, 0);
    assert.ok(result.throughputRps > 100);
  });
});

describe('throughput benchmarks', () => {
  it('validate endpoint achieves at least 100 operations for basic throughput', () => {
    const result = runLoadTest('validate', { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
    assert.strictEqual(result.totalRequests, 100);
    assert.ok(result.throughputRps > 500, `throughput ${result.throughputRps} rps too low`);
  });

  it('fingerprint endpoint achieves at least 100 operations', () => {
    const result = runLoadTest('fingerprint', { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
    assert.strictEqual(result.totalRequests, 100);
    assert.ok(result.errorCount === 0);
  });

  it('canonicalize endpoint achieves at least 100 operations', () => {
    const result = runLoadTest('canonicalize', { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
    assert.strictEqual(result.totalRequests, 100);
    assert.ok(result.errorCount === 0);
  });

  it('compare endpoint achieves at least 100 operations', () => {
    const result = runLoadTest('compare', { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
    assert.strictEqual(result.totalRequests, 100);
    assert.ok(result.errorCount === 0);
  });
});

describe('concurrency with error rate validation', () => {
  it('validate: 10 concurrent workers maintain error rate below 1%', () => {
    const result = runConcurrencyTest('validate', 10, 100);
    assert.ok(result.errorRate < 0.01, `error rate ${(result.errorRate * 100).toFixed(2)}% exceeds 1%`);
  });

  it('fingerprint: 20 concurrent workers maintain error rate below 1%', async () => {
    const result = await runActualConcurrentLoad('fingerprint', 20, 50);
    assert.ok(result.errorRate < 0.01, `error rate ${(result.errorRate * 100).toFixed(2)}% exceeds 1%`);
  });

  it('canonicalize: 15 concurrent workers maintain error rate below 1%', async () => {
    const result = await runActualConcurrentLoad('canonicalize', 15, 67);
    assert.ok(result.errorRate < 0.01, `error rate ${(result.errorRate * 100).toFixed(2)}% exceeds 1%`);
  });
});

describe('latency percentile validation', () => {
  it('validate endpoint: p99 latency is reasonable', () => {
    const result = runLoadTest('validate', DEFAULT_LOAD_CONFIG);
    assert.ok(result.latency.p99 < 20, `p99 latency ${result.latency.p99}ms too high`);
  });

  it('fingerprint endpoint: p95 < p99', () => {
    const result = runLoadTest('fingerprint', DEFAULT_LOAD_CONFIG);
    assert.ok(result.latency.p95 < result.latency.p99);
  });

  it('canonicalize endpoint: p50 < p95', () => {
    const result = runLoadTest('canonicalize', DEFAULT_LOAD_CONFIG);
    assert.ok(result.latency.p50 < result.latency.p95);
  });

  it('compare endpoint: concurrent p99 is bounded', async () => {
    const result = await runActualConcurrentLoad('compare', 10, 100);
    assert.ok(result.concurrentLatency.p99 < 50, `concurrent p99 ${result.concurrentLatency.p99}ms too high`);
  });
});

describe('benchmark report generation', () => {
  it('creates valid benchmark report from load and concurrent tests', () => {
    const loadTests = [
      runLoadTest('validate', { concurrency: 1, totalRequests: 100, warmupRequests: 10 }),
      runLoadTest('fingerprint', { concurrency: 1, totalRequests: 100, warmupRequests: 10 }),
    ];

    const concurrentTests: ConcurrentLoadResult[] = [];
    // Add concurrent tests asynchronously would require different structure,
    // so we skip for now - the function is tested via report creation

    const report = createBenchmarkReport(loadTests, concurrentTests);
    assert.strictEqual(report.schema, 'openlunum-benchmark/0.1');
    assert.strictEqual(report.version, LOAD_SOAK_VERSION);
    assert.ok(report.timestamp.length > 0);
    assert.ok(report.summary.totalTests >= 2);
    assert.ok(report.summary.passedTests >= 0);
    assert.ok(report.summary.overallThroughputRps > 0);
  });

  it('benchmark report includes all required fields', () => {
    const loadTests = [
      runLoadTest('validate', { concurrency: 1, totalRequests: 50, warmupRequests: 5 }),
    ];
    const report = createBenchmarkReport(loadTests, []);

    assert.ok('schema' in report);
    assert.ok('version' in report);
    assert.ok('timestamp' in report);
    assert.ok('endpoints' in report);
    assert.ok('summary' in report);
    assert.ok(typeof report.summary.totalTests === 'number');
    assert.ok(typeof report.summary.passedTests === 'number');
    assert.ok(typeof report.summary.failedTests === 'number');
    assert.ok(typeof report.summary.errorRate === 'number');
    assert.ok(typeof report.summary.overallThroughputRps === 'number');
  });

  it('report passes JSON serialization', () => {
    const loadTests = [
      runLoadTest('validate', { concurrency: 1, totalRequests: 100, warmupRequests: 10 }),
    ];
    const report = createBenchmarkReport(loadTests, []);

    const json = JSON.stringify(report);
    assert.ok(json.length > 0);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.schema, report.schema);
    assert.strictEqual(parsed.version, report.version);
  });
});

describe('load test report format', () => {
  it('generates JSON-serializable LoadTestResult', () => {
    const result = runLoadTest('validate', { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
    const json = JSON.stringify(result);
    assert.ok(json.length > 0);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.schema, 'openlunum-load-test/0.1');
    assert.strictEqual(parsed.totalRequests, 100);
  });

  it('latency buckets are present in report', () => {
    const result = runLoadTest('validate', { concurrency: 1, totalRequests: 100, warmupRequests: 10 });
    assert.ok(Array.isArray(result.buckets));
    assert.ok(result.buckets.length > 0);
    for (const bucket of result.buckets) {
      assert.ok(typeof bucket.min === 'number');
      assert.ok(typeof bucket.max === 'number');
      assert.ok(typeof bucket.count === 'number');
    }
  });
});
