import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_SERVICE_SLOS,
  validateServiceSlo,
  validateAllSlos,
  computeAllowedDowntime,
  type ServiceSlo,
  type SloMeasurement,
} from '../src/api-slo.js';

describe('API Service SLOs', () => {
  it('API_SERVICE_SLOS has at least 4 entries', () => {
    assert.ok(API_SERVICE_SLOS.length >= 4, `Expected >= 4, got ${API_SERVICE_SLOS.length}`);
  });

  describe('validateServiceSlo', () => {
    const slo: ServiceSlo = API_SERVICE_SLOS.find(s => s.id === 'api-parse')!;

    it('passes when all measurements within bounds', () => {
      const measurement: SloMeasurement = {
        sloId: 'api-parse',
        measuredAt: new Date().toISOString(),
        p50Ms: 30,
        p95Ms: 150,
        p99Ms: 400,
        errorRate: 0.005,
        throughputRps: 150,
        availabilityMeasured: 0.9995,
      };
      const result = validateServiceSlo(slo, measurement);
      assert.equal(result.met, true);
      assert.equal(result.violations.length, 0);
    });

    it('fails when p99 exceeds limit', () => {
      const measurement: SloMeasurement = {
        sloId: 'api-parse',
        measuredAt: new Date().toISOString(),
        p50Ms: 30,
        p95Ms: 150,
        p99Ms: 600, // exceeds 500ms limit
        errorRate: 0.005,
        throughputRps: 150,
        availabilityMeasured: 0.9995,
      };
      const result = validateServiceSlo(slo, measurement);
      assert.equal(result.met, false);
      assert.ok(result.violations.some(v => v.includes('p99')));
    });

    it('fails when error rate exceeds limit', () => {
      const measurement: SloMeasurement = {
        sloId: 'api-parse',
        measuredAt: new Date().toISOString(),
        p50Ms: 30,
        p95Ms: 150,
        p99Ms: 400,
        errorRate: 0.02, // exceeds 0.01 limit
        throughputRps: 150,
        availabilityMeasured: 0.9995,
      };
      const result = validateServiceSlo(slo, measurement);
      assert.equal(result.met, false);
      assert.ok(result.violations.some(v => v.includes('error rate')));
    });

    it('margins are positive for headroom, negative for breach', () => {
      // Within bounds - positive margins
      const good: SloMeasurement = {
        sloId: 'api-parse',
        measuredAt: new Date().toISOString(),
        p50Ms: 25,       // 50% of 50ms budget
        p95Ms: 100,       // 50% of 200ms budget
        p99Ms: 250,       // 50% of 500ms budget
        errorRate: 0.005, // 50% of 0.01 budget
        throughputRps: 200, // 100% above 100 minimum
        availabilityMeasured: 0.9995,
      };
      const goodResult = validateServiceSlo(slo, good);
      assert.ok(goodResult.margins.p50Margin > 0, 'p50 margin should be positive');
      assert.ok(goodResult.margins.p95Margin > 0, 'p95 margin should be positive');
      assert.ok(goodResult.margins.p99Margin > 0, 'p99 margin should be positive');
      assert.ok(goodResult.margins.errorRateMargin > 0, 'error rate margin should be positive');
      assert.ok(goodResult.margins.throughputMargin > 0, 'throughput margin should be positive');
      assert.ok(goodResult.margins.availabilityMargin > 0, 'availability margin should be positive');

      // Breaching - negative margins
      const bad: SloMeasurement = {
        sloId: 'api-parse',
        measuredAt: new Date().toISOString(),
        p50Ms: 60,          // exceeds 50ms
        p95Ms: 250,         // exceeds 200ms
        p99Ms: 600,         // exceeds 500ms
        errorRate: 0.02,    // exceeds 0.01
        throughputRps: 80,  // below 100
        availabilityMeasured: 0.998, // below 0.999
      };
      const badResult = validateServiceSlo(slo, bad);
      assert.ok(badResult.margins.p50Margin < 0, 'p50 margin should be negative');
      assert.ok(badResult.margins.p95Margin < 0, 'p95 margin should be negative');
      assert.ok(badResult.margins.p99Margin < 0, 'p99 margin should be negative');
      assert.ok(badResult.margins.errorRateMargin < 0, 'error rate margin should be negative');
      assert.ok(badResult.margins.throughputMargin < 0, 'throughput margin should be negative');
      assert.ok(badResult.margins.availabilityMargin < 0, 'availability margin should be negative');
    });
  });

  describe('validateAllSlos', () => {
    it('aggregates correctly, allMet reflects all results', () => {
      const measurements: SloMeasurement[] = [
        {
          sloId: 'api-parse',
          measuredAt: new Date().toISOString(),
          p50Ms: 30,
          p95Ms: 150,
          p99Ms: 400,
          errorRate: 0.005,
          throughputRps: 150,
          availabilityMeasured: 0.9995,
        },
        {
          sloId: 'api-fingerprint',
          measuredAt: new Date().toISOString(),
          p50Ms: 5,
          p95Ms: 30,
          p99Ms: 80,
          errorRate: 0.0005,
          throughputRps: 600,
          availabilityMeasured: 0.9995,
        },
      ];
      const report = validateAllSlos(measurements);
      assert.equal(report.allMet, true);
      assert.equal(report.results.length, 2);
      assert.equal(report.worstViolation, null);
    });

    it('allMet is false when any SLO is breached', () => {
      const measurements: SloMeasurement[] = [
        {
          sloId: 'api-parse',
          measuredAt: new Date().toISOString(),
          p50Ms: 30,
          p95Ms: 150,
          p99Ms: 400,
          errorRate: 0.005,
          throughputRps: 150,
          availabilityMeasured: 0.9995,
        },
        {
          sloId: 'api-health',
          measuredAt: new Date().toISOString(),
          p50Ms: 5,
          p95Ms: 20,
          p99Ms: 100, // breaches 50ms p99 limit
          errorRate: 0.00005,
          throughputRps: 1500,
          availabilityMeasured: 0.99995,
        },
      ];
      const report = validateAllSlos(measurements);
      assert.equal(report.allMet, false);
      assert.ok(report.worstViolation !== null);
      assert.ok(report.worstViolation.includes('api-health'));
    });
  });

  describe('computeAllowedDowntime', () => {
    it('0.999 over 24h is approximately 1.44 minutes', () => {
      const result = computeAllowedDowntime(0.999, 24);
      assert.ok(Math.abs(result - 1.44) < 0.01, `Expected ~1.44, got ${result}`);
    });

    it('0.9999 over 720h (30d) is approximately 4.32 minutes', () => {
      const result = computeAllowedDowntime(0.9999, 720);
      assert.ok(Math.abs(result - 4.32) < 0.01, `Expected ~4.32, got ${result}`);
    });
  });
});
