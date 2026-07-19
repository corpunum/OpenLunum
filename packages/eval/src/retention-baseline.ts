/**
 * Retention baseline store — saves and loads per-language retention metrics
 * so that CI can detect regressions by comparing current runs against a
 * known-good baseline.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetentionBaseline {
  /** Schema version of this baseline format */
  schema: 'openlunum-retention-baseline/0.1';
  /** When the baseline was captured (ISO 8601) */
  capturedAt: string;
  /** Baseline commit that produced this baseline */
  commit: string;
  /** Baseline dataset SHA-256 */
  datasetSha256: string;
  /** Per-language retention rates from the baseline run */
  baselines: Record<string, {
    retentionRate: number;
    totalItems: number;
    passedItems: number;
    failedItems: number;
    avgPredicateMatch: number;
    avgRoleMatch: number;
    avgProtectedLiteralPreservation: number;
  }>;
  /** Overall retention rate across all languages */
  overallRetentionRate: number;
  /** Whether a regression was detected in the baseline run */
  regressionDetected: boolean;
}

export interface BaselineComparison {
  /** Whether a regression was detected */
  regressionDetected: boolean;
  /** Per-language comparison results */
  comparisons: Record<string, {
    baselineRate: number;
    currentRate: number;
    delta: number; // current - baseline (negative = regression)
    passed: boolean;
    belowThreshold: boolean;
  }>;
  /** Overall comparison */
  overall: {
    baselineRate: number;
    currentRate: number;
    delta: number;
    passed: boolean;
  };
  /** Warnings about languages that dropped significantly */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Default baseline directory
// ---------------------------------------------------------------------------

const DEFAULT_BASELINE_DIR = '.openlunum/baselines';
const BASELINE_FILENAME = 'retention-baseline.json';

// ---------------------------------------------------------------------------
// Baseline store
// ---------------------------------------------------------------------------

/**
 * Save a retention baseline to disk.
 * Creates the baseline directory if it doesn't exist.
 */
export async function saveBaseline(
  baseline: RetentionBaseline,
  options: { dir?: string } = {}
): Promise<void> {
  const dir = options.dir ?? DEFAULT_BASELINE_DIR;
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, BASELINE_FILENAME);
  await writeFile(filePath, JSON.stringify(baseline, null, 2), 'utf-8');
}

/**
 * Load a retention baseline from disk.
 * Returns `null` if no baseline exists.
 */
export async function loadBaseline(options: { dir?: string } = {}): Promise<RetentionBaseline | null> {
  const dir = options.dir ?? DEFAULT_BASELINE_DIR;
  const filePath = join(dir, BASELINE_FILENAME);
  try {
    await access(filePath);
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as RetentionBaseline;
  } catch {
    return null;
  }
}

/**
 * Check whether a baseline exists.
 */
export async function hasBaseline(options: { dir?: string } = {}): Promise<boolean> {
  const dir = options.dir ?? DEFAULT_BASELINE_DIR;
  const filePath = join(dir, BASELINE_FILENAME);
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Regression detection
// ---------------------------------------------------------------------------

/**
 * Compare current retention metrics against the baseline.
 *
 * A regression is detected when:
 * - Any language's retention rate drops below its baseline, OR
 * - Any language's retention rate drops below the minimum threshold (0.5 by default), OR
 * - The overall retention rate drops significantly (> 5 percentage points)
 *
 * @param currentReport - Current retention report metrics
 * @param baseline - Optional baseline to compare against (loads from disk if not provided)
 * @param options - Configuration options
 */
export async function compareRetentionAgainstBaseline(
  currentReport: {
    languages: string[];
    languageMetrics: Record<string, {
      retentionRate: number;
      totalItems: number;
      passedItems: number;
      failedItems: number;
      avgPredicateMatch: number;
      avgRoleMatch: number;
      avgProtectedLiteralPreservation: number;
    }>;
    overallRetentionRate: number;
    baselineThreshold: number;
  },
  baseline?: RetentionBaseline | null,
  options: {
    dir?: string;
    /** Minimum acceptable delta before flagging (default: 0.05 = 5 percentage points) */
    minDelta?: number;
    /** Whether to fail on any regression (default: true) */
    strict?: boolean;
  } = {}
): Promise<BaselineComparison> {
  const { minDelta = 0.05, strict = true } = options;

  // Load baseline if not provided
  let bl = baseline;
  if (!bl) {
    const loadOpts: { dir?: string } = {};
    if (options.dir !== undefined) loadOpts.dir = options.dir;
    bl = await loadBaseline(loadOpts);
  }

  const comparisons: Record<string, BaselineComparison['comparisons'][string]> = {};
  const warnings: string[] = [];
  let regressionDetected = false;

  const baselineThreshold = currentReport.baselineThreshold ?? 0.5;

  for (const lang of currentReport.languages) {
    const current = currentReport.languageMetrics[lang];
    if (!current) continue;

    const baseline = bl?.baselines[lang];
    const baselineRate = baseline?.retentionRate ?? 1.0; // Default to perfect if no baseline
    const currentRate = current.retentionRate;
    const delta = currentRate - baselineRate;

    const belowThreshold = currentRate < baselineThreshold;
    const regression = delta < -minDelta || belowThreshold;

    if (regression) {
      regressionDetected = true;
    }

    comparisons[lang] = {
      baselineRate,
      currentRate,
      delta,
      passed: !regression,
      belowThreshold
    };

    if (regression) {
      const reason = [];
      if (delta < -minDelta) {
        reason.push(`${(delta * 100).toFixed(1)}pp drop from baseline ${(baselineRate * 100).toFixed(1)}%`);
      }
      if (belowThreshold) {
        reason.push(`below minimum threshold ${(baselineThreshold * 100).toFixed(1)}%`);
      }
      warnings.push(`Language ${lang}: retention ${currentRate.toFixed(3)} — ${reason.join(', ')}`);
    }
  }

  // Overall comparison
  const overallBaseline = bl?.overallRetentionRate ?? 1.0;
  const overallDelta = currentReport.overallRetentionRate - overallBaseline;
  const overallRegression = overallDelta < -minDelta || currentReport.overallRetentionRate < baselineThreshold;

  if (overallRegression && !regressionDetected) {
    regressionDetected = true;
    warnings.push(`Overall retention ${currentReport.overallRetentionRate.toFixed(3)} — ${(-overallDelta * 100).toFixed(1)}pp drop from baseline ${(overallBaseline * 100).toFixed(1)}%`);
  }

  return {
    regressionDetected,
    comparisons,
    overall: {
      baselineRate: overallBaseline,
      currentRate: currentReport.overallRetentionRate,
      delta: overallDelta,
      passed: !overallRegression
    },
    warnings
  };
}

// ---------------------------------------------------------------------------
// Helper: Build baseline from a retention report
// ---------------------------------------------------------------------------

export interface RetentionReportSnapshot {
  experimentId: string;
  runId: string;
  languages: string[];
  totalItems: number;
  totalPassed: number;
  totalFailed: number;
  totalErrors: number;
  overallRetentionRate: number;
  languageMetrics: Record<string, {
    retentionRate: number;
    totalItems: number;
    passedItems: number;
    failedItems: number;
    avgPredicateMatch: number;
    avgRoleMatch: number;
    avgProtectedLiteralPreservation: number;
  }>;
  baselineThreshold: number;
  regressionDetected: boolean;
}

/**
 * Convert a retention report snapshot into a baseline record.
 */
export function snapshotToBaseline(
  report: RetentionReportSnapshot,
  options: { commit: string; datasetSha256: string }
): RetentionBaseline {
  const baselines: Record<string, RetentionBaseline['baselines'][string]> = {};

  for (const lang of report.languages) {
    const m = report.languageMetrics[lang];
    if (!m) continue;
    baselines[lang] = {
      retentionRate: m.retentionRate,
      totalItems: m.totalItems,
      passedItems: m.passedItems,
      failedItems: m.failedItems,
      avgPredicateMatch: m.avgPredicateMatch,
      avgRoleMatch: m.avgRoleMatch,
      avgProtectedLiteralPreservation: m.avgProtectedLiteralPreservation
    };
  }

  return {
    schema: 'openlunum-retention-baseline/0.1',
    capturedAt: new Date().toISOString(),
    commit: options.commit,
    datasetSha256: options.datasetSha256,
    baselines,
    overallRetentionRate: report.overallRetentionRate,
    regressionDetected: report.regressionDetected
  };
}
