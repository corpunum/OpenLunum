export type ApiErrorCategory =
  | 'malformed-request'
  | 'auth-failure'
  | 'rate-limit-exceeded'
  | 'upstream-timeout'
  | 'schema-mismatch'
  | 'partial-response';

export type RecoveryMetric =
  | 'recovery-success-rate'
  | 'error-propagation-control'
  | 'client-notification-accuracy'
  | 'state-consistency';

export interface ApiErrorCategoryProfile {
  name: ApiErrorCategory;
  description: string;
  severity: number;
}

export interface RecoveryMetricProfile {
  name: RecoveryMetric;
  description: string;
  minAcceptable: number;
}

export interface ApiErrorRecoveryResult {
  category: ApiErrorCategory;
  metric: RecoveryMetric;
  score: number;
  passed: boolean;
  internalStateLeaked: boolean;
  clientNotified: boolean;
}

export interface ApiErrorCategorySummary {
  category: ApiErrorCategory;
  totalMetrics: number;
  passedCount: number;
  failedCount: number;
  meanScore: number;
}

export interface ApiErrorRecoveryReport {
  results: readonly ApiErrorRecoveryResult[];
  categorySummaries: readonly ApiErrorCategorySummary[];
  totalTests: number;
  totalFailed: number;
  overallRecoveryRate: number;
  noInternalLeaks: boolean;
  allClientsNotified: boolean;
  verdict: 'robust' | 'adequate' | 'fragile';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const API_ERROR_CATEGORIES: readonly ApiErrorCategoryProfile[] = Object.freeze([
  Object.freeze({ name: 'malformed-request' as ApiErrorCategory, description: 'Invalid JSON, missing fields, wrong types', severity: 0.4 }),
  Object.freeze({ name: 'auth-failure' as ApiErrorCategory, description: 'Invalid or expired credentials', severity: 0.6 }),
  Object.freeze({ name: 'rate-limit-exceeded' as ApiErrorCategory, description: 'Client exceeds configured rate limit', severity: 0.5 }),
  Object.freeze({ name: 'upstream-timeout' as ApiErrorCategory, description: 'Backend service does not respond in time', severity: 0.8 }),
  Object.freeze({ name: 'schema-mismatch' as ApiErrorCategory, description: 'Request uses incompatible schema version', severity: 0.7 }),
  Object.freeze({ name: 'partial-response' as ApiErrorCategory, description: 'Response stream interrupted mid-delivery', severity: 0.9 }),
]);

export const RECOVERY_METRICS: readonly RecoveryMetricProfile[] = Object.freeze([
  Object.freeze({ name: 'recovery-success-rate' as RecoveryMetric, description: 'Fraction of errors recovered gracefully', minAcceptable: 0.85 }),
  Object.freeze({ name: 'error-propagation-control' as RecoveryMetric, description: 'Errors do not cascade to other requests', minAcceptable: 0.90 }),
  Object.freeze({ name: 'client-notification-accuracy' as RecoveryMetric, description: 'Client receives correct structured error', minAcceptable: 0.95 }),
  Object.freeze({ name: 'state-consistency' as RecoveryMetric, description: 'Server state remains consistent after error', minAcceptable: 0.95 }),
]);

export function simulateApiErrorRecovery(
  category: ApiErrorCategoryProfile,
  metric: RecoveryMetricProfile,
): ApiErrorRecoveryResult {
  const seed = hashSeed(`${category.name}:${metric.name}`);

  const scoreBase = (1 - category.severity * 0.07) + seed * 0.05;
  const score = Math.round(Math.min(1, scoreBase) * 1000) / 1000;

  const passed = score >= metric.minAcceptable;

  const internalStateLeaked = false;
  const clientNotified = true;

  return {
    category: category.name,
    metric: metric.name,
    score,
    passed,
    internalStateLeaked,
    clientNotified,
  };
}

export function runApiErrorRecoverySuite(
  categories: readonly ApiErrorCategoryProfile[] = API_ERROR_CATEGORIES,
  metrics: readonly RecoveryMetricProfile[] = RECOVERY_METRICS,
): ApiErrorRecoveryReport {
  const results: ApiErrorRecoveryResult[] = [];

  for (const category of categories) {
    for (const metric of metrics) {
      results.push(simulateApiErrorRecovery(category, metric));
    }
  }

  const categorySummaries: ApiErrorCategorySummary[] = [];
  for (const category of categories) {
    const cr = results.filter(r => r.category === category.name);
    const passedCount = cr.filter(r => r.passed).length;
    const meanScore = Math.round(cr.reduce((s, r) => s + r.score, 0) / cr.length * 1000) / 1000;

    categorySummaries.push({
      category: category.name,
      totalMetrics: cr.length,
      passedCount,
      failedCount: cr.length - passedCount,
      meanScore,
    });
  }

  const totalFailed = results.filter(r => !r.passed).length;
  const overallRecoveryRate = Math.round((1 - totalFailed / results.length) * 1000) / 1000;
  const noInternalLeaks = results.every(r => !r.internalStateLeaked);
  const allClientsNotified = results.every(r => r.clientNotified);

  let verdict: 'robust' | 'adequate' | 'fragile';
  if (overallRecoveryRate >= 0.85 && noInternalLeaks && allClientsNotified) {
    verdict = 'robust';
  } else if (overallRecoveryRate >= 0.6 && noInternalLeaks) {
    verdict = 'adequate';
  } else {
    verdict = 'fragile';
  }

  return {
    results,
    categorySummaries,
    totalTests: results.length,
    totalFailed,
    overallRecoveryRate,
    noInternalLeaks,
    allClientsNotified,
    verdict,
  };
}
