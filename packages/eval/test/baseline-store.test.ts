/**
 * Tests for the retention baseline store and regression gate.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as os from 'node:os';
import * as fs from 'node:fs';
import {
  loadBaselineStore,
  saveBaselineStore,
  runRegressionGate,
  recordBaseline,
  createDefaultBaseline,
  printRegressionSummary,
  type RegressionGateResult,
  type RetentionBaselineStore
} from '../src/baseline-store.js';
import type { RetentionMetric } from '../src/retention-experiment.js';
import type { RealizationLanguage } from '../src/realization.js';
import type { LanguageBaseline } from '../src/baseline-store.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-test-'));
}

function makeMetrics(overrides?: Partial<Record<RealizationLanguage, Partial<RetentionMetric>>>): Record<RealizationLanguage, RetentionMetric> {
  const base = (lang: RealizationLanguage): RetentionMetric => ({
    language: lang,
    totalItems: 10,
    passedItems: 8,
    failedItems: 2,
    errorItems: 0,
    retentionRate: 0.8,
    avgPredicateMatch: 0.85,
    avgRoleMatch: 0.75,
    avgProtectedLiteralPreservation: 0.7,
    meanLatencyMs: 100
  } as RetentionMetric);

  return {
    en: { ...base('en'), ...(overrides?.en ?? {}) },
    el: { ...base('el'), ...(overrides?.el ?? {}) },
    es: { ...base('es'), ...(overrides?.es ?? {}) },
    id: { ...base('id'), ...(overrides?.id ?? {}) }
  } as Record<RealizationLanguage, RetentionMetric>;
}

// ── Tests ──────────────────────────────────────────────────────────

test('baseline store: save and load round-trip', async () => {
  const tmpDir = makeTempDir();
  const store: RetentionBaselineStore = {
    version: '1.0',
    experimentId: 'test-exp',
    datasetSha256: 'abc123def456',
    recordedAt: '2026-07-18T10:00:00Z',
    languageBaselines: {
      en: {
        language: 'en', retentionRate: 0.9, avgPredicateMatch: 0.9,
        avgRoleMatch: 0.85, avgProtectedLiteralPreservation: 0.85,
        recordedAt: '2026-07-18T10:00:00Z', datasetSha256: 'abc123def456'
      },
      el: {
        language: 'el', retentionRate: 0.85, avgPredicateMatch: 0.85,
        avgRoleMatch: 0.8, avgProtectedLiteralPreservation: 0.8,
        recordedAt: '2026-07-18T10:00:00Z', datasetSha256: 'abc123def456'
      },
      es: {
        language: 'es', retentionRate: 0.88, avgPredicateMatch: 0.88,
        avgRoleMatch: 0.82, avgProtectedLiteralPreservation: 0.82,
        recordedAt: '2026-07-18T10:00:00Z', datasetSha256: 'abc123def456'
      },
      id: {
        language: 'id', retentionRate: 0.82, avgPredicateMatch: 0.82,
        avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.78,
        recordedAt: '2026-07-18T10:00:00Z', datasetSha256: 'abc123def456'
      }
    }
  };

  await saveBaselineStore(tmpDir, store);
  const loaded = await loadBaselineStore(tmpDir);

  assert.ok(loaded, 'Should load the saved baseline store');
  assert.strictEqual(loaded!.version, '1.0');
  assert.strictEqual(loaded!.experimentId, 'test-exp');
  assert.strictEqual(loaded!.languageBaselines.en.retentionRate, 0.9);
  assert.strictEqual(loaded!.languageBaselines.id.retentionRate, 0.82);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('baseline store: load returns null when file does not exist', async () => {
  const tmpDir = makeTempDir();
  const result = await loadBaselineStore(tmpDir);
  assert.strictEqual(result, null, 'Should return null for missing store');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('baseline store: recordBaseline creates store with current metrics', async () => {
  const tmpDir = makeTempDir();
  const metrics = makeMetrics({
    en: { retentionRate: 0.95, avgPredicateMatch: 0.92 },
    el: { retentionRate: 0.88, avgPredicateMatch: 0.85 },
    es: { retentionRate: 0.90, avgPredicateMatch: 0.87 },
    id: { retentionRate: 0.83, avgPredicateMatch: 0.80 }
  });

  const store = await recordBaseline(tmpDir, 'ret-test', 'sha256-test', metrics);

  assert.strictEqual(store.version, '1.0');
  assert.strictEqual(store.experimentId, 'ret-test');
  assert.strictEqual(store.datasetSha256, 'sha256-test');
  assert.strictEqual(store.languageBaselines.en.retentionRate, 0.95);
  assert.strictEqual(store.languageBaselines.id.retentionRate, 0.83);

  // Verify file was created
  const fsPath = path.join(tmpDir, 'reports', 'retention', 'baseline-store.json');
  assert.ok(fs.existsSync(fsPath), 'Baseline store file should exist on disk');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('baseline store: createDefaultBaseline uses conservative defaults', () => {
  const store = createDefaultBaseline('default-test', 'sha256-default');

  assert.strictEqual(store.languageBaselines.en.retentionRate, 0.5);
  assert.strictEqual(store.languageBaselines.en.avgPredicateMatch, 0.5);
  assert.strictEqual(store.languageBaselines.en.avgRoleMatch, 0.4);
  assert.strictEqual(store.languageBaselines.en.avgProtectedLiteralPreservation, 0.4);
});

test('regression gate: returns null baseline when no store exists', async () => {
  const tmpDir = makeTempDir();
  const metrics = makeMetrics({
    en: { retentionRate: 0.6 }
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', metrics);

  assert.strictEqual(result.anyRegression, false);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.criticalRegressions.length, 0);
  assert.strictEqual(result.warningRegressions.length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: detects no regression when metrics match baseline', async () => {
  const tmpDir = makeTempDir();
  const metrics = makeMetrics({
    en: { retentionRate: 0.9, avgPredicateMatch: 0.9, avgRoleMatch: 0.85, avgProtectedLiteralPreservation: 0.85 },
    el: { retentionRate: 0.85, avgPredicateMatch: 0.85, avgRoleMatch: 0.8, avgProtectedLiteralPreservation: 0.8 },
    es: { retentionRate: 0.88, avgPredicateMatch: 0.88, avgRoleMatch: 0.82, avgProtectedLiteralPreservation: 0.82 },
    id: { retentionRate: 0.82, avgPredicateMatch: 0.82, avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.78 }
  });

  // Record baseline with identical metrics
  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', metrics);

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', metrics);

  assert.strictEqual(result.anyRegression, false);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.perLanguageRegressions.length, 4);

  // Check all languages show no regression
  for (const r of result.perLanguageRegressions) {
    assert.ok(!r.regressionDetected, `${r.language} should show no regression`);
    assert.strictEqual(r.severity, 'none');
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: detects critical regression (>20pp drop)', async () => {
  const tmpDir = makeTempDir();
  const baselineMetrics = makeMetrics({
    en: { retentionRate: 0.9, avgPredicateMatch: 0.9, avgRoleMatch: 0.85 },
    el: { retentionRate: 0.85, avgPredicateMatch: 0.85, avgRoleMatch: 0.8 },
    es: { retentionRate: 0.88, avgPredicateMatch: 0.88, avgRoleMatch: 0.82 },
    id: { retentionRate: 0.82, avgPredicateMatch: 0.82, avgRoleMatch: 0.78 }
  });
  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', baselineMetrics);

  // Current metrics show critical drops
  const currentMetrics = makeMetrics({
    en: { retentionRate: 0.6, avgPredicateMatch: 0.6, avgRoleMatch: 0.5 },
    el: { retentionRate: 0.6, avgPredicateMatch: 0.6, avgRoleMatch: 0.55 },
    es: { retentionRate: 0.62, avgPredicateMatch: 0.62, avgRoleMatch: 0.57 },
    id: { retentionRate: 0.54, avgPredicateMatch: 0.54, avgRoleMatch: 0.5 }
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', currentMetrics);

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.anyRegression, true);
  assert.strictEqual(result.criticalRegressions.length > 0, true, 'Should have critical regressions');
  assert.strictEqual(result.warningRegressions.length, 0, 'No warnings when critical exists');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: detects warning regression (10-20pp drop)', async () => {
  const tmpDir = makeTempDir();
  const baselineMetrics = makeMetrics({
    en: { retentionRate: 0.9, avgPredicateMatch: 0.9, avgRoleMatch: 0.85 },
    el: { retentionRate: 0.85, avgPredicateMatch: 0.85, avgRoleMatch: 0.8 },
    es: { retentionRate: 0.88, avgPredicateMatch: 0.88, avgRoleMatch: 0.82 },
    id: { retentionRate: 0.82, avgPredicateMatch: 0.82, avgRoleMatch: 0.78 }
  });
  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', baselineMetrics);

  // Current metrics show warning-level drops (10-20pp)
  const currentMetrics = makeMetrics({
    en: { retentionRate: 0.75, avgPredicateMatch: 0.77, avgRoleMatch: 0.72 },
    el: { retentionRate: 0.72, avgPredicateMatch: 0.74, avgRoleMatch: 0.68 },
    es: { retentionRate: 0.74, avgPredicateMatch: 0.76, avgRoleMatch: 0.70 },
    id: { retentionRate: 0.68, avgPredicateMatch: 0.70, avgRoleMatch: 0.65 }
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', currentMetrics);

  assert.strictEqual(result.passed, true); // Passes because no critical
  assert.strictEqual(result.anyRegression, true);
  assert.strictEqual(result.criticalRegressions.length, 0);
  assert.ok(result.warningRegressions.length > 0, 'Should have warning regressions');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: handles missing baseline for some languages', async () => {
  const tmpDir = makeTempDir();
  const baselineMetrics = makeMetrics({
    en: { retentionRate: 0.9, avgPredicateMatch: 0.9 },
    el: { retentionRate: 0.85, avgPredicateMatch: 0.85 },
    es: { retentionRate: 0, avgPredicateMatch: 0 },
    id: { retentionRate: 0, avgPredicateMatch: 0 }
  });

  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', baselineMetrics);

  const currentMetrics = makeMetrics({
    es: { retentionRate: 0.88, avgPredicateMatch: 0.88 },
    id: { retentionRate: 0.82, avgPredicateMatch: 0.82 }
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', currentMetrics);

  // Should only have regressions for en/el (which have baselines)
  const checkedLanguages = result.perLanguageRegressions.map(r => r.language);
  assert.ok(checkedLanguages.includes('en'), 'Should check en');
  assert.ok(checkedLanguages.includes('el'), 'Should check el');
  assert.ok(checkedLanguages.includes('es'), 'Should check es');
  assert.ok(checkedLanguages.includes('id'), 'Should check id');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: critical regression overrides warning', async () => {
  const tmpDir = makeTempDir();
  const baselineMetrics = makeMetrics({
    en: { retentionRate: 0.9, avgPredicateMatch: 0.9, avgRoleMatch: 0.85, avgProtectedLiteralPreservation: 0.85 }
  });
  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', baselineMetrics);

  // Current: en drops >20pp (critical), but another metric drops 10-20pp (warning)
  const currentMetrics = makeMetrics({
    en: { retentionRate: 0.6, avgPredicateMatch: 0.78, avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.68 }
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', currentMetrics);

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.criticalRegressions.length > 0, true);
  // Critical should override warning — no separate warning entries
  assert.strictEqual(result.warningRegressions.length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: mixed critical and warning across languages', async () => {
  const tmpDir = makeTempDir();
  const baselineMetrics = makeMetrics({
    en: { retentionRate: 0.9, avgPredicateMatch: 0.9, avgRoleMatch: 0.85, avgProtectedLiteralPreservation: 0.85 },
    el: { retentionRate: 0.85, avgPredicateMatch: 0.85, avgRoleMatch: 0.8, avgProtectedLiteralPreservation: 0.8 },
    es: { retentionRate: 0.88, avgPredicateMatch: 0.88, avgRoleMatch: 0.82, avgProtectedLiteralPreservation: 0.82 },
    id: { retentionRate: 0.82, avgPredicateMatch: 0.82, avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.78 }
  });
  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', baselineMetrics);

  const currentMetrics = makeMetrics({
    en: { retentionRate: 0.55, avgPredicateMatch: 0.6, avgRoleMatch: 0.55, avgProtectedLiteralPreservation: 0.55 }, // critical (>20pp drop)
    el: { retentionRate: 0.70, avgPredicateMatch: 0.72, avgRoleMatch: 0.68, avgProtectedLiteralPreservation: 0.68 }, // warning (10-20pp drop)
    es: { retentionRate: 0.88, avgPredicateMatch: 0.88, avgRoleMatch: 0.82, avgProtectedLiteralPreservation: 0.82 }, // no regression
    id: { retentionRate: 0.82, avgPredicateMatch: 0.82, avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.78 }  // no regression
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', currentMetrics);

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.criticalRegressions.length, 1); // Only en is critical
  assert.strictEqual(result.warningRegressions.length, 1);  // Only el is warning
  assert.ok(result.criticalRegressions[0]!.includes('en'), 'Critical regression should be for en');
  assert.ok(result.warningRegressions[0]!.includes('el'), 'Warning regression should be for el');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('regression gate: regression details are accurate', async () => {
  const tmpDir = makeTempDir();
  const baselineMetrics = makeMetrics({
    en: { retentionRate: 0.8, avgPredicateMatch: 0.85, avgRoleMatch: 0.75, avgProtectedLiteralPreservation: 0.7 }
  });
  await recordBaseline(tmpDir, 'test-exp', 'sha256-test', baselineMetrics);

  const currentMetrics = makeMetrics({
    en: { retentionRate: 0.6, avgPredicateMatch: 0.65, avgRoleMatch: 0.55, avgProtectedLiteralPreservation: 0.5 }
  });

  const result = await runRegressionGate(tmpDir, 'test-exp', 'sha256-test', currentMetrics);
  const enResult = result.perLanguageRegressions.find(r => r.language === 'en')!;

  assert.strictEqual(enResult.baselineRetentionRate, 0.8);
  assert.strictEqual(enResult.currentRetentionRate, 0.6);
  assert.strictEqual(enResult.baselinePredicateMatch, 0.85);
  assert.strictEqual(enResult.currentPredicateMatch, 0.65);
  assert.strictEqual(enResult.baselineRoleMatch, 0.75);
  assert.strictEqual(enResult.currentRoleMatch, 0.55);
  assert.strictEqual(enResult.baselineLiteralPreservation, 0.7);
  assert.strictEqual(enResult.currentLiteralPreservation, 0.5);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('baseline store: dataset sha256 is recorded and preserved', async () => {
  const tmpDir = makeTempDir();
  const metrics = makeMetrics();
  const datasetSha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

  await recordBaseline(tmpDir, 'test', datasetSha, metrics);
  const loaded = await loadBaselineStore(tmpDir);

  assert.strictEqual(loaded!.datasetSha256, datasetSha);
  for (const lang of ['en', 'el', 'es', 'id'] as RealizationLanguage[]) {
    assert.strictEqual((loaded!.languageBaselines as Record<RealizationLanguage, LanguageBaseline>)[lang].datasetSha256, datasetSha);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('baseline store: printed summary contains expected content', async () => {
  const result: RegressionGateResult = {
    experimentId: 'test',
    datasetSha256: 'sha256test',
    baselines: createDefaultBaseline('test', 'sha256test'),
    currentMetrics: makeMetrics(),
    perLanguageRegressions: [
      {
        language: 'en',
        baselineRetentionRate: 0.9, currentRetentionRate: 0.65,
        baselinePredicateMatch: 0.9, currentPredicateMatch: 0.65,
        baselineRoleMatch: 0.85, currentRoleMatch: 0.6,
        baselineLiteralPreservation: 0.85, currentLiteralPreservation: 0.6,
        regressionDetected: true,
        regressionReasons: ['Retention dropped 25pp (>20% drop)', 'Predicate match dropped 25pp'],
        severity: 'critical'
      }
    ],
    anyRegression: true,
    criticalRegressions: ['en: Retention dropped 25pp (>20% drop); Predicate match dropped 25pp'],
    warningRegressions: ['el: Retention dropped 15pp (>10% drop)'],
    passed: false
  };

  // Capture console output
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => logs.push(args.join(' '));

  try {
    printRegressionSummary(result);
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  assert.ok(output.includes('Retention Regression Gate'), 'Should print header');
  assert.ok(output.includes('FAIL'), 'Should show FAIL status');
  assert.ok(output.includes('en'), 'Should show language');
  assert.ok(output.includes('Critical Regressions'), 'Should show critical section');
  assert.ok(output.includes('Warning Regressions'), 'Should show warning section');
});

test('baseline store: handles zero metrics gracefully', async () => {
  const tmpDir = makeTempDir();
  const zeroMetrics = {
    en: { language: 'en', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    el: { language: 'el', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    es: { language: 'es', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    id: { language: 'id', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any
  };

  await recordBaseline(tmpDir, 'zero-test', 'sha256-zero', zeroMetrics);
  const loaded = await loadBaselineStore(tmpDir);

  assert.ok(loaded);
  assert.strictEqual(loaded!.languageBaselines.en.retentionRate, 0);
  assert.strictEqual(loaded!.languageBaselines.en.avgPredicateMatch, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
