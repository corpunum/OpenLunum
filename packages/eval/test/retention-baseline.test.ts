import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import os from 'node:os';
import {
  saveBaseline,
  loadBaseline,
  hasBaseline,
  compareRetentionAgainstBaseline,
  snapshotToBaseline
} from '../src/retention-baseline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTempDir(prefix: string = 'retention-baseline-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

type CurrentReport = {
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
};

// ---------------------------------------------------------------------------
// Baseline store tests
// ---------------------------------------------------------------------------

test('baseline store: saves and loads a baseline', async () => {
  const dir = mkTempDir();
  try {
    const baseline = {
      schema: 'openlunum-retention-baseline/0.1' as const,
      capturedAt: '2026-07-18T00:00:00.000Z',
      commit: 'abc123',
      datasetSha256: 'def456',
      baselines: {
        en: {
          retentionRate: 0.95,
          totalItems: 100,
          passedItems: 95,
          failedItems: 5,
          avgPredicateMatch: 0.92,
          avgRoleMatch: 0.88,
          avgProtectedLiteralPreservation: 0.9
        }
      },
      overallRetentionRate: 0.95,
      regressionDetected: false
    };

    await saveBaseline(baseline, { dir });
    assert.equal(await hasBaseline({ dir }), true);

    const loaded = await loadBaseline({ dir });
    assert.ok(loaded);
    assert.equal(loaded!.schema, 'openlunum-retention-baseline/0.1');
    assert.equal(loaded!.commit, 'abc123');
    assert.equal(loaded!.overallRetentionRate, 0.95);
    assert.equal(loaded!.baselines.en!.retentionRate, 0.95);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('baseline store: returns null when no baseline exists', async () => {
  const dir = mkTempDir();
  try {
    assert.equal(await hasBaseline({ dir }), false);
    const loaded = await loadBaseline({ dir });
    assert.equal(loaded, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Snapshot to baseline tests
// ---------------------------------------------------------------------------

test('snapshotToBaseline: converts a retention report to a baseline', () => {
  const report = {
    experimentId: 'retention-test',
    runId: 'run-001',
    languages: ['en', 'el', 'es', 'id'],
    totalItems: 16,
    totalPassed: 15,
    totalFailed: 1,
    totalErrors: 0,
    overallRetentionRate: 0.9375,
    languageMetrics: {
      en: { retentionRate: 1.0, totalItems: 4, passedItems: 4, failedItems: 0, avgPredicateMatch: 0.95, avgRoleMatch: 0.9, avgProtectedLiteralPreservation: 0.95 },
      el: { retentionRate: 0.75, totalItems: 4, passedItems: 3, failedItems: 1, avgPredicateMatch: 0.8, avgRoleMatch: 0.7, avgProtectedLiteralPreservation: 0.8 },
      es: { retentionRate: 1.0, totalItems: 4, passedItems: 4, failedItems: 0, avgPredicateMatch: 0.92, avgRoleMatch: 0.88, avgProtectedLiteralPreservation: 0.92 },
      id: { retentionRate: 1.0, totalItems: 4, passedItems: 4, failedItems: 0, avgPredicateMatch: 0.93, avgRoleMatch: 0.89, avgProtectedLiteralPreservation: 0.93 }
    },
    baselineThreshold: 0.5,
    regressionDetected: false
  };

  const baseline = snapshotToBaseline(report, {
    commit: 'abc123',
    datasetSha256: 'def456'
  });

  assert.equal(baseline.schema, 'openlunum-retention-baseline/0.1');
  assert.equal(baseline.commit, 'abc123');
  assert.equal(baseline.datasetSha256, 'def456');
  assert.ok(baseline.capturedAt);
  assert.equal(baseline.overallRetentionRate, 0.9375);
  assert.equal(Object.keys(baseline.baselines).length, 4);
  assert.equal(baseline.baselines.en!.retentionRate, 1.0);
  assert.equal(baseline.baselines.el!.retentionRate, 0.75);
});

// ---------------------------------------------------------------------------
// Regression detection tests
// ---------------------------------------------------------------------------

test('compareRetentionAgainstBaseline: no regression when rates match baseline', async () => {
  const dir = mkTempDir();
  try {
    const baseline = {
      schema: 'openlunum-retention-baseline/0.1' as const,
      capturedAt: '2026-07-18T00:00:00.000Z',
      commit: 'abc123',
      datasetSha256: 'def456',
      baselines: {
        en: { retentionRate: 0.95, totalItems: 100, passedItems: 95, failedItems: 5, avgPredicateMatch: 0.92, avgRoleMatch: 0.88, avgProtectedLiteralPreservation: 0.9 },
        el: { retentionRate: 0.85, totalItems: 100, passedItems: 85, failedItems: 15, avgPredicateMatch: 0.82, avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.8 }
      },
      overallRetentionRate: 0.9,
      regressionDetected: false
    };

    await saveBaseline(baseline, { dir });

    const currentReport: CurrentReport = {
      languages: ['en', 'el'],
      languageMetrics: {
        en: { retentionRate: 0.94, totalItems: 100, passedItems: 94, failedItems: 6, avgPredicateMatch: 0.91, avgRoleMatch: 0.87, avgProtectedLiteralPreservation: 0.89 },
        el: { retentionRate: 0.84, totalItems: 100, passedItems: 84, failedItems: 16, avgPredicateMatch: 0.81, avgRoleMatch: 0.77, avgProtectedLiteralPreservation: 0.79 }
      },
      overallRetentionRate: 0.89,
      baselineThreshold: 0.5
    };

    const result = await compareRetentionAgainstBaseline(currentReport, null, { dir });
    assert.equal(result.regressionDetected, false);
    assert.equal(result.overall.passed, true);
    const compEn = result.comparisons.en!;
    assert.ok(compEn.passed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compareRetentionAgainstBaseline: detects regression when rates drop below baseline', async () => {
  const dir = mkTempDir();
  try {
    const baseline = {
      schema: 'openlunum-retention-baseline/0.1' as const,
      capturedAt: '2026-07-18T00:00:00.000Z',
      commit: 'abc123',
      datasetSha256: 'def456',
      baselines: {
        en: { retentionRate: 0.95, totalItems: 100, passedItems: 95, failedItems: 5, avgPredicateMatch: 0.92, avgRoleMatch: 0.88, avgProtectedLiteralPreservation: 0.9 }
      },
      overallRetentionRate: 0.95,
      regressionDetected: false
    };

    await saveBaseline(baseline, { dir });

    const currentReport: CurrentReport = {
      languages: ['en'],
      languageMetrics: {
        en: { retentionRate: 0.85, totalItems: 100, passedItems: 85, failedItems: 15, avgPredicateMatch: 0.82, avgRoleMatch: 0.78, avgProtectedLiteralPreservation: 0.8 }
      },
      overallRetentionRate: 0.85,
      baselineThreshold: 0.5
    };

    const result = await compareRetentionAgainstBaseline(currentReport, null, { dir });
    assert.equal(result.regressionDetected, true);
    assert.equal(result.overall.passed, false);
    assert.ok(result.warnings.length > 0);
    const compEn = result.comparisons.en!;
    assert.ok(compEn.delta < 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compareRetentionAgainstBaseline: no baseline defaults to perfect retention', async () => {
  const dir = mkTempDir();
  try {
    const currentReport: CurrentReport = {
      languages: ['en'],
      languageMetrics: {
        en: { retentionRate: 0.5, totalItems: 10, passedItems: 5, failedItems: 5, avgPredicateMatch: 0.5, avgRoleMatch: 0.5, avgProtectedLiteralPreservation: 0.5 }
      },
      overallRetentionRate: 0.5,
      baselineThreshold: 0.5
    };

    const result = await compareRetentionAgainstBaseline(currentReport, null, { dir });
    // Without a baseline, rates within minDelta of 1.0 should not trigger regression
    assert.equal(result.regressionDetected, true); // 0.5 is below threshold
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compareRetentionAgainstBaseline: explicit baseline parameter works', async () => {
  const baseline = {
    schema: 'openlunum-retention-baseline/0.1' as const,
    capturedAt: '2026-07-18T00:00:00.000Z',
    commit: 'abc123',
    datasetSha256: 'def456',
    baselines: {
      en: { retentionRate: 0.9, totalItems: 100, passedItems: 90, failedItems: 10, avgPredicateMatch: 0.88, avgRoleMatch: 0.85, avgProtectedLiteralPreservation: 0.87 }
    },
    overallRetentionRate: 0.9,
    regressionDetected: false
  };

  const currentReport: CurrentReport = {
    languages: ['en'],
    languageMetrics: {
      en: { retentionRate: 0.92, totalItems: 100, passedItems: 92, failedItems: 8, avgPredicateMatch: 0.9, avgRoleMatch: 0.87, avgProtectedLiteralPreservation: 0.89 }
    },
    overallRetentionRate: 0.92,
    baselineThreshold: 0.5
  };

  const result = await compareRetentionAgainstBaseline(currentReport, baseline);
  assert.equal(result.regressionDetected, false);
  assert.ok(result.comparisons.en!.delta > 0); // Improved
});

test('compareRetentionAgainstBaseline: warns on below-threshold retention', async () => {
  const dir = mkTempDir();
  try {
    const currentReport: CurrentReport = {
      languages: ['en'],
      languageMetrics: {
        en: { retentionRate: 0.3, totalItems: 100, passedItems: 30, failedItems: 70, avgPredicateMatch: 0.3, avgRoleMatch: 0.3, avgProtectedLiteralPreservation: 0.3 }
      },
      overallRetentionRate: 0.3,
      baselineThreshold: 0.5
    };

    const result = await compareRetentionAgainstBaseline(currentReport, null, { dir });
    assert.equal(result.regressionDetected, true);
    const compEn = result.comparisons.en!;
    assert.ok(compEn.belowThreshold);
    assert.ok(result.warnings.some(w => w.includes('below minimum threshold')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
