import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { rm } from 'node:fs/promises';
import {
  loadBaselineStore,
  saveBaseline,
  checkRegression,
  printRegressionSummary,
  isBaselineStale,
  getStaleWarning,
  getBaselineStorePath,
  type RetentionMetric,
  type RetentionBaselineStore
} from '../src/baseline-store.js';

const TEST_DIR = path.join('/tmp', `baseline-store-test-${Date.now()}`);

function cleanup(): void {
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}

function createMetrics(lang: string, retentionRate: number): Record<string, RetentionMetric> {
  return {
    [lang]: {
      language: lang as any,
      totalItems: 10,
      passedItems: Math.round(10 * retentionRate),
      failedItems: 10 - Math.round(10 * retentionRate),
      errorItems: 0,
      retentionRate,
      avgPredicateMatch: 0.9,
      avgRoleMatch: 0.85,
      avgProtectedLiteralPreservation: 0.95,
      meanLatencyMs: 50
    }
  };
}

test('baseline-store: save and load baseline', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const metrics = createMetrics('en', 0.9);
    const store = saveBaseline(TEST_DIR, metrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    assert.strictEqual(store.version, '1.0');
    assert.strictEqual(store.datasetSha256, 'abc123');
    assert.strictEqual(store.modelId, 'test-model');
    assert.strictEqual(store.schemaVersion, '0.2');
    assert.ok(store.languages.en);
    assert.strictEqual(store.languages.en.retentionRate, 0.9);

    const loaded = loadBaselineStore(TEST_DIR);
    assert.ok(loaded);
    assert.strictEqual(loaded!.version, store.version);
    assert.strictEqual(loaded!.datasetSha256, store.datasetSha256);
  } finally {
    cleanup();
  }
});

test('baseline-store: load returns null when no store exists', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const loaded = loadBaselineStore(TEST_DIR);
    assert.strictEqual(loaded, null);
  } finally {
    cleanup();
  }
});

test('baseline-store: checkRegression detects no regression', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const baseMetrics = createMetrics('en', 0.9);
    saveBaseline(TEST_DIR, baseMetrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    // Same metrics as baseline
    const currentMetrics = createMetrics('en', 0.9);
    const result = checkRegression(TEST_DIR, currentMetrics);

    assert.ok(result.passed);
    assert.strictEqual(result.criticalFailures.length, 0);
    assert.strictEqual(result.warningResults.length, 0);
  } finally {
    cleanup();
  }
});

test('baseline-store: checkRegression detects critical regression', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const baseMetrics = createMetrics('en', 0.9);
    saveBaseline(TEST_DIR, baseMetrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    // Significant drop (>20 percentage points)
    const currentMetrics = createMetrics('en', 0.6);
    const result = checkRegression(TEST_DIR, currentMetrics);

    assert.ok(!result.passed);
    assert.ok(result.criticalFailures.length > 0, 'Should have critical failures');
  } finally {
    cleanup();
  }
});

test('baseline-store: checkRegression detects warning regression', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const baseMetrics = createMetrics('en', 0.9);
    saveBaseline(TEST_DIR, baseMetrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    // Moderate drop (10-20 percentage points)
    const currentMetrics = createMetrics('en', 0.75);
    const result = checkRegression(TEST_DIR, currentMetrics);

    assert.ok(result.passed, 'Should pass with only warnings');
    assert.ok(result.warningResults.length > 0, 'Should have warning results');
    assert.strictEqual(result.criticalFailures.length, 0);
  } finally {
    cleanup();
  }
});

test('baseline-store: checkRegression with no baseline', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const currentMetrics = createMetrics('en', 0.9);
    const result = checkRegression(TEST_DIR, currentMetrics);

    assert.ok(!result.passed);
    assert.ok(result.warnings.length > 0);
    assert.strictEqual(result.store, null);
  } finally {
    cleanup();
  }
});

test('baseline-store: printRegressionSummary produces output', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const baseMetrics = createMetrics('en', 0.9);
    saveBaseline(TEST_DIR, baseMetrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    const currentMetrics = createMetrics('en', 0.6);
    const result = checkRegression(TEST_DIR, currentMetrics);
    const summary = printRegressionSummary(result);

    assert.ok(typeof summary === 'string');
    assert.ok(summary.length > 0);
    assert.ok(summary.includes('Retention Regression Gate'));
  } finally {
    cleanup();
  }
});

test('baseline-store: isBaselineStale returns false for recent baseline', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const baseMetrics = createMetrics('en', 0.9);
    saveBaseline(TEST_DIR, baseMetrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    assert.strictEqual(isBaselineStale(TEST_DIR), false);
  } finally {
    cleanup();
  }
});

test('baseline-store: isBaselineStale returns false when no baseline', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    assert.strictEqual(isBaselineStale(TEST_DIR), false);
  } finally {
    cleanup();
  }
});

test('baseline-store: getBaselineStorePath returns correct path', () => {
  const storePath = getBaselineStorePath('/some/root');
  assert.strictEqual(storePath, path.join('/some/root', 'reports/retention/baseline-store.json'));
});

test('baseline-store: multiple languages in baseline', () => {
  cleanup();
  try {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const metrics: Record<string, RetentionMetric> = {};
    metrics['en'] = createMetrics('en', 0.9)['en']!;
    metrics['el'] = createMetrics('el', 0.85)['el']!;
    metrics['es'] = createMetrics('es', 0.8)['es']!;
    metrics['id'] = createMetrics('id', 0.75)['id']!;

    const store = saveBaseline(TEST_DIR, metrics, {
      datasetSha256: 'abc123',
      modelId: 'test-model',
      schemaVersion: '0.2'
    });

    assert.ok(store.languages.en);
    assert.ok(store.languages.el);
    assert.ok(store.languages.es);
    assert.ok(store.languages.id);
  } finally {
    cleanup();
  }
});
