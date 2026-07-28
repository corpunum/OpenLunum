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
  validateLoadTestResult,
  validateSoakTestResult,
} from '../src/load-soak-testing.js';
import type { LoadTestResult, SoakTestResult, EndpointId } from '../src/load-soak-testing.js';

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
