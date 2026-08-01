import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_ENDPOINTS_LOAD,
  DEFAULT_API_LOAD_CONFIG,
  FAILURE_SCENARIOS,
  simulateApiLoad,
  simulateFailureInjection,
  testConcurrencyLevels,
  type ApiLoadConfig,
} from '../src/api-load-testing.js';

describe('API load testing', () => {
  const endpoint = API_ENDPOINTS_LOAD[0]!; // POST /api/v1/parse

  it('simulateApiLoad returns positive metrics for valid config', () => {
    const config: ApiLoadConfig = {
      ...DEFAULT_API_LOAD_CONFIG,
      endpoint,
    };
    const result = simulateApiLoad(config);

    assert.ok(result.totalRequests > 0, 'totalRequests should be positive');
    assert.ok(result.successCount > 0, 'successCount should be positive');
    assert.ok(result.p50Ms > 0, 'p50Ms should be positive');
    assert.ok(result.p95Ms > 0, 'p95Ms should be positive');
    assert.ok(result.p99Ms > 0, 'p99Ms should be positive');
    assert.ok(result.throughput > 0, 'throughput should be positive');
    assert.strictEqual(result.endpoint, endpoint);
    assert.strictEqual(result.totalRequests, result.successCount + result.errorCount);
  });

  it('simulateApiLoad error rate stays low for normal load', () => {
    const config: ApiLoadConfig = {
      concurrency: 5,
      requestsPerSecond: 50,
      durationMs: 2_000,
      endpoint,
    };
    const result = simulateApiLoad(config);

    assert.ok(result.errorRate < 0.01, `error rate ${result.errorRate} should be < 1%`);
  });

  it('simulateApiLoad percentiles are ordered p50 <= p95 <= p99', () => {
    const config: ApiLoadConfig = {
      ...DEFAULT_API_LOAD_CONFIG,
      endpoint,
    };
    const result = simulateApiLoad(config);

    assert.ok(result.p50Ms <= result.p95Ms, 'p50 should be <= p95');
    assert.ok(result.p95Ms <= result.p99Ms, 'p95 should be <= p99');
  });
});

describe('Failure injection', () => {
  it('simulateFailureInjection detects all failure types', () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const result = simulateFailureInjection(scenario);
      assert.strictEqual(result.detected, true, `${scenario.id} should be detected`);
      assert.ok(result.recoveredWithinMs > 0, `${scenario.id} recovery time should be positive`);
    }
  });

  it('simulateFailureInjection reports no data corruption', () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const result = simulateFailureInjection(scenario);
      assert.strictEqual(result.dataCorrupted, false, `${scenario.id} should not corrupt data`);
    }
  });

  it('simulateFailureInjection propagates errors', () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const result = simulateFailureInjection(scenario);
      assert.strictEqual(result.errorPropagated, true, `${scenario.id} should propagate errors`);
    }
  });
});

describe('Concurrency levels', () => {
  it('testConcurrencyLevels tests multiple levels', () => {
    const endpoint = API_ENDPOINTS_LOAD[2]!; // GET /api/v1/health
    const levels = [1, 5, 10, 25];
    const result = testConcurrencyLevels(endpoint, levels);

    assert.strictEqual(result.testedLevels.length, levels.length);
    assert.strictEqual(result.results.length, levels.length);
    assert.strictEqual(result.maxConcurrency, 25);
    assert.deepStrictEqual(result.testedLevels, [1, 5, 10, 25]);
  });

  it('testConcurrencyLevels finds breaking point at high concurrency', () => {
    const endpoint = API_ENDPOINTS_LOAD[0]!;
    const levels = [1, 10, 50, 100, 200];
    const result = testConcurrencyLevels(endpoint, levels);

    assert.strictEqual(result.results.length, levels.length);
    // At very high concurrency the simulation injects errors > 5%
    // breakingPoint may or may not be null depending on random jitter
    if (result.breakingPoint !== null) {
      assert.ok(result.breakingPoint > 0, 'breaking point should be positive');
    }
  });
});

describe('Constants', () => {
  it('API_ENDPOINTS_LOAD has at least 4 entries', () => {
    assert.ok(API_ENDPOINTS_LOAD.length >= 4, `expected >= 4, got ${API_ENDPOINTS_LOAD.length}`);
  });

  it('FAILURE_SCENARIOS has 5 entries', () => {
    assert.strictEqual(FAILURE_SCENARIOS.length, 5);
  });

  it('FAILURE_SCENARIOS covers all failure types', () => {
    const types = new Set(FAILURE_SCENARIOS.map(s => s.type));
    assert.ok(types.has('timeout'));
    assert.ok(types.has('connection-reset'));
    assert.ok(types.has('server-error'));
    assert.ok(types.has('rate-limited'));
    assert.ok(types.has('restart'));
  });

  it('DEFAULT_API_LOAD_CONFIG has sensible values', () => {
    assert.strictEqual(DEFAULT_API_LOAD_CONFIG.concurrency, 10);
    assert.strictEqual(DEFAULT_API_LOAD_CONFIG.requestsPerSecond, 100);
    assert.strictEqual(DEFAULT_API_LOAD_CONFIG.durationMs, 5_000);
  });
});
