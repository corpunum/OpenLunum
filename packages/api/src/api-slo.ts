// ── Service SLO Declarations and Validation ──────────────────────────

export interface ServiceSlo {
  id: string;
  service: 'api' | 'mcp';
  endpoint: string;
  availability: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxErrorRate: number;
  minThroughputRps: number;
}

export const API_SERVICE_SLOS: readonly ServiceSlo[] = [
  {
    id: 'api-parse',
    service: 'api',
    endpoint: '/parse',
    availability: 0.999,
    p50LatencyMs: 50,
    p95LatencyMs: 200,
    p99LatencyMs: 500,
    maxErrorRate: 0.01,
    minThroughputRps: 100,
  },
  {
    id: 'api-fingerprint',
    service: 'api',
    endpoint: '/fingerprint',
    availability: 0.999,
    p50LatencyMs: 10,
    p95LatencyMs: 50,
    p99LatencyMs: 100,
    maxErrorRate: 0.001,
    minThroughputRps: 500,
  },
  {
    id: 'api-health',
    service: 'api',
    endpoint: '/health',
    availability: 0.9999,
    p50LatencyMs: 5,
    p95LatencyMs: 20,
    p99LatencyMs: 50,
    maxErrorRate: 0.0001,
    minThroughputRps: 1000,
  },
  {
    id: 'mcp-tool-call',
    service: 'mcp',
    endpoint: '/tool-call',
    availability: 0.999,
    p50LatencyMs: 100,
    p95LatencyMs: 500,
    p99LatencyMs: 1000,
    maxErrorRate: 0.01,
    minThroughputRps: 50,
  },
] as const;

export interface SloMeasurement {
  sloId: string;
  measuredAt: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  throughputRps: number;
  availabilityMeasured: number;
}

export interface SloMargins {
  availabilityMargin: number;
  p50Margin: number;
  p95Margin: number;
  p99Margin: number;
  errorRateMargin: number;
  throughputMargin: number;
}

export interface SloValidationResult {
  slo: ServiceSlo;
  measurement: SloMeasurement;
  met: boolean;
  violations: string[];
  margins: SloMargins;
}

/**
 * Compute margin as percentage of budget remaining.
 * Positive = headroom, negative = breach.
 */
function latencyMarginPct(measured: number, limit: number): number {
  if (limit === 0) return measured === 0 ? 100 : -100;
  return ((limit - measured) / limit) * 100;
}

function errorRateMarginPct(measured: number, limit: number): number {
  if (limit === 0) return measured === 0 ? 100 : -100;
  return ((limit - measured) / limit) * 100;
}

function availabilityMarginPct(measured: number, target: number): number {
  const budget = 1 - target;
  if (budget === 0) return measured >= target ? 100 : -100;
  const used = 1 - measured;
  return ((budget - used) / budget) * 100;
}

function throughputMarginPct(measured: number, minimum: number): number {
  if (minimum === 0) return 100;
  return ((measured - minimum) / minimum) * 100;
}

export function validateServiceSlo(
  slo: ServiceSlo,
  measurement: SloMeasurement,
): SloValidationResult {
  const violations: string[] = [];

  if (measurement.availabilityMeasured < slo.availability) {
    violations.push(
      `availability ${measurement.availabilityMeasured} < ${slo.availability}`,
    );
  }
  if (measurement.p50Ms > slo.p50LatencyMs) {
    violations.push(`p50 ${measurement.p50Ms}ms > ${slo.p50LatencyMs}ms`);
  }
  if (measurement.p95Ms > slo.p95LatencyMs) {
    violations.push(`p95 ${measurement.p95Ms}ms > ${slo.p95LatencyMs}ms`);
  }
  if (measurement.p99Ms > slo.p99LatencyMs) {
    violations.push(`p99 ${measurement.p99Ms}ms > ${slo.p99LatencyMs}ms`);
  }
  if (measurement.errorRate > slo.maxErrorRate) {
    violations.push(
      `error rate ${measurement.errorRate} > ${slo.maxErrorRate}`,
    );
  }
  if (measurement.throughputRps < slo.minThroughputRps) {
    violations.push(
      `throughput ${measurement.throughputRps} rps < ${slo.minThroughputRps} rps`,
    );
  }

  const margins: SloMargins = {
    availabilityMargin: availabilityMarginPct(
      measurement.availabilityMeasured,
      slo.availability,
    ),
    p50Margin: latencyMarginPct(measurement.p50Ms, slo.p50LatencyMs),
    p95Margin: latencyMarginPct(measurement.p95Ms, slo.p95LatencyMs),
    p99Margin: latencyMarginPct(measurement.p99Ms, slo.p99LatencyMs),
    errorRateMargin: errorRateMarginPct(
      measurement.errorRate,
      slo.maxErrorRate,
    ),
    throughputMargin: throughputMarginPct(
      measurement.throughputRps,
      slo.minThroughputRps,
    ),
  };

  return {
    slo,
    measurement,
    met: violations.length === 0,
    violations,
    margins,
  };
}

export interface SloComplianceReport {
  timestamp: string;
  results: SloValidationResult[];
  allMet: boolean;
  worstViolation: string | null;
}

export function validateAllSlos(
  measurements: SloMeasurement[],
  slos: readonly ServiceSlo[] = API_SERVICE_SLOS,
): SloComplianceReport {
  const sloMap = new Map<string, ServiceSlo>();
  for (const slo of slos) {
    sloMap.set(slo.id, slo);
  }

  const results: SloValidationResult[] = [];
  for (const m of measurements) {
    const slo = sloMap.get(m.sloId);
    if (slo) {
      results.push(validateServiceSlo(slo, m));
    }
  }

  const allMet = results.every(r => r.met);

  let worstViolation: string | null = null;
  for (const r of results) {
    if (r.violations.length > 0 && worstViolation === null) {
      worstViolation = `${r.slo.id}: ${r.violations[0]}`;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    allMet,
    worstViolation,
  };
}

export interface SloTarget {
  period: '1h' | '24h' | '7d' | '30d';
  uptimeTarget: number;
  allowedDowntimeMinutes: number;
}

export function computeAllowedDowntime(
  availability: number,
  periodHours: number,
): number {
  return (1 - availability) * periodHours * 60;
}
