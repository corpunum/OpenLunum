/**
 * Baseline store for retention regression gates.
 *
 * Provides persistent storage for baseline metrics and regression detection
 * to ensure multilingual retention quality doesn't degrade over time.
 *
 * Stores baselines in reports/retention/baseline-store.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { RetentionMetric } from './retention-experiment.js';
export type { RetentionMetric } from './retention-experiment.js';

// ── Types ──────────────────────────────────────────────────────────

/** Per-language baseline thresholds recorded from first run. */
export interface LanguageBaseline {
  language: string;
  retentionRate: number;
  avgPredicateMatch: number;
  avgRoleMatch: number;
  avgProtectedLiteralPreservation: number;
  recordedAt: number;
}

/** Full baseline store with provenance. */
export interface RetentionBaselineStore {
  version: string;
  recordedAt: number;
  datasetSha256: string;
  modelId: string;
  schemaVersion: string;
  languages: Record<string, LanguageBaseline>;
}

/** Severity level for a regression. */
export type RegressionSeverity = 'none' | 'warning' | 'critical';

/** Result of comparing metrics against a baseline for one language. */
export interface RegressionResult {
  language: string;
  metric: string;
  baseline: number;
  current: number;
  drop: number;
  severity: RegressionSeverity;
}

/** Full gate result for retention regression check. */
export interface RegressionGateResult {
  passed: boolean;
  warnings: string[];
  criticalFailures: RegressionResult[];
  warningResults: RegressionResult[];
  languageResults: Map<string, RegressionResult[]>;
  store: RetentionBaselineStore | null;
}

// ── Constants ──────────────────────────────────────────────────────

const BASELINE_STORE_PATH = path.join('reports', 'retention', 'baseline-store.json');
const WARN_THRESHOLD = 0.10; // 10 percentage point drop
const CRITICAL_THRESHOLD = 0.20; // 20 percentage point drop
const STALE_DAYS = 90; // Baseline is stale after 90 days

const METRIC_NAMES = [
  'retentionRate',
  'avgPredicateMatch',
  'avgRoleMatch',
  'avgProtectedLiteralPreservation'
] as const;

// ── Store Persistence ─────────────────────────────────────────────

/**
 * Load the baseline store from disk.
 * Returns null if no store exists.
 */
export function loadBaselineStore(): RetentionBaselineStore | null {
  try {
    if (!existsSync(BASELINE_STORE_PATH)) return null;
    const raw = readFileSync(BASELINE_STORE_PATH, 'utf8');
    return JSON.parse(raw) as RetentionBaselineStore;
  } catch {
    return null;
  }
}

/**
 * Save the baseline store to disk.
 * Creates parent directories if needed.
 */
export function saveBaselineStore(store: RetentionBaselineStore): void {
  const dir = path.dirname(BASELINE_STORE_PATH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(BASELINE_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ── Baseline Recording ─────────────────────────────────────────────

/**
 * Create a new baseline from retention experiment metrics.
 * Uses conservative default values if metrics are missing.
 */
export function recordBaselineFromMetrics(
  metrics: Record<string, RetentionMetric>,
  options: {
    datasetSha256: string;
    modelId: string;
    schemaVersion: string;
  }
): RetentionBaselineStore {
  const languages: Record<string, LanguageBaseline> = {};

  for (const [lang, m] of Object.entries(metrics)) {
    languages[lang] = {
      language: lang,
      retentionRate: m.retentionRate ?? 0.5,
      avgPredicateMatch: m.avgPredicateMatch ?? 0.5,
      avgRoleMatch: m.avgRoleMatch ?? 0.4,
      avgProtectedLiteralPreservation: m.avgProtectedLiteralPreservation ?? 0.4,
      recordedAt: Date.now()
    };
  }

  return {
    version: '1.0',
    recordedAt: Date.now(),
    datasetSha256: options.datasetSha256,
    modelId: options.modelId,
    schemaVersion: options.schemaVersion,
    languages
  };
}

// ── Regression Detection ───────────────────────────────────────────

/**
 * Check if a baseline is stale (older than STALE_DAYS).
 */
export function isBaselineStale(store: RetentionBaselineStore): boolean {
  const ageMs = Date.now() - store.recordedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > STALE_DAYS;
}

/**
 * Detect regressions by comparing current metrics against baselines.
 * Returns results sorted by severity (critical first).
 */
export function detectRegressions(
  store: RetentionBaselineStore,
  currentMetrics: Record<string, RetentionMetric>
): RegressionGateResult {
  const criticalFailures: RegressionResult[] = [];
  const warningResults: RegressionResult[] = [];
  const languageResults = new Map<string, RegressionResult[]>();
  const warnings: string[] = [];

  // Check for stale baseline
  if (isBaselineStale(store)) {
    warnings.push(`Baseline is ${Math.floor((Date.now() - store.recordedAt) / (1000 * 60 * 60 * 24))} days old (threshold: ${STALE_DAYS} days)`);
  }

  // Check for dataset mismatch
  const currentDatasetSha = (currentMetrics as any)._datasetSha256 as string | undefined;
  if (currentDatasetSha && store.datasetSha256 !== currentDatasetSha) {
    warnings.push(`Dataset SHA mismatch: baseline=${store.datasetSha256.slice(0, 16)}..., current=${currentDatasetSha?.slice(0, 16)}...`);
  }

  for (const [lang, current] of Object.entries(currentMetrics)) {
    const baseline = store.languages[lang];
    if (!baseline) {
      warnings.push(`No baseline for language: ${lang}`);
      continue;
    }

    const results: RegressionResult[] = [];

    for (const metricName of METRIC_NAMES) {
      const baselineValue = (baseline as any)[metricName] as number;
      const currentValue = (current as any)[metricName] as number;

      if (baselineValue === undefined || currentValue === undefined) continue;

      const drop = baselineValue - currentValue;
      let severity: RegressionSeverity = 'none';

      if (drop > CRITICAL_THRESHOLD) {
        severity = 'critical';
      } else if (drop > WARN_THRESHOLD) {
        severity = 'warning';
      }

      const result: RegressionResult = {
        language: lang,
        metric: metricName,
        baseline: baselineValue,
        current: currentValue,
        drop,
        severity
      };

      results.push(result);

      if (severity === 'critical') {
        criticalFailures.push(result);
      } else if (severity === 'warning') {
        warningResults.push(result);
      }
    }

    if (results.length > 0) {
      languageResults.set(lang, results);
    }
  }

  return {
    passed: criticalFailures.length === 0,
    warnings,
    criticalFailures,
    warningResults,
    languageResults,
    store
  };
}

// ── Output Formatting ──────────────────────────────────────────────

/**
 * Print a human-readable regression summary.
 */
export function printRegressionSummary(result: RegressionGateResult): string {
  let output = '';

  if (!result.passed) {
    output += '❌ RETENTION REGRESSION GATE: FAILED\n\n';
  } else if (result.warningResults.length > 0) {
    output += '⚠️  RETENTION REGRESSION GATE: PASSED (with warnings)\n\n';
  } else {
    output += '✅ RETENTION REGRESSION GATE: PASSED\n\n';
  }

  if (result.warnings.length > 0) {
    output += 'Warnings:\n';
    for (const w of result.warnings) {
      output += `  - ${w}\n`;
    }
    output += '\n';
  }

  if (result.criticalFailures.length > 0) {
    output += 'Critical regressions:\n';
    for (const r of result.criticalFailures) {
      output += `  ${r.language}.${r.metric}: ${r.baseline.toFixed(3)} → ${r.current.toFixed(3)} (drop: ${r.drop.toFixed(3)})\n`;
    }
    output += '\n';
  }

  if (result.warningResults.length > 0) {
    output += 'Warning regressions:\n';
    for (const r of result.warningResults) {
      output += `  ${r.language}.${r.metric}: ${r.baseline.toFixed(3)} → ${r.current.toFixed(3)} (drop: ${r.drop.toFixed(3)})\n`;
    }
    output += '\n';
  }

  return output;
}
