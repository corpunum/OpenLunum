import { SLO_DECLARATIONS, runLoadTest, DEFAULT_LOAD_CONFIG } from './load-soak-testing.js';
import type { SloDeclaration, LoadTestResult, EndpointId } from './load-soak-testing.js';

export interface MarginReport {
  p50MarginPct: number;
  p95MarginPct: number;
  p99MarginPct: number;
  errorRateMarginPct: number;
  throughputMarginPct: number;
}

export interface SloComplianceEntry {
  sloId: string;
  endpoint: string;
  met: boolean;
  violations: string[];
  margins: MarginReport;
}

export interface SloComplianceReport {
  timestamp: string;
  results: SloComplianceEntry[];
  allMet: boolean;
  worstMargin: number;
}

/**
 * Compute margin as a percentage of headroom to the SLO threshold.
 * For latency/error rate: positive = headroom, negative = breach.
 * For throughput: positive = above minimum, negative = below.
 */
function latencyMargin(measured: number, limit: number): number {
  if (limit === 0) return measured === 0 ? 100 : -100;
  return Math.round(((limit - measured) / limit) * 10000) / 100;
}

function throughputMargin(measured: number, minimum: number): number {
  if (minimum === 0) return 100;
  return Math.round(((measured - minimum) / minimum) * 10000) / 100;
}

function errorRateMargin(measuredRate: number, limitPct: number): number {
  const limitFraction = limitPct / 100;
  if (limitFraction === 0) {
    return measuredRate === 0 ? 100 : -100;
  }
  return Math.round(((limitFraction - measuredRate) / limitFraction) * 10000) / 100;
}

/**
 * Verify SLO compliance for a load test result against a set of SLO declarations.
 * Returns a report with per-SLO entries including margin-to-breach percentages.
 */
export function verifySloCompliance(
  loadResult: LoadTestResult,
  slos: readonly SloDeclaration[],
): SloComplianceReport {
  const matchingSlos = slos.filter(s => s.endpoint === loadResult.endpoint);

  const results: SloComplianceEntry[] = matchingSlos.map(slo => {
    const violations: string[] = [];

    if (loadResult.latency.p50 > slo.p50LatencyMs) {
      violations.push(`p50 ${loadResult.latency.p50.toFixed(3)}ms > ${slo.p50LatencyMs}ms`);
    }
    if (loadResult.latency.p95 > slo.p95LatencyMs) {
      violations.push(`p95 ${loadResult.latency.p95.toFixed(3)}ms > ${slo.p95LatencyMs}ms`);
    }
    if (loadResult.latency.p99 > slo.p99LatencyMs) {
      violations.push(`p99 ${loadResult.latency.p99.toFixed(3)}ms > ${slo.p99LatencyMs}ms`);
    }
    if (loadResult.errorRate > slo.errorRatePct / 100) {
      violations.push(`error rate ${(loadResult.errorRate * 100).toFixed(2)}% > ${slo.errorRatePct}%`);
    }
    if (loadResult.throughputRps < slo.throughputRps) {
      violations.push(`throughput ${loadResult.throughputRps} rps < ${slo.throughputRps} rps`);
    }

    const margins: MarginReport = {
      p50MarginPct: latencyMargin(loadResult.latency.p50, slo.p50LatencyMs),
      p95MarginPct: latencyMargin(loadResult.latency.p95, slo.p95LatencyMs),
      p99MarginPct: latencyMargin(loadResult.latency.p99, slo.p99LatencyMs),
      errorRateMarginPct: errorRateMargin(loadResult.errorRate, slo.errorRatePct),
      throughputMarginPct: throughputMargin(loadResult.throughputRps, slo.throughputRps),
    };

    return {
      sloId: slo.id,
      endpoint: slo.endpoint,
      met: violations.length === 0,
      violations,
      margins,
    };
  });

  const allMet = results.every(r => r.met);
  const allMargins = results.flatMap(r => [
    r.margins.p50MarginPct,
    r.margins.p95MarginPct,
    r.margins.p99MarginPct,
    r.margins.errorRateMarginPct,
    r.margins.throughputMarginPct,
  ]);
  const worstMargin = allMargins.length > 0 ? Math.min(...allMargins) : 100;

  return {
    timestamp: new Date().toISOString(),
    results,
    allMet,
    worstMargin,
  };
}

/**
 * Run a measured soak: execute load tests for each endpoint,
 * verify against SLO_DECLARATIONS, and return an aggregate report.
 */
export function runMeasuredSoak(
  endpoints: EndpointId[],
  _durationMs: number,
): SloComplianceReport {
  const allResults: SloComplianceEntry[] = [];

  for (const endpoint of endpoints) {
    const loadResult = runLoadTest(endpoint, DEFAULT_LOAD_CONFIG);
    const report = verifySloCompliance(loadResult, SLO_DECLARATIONS);
    allResults.push(...report.results);
  }

  const allMet = allResults.every(r => r.met);
  const allMargins = allResults.flatMap(r => [
    r.margins.p50MarginPct,
    r.margins.p95MarginPct,
    r.margins.p99MarginPct,
    r.margins.errorRateMarginPct,
    r.margins.throughputMarginPct,
  ]);
  const worstMargin = allMargins.length > 0 ? Math.min(...allMargins) : 100;

  return {
    timestamp: new Date().toISOString(),
    results: allResults,
    allMet,
    worstMargin,
  };
}
