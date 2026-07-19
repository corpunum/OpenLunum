# Retention Baseline Store

**Status:** Reference implementation
**Package:** `packages/eval`
**Module:** `packages/eval/src/retention-baseline.ts`
**Tests:** `packages/eval/test/retention-baseline.test.ts` (274 lines)
**Added:** PR #180 (commit 7fced9b)

## Purpose

The retention baseline store provides a structured way to capture per-language retention metrics from a successful experiment run and compare future runs against that baseline to detect regressions. Unlike the earlier `baseline-store.ts` (PR #167), this module stores a richer baseline format with per-language detailed metrics and supports snapshot conversion from retention reports.

## How it works

1. **Baseline capture:** After a successful multilingual round-trip retention experiment, call `snapshotToBaseline()` to convert the retention report snapshot into a baseline record, then `saveBaseline()` to persist it to disk.
2. **Baseline provenance:** Each baseline records commit SHA, dataset SHA-256, and a timestamp so comparisons are apples-to-apples.
3. **Regression detection:** Call `compareRetentionAgainstBaseline()` with current experiment metrics. The function loads the saved baseline (or uses a provided one) and compares per-language retention rates, predicate match, role match, and protected-literal preservation.
4. **Regression criteria:** A regression is detected when:
   - Any language's retention rate drops below its baseline by more than the configured minimum delta (default 5 pp), OR
   - Any language's retention rate drops below the minimum threshold (0.5 = 50% by default), OR
   - The overall retention rate drops significantly (> 5 pp from baseline)
5. **CI integration:** The baseline can be checked in CI workflows; regressions produce warnings and can be configured to fail CI in strict mode.

## Types

```typescript
interface RetentionBaseline {
  schema: 'openlunum-retention-baseline/0.1';
  capturedAt: string;
  commit: string;
  datasetSha256: string;
  baselines: Record<string, {
    retentionRate: number;
    totalItems: number;
    passedItems: number;
    failedItems: number;
    avgPredicateMatch: number;
    avgRoleMatch: number;
    avgProtectedLiteralPreservation: number;
  }>;
  overallRetentionRate: number;
  regressionDetected: boolean;
}

interface BaselineComparison {
  regressionDetected: boolean;
  comparisons: Record<string, {
    baselineRate: number;
    currentRate: number;
    delta: number;
    passed: boolean;
    belowThreshold: boolean;
  }>;
  overall: {
    baselineRate: number;
    currentRate: number;
    delta: number;
    passed: boolean;
  };
  warnings: string[];
}

interface RetentionReportSnapshot {
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
```

## API

```typescript
// Save a retention baseline to disk
function saveBaseline(
  baseline: RetentionBaseline,
  options?: { dir?: string }
): Promise<void>;

// Load a previously saved baseline (returns null if not found)
function loadBaseline(options?: { dir?: string }): Promise<RetentionBaseline | null>;

// Check whether a baseline exists on disk
function hasBaseline(options?: { dir?: string }): Promise<boolean>;

// Convert a retention report snapshot to a baseline record
function snapshotToBaseline(
  report: RetentionReportSnapshot,
  options: { commit: string; datasetSha256: string }
): RetentionBaseline;

// Compare current metrics against the baseline
function compareRetentionAgainstBaseline(
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
  options?: {
    dir?: string;
    minDelta?: number;      // default: 0.05 (5 pp)
    strict?: boolean;        // default: true
  }
): Promise<BaselineComparison>;
```

## Storage

Baselines are stored in `.openlunum/baselines/retention-baseline.json` by default. The directory is created automatically if it does not exist. The path can be customized via the `dir` option.

## Default thresholds

| Name | Value | Meaning |
|---|---|---|
| `minDelta` | `0.05` (5 pp) | Minimum drop before flagging as regression |
| `baselineThreshold` | `0.5` (50%) | Minimum acceptable retention rate per language |
| `strict` | `true` | Whether regressions cause the comparison to fail |

## Usage example

```typescript
import {
  saveBaseline,
  loadBaseline,
  snapshotToBaseline,
  compareRetentionAgainstBaseline
} from '@corpunum/lunum-eval/retention-baseline';

// After a retention experiment run, convert the report snapshot
const snapshot = {
  experimentId: 'round-trip-001',
  runId: 'run-2026-07-19',
  languages: ['en', 'el', 'es', 'id'],
  totalItems: 100,
  totalPassed: 95,
  totalFailed: 5,
  totalErrors: 0,
  overallRetentionRate: 0.95,
  languageMetrics: {
    en: { retentionRate: 0.98, totalItems: 25, passedItems: 25, failedItems: 0, avgPredicateMatch: 0.96, avgRoleMatch: 0.94, avgProtectedLiteralPreservation: 0.99 },
    el: { retentionRate: 0.94, totalItems: 25, passedItems: 24, failedItems: 1, avgPredicateMatch: 0.92, avgRoleMatch: 0.90, avgProtectedLiteralPreservation: 0.95 },
    es: { retentionRate: 0.92, totalItems: 25, passedItems: 23, failedItems: 2, avgPredicateMatch: 0.90, avgRoleMatch: 0.88, avgProtectedLiteralPreservation: 0.93 },
    id: { retentionRate: 0.93, totalItems: 25, passedItems: 23, failedItems: 2, avgPredicateMatch: 0.91, avgRoleMatch: 0.89, avgProtectedLiteralPreservation: 0.94 }
  },
  baselineThreshold: 0.5,
  regressionDetected: false
};

// Convert snapshot to baseline and save
const baseline = snapshotToBaseline(snapshot, {
  commit: '7fced9b',
  datasetSha256: 'abc123...'
});
await saveBaseline(baseline);

// Later, compare new results against baseline
const currentReport = { /* current experiment metrics */ };
const comparison = await compareRetentionAgainstBaseline(currentReport);

if (comparison.regressionDetected) {
  console.warn('Reggression detected:', comparison.warnings);
}
```

## Design decisions

- **Snapshot-first design:** Baselines are created by converting a retention report snapshot, ensuring all metrics are captured consistently. This avoids the need for a separate metrics collection path.
- **Per-language granularity:** The baseline stores detailed per-language metrics, not just an overall rate. This enables detection of regressions in specific languages even when the overall rate appears stable.
- **Configurable thresholds:** Both `minDelta` (minimum drop to flag) and `strict` (whether to fail on regression) are configurable, allowing different CI strategies (e.g., warning-only in development, strict in release branches).
- **Default-to-perfect baseline:** When no baseline exists, the comparison defaults to a perfect baseline (100% retention), which means any real regression will be detected. This is intentional for first-run scenarios.
- **Separation from baseline-store.ts:** The earlier `baseline-store.ts` (PR #167) used a simpler format focused on regression severity levels (warning/critical). This module uses a richer baseline format with per-language detailed metrics and snapshot conversion. They serve complementary purposes: baseline-store for quick severity checks, retention-baseline for detailed per-language analysis.

## Limitations

- Baselines are stored as plain JSON on disk; there is no versioned history or diff between baseline runs.
- The regression detection compares against a single baseline, not a trend or moving average.
- Requires a retention report snapshot in the expected format; incompatible snapshots will produce incorrect comparisons.
- The `hasBaseline()` check does not validate the content of the baseline file, only its existence.

## Related

- [`docs/RETENTION_REGRESSION_GATE.md`](RETENTION_REGRESSION_GATE.md) — The earlier retention regression gate (baseline-store.ts) with severity-based detection.
- [`docs/ROUND_TRIP_RETENTION.md`](ROUND_TRIP_RETENTION.md) — Multilingual round-trip retention experiments that produce the metrics this module evaluates.
- [`docs/EXPERIMENT_PROTOCOL.md`](EXPERIMENT_PROTOCOL.md) — How experiments are structured and reported.
