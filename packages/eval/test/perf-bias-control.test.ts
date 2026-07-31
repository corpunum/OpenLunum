import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shuffleTestOrder,
  detectCacheBias,
  runWithBiasControl,
  DEFAULT_BIAS_CONFIG,
  type BiasReport,
} from '../src/perf-bias-control.js';

describe('perf bias control', () => {
  describe('shuffleTestOrder', () => {
    it('preserves all elements', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = shuffleTestOrder(items);
      assert.equal(shuffled.length, items.length);
      assert.deepEqual(shuffled.sort((a, b) => a - b), items);
    });

    it('does not mutate the original array', () => {
      const items = [1, 2, 3];
      const copy = [...items];
      shuffleTestOrder(items);
      assert.deepEqual(items, copy);
    });

    it('handles empty array', () => {
      assert.deepEqual(shuffleTestOrder([]), []);
    });

    it('handles single element', () => {
      assert.deepEqual(shuffleTestOrder([42]), [42]);
    });
  });

  describe('detectCacheBias', () => {
    it('detects cache bias when first run is much slower', () => {
      const latencies = [10, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const report = detectCacheBias(latencies);
      assert.equal(report.cacheEffectDetected, true);
      assert.ok(report.coldWarmRatio >= 2);
      assert.equal(report.firstRunMs, 10);
    });

    it('reports no cache bias for uniform latencies', () => {
      const latencies = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const report = detectCacheBias(latencies);
      assert.equal(report.cacheEffectDetected, false);
      assert.ok(report.coldWarmRatio < 2);
    });

    it('handles single measurement', () => {
      const report = detectCacheBias([5]);
      assert.equal(report.cacheEffectDetected, false);
      assert.equal(report.firstRunMs, 5);
    });

    it('handles empty array', () => {
      const report = detectCacheBias([]);
      assert.equal(report.cacheEffectDetected, false);
      assert.equal(report.firstRunMs, 0);
    });

    it('detects order sensitivity from drifting latencies', () => {
      const rising = Array.from({ length: 20 }, (_, i) => 1 + i * 0.5);
      const report = detectCacheBias(rising);
      assert.equal(report.orderSensitive, true);
    });

    it('reports no order sensitivity for stable latencies', () => {
      const stable = Array.from({ length: 20 }, () => 1);
      const report = detectCacheBias(stable);
      assert.equal(report.orderSensitive, false);
    });

    it('respects custom threshold', () => {
      const latencies = [3, 1, 1, 1, 1];
      const strict = detectCacheBias(latencies, 2.0);
      const loose = detectCacheBias(latencies, 5.0);
      assert.equal(strict.cacheEffectDetected, true);
      assert.equal(loose.cacheEffectDetected, false);
    });
  });

  describe('runWithBiasControl', () => {
    it('produces latencies and bias report', async () => {
      let count = 0;
      const result = await runWithBiasControl(() => { count++; }, {
        warmupRuns: 5,
        measurementRuns: 20,
        cooldownMs: 0,
        cacheBiasThreshold: 2.0,
      });
      assert.equal(result.latencies.length, 20);
      assert.equal(count, 25);
      assert.ok(result.meanMs >= 0);
      assert.ok(result.p50Ms >= 0);
      assert.ok(result.p95Ms >= 0);
      assert.ok(result.p99Ms >= 0);
      assert.ok(result.biasReport);
    });

    it('warmup runs are excluded from latencies', async () => {
      const result = await runWithBiasControl(() => {}, {
        warmupRuns: 100,
        measurementRuns: 10,
        cooldownMs: 0,
        cacheBiasThreshold: 2.0,
      });
      assert.equal(result.latencies.length, 10);
    });
  });

  describe('DEFAULT_BIAS_CONFIG', () => {
    it('has sensible defaults', () => {
      assert.equal(DEFAULT_BIAS_CONFIG.warmupRuns, 50);
      assert.equal(DEFAULT_BIAS_CONFIG.measurementRuns, 200);
      assert.equal(DEFAULT_BIAS_CONFIG.cacheBiasThreshold, 2.0);
      assert.ok(DEFAULT_BIAS_CONFIG.cooldownMs >= 0);
    });
  });
});
