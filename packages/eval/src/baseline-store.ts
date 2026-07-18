/**
 * Baseline store for retention experiment regression detection.
 *
 * Stores per-language retention thresholds from initial runs and
 * compares subsequent runs against them to detect regressions.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { RealizationLanguage } from './realization.js';
import type { RetentionMetric } from './retention-experiment.js';

// ── Types ──────────────────────────────────────────────────────────

export interface LanguageBaseline {
  language: RealizationLanguage;
  retentionRate: number;
  avgPredicateMatch: number;
  avgRoleMatch: number;
  avgProtectedLiteralPreservation: number;
  recordedAt: string;
  datasetSha256: string;
}

export interface RetentionBaselineStore {
  version: string;
  experimentId: string;
  datasetSha256: string;
  recordedAt: string;
  languageBaselines: Record<RealizationLanguage, LanguageBaseline>;
}

export interface RegressionResult {
  language: RealizationLanguage;
  baselineRetentionRate: number;
  currentRetentionRate: number;
  baselinePredicateMatch: number;
  currentPredicateMatch: number;
  baselineRoleMatch: number;
  currentRoleMatch: number;
  baselineLiteralPreservation: number;
  currentLiteralPreservation: number;
  regressionDetected: boolean;
  regressionReasons: string[];
  severity: 'critical' | 'warning' | 'none';
}

export interface RegressionGateResult {
  experimentId: string;
  datasetSha256: string;
  baselines: RetentionBaselineStore;
  currentMetrics: Record<RealizationLanguage, RetentionMetric>;
  perLanguageRegressions: RegressionResult[];
  anyRegression: boolean;
  criticalRegressions: string[];
  warningRegressions: string[];
  passed: boolean;
}

// ── Default thresholds ─────────────────────────────────────────────

/**
 * Default minimum retention rate per language (used when no baseline exists).
 * These are conservative values based on the first run's results.
 */
const DEFAULT_RETENTION_RATE = 0.5;
const DEFAULT_PREDICATE_MATCH = 0.5;
const DEFAULT_ROLE_MATCH = 0.4;
const DEFAULT_LITERAL_PRESERVATION = 0.4;

/**
 * Regression severity thresholds:
 * - critical: retention drops more than 20 percentage points
 * - warning: retention drops more than 10 percentage points
 * - none: within tolerance
 */
const CRITICAL_DROP = 0.20;
const WARNING_DROP = 0.10;

// ── Baseline Store ─────────────────────────────────────────────────

/**
 * Path to the baseline store file relative to workspace root.
 */
const BASELINE_STORE_PATH = 'reports/retention/baseline-store.json';

/**
 * Load the baseline store from disk.
 * Returns null if no baseline exists yet.
 */
export async function loadBaselineStore(workspaceRoot: string): Promise<RetentionBaselineStore | null> {
  const storePath = path.join(workspaceRoot, BASELINE_STORE_PATH);
  try {
    const raw = await readFile(storePath, 'utf-8');
    return JSON.parse(raw) as RetentionBaselineStore;
  } catch {
    return null;
  }
}

/**
 * Save the baseline store to disk.
 */
export async function saveBaselineStore(workspaceRoot: string, store: RetentionBaselineStore): Promise<void> {
  const storePath = path.join(workspaceRoot, BASELINE_STORE_PATH);
  const dir = path.dirname(storePath);
  await mkdir(dir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

// ── Regression Detection ───────────────────────────────────────────

/**
 * Compute regression for a single language.
 * Returns null if no baseline exists for this language.
 */
function computeLanguageRegression(
  language: RealizationLanguage,
  baseline: LanguageBaseline,
  current: RetentionMetric
): RegressionResult {
  const reasons: string[] = [];
  let severity: 'critical' | 'warning' | 'none' = 'none';

  const retentionDrop = baseline.retentionRate - current.retentionRate;
  const predicateDrop = baseline.avgPredicateMatch - current.avgPredicateMatch;
  const roleDrop = baseline.avgRoleMatch - current.avgRoleMatch;
  const literalDrop = baseline.avgProtectedLiteralPreservation - current.avgProtectedLiteralPreservation;

  // Check each metric for regression — use numeric severity to avoid TS narrowing issues
  let sev = 0; // 0=none, 1=warning, 2=critical

  if (retentionDrop > CRITICAL_DROP) {
    reasons.push(`Retention dropped ${Math.round(retentionDrop * 100)}pp (>${CRITICAL_DROP * 100}% drop)`);
    sev = Math.max(sev, 2);
  } else if (retentionDrop > WARNING_DROP) {
    reasons.push(`Retention dropped ${Math.round(retentionDrop * 100)}pp (>${WARNING_DROP * 100}% drop)`);
    sev = Math.max(sev, 1);
  }

  if (predicateDrop > CRITICAL_DROP) {
    reasons.push(`Predicate match dropped ${Math.round(predicateDrop * 100)}pp`);
    sev = Math.max(sev, 2);
  } else if (predicateDrop > WARNING_DROP && sev < 2) {
    reasons.push(`Predicate match dropped ${Math.round(predicateDrop * 100)}pp`);
    sev = Math.max(sev, 1);
  }

  if (roleDrop > CRITICAL_DROP) {
    reasons.push(`Role match dropped ${Math.round(roleDrop * 100)}pp`);
    sev = Math.max(sev, 2);
  } else if (roleDrop > WARNING_DROP && sev < 2) {
    reasons.push(`Role match dropped ${Math.round(roleDrop * 100)}pp`);
    sev = Math.max(sev, 1);
  }

  if (literalDrop > CRITICAL_DROP) {
    reasons.push(`Literal preservation dropped ${Math.round(literalDrop * 100)}pp`);
    sev = Math.max(sev, 2);
  } else if (literalDrop > WARNING_DROP && sev < 2) {
    reasons.push(`Literal preservation dropped ${Math.round(literalDrop * 100)}pp`);
    sev = Math.max(sev, 1);
  }

  severity = sev === 2 ? 'critical' : sev === 1 ? 'warning' : 'none';

  const regressionDetected = reasons.length > 0;

  return {
    language,
    baselineRetentionRate: baseline.retentionRate,
    currentRetentionRate: current.retentionRate,
    baselinePredicateMatch: baseline.avgPredicateMatch,
    currentPredicateMatch: current.avgPredicateMatch,
    baselineRoleMatch: baseline.avgRoleMatch,
    currentRoleMatch: current.avgRoleMatch,
    baselineLiteralPreservation: baseline.avgProtectedLiteralPreservation,
    currentLiteralPreservation: current.avgProtectedLiteralPreservation,
    regressionDetected,
    regressionReasons: reasons,
    severity
  };
}

/**
 * Run a full regression gate check.
 *
 * Compares current retention metrics against stored baselines.
 * Returns a gate result indicating pass/fail and per-language regression details.
 */
export async function runRegressionGate(
  workspaceRoot: string,
  experimentId: string,
  datasetSha256: string,
  currentMetrics: Record<RealizationLanguage, RetentionMetric>
): Promise<RegressionGateResult> {
  const baselineStore = await loadBaselineStore(workspaceRoot);
  const languages: RealizationLanguage[] = ['en', 'el', 'es', 'id'];
  const perLanguageRegressions: RegressionResult[] = [];
  const criticalRegressions: string[] = [];
  const warningRegressions: string[] = [];

  // If no baseline exists, we can't do regression — return neutral
  if (!baselineStore) {
    return {
      experimentId,
      datasetSha256,
      baselines: baselineStore || {
        version: '1.0',
        experimentId: 'unknown',
        datasetSha256,
        recordedAt: new Date().toISOString(),
        languageBaselines: {} as Record<RealizationLanguage, LanguageBaseline>
      },
      currentMetrics,
      perLanguageRegressions,
      anyRegression: false,
      criticalRegressions,
      warningRegressions,
      passed: true
    };
  }

  // Check each language
  for (const lang of languages) {
    const baseline = baselineStore.languageBaselines[lang as RealizationLanguage];
    const current = currentMetrics[lang];

    if (!baseline) {
      // No baseline for this language — treat as no regression
      continue;
    }

    const regression = computeLanguageRegression(lang, baseline, current);
    perLanguageRegressions.push(regression);

    if (regression.regressionDetected) {
      if (regression.severity === 'critical') {
        criticalRegressions.push(`${lang}: ${regression.regressionReasons.join('; ')}`);
      } else {
        warningRegressions.push(`${lang}: ${regression.regressionReasons.join('; ')}`);
      }
    }
  }

  const anyRegression = perLanguageRegressions.some(r => r.regressionDetected);
  // Gate passes if no critical regressions
  const passed = criticalRegressions.length === 0;

  return {
    experimentId,
    datasetSha256,
    baselines: baselineStore,
    currentMetrics,
    perLanguageRegressions,
    anyRegression,
    criticalRegressions,
    warningRegressions,
    passed
  };
}

// ── Baseline Recording ─────────────────────────────────────────────

/**
 * Record a new baseline from current experiment results.
 * This is called after the first run to establish thresholds.
 */
export async function recordBaseline(
  workspaceRoot: string,
  experimentId: string,
  datasetSha256: string,
  metrics: Record<RealizationLanguage, RetentionMetric>
): Promise<RetentionBaselineStore> {
  const now = new Date().toISOString();

  const baselines: RetentionBaselineStore = {
    version: '1.0',
    experimentId,
    datasetSha256,
    recordedAt: now,
    languageBaselines: {} as Record<RealizationLanguage, LanguageBaseline>
  };

  for (const lang of ['en', 'el', 'es', 'id'] as RealizationLanguage[]) {
    const m = metrics[lang];
    baselines.languageBaselines[lang] = {
      language: lang,
      retentionRate: m.retentionRate,
      avgPredicateMatch: m.avgPredicateMatch,
      avgRoleMatch: m.avgRoleMatch,
      avgProtectedLiteralPreservation: m.avgProtectedLiteralPreservation,
      recordedAt: now,
      datasetSha256
    };
  }

  await saveBaselineStore(workspaceRoot, baselines);
  return baselines;
}

// ── Default Baseline ───────────────────────────────────────────────

/**
 * Create a default baseline using conservative threshold values.
 * Useful when no prior run exists.
 */
export function createDefaultBaseline(
  experimentId: string,
  datasetSha256: string
): RetentionBaselineStore {
  const now = new Date().toISOString();

  const baselines: RetentionBaselineStore = {
    version: '1.0',
    experimentId,
    datasetSha256,
    recordedAt: now,
    languageBaselines: {} as Record<RealizationLanguage, LanguageBaseline>
  };

  for (const lang of ['en', 'el', 'es', 'id'] as RealizationLanguage[]) {
    baselines.languageBaselines[lang] = {
      language: lang,
      retentionRate: DEFAULT_RETENTION_RATE,
      avgPredicateMatch: DEFAULT_PREDICATE_MATCH,
      avgRoleMatch: DEFAULT_ROLE_MATCH,
      avgProtectedLiteralPreservation: DEFAULT_LITERAL_PRESERVATION,
      recordedAt: now,
      datasetSha256
    };
  }

  return baselines;
}

// ── CLI Helpers ────────────────────────────────────────────────────

/**
 * Print a human-readable regression gate summary.
 */
export function printRegressionSummary(result: RegressionGateResult): void {
  console.log('\n=== Retention Regression Gate ===');
  console.log(`Experiment: ${result.experimentId}`);
  console.log(`Dataset SHA: ${result.datasetSha256.slice(0, 16)}...`);
  console.log(`Status: ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log();

  for (const r of result.perLanguageRegressions) {
    if (!r.regressionDetected) continue;
    const icon = r.severity === 'critical' ? '🔴' : '🟡';
    console.log(`${icon} ${r.language}: ${r.regressionReasons.join(', ')}`);
  }

  if (result.criticalRegressions.length > 0) {
    console.log('\n--- Critical Regressions ---');
    for (const msg of result.criticalRegressions) {
      console.log(`  🔴 ${msg}`);
    }
  }

  if (result.warningRegressions.length > 0) {
    console.log('\n--- Warning Regressions ---');
    for (const msg of result.warningRegressions) {
      console.log(`  🟡 ${msg}`);
    }
  }

  if (!result.anyRegression) {
    console.log('  No regressions detected.');
  }

  console.log('===============================\n');
}
