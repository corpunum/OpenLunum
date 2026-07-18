import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── Test fixtures ─────────────────────────────────────────────────

const testDataset = [
  {
    id: 'preference-en',
    sourceLanguage: 'en',
    sourceText: 'The user prefers concise answers.',
    goldSem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [
        { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } } }
      ]
    },
    protectedLiterals: ['user', 'concise']
  },
  {
    id: 'preference-el',
    sourceLanguage: 'el',
    sourceText: 'Ο χρήστης προτιμά σύντομες απαντήσεις.',
    goldSem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [
        { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } } }
      ]
    },
    protectedLiterals: ['user']
  },
  {
    id: 'preference-es',
    sourceLanguage: 'es',
    sourceText: 'El usuario prefiere respuestas concisas.',
    goldSem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [
        { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } } }
      ]
    },
    protectedLiterals: ['user']
  },
  {
    id: 'preference-id',
    sourceLanguage: 'id',
    sourceText: 'Pengguna lebih menyukai jawaban yang ringkas.',
    goldSem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [
        { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } } }
      ]
    },
    protectedLiterals: ['user']
  }
];

const testManifest = {
  schema: 'openlunum-experiment/0.1',
  id: 'retention-test',
  area: 'semantic-contract' as const,
  task: 'parse' as const,
  hypothesis: 'Test retention across languages',
  baselineCommit: 'abc123',
  limits: { maxItems: 10, maxAttemptsPerItem: 3, maxModelCalls: 100 },
  gates: { minimumFeatureRecall: 0.9, minimumExactRate: 0.5, requireProtectedLiteralCoverage: true },
  outputDirectory: ''
};

// Import the retention experiment runner
import { runRetentionExperiment } from '../src/retention-experiment.js';
import type { RealizationLanguage } from '../src/realization.js';

// ── Tests ─────────────────────────────────────────────────────────

test('retention experiment: processes all 4 languages', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results, report } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  // Each item is realized to all 4 languages, so 4 items × 4 languages = 16 results
  assert.strictEqual(results.length, 16, 'Should process all 4 items × 4 languages');
  assert.strictEqual(report.languages.length, 4, 'Should have 4 languages');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: produces per-language metrics', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  for (const lang of ['en', 'el', 'es', 'id'] as RealizationLanguage[]) {
    const m = report.languageMetrics[lang];
    assert.ok(m, `Should have metrics for ${lang}`);
    assert.ok(m.totalItems > 0, `${lang} should have items`);
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: reports include pass rates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  assert.ok(report.totalItems > 0, 'Should have total items');
  assert.ok(report.totalPassed >= 0, 'Should have total passed');
  assert.ok(report.totalFailed >= 0, 'Should have total failed');
  assert.ok(report.overallRetentionRate >= 0, 'Should have retention rate');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: scores protected-literal coverage', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  for (const result of results) {
    assert.ok(result.protectedLiteralPreservation >= 0, 'Should have literal preservation score');
    assert.ok(result.protectedLiteralPreservation <= 1, 'Literal preservation should be <= 1');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: semantic scores are computed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  for (const result of results) {
    assert.ok(result.predicateMatch >= 0, 'Should have predicate match score');
    assert.ok(result.predicateMatch <= 1, 'Predicate match should be <= 1');
    assert.ok(result.roleMatch >= 0, 'Should have role match score');
    assert.ok(result.roleMatch <= 1, 'Role match should be <= 1');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: produces correct summary', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  assert.strictEqual(report.totalItems, 16, 'Should have 4 total items');
  assert.ok(report.totalPassed + report.totalFailed + report.totalErrors === 16, 'Passed + Failed + Errors should equal total');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: summary counts match per-language', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  const langTotal = Object.values(report.languageMetrics).reduce((sum, m) => sum + m.totalItems, 0);
  assert.strictEqual(langTotal, 16, 'Sum of per-language items should equal total');

  const langPassed = Object.values(report.languageMetrics).reduce((sum, m) => sum + (m.passedItems ?? 0), 0);
  assert.strictEqual(langPassed, report.totalPassed, 'Sum of per-language passed should equal total passed');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: handles empty dataset', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, []);

  assert.strictEqual(report.totalItems, 0, 'Should have 0 total items');
  assert.strictEqual(report.overallRetentionRate, 0, 'Should have 0 retention rate');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: handles items without protected literals', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const dataset = [
    {
      id: 'no-literals',
      sourceLanguage: 'en',
      sourceText: 'Test item.',
      goldSem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'test',
        clauses: [{ predicate: 'test', roles: {} }]
      },
      protectedLiterals: []
    }
  ];

  const { results } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, dataset);

  assert.strictEqual(results.length, 4, 'Should process 1 item × 4 languages');
  const r = results[0];
  assert.ok(r && r.protectedLiteralPreservation === 1, 'Should have 1.0 literal preservation for empty literals');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: handles items with missing goldSem gracefully', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const dataset = [
    {
      id: 'no-sem',
      sourceLanguage: 'en',
      sourceText: 'Test item.',
      protectedLiterals: []
    }
  ];

  const { results } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, dataset);

  assert.strictEqual(results.length, 4, 'Should process 1 item × 4 languages');
  const r = results[0];
  assert.strictEqual(r?.status, 'error', 'Should error on missing sem');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('retention experiment: results have correct structure', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset);

  for (const result of results) {
    assert.ok(result.id, 'Should have id');
    assert.ok(result.language, 'Should have language');
    assert.ok(['passed', 'failed', 'error'].includes(result.status), 'Should have valid status');
    assert.ok(result.sourceText, 'Should have sourceText');
    assert.ok(result.realizedText !== undefined, 'Should have realizedText');
    assert.ok(result.retention !== undefined, 'Should have retention flag');
    assert.ok(result.latencyMs >= 0, 'Should have non-negative latency');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
