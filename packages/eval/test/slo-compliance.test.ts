import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifySloCompliance,
  runMeasuredSoak,
} from '../src/slo-compliance.js';
import type { SloComplianceReport, SloComplianceEntry, MarginReport } from '../src/slo-compliance.js';
import { SLO_DECLARATIONS } from '../src/load-soak-testing.js';
import type { LoadTestResult, SloDeclaration } from '../src/load-soak-testing.js';

function makeLoadResult(overrides: Partial<LoadTestResult> = {}): LoadTestResult {
  return {
    schema: 'openlunum-load-test/0.1',
    version: '0.1.0',
    endpoint: 'validate',
    config: { concurrency: 10, totalRequests: 1000, warmupRequests: 100 },
    timestamp: new Date().toISOString(),
    durationMs: 100,
    totalRequests: 1000,
    successCount: 1000,
    errorCount: 0,
    errorRate: 0,
    throughputRps: 50_000,
    latency: { min: 0.001, max: 0.5, mean: 0.01, p50: 0.01, p95: 0.05, p99: 0.1 },
    buckets: [],
    ...overrides,
  };
}

const VALIDATE_SLO: readonly SloDeclaration[] = SLO_DECLARATIONS.filter(s => s.endpoint === 'validate');

describe('verifySloCompliance', () => {
  it('passes when all measurements are within bounds', () => {
    const result = makeLoadResult();
    const report = verifySloCompliance(result, VALIDATE_SLO);

    assert.ok(report.allMet);
    assert.strictEqual(report.results.length, 1);
    assert.ok(report.results[0]!.met);
    assert.strictEqual(report.results[0]!.violations.length, 0);
  });

  it('fails when p99 latency exceeds SLO', () => {
    const result = makeLoadResult({
      latency: { min: 0.01, max: 50, mean: 5, p50: 0.5, p95: 3, p99: 15 },
    });
    const report = verifySloCompliance(result, VALIDATE_SLO);

    assert.ok(!report.allMet);
    assert.ok(!report.results[0]!.met);
    assert.ok(report.results[0]!.violations.some(v => v.includes('p99')));
  });

  it('fails when error rate exceeds SLO', () => {
    const result = makeLoadResult({
      errorRate: 0.05,
      errorCount: 50,
      successCount: 950,
    });
    const report = verifySloCompliance(result, VALIDATE_SLO);

    assert.ok(!report.allMet);
    assert.ok(report.results[0]!.violations.some(v => v.includes('error rate')));
  });

  it('margin is positive when measurement has headroom', () => {
    const result = makeLoadResult({
      latency: { min: 0.001, max: 0.5, mean: 0.01, p50: 0.5, p95: 2.5, p99: 5 },
      throughputRps: 20_000,
    });
    const report = verifySloCompliance(result, VALIDATE_SLO);
    const margins = report.results[0]!.margins;

    assert.ok(margins.p50MarginPct > 0, `p50 margin should be positive: ${margins.p50MarginPct}`);
    assert.ok(margins.p95MarginPct > 0, `p95 margin should be positive: ${margins.p95MarginPct}`);
    assert.ok(margins.p99MarginPct > 0, `p99 margin should be positive: ${margins.p99MarginPct}`);
    assert.ok(margins.throughputMarginPct > 0, `throughput margin should be positive: ${margins.throughputMarginPct}`);
  });

  it('margin is negative when breaching', () => {
    const result = makeLoadResult({
      latency: { min: 0.01, max: 50, mean: 5, p50: 2, p95: 8, p99: 15 },
      throughputRps: 3_000,
    });
    const report = verifySloCompliance(result, VALIDATE_SLO);
    const margins = report.results[0]!.margins;

    assert.ok(margins.p50MarginPct < 0, `p50 margin should be negative: ${margins.p50MarginPct}`);
    assert.ok(margins.p95MarginPct < 0, `p95 margin should be negative: ${margins.p95MarginPct}`);
    assert.ok(margins.p99MarginPct < 0, `p99 margin should be negative: ${margins.p99MarginPct}`);
    assert.ok(margins.throughputMarginPct < 0, `throughput margin should be negative: ${margins.throughputMarginPct}`);
  });

  it('barely-passing SLO has small positive margin', () => {
    // SLO-VALIDATE: p99 = 10ms. Set p99 to 9.5ms => 5% margin
    const result = makeLoadResult({
      latency: { min: 0.001, max: 9.5, mean: 0.5, p50: 0.5, p95: 2, p99: 9.5 },
    });
    const report = verifySloCompliance(result, VALIDATE_SLO);
    const margins = report.results[0]!.margins;

    assert.ok(report.allMet, 'SLO should be met');
    assert.ok(margins.p99MarginPct > 0 && margins.p99MarginPct < 10,
      `p99 margin should be small positive: ${margins.p99MarginPct}`);
  });

  it('worstMargin reflects the most breached metric', () => {
    const result = makeLoadResult({
      latency: { min: 0.01, max: 50, mean: 5, p50: 0.5, p95: 2, p99: 20 },
      throughputRps: 50_000,
    });
    const report = verifySloCompliance(result, VALIDATE_SLO);

    // p99 = 20ms vs SLO 10ms => -100% margin, that's the worst
    assert.ok(report.worstMargin < 0, `worstMargin should be negative: ${report.worstMargin}`);
  });
});

describe('runMeasuredSoak', () => {
  it('runs and produces report with results for each endpoint', () => {
    const report = runMeasuredSoak(['validate', 'fingerprint'], 1000);

    assert.ok(report.timestamp.length > 0);
    assert.ok(report.results.length >= 2);

    const endpoints = report.results.map(r => r.endpoint);
    assert.ok(endpoints.includes('validate'));
    assert.ok(endpoints.includes('fingerprint'));
  });

  it('allMet reflects aggregate compliance', () => {
    const report = runMeasuredSoak(['validate'], 500);

    // For these pure-compute endpoints, SLOs should be met
    assert.strictEqual(report.allMet, report.results.every(r => r.met));
  });
});

describe('SloComplianceReport structure', () => {
  it('report has all required fields', () => {
    const result = makeLoadResult();
    const report = verifySloCompliance(result, VALIDATE_SLO);

    assert.ok('timestamp' in report);
    assert.ok('results' in report);
    assert.ok('allMet' in report);
    assert.ok('worstMargin' in report);
    assert.ok(Array.isArray(report.results));
    assert.strictEqual(typeof report.allMet, 'boolean');
    assert.strictEqual(typeof report.worstMargin, 'number');
  });

  it('each entry has margins with all 5 dimensions', () => {
    const result = makeLoadResult();
    const report = verifySloCompliance(result, VALIDATE_SLO);

    for (const entry of report.results) {
      assert.strictEqual(typeof entry.margins.p50MarginPct, 'number');
      assert.strictEqual(typeof entry.margins.p95MarginPct, 'number');
      assert.strictEqual(typeof entry.margins.p99MarginPct, 'number');
      assert.strictEqual(typeof entry.margins.errorRateMarginPct, 'number');
      assert.strictEqual(typeof entry.margins.throughputMarginPct, 'number');
    }
  });
});
