# Retention Regression Gate

**Status:** Reference implementation  
**Package:** `packages/eval`  
**Module:** `packages/eval/src/baseline-store.ts`  
**Tests:** `packages/eval/test/baseline-store.test.ts` (11 tests)  
**CI:** `.github/workflows/retention-regression-gate.yml`  
**Added:** PR #167 (commit 81df623)

## Purpose

The retention regression gate prevents multilingual retention quality from degrading over time by comparing current experiment results against a stored baseline and failing CI when critical regressions are detected.

## How it works

1. **Baseline creation:** After a successful retention experiment run, call `saveBaseline()` to record per-language metrics. This is an explicit action, not automatic on first run.
2. **Baseline provenance:** Each baseline records dataset SHA-256, model ID, and Lunum schema version so comparisons are apples-to-apples.
3. **Regression detection:** Call `checkRegression()` with current metrics. The gate compares retention rate, predicate match, role match, and protected-literal preservation against the baseline.
4. **Severity levels:**
   - `warning`: ≥10 percentage point drop
   - `critical`: ≥20 percentage point drop
5. **Stale-baseline check:** Baselines older than 365 days are flagged; stale baselines produce warnings but do not automatically fail the gate.
6. **CI gate:** The nightly CI workflow runs retention experiments and checks for critical regressions. Exit code 2 = critical regression detected = gate fails.

## Types

```typescript
interface LanguageBaseline {
  language: string;
  retentionRate: number;
  avgPredicateMatch: number;
  avgRoleMatch: number;
  avgProtectedLiteralPreservation: number;
  recordedAt: number;
}

interface RetentionBaselineStore {
  version: string;           // '1.0'
  recordedAt: number;
  datasetSha256: string;
  modelId: string;
  schemaVersion: string;
  languages: Record<string, LanguageBaseline>;
}

type RegressionSeverity = 'none' | 'warning' | 'critical';

interface RegressionResult {
  language: string;
  metric: string;
  baseline: number;
  current: number;
  drop: number;
  severity: RegressionSeverity;
}

interface RegressionGateResult {
  passed: boolean;
  warnings: string[];
  criticalFailures: RegressionResult[];
  warningResults: RegressionResult[];
  languageResults: Map<string, RegressionResult[]>;
  store: RetentionBaselineStore | null;
}
```

## API

```typescript
// Get the path to the baseline store file
function getBaselineStorePath(root: string): string;

// Save a baseline from experiment metrics
function saveBaseline(
  root: string,
  metrics: Record<string, RetentionMetric>
): RetentionBaselineStore;

// Load a previously saved baseline
function loadBaseline(root: string): RetentionBaselineStore | null;

// Check current metrics against the stored baseline
function checkRegression(
  root: string,
  currentMetrics: Record<string, RetentionMetric>
): RegressionGateResult;

// Human-readable summary of regression results
function printRegressionSummary(result: RegressionGateResult): string;
```

## Storage

Baselines are stored in `reports/retention/baseline-store.json` relative to the repository root. The directory `reports/retention/` is created automatically if it does not exist.

## CI workflow

The retention regression gate runs nightly on `main` when any of these files change:

- `packages/eval/src/retention-experiment.ts`
- `packages/eval/src/baseline-store.ts`
- `packages/eval/src/realization.ts`

It can also be triggered manually via `workflow_dispatch`.

The workflow:

1. Checks out the repository and builds the project.
2. Runs `pnpm --filter @corpunum/lunum-eval eval:retention` to execute retention experiments.
3. Parses the latest `reports/experiments/retention/*/summary.json` for per-language metrics.
4. Calls `checkRegression()` to compare against the stored baseline.
5. Fails the CI job (exit 1) if any critical regression is detected.

## Constants

| Name | Value | Meaning |
|---|---|---|
| `BASELINE_VERSION` | `'1.0'` | Schema version of baseline store format |
| `BASELINE_DIR` | `'reports/retention'` | Directory for baseline data |
| `STALE_DAYS` | `365` | Days before a baseline is considered stale |
| `warning` threshold | `0.10` (10 pp) | Drop ≥10 percentage points = warning |
| `critical` threshold | `0.20` (20 pp) | Drop ≥20 percentage points = critical |
| Required metrics | `retentionRate`, `avgPredicateMatch`, `avgRoleMatch`, `avgProtectedLiteralPreservation` | All four must be present for a valid baseline |

## Usage example

```typescript
import { saveBaseline, checkRegression, printRegressionSummary } from '@corpunum/lunum-eval/baseline-store';

// After a retention experiment run
const currentMetrics = {
  en: { retentionRate: 0.95, avgPredicateMatch: 0.93, avgRoleMatch: 0.91, avgProtectedLiteralPreservation: 0.97 },
  el: { retentionRate: 0.92, avgPredicateMatch: 0.89, avgRoleMatch: 0.87, avgProtectedLiteralPreservation: 0.94 }
};

// Record as baseline (first run)
const baseline = saveBaseline(process.cwd(), currentMetrics);
console.log('Baseline saved:', baseline.recordedAt);

// Later, check for regressions
const result = checkRegression(process.cwd(), currentMetrics);
console.log(printRegressionSummary(result));
// If critical regressions exist: result.passed === false
```

## Design decisions

- **Explicit baseline creation:** Baselines are not recorded automatically on first run. This prevents accidental baselines from noisy experimental runs and makes the baseline recording a deliberate act.
- **Separation of concerns:** `baseline-store.ts` handles storage and regression detection. The CI workflow handles orchestration. The eval runner handles experiment execution.
- **Stale baselines warn but do not fail:** A baseline older than 365 days gets a warning, reflecting that model behavior may have legitimately changed over a long period. The warning encourages refreshing baselines without forcing an immediate failure.
- **Severity thresholds are fixed:** Warning at 10 pp, critical at 20 pp. These are conservative; the project can adjust thresholds in a future version if needed.

## Limitations

- Baselines are stored as plain JSON on disk; there is no versioned history or diff between baseline runs.
- The regression gate compares against a single baseline, not a trend or moving average.
- The CI workflow reads from `reports/experiments/retention/`; if the directory is empty or malformed, the gate exits cleanly (no regression to detect).
- Requires a configured OpenAI-compatible endpoint for the retention experiment itself; the gate only checks the results.

## Related

- [`docs/MULTILINGUAL_REALIZATION.md`](MULTILINGUAL_REALIZATION.md) — Multilingual realization experiments that produce the metrics the gate evaluates.
- [`docs/EXPERIMENT_PROTOCOL.md`](EXPERIMENT_PROTOCOL.md) — How experiments are structured and reported.
- [`.github/workflows/retention-regression-gate.yml`](../.github/workflows/retention-regression-gate.yml) — CI workflow definition.
