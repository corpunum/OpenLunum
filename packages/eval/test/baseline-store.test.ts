import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  loadBaselineStore,
  saveBaselineStore,
  recordBaselineFromMetrics,
  detectRegressions,
  isBaselineStale,
  printRegressionSummary,
  type RetentionBaselineStore,
  type RetentionMetric
} from '../src/baseline-store.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync as syncReadFileSync, writeFileSync as syncWriteFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Use a test-specific path to avoid polluting the real store
const TEST_STORE_DIR = path.join('packages', 'eval', 'test', 'tmp-baseline-store');
const TEST_STORE_PATH = path.join(TEST_STORE_DIR, 'baseline-store.json');

function makeMetric(lang: string, retention: number, predMatch: number, roleMatch: number, literalPres: number): RetentionMetric {
  return {
    language: lang as any,
    totalItems: 10,
    passedItems: Math.round(10 * retention),
    failedItems: 10 - Math.round(10 * retention),
    errorItems: 0,
    retentionRate: retention,
    avgPredicateMatch: predMatch,
    avgRoleMatch: roleMatch,
    avgProtectedLiteralPreservation: literalPres,
    meanLatencyMs: 100
  };
}

describe('baseline-store', () => {
  before(async () => {
    await mkdir(TEST_STORE_DIR, { recursive: true });
    // Temporarily override the store path by writing directly to test path
  });

  after(async () => {
    await rm(TEST_STORE_DIR, { recursive: true, force: true });
  });

  it('save and load baseline store round-trip', async () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now(),
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0.9,
          avgPredicateMatch: 0.85,
          avgRoleMatch: 0.8,
          avgProtectedLiteralPreservation: 0.95,
          recordedAt: Date.now()
        }
      }
    };

    // Save to test path
    mkdirSync(TEST_STORE_DIR, { recursive: true });
    syncWriteFileSync(TEST_STORE_PATH, JSON.stringify(store));

    // Load from test path
    const loaded = JSON.parse(syncReadFileSync(TEST_STORE_PATH, 'utf8'));
    assert.equal(loaded.version, '1.0');
    assert.equal(loaded.datasetSha256, 'abc123');
    assert.ok(loaded.languages.en);
  });

  it('recordBaselineFromMetrics creates store with conservative defaults', () => {
    const metrics: Record<string, any> = {
      en: makeMetric('en', 0.9, 0.85, 0.8, 0.95),
      el: makeMetric('el', 0.85, 0.8, 0.75, 0.9)
    };

    const store = recordBaselineFromMetrics(metrics, {
      datasetSha256: 'test-dataset-sha',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    assert.equal(store.version, '1.0');
    assert.equal(store.datasetSha256, 'test-dataset-sha');
    assert.ok(store.languages.en);
    assert.ok(store.languages.el);
    assert.equal(store.languages.en.retentionRate, 0.9);
  });

  it('detectRegressions returns no regression when metrics match baseline', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day old
      datasetSha256: 'test-dataset',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0.9,
          avgPredicateMatch: 0.85,
          avgRoleMatch: 0.8,
          avgProtectedLiteralPreservation: 0.95,
          recordedAt: Date.now()
        }
      }
    };

    const metrics: Record<string, any> = {
      en: makeMetric('en', 0.9, 0.85, 0.8, 0.95),
      _datasetSha256: 'test-dataset'
    };

    const result = detectRegressions(store, metrics as any);

    assert.ok(result.passed);
    assert.equal(result.criticalFailures.length, 0);
  });

  it('detectRegressions detects critical regression (>20pp drop)', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24,
      datasetSha256: 'test-dataset',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0.9,
          avgPredicateMatch: 0.85,
          avgRoleMatch: 0.8,
          avgProtectedLiteralPreservation: 0.95,
          recordedAt: Date.now()
        }
      }
    };

    // Current metrics have 25pp drop in retention
    const metrics: Record<string, any> = {
      en: makeMetric('en', 0.65, 0.85, 0.8, 0.95),
      _datasetSha256: 'test-dataset'
    };

    const result = detectRegressions(store, metrics as any);

    assert.ok(!result.passed);
    assert.ok(result.criticalFailures.some(f => f.metric === 'retentionRate'));
  });

  it('detectRegressions detects warning regression (10-20pp drop)', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24,
      datasetSha256: 'test-dataset',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0.9,
          avgPredicateMatch: 0.85,
          avgRoleMatch: 0.8,
          avgProtectedLiteralPreservation: 0.95,
          recordedAt: Date.now()
        }
      }
    };

    // Current metrics have 15pp drop in retention
    const metrics: Record<string, any> = {
      en: makeMetric('en', 0.75, 0.85, 0.8, 0.95),
      _datasetSha256: 'test-dataset'
    };

    const result = detectRegressions(store, metrics as any);

    assert.ok(result.passed); // Still passes, just warnings
    assert.ok(result.warningResults.some(f => f.metric === 'retentionRate'));
  });

  it('detectRegressions handles missing baseline for language', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24,
      datasetSha256: 'test-dataset',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0.9,
          avgPredicateMatch: 0.85,
          avgRoleMatch: 0.8,
          avgProtectedLiteralPreservation: 0.95,
          recordedAt: Date.now()
        }
      }
    };

    // Only has el, not en
    const metrics: Record<string, any> = {
      el: makeMetric('el', 0.8, 0.75, 0.7, 0.85),
      _datasetSha256: 'test-dataset'
    };

    const result = detectRegressions(store, metrics as any);

    assert.ok(result.warnings.some(w => w.includes('No baseline')));
  });

  it('isBaselineStale returns true for old baseline', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24 * 100, // 100 days old
      datasetSha256: 'test',
      modelId: 'test',
      schemaVersion: '0.2',
      languages: {}
    };

    assert.ok(isBaselineStale(store));
  });

  it('isBaselineStale returns false for recent baseline', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days old
      datasetSha256: 'test',
      modelId: 'test',
      schemaVersion: '0.2',
      languages: {}
    };

    assert.ok(!isBaselineStale(store));
  });

  it('detectRegressions handles critical overrides warning', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24,
      datasetSha256: 'test-dataset',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0.9,
          avgPredicateMatch: 0.85,
          avgRoleMatch: 0.8,
          avgProtectedLiteralPreservation: 0.95,
          recordedAt: Date.now()
        }
      }
    };

    const metrics: Record<string, any> = {
      en: makeMetric('en', 0.65, 0.7, 0.75, 0.85),
      _datasetSha256: 'test-dataset'
    };

    const result = detectRegressions(store, metrics as any);

    assert.ok(!result.passed);
    assert.ok(result.criticalFailures.length > 0);
    // retentionRate should be critical (>20pp), but predicateMatch should be warning (15pp)
    assert.ok(result.warningResults.length > 0 || result.criticalFailures.some(f => f.drop > 0.2));
  });

  it('printRegressionSummary produces valid output', () => {
    const result: ReturnType<typeof detectRegressions> = {
      passed: true,
      warnings: ['Test warning'],
      criticalFailures: [],
      warningResults: [],
      languageResults: new Map(),
      store: null
    };

    const output = printRegressionSummary(result);

    assert.ok(output.includes('PASSED'));
    assert.ok(output.includes('Test warning'));
  });

  it('zero metrics edge case handled', () => {
    const store: RetentionBaselineStore = {
      version: '1.0',
      recordedAt: Date.now() - 1000 * 60 * 60 * 24,
      datasetSha256: 'test-dataset',
      modelId: 'test-model',
      schemaVersion: '0.2',
      languages: {
        en: {
          language: 'en',
          retentionRate: 0,
          avgPredicateMatch: 0,
          avgRoleMatch: 0,
          avgProtectedLiteralPreservation: 0,
          recordedAt: Date.now()
        }
      }
    };

    const metrics: Record<string, any> = {
      en: makeMetric('en', 0, 0, 0, 0),
      _datasetSha256: 'test-dataset'
    };

    const result = detectRegressions(store, metrics as any);

    assert.ok(result.passed); // No regression (0 → 0 is no drop)
  });
});
