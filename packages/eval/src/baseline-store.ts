/**
 * Baseline store for retention regression gates.
 *
 * Provides persistent storage for baseline metrics and regression detection
 * to ensure multilingual retention quality doesn't degrade over time.
 *
 * Stores baselines in reports/retention/baseline-store.json.
 *
 * Usage:
 *   1. Run retention experiment to generate metrics
 *   2. Call saveBaseline() to record baseline (explicit action)
 *   3. Run experiment again, call checkRegression() to detect regressions
 *   4. CI gate fails if critical regressions detected
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
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
  /** Schema version */
  version: string;
  /** Timestamp when baseline was recorded */
  recordedAt: number;
  /** Dataset SHA-256 used for baseline */
  datasetSha256: string;
  /** Model ID used for baseline */
  modelId: string;
  /** Schema version of Lunum records */
  schemaVersion: string;
  /** Per-language baselines */
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
  /** Whether the gate passed */
  passed: boolean;
  /** Warning messages */
  warnings: string[];
  /** Critical failures */
  criticalFailures: RegressionResult[];
  /** Warning-level regressions */
  warningResults: RegressionResult[];
  /** Per-language regression results */
  languageResults: Map<string, RegressionResult[]>;
  /** The baseline store being checked against */
  store: RetentionBaselineStore | null;
}

// ── Constants ──────────────────────────────────────────────────────

const BASELINE_VERSION = '1.0';
const BASELINE_DIR = 'reports/retention';
const BASELINE_FILE = 'baseline-store.json';
const STALE_DAYS = 365;

/** Severity thresholds */
const SEVERITY_THRESHOLDS = {
  warning: 0.10, // 10 percentage point drop
  critical: 0.20 // 20 percentage point drop
};

/** Required metrics for a valid baseline */
const REQUIRED_METRICS = ['retentionRate', 'avgPredicateMatch', 'avgRoleMatch', 'avgProtectedLiteralPreservation'] as const;

// ── Baseline Store ─────────────────────────────────────────────────

/** Get the path to the baseline store file. */
export function getBaselineStorePath(root: string): string {
  return path.join(root, BASELINE_DIR, BASELINE_FILE);
}

/** Load the baseline store, or null if not found. */
export function loadBaselineStore(root: string): RetentionBaselineStore | null {
  const storePath = getBaselineStorePath(root);
  if (!existsSync(storePath)) return null;

  try {
    const data = JSON.parse(readFileSync(storePath, 'utf-8'));
    validateBaselineStore(data);
    return data;
  } catch {
    return null;
  }
}

/** Validate baseline store structure. */
function validateBaselineStore(data: unknown): asserts data is RetentionBaselineStore {
  if (!data || typeof data !== 'object') throw new Error('Baseline store must be an object');
  const store = data as Record<string, unknown>;

  if (store.version !== BASELINE_VERSION) throw new Error(`Unexpected baseline version: ${store.version}`);
  if (typeof store.recordedAt !== 'number') throw new Error('Missing recordedAt');
  if (typeof store.datasetSha256 !== 'string') throw new Error('Missing datasetSha256');
  if (typeof store.modelId !== 'string') throw new Error('Missing modelId');
  if (typeof store.schemaVersion !== 'string') throw new Error('Missing schemaVersion');
  if (!store.languages || typeof store.languages !== 'object') throw new Error('Missing languages');

  for (const [lang, base] of Object.entries(store.languages as Record<string, unknown>)) {
    if (!base || typeof base !== 'object') throw new Error(`Invalid baseline for ${lang}`);
    const b = base as Record<string, unknown>;
    if (typeof b.language !== 'string') throw new Error(`Missing language for ${lang}`);
    if (typeof b.retentionRate !== 'number') throw new Error(`Missing retentionRate for ${lang}`);
    if (typeof b.avgPredicateMatch !== 'number') throw new Error(`Missing avgPredicateMatch for ${lang}`);
    if (typeof b.avgRoleMatch !== 'number') throw new Error(`Missing avgRoleMatch for ${lang}`);
    if (typeof b.avgProtectedLiteralPreservation !== 'number') throw new Error(`Missing avgProtectedLiteralPreservation for ${lang}`);
  }
}

/** Save baseline metrics to the store. This is an explicit action, not automatic. */
export function saveBaseline(root: string, metrics: Record<string, RetentionMetric>, options: {
  datasetSha256: string;
  modelId: string;
  schemaVersion: string;
}): RetentionBaselineStore {
  const { datasetSha256, modelId, schemaVersion } = options;

  // Ensure baseline directory exists
  const storePath = getBaselineStorePath(root);
  mkdirSync(path.dirname(storePath), { recursive: true });

  // Build language baselines
  const languages: Record<string, LanguageBaseline> = {};
  for (const [lang, m] of Object.entries(metrics)) {
    languages[lang] = {
      language: lang,
      retentionRate: m.retentionRate,
      avgPredicateMatch: m.avgPredicateMatch,
      avgRoleMatch: m.avgRoleMatch,
      avgProtectedLiteralPreservation: m.avgProtectedLiteralPreservation,
      recordedAt: Date.now()
    };
  }

  const store: RetentionBaselineStore = {
    version: BASELINE_VERSION,
    recordedAt: Date.now(),
    datasetSha256,
    modelId,
    schemaVersion,
    languages
  };

  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
  return store;
}

/** Check if the baseline store is stale (older than STALE_DAYS). */
export function isBaselineStale(root: string): boolean {
  const store = loadBaselineStore(root);
  if (!store) return false; // No baseline = not stale (just not recorded yet)

  const ageMs = Date.now() - store.recordedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > STALE_DAYS;
}

/** Get a warning message if baseline is stale. */
export function getStaleWarning(root: string): string | null {
  const store = loadBaselineStore(root);
  if (!store) return null;

  const ageMs = Date.now() - store.recordedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays > STALE_DAYS) {
    return `Baseline is ${Math.floor(ageDays)} days old (threshold: ${STALE_DAYS} days). Consider recording a new baseline.`;
  }
  return null;
}

// ── Regression Detection ───────────────────────────────────────────

/**
 * Compare current metrics against the baseline and detect regressions.
 *
 * Returns a RegressionGateResult with pass/fail status and per-language details.
 */
export function checkRegression(root: string, currentMetrics: Record<string, RetentionMetric>): RegressionGateResult {
  const store = loadBaselineStore(root);
  if (!store) {
    return {
      passed: false,
      warnings: ['No baseline store found. Run saveBaseline() first to establish a baseline.'],
      criticalFailures: [],
      warningResults: [],
      languageResults: new Map(),
      store: null
    };
  }

  const warnings: string[] = [];
  const criticalFailures: RegressionResult[] = [];
  const warningResults: RegressionResult[] = [];
  const languageResults = new Map<string, RegressionResult[]>();

  // Check each language
  for (const [lang, langMetrics] of Object.entries(currentMetrics)) {
    const base = store.languages[lang];
    if (!base) {
      warnings.push(`No baseline for language ${lang}`);
      continue;
    }

    const results: RegressionResult[] = [];

    for (const metric of REQUIRED_METRICS) {
      const baseline = base[metric];
      const metricCurrent = (langMetrics as any)[metric];
      if (baseline === undefined || metricCurrent === undefined) continue;

      const drop = baseline - metricCurrent;
      let severity: RegressionSeverity = 'none';

      if (drop >= SEVERITY_THRESHOLDS.critical) {
        severity = 'critical';
      } else if (drop >= SEVERITY_THRESHOLDS.warning) {
        severity = 'warning';
      }

      if (severity !== 'none') {
        const result: RegressionResult = {
          language: lang,
          metric,
          baseline,
          current: metricCurrent,
          drop,
          severity
        };

        if (severity === 'critical') {
          criticalFailures.push(result);
        } else {
          warningResults.push(result);
        }
        results.push(result);
      }
    }

    if (results.length > 0) {
      languageResults.set(lang, results);
    }
  }

  // Check for stale baseline
  const staleWarning = getStaleWarning(root);
  if (staleWarning) warnings.push(staleWarning);

  const passed = criticalFailures.length === 0;

  return {
    passed,
    warnings,
    criticalFailures,
    warningResults,
    languageResults,
    store
  };
}

/** Print a human-readable regression summary. */
export function printRegressionSummary(result: RegressionGateResult): string {
  const lines: string[] = [];
  lines.push('=== Retention Regression Gate ===');
  lines.push(`Passed: ${result.passed ? 'YES' : 'NO'}`);

  if (result.store) {
    lines.push(`Baseline: ${new Date(result.store.recordedAt).toISOString()}`);
    lines.push(`Languages: ${Object.keys(result.store.languages).join(', ')}`);
  }

  if (result.criticalFailures.length > 0) {
    lines.push(`\nCRITICAL FAILURES (${result.criticalFailures.length}):`);
    for (const f of result.criticalFailures) {
      lines.push(`  ${f.language}.${f.metric}: ${f.baseline.toFixed(4)} → ${f.current.toFixed(4)} (drop: ${f.drop.toFixed(4)})`);
    }
  }

  if (result.warningResults.length > 0) {
    lines.push(`\nWARNINGS (${result.warningResults.length}):`);
    for (const w of result.warningResults) {
      lines.push(`  ${w.language}.${w.metric}: ${w.baseline.toFixed(4)} → ${w.current.toFixed(4)} (drop: ${w.drop.toFixed(4)})`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWARNINGS:');
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  return lines.join('\n');
}
