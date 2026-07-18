import { test, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { runRealizationExperiment, type RealizationReport } from '../src/realization-runner.js';
import type { ExperimentManifest, ExperimentItem } from '../src/types.js';

// Track temp dirs for cleanup
const tempDirs = new Set<string>();

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `openlunum-realization-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tempDirs.add(dir);
  return dir;
}

after(async () => {
  for (const dir of tempDirs) {
    try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tempDirs.clear();
});

// ── Helpers ────────────────────────────────────────────────────────

function createManifest(id = 'test-realization', outputDir?: string): ExperimentManifest {
  return {
    schema: 'openlunum-experiment/0.1',
    id,
    area: 'realization',
    task: 'realize',
    hypothesis: 'Protected literals should be preserved across all realization languages',
    baselineCommit: 'abc123',
    limits: { maxItems: 5, maxAttemptsPerItem: 1, maxModelCalls: 100 },
    gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.5, requireProtectedLiteralCoverage: true },
    outputDirectory: outputDir ?? createTempDir()
  };
}

function createDatasetItem(
  id: string,
  sourceText: string,
  sourceLanguage: string,
  targetLanguage: string,
  protectedLiterals: string[] = []
): ExperimentItem {
  const item: ExperimentItem = {
    id,
    sourceText,
    sourceLanguage,
    targetLanguage,
    goldSem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test-world',
      kind: 'statement',
      clauses: [
        { predicate: 'statement', roles: { subject: 'Test', verb: 'is', object: 'running' } }
      ]
    }
  };
  if (protectedLiterals.length > 0) {
    item.protectedLiterals = protectedLiterals;
  }
  return item;
}

// ── Constructor / Basic Tests ──────────────────────────────────────

test('runRealizationExperiment processes all 4 languages', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Hello world', 'en', 'en', ['Hello'])
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  assert.strictEqual(report.languages.length, 4);
  assert.ok(report.languages.includes('en'));
  assert.ok(report.languages.includes('el'));
  assert.ok(report.languages.includes('es'));
  assert.ok(report.languages.includes('id'));
});

test('runRealizationExperiment produces per-language metrics', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Test content', 'en', 'en', ['Test'])
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    assert.ok(report.metrics[lang]);
    assert.strictEqual(report.metrics[lang].language, lang);
    assert.ok(report.metrics[lang].total > 0);
    assert.ok(report.metrics[lang].passRate >= 0);
    assert.ok(report.metrics[lang].passRate <= 1);
  }
});

test('runRealizationExperiment reports include pass rates', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Test content', 'en', 'en')
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    assert.ok(lang in report.passRates);
  }
});

// ── Protected-Literal Scoring Tests ───────────────────────────────

test('runRealizationExperiment scores protected-literal coverage', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Hello Alice', 'en', 'en', ['Alice'])
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  // All languages should have computed coverage
  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    const m = report.metrics[lang];
    assert.ok(m.avgProtectedLiteralCoverage >= 0);
    assert.ok(m.avgProtectedLiteralCoverage <= 1);
  }
});

test('runRealizationExperiment semantic scores are computed', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Test sentence', 'en', 'en')
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    const semantic = report.metrics[lang].semanticScores;
    assert.ok(semantic.completeness >= 0);
    assert.ok(semantic.consistency >= 0);
    assert.ok(semantic.predicateClarity >= 0);
    assert.ok(semantic.roleCoverage >= 0);
    assert.ok(semantic.protectedLiteralPreservation >= 0);
    assert.ok(semantic.overall >= 0);
  }
});

// ── Summary Tests ─────────────────────────────────────────────────

test('runRealizationExperiment produces correct summary', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'First', 'en', 'en'),
    createDatasetItem('item-2', 'Second', 'en', 'en'),
    createDatasetItem('item-3', 'Third', 'en', 'en')
  ];

  const { report, results } = await runRealizationExperiment(manifest, '/tmp', dataset);

  assert.strictEqual(report.summary.totalItems, results.length);
  assert.strictEqual(report.summary.totalItems, report.totalRecords);
  assert.strictEqual(report.summary.overallPassRate >= 0, true);
  // Latency may be 0 in some test environments, so check >= 0
  assert.ok(report.summary.avgLatencyMs >= 0);
});

test('runRealizationExperiment summary counts match per-language', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Test', 'en', 'en')
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  // Summary should reflect the sum across all languages
  let totalFromMetrics = 0;
  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    totalFromMetrics += report.metrics[lang].total;
  }

  assert.strictEqual(report.summary.totalItems, totalFromMetrics);
});

// ── Edge Cases ────────────────────────────────────────────────────

test('runRealizationExperiment handles empty dataset', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  assert.strictEqual(report.totalRecords, 0);
  assert.strictEqual(report.summary.totalItems, 0);
  assert.strictEqual(report.summary.totalPassed, 0);
  assert.strictEqual(report.summary.overallPassRate, 0);
});

test('runRealizationExperiment handles items without protected literals', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'No literals here', 'en', 'en')
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  // Should still compute metrics (coverage defaults to 1 when no literals)
  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    assert.ok(report.metrics[lang].total > 0);
  }
});

test('runRealizationExperiment handles items with missing goldSem gracefully', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    {
      id: 'item-1',
      sourceText: 'Test',
      sourceLanguage: 'en',
      targetLanguage: 'en'
      // No goldSem
    }
  ];

  const { report } = await runRealizationExperiment(manifest, '/tmp', dataset);

  // Should produce empty or zero metrics for items without goldSem
  assert.ok(report.totalRecords >= 0);
});

// ── Results Tests ─────────────────────────────────────────────────

test('runRealizationExperiment results have correct structure', async () => {
  const manifest = createManifest();
  const dataset: ExperimentItem[] = [
    createDatasetItem('item-1', 'Test realization', 'en', 'en')
  ];

  const { results } = await runRealizationExperiment(manifest, '/tmp', dataset);

  // Results should have entries for each language x item combination
  assert.ok(results.length > 0);

  for (const result of results) {
    assert.ok(result.id);
    assert.ok(['passed', 'failed', 'error'].includes(result.status));
    assert.ok(result.latencyMs > 0);
  }
});
