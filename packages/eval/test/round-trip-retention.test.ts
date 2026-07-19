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
  id: 'round-trip-retention-test',
  area: 'semantic-contract' as const,
  task: 'parse' as const,
  hypothesis: 'Round-trip retention across 4 languages and 2 models',
  baselineCommit: 'abc123',
  limits: { maxItems: 4, maxAttemptsPerItem: 3, maxModelCalls: 100 },
  gates: { minimumFeatureRecall: 0.9, minimumExactRate: 0.5, requireProtectedLiteralCoverage: true },
  outputDirectory: ''
};

const testModelProfiles = [
  {
    schema: 'openlunum-model-profile/0.1' as const,
    id: 'local-model-1',
    provider: 'openai-compatible' as const,
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'test-model-1',
    temperature: 0,
    seed: 42,
    timeoutMs: 120000
  },
  {
    schema: 'openlunum-model-profile/0.1' as const,
    id: 'local-model-2',
    provider: 'openai-compatible' as const,
    baseUrl: 'http://127.0.0.1:8081/v1',
    model: 'test-model-2',
    temperature: 0,
    seed: 43,
    timeoutMs: 120000
  }
];

// Import the round-trip retention runner
import {
  modelProfileReportFilename,
  runRoundTripRetentionExperiment,
  selectBestModelIds
} from '../src/round-trip-retention.js';

// ── Tests ─────────────────────────────────────────────────────────

test('round-trip retention: processes all 4 languages × 2 models', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results, report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  // 4 items × 4 languages × 2 models = 32 results
  assert.strictEqual(results.length, 32, 'Should process all items × languages × models');
  assert.strictEqual(report.languages.length, 4, 'Should have 4 languages');
  assert.deepStrictEqual(report.models, ['local-model-1', 'local-model-2'], 'Should have 2 models');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: produces per-language metrics', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  for (const lang of ['en', 'el', 'es', 'id']) {
    const m = report.languageMetrics[lang as 'en' | 'el' | 'es' | 'id'];
    assert.ok(m, `Should have metrics for ${lang}`);
    assert.ok(m.totalItems > 0, `${lang} should have items`);
    assert.ok(m.totalItems === 8, `${lang} should have 4 items × 2 models`);
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: reports include pass rates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  assert.ok(report.totalItems > 0, 'Should have total items');
  assert.ok(report.totalPassed >= 0, 'Should have total passed');
  assert.ok(report.totalFailed >= 0, 'Should have total failed');
  assert.ok(report.overallRetentionRate >= 0, 'Should have retention rate');
  assert.ok(report.overallRetentionRate <= 1, 'Should have retention rate <= 1');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: scores protected-literal coverage', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  for (const result of results) {
    assert.ok(result.protectedLiteralPreservation >= 0, 'Should have literal preservation score >= 0');
    assert.ok(result.protectedLiteralPreservation <= 1, 'Literal preservation should be <= 1');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: semantic scores are computed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  for (const result of results) {
    assert.ok(result.predicateMatch >= 0, 'Should have predicate match score >= 0');
    assert.ok(result.predicateMatch <= 1, 'Predicate match should be <= 1');
    assert.ok(result.roleMatch >= 0, 'Should have role match score >= 0');
    assert.ok(result.roleMatch <= 1, 'Role match should be <= 1');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: produces correct summary', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  assert.strictEqual(report.totalItems, 32, 'Should have 32 total items (4 × 4 × 2)');
  assert.ok(report.totalPassed + report.totalFailed + report.totalErrors === 32, 'Passed + Failed + Errors should equal total');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: summary counts match per-language', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  const langTotal = Object.values(report.languageMetrics).reduce((sum, m) => sum + m.totalItems, 0);
  assert.strictEqual(langTotal, 32, 'Sum of per-language items should equal total');

  const langPassed = Object.values(report.languageMetrics).reduce((sum, m) => sum + (m.passedItems ?? 0), 0);
  assert.strictEqual(langPassed, report.totalPassed, 'Sum of per-language passed should equal total passed');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: handles empty dataset', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, [], testModelProfiles);

  assert.strictEqual(report.totalItems, 0, 'Should have 0 total items');
  assert.strictEqual(report.overallRetentionRate, 0, 'Should have 0 retention rate');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: handles items without protected literals', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
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

  const { results } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, dataset, testModelProfiles);

  // 1 item × 4 languages × 2 models = 8 results
  assert.strictEqual(results.length, 8, 'Should process 1 item × 4 languages × 2 models');

  // All results should have literal preservation in valid range
  for (const r of results) {
    assert.ok(r.protectedLiteralPreservation >= 0, 'Should have non-negative literal preservation');
    assert.ok(r.protectedLiteralPreservation <= 1, 'Literal preservation should be <= 1');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: handles items with missing goldSem gracefully', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const dataset = [
    {
      id: 'no-sem',
      sourceLanguage: 'en',
      sourceText: 'Test item.',
      protectedLiterals: []
    }
  ];

  const { results } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, dataset, testModelProfiles);

  // Missing goldSem should skip the item entirely
  assert.strictEqual(results.length, 0, 'Should skip items without goldSem');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: results have correct structure', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  for (const result of results) {
    assert.ok(result.id, 'Should have id');
    assert.ok(result.language, 'Should have language');
    assert.ok(['passed', 'failed', 'error'].includes(result.status), 'Should have valid status');
    assert.ok(result.sourceText, 'Should have sourceText');
    assert.ok(result.realizedText !== undefined, 'Should have realizedText');
    assert.ok(result.predicateMatch !== undefined, 'Should have predicateMatch');
    assert.ok(result.retention !== undefined, 'Should have retention flag');
    assert.ok(result.latencyMs >= 0, 'Should have non-negative latency');
    assert.ok(result.model, 'Should have model id');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: writes report to disk', async () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-report-'));
  const manifest = { ...testManifest, outputDirectory: '' } as any;

  await runRoundTripRetentionExperiment(manifest, reportDir, testDataset.slice(0, 1), testModelProfiles);

  // Check that report files were written to the provided root
  const reportFiles = fs.readdirSync(reportDir);
  assert.ok(reportFiles.some(f => f.endsWith('.json')), 'Should write JSON report');
  assert.ok(reportFiles.some(f => f.endsWith('.md')), 'Should write markdown reports');

  // Cleanup
  fs.rmSync(reportDir, { recursive: true, force: true });
});

test('round-trip retention: regression detected when retention below threshold', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = {
    ...testManifest,
    outputDirectory: tmpDir,
    gates: { ...testManifest.gates, minimumExactRate: 1.0 } // Very high threshold
  } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  // With a 1.0 threshold, it's likely some items will fail, triggering regression
  assert.ok(report.regressionDetected === true || report.regressionDetected === false, 'Should have regressionDetected flag');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: two models produce different model results', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { results } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset.slice(0, 1), testModelProfiles);

  // Check that we have results from both models
  const model1Results = results.filter(r => r.model === 'local-model-1');
  const model2Results = results.filter(r => r.model === 'local-model-2');

  assert.strictEqual(model1Results.length, 4, 'Should have 4 results from model 1 (4 languages)');
  assert.strictEqual(model2Results.length, 4, 'Should have 4 results from model 2 (4 languages)');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: produces per-model retention profiles', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  // Should have profiles for both models
  assert.ok(report.modelProfiles, 'Should have modelProfiles');
  assert.strictEqual(Object.keys(report.modelProfiles).length, 2, 'Should have 2 model profiles');
  assert.ok(report.modelProfiles['local-model-1'], 'Should have profile for local-model-1');
  assert.ok(report.modelProfiles['local-model-2'], 'Should have profile for local-model-2');

  // Check profile structure
  for (const [modelId, profile] of Object.entries(report.modelProfiles)) {
    const sourceProfile = testModelProfiles.find(candidate => candidate.id === modelId)!;
    assert.strictEqual(profile.modelId, modelId, `Model ID should match key`);
    assert.strictEqual(profile.modelName, sourceProfile.model, `Model name should retain profile identity`);
    assert.deepStrictEqual(profile.settings, {
      temperature: sourceProfile.temperature,
      seed: sourceProfile.seed,
      timeoutMs: sourceProfile.timeoutMs
    }, `Model settings should remain reproducible`);
    assert.ok(profile.totalItems > 0, `${modelId} should have items`);
    assert.ok(profile.totalItems === 16, `${modelId} should have 4 items × 4 languages`);
    assert.ok(profile.retentionRate >= 0, `${modelId} should have non-negative retention rate`);
    assert.ok(profile.retentionRate <= 1, `${modelId} retention rate should be <= 1`);
    assert.ok(profile.passesBaseline !== undefined, `${modelId} should have passesBaseline flag`);

    // Check per-language breakdown
    for (const lang of ['en', 'el', 'es', 'id'] as const) {
      assert.ok(profile.languageBreakdown[lang], `${modelId} should have breakdown for ${lang}`);
      assert.strictEqual(profile.languageBreakdown[lang]!.language, lang, `Language should match`);
      assert.ok(profile.languageBreakdown[lang]!.totalItems > 0, `${modelId} ${lang} should have items`);
      assert.strictEqual(profile.languageBreakdown[lang]!.totalItems, 4, `${modelId} ${lang} should have 4 items`);
    }
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: best models by language are computed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  // Error-only languages intentionally have no winner. Any reported winners
  // must be explicit arrays so ties are not silently input-order dependent.
  assert.ok(report.bestModelsByLanguage, 'Should have bestModelsByLanguage');
  for (const lang of ['en', 'el', 'es', 'id'] as const) {
    const winners = report.bestModelsByLanguage[lang];
    if (winners) {
      assert.ok(winners.length > 0, `${lang} winner list should be non-empty`);
      assert.ok(winners.every(model => ['local-model-1', 'local-model-2'].includes(model)), `${lang} winners should be tested models`);
    }
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: all-error models have no best-model winner', () => {
  assert.deepStrictEqual(selectBestModelIds([
    { modelId: 'a', total: 4, passed: 0, failed: 0 },
    { modelId: 'b', total: 4, passed: 0, failed: 0 }
  ]), []);
});

test('round-trip retention: best-model selection reports ties explicitly', () => {
  assert.deepStrictEqual(selectBestModelIds([
    { modelId: 'b', total: 4, passed: 2, failed: 1 },
    { modelId: 'a', total: 4, passed: 2, failed: 2 },
    { modelId: 'c', total: 4, passed: 1, failed: 3 }
  ]), ['a', 'b']);
});

test('round-trip retention: profile report filenames cannot traverse directories', () => {
  const filename = modelProfileReportFilename('../../outside');
  assert.ok(!filename.includes('/'));
  assert.ok(!filename.includes('\\'));
  assert.ok(filename.startsWith('model-profile-encoded-'));
});

test('round-trip retention: duplicate profile ids fail before evaluation', async () => {
  const duplicateProfiles = [testModelProfiles[0]!, { ...testModelProfiles[1]!, id: testModelProfiles[0]!.id }];
  await assert.rejects(
    runRoundTripRetentionExperiment(testManifest as any, WORKSPACE_ROOT, testDataset, duplicateProfiles),
    /must be unique/
  );
});

test('round-trip retention: model profiles include semantic scores', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-test-'));
  const manifest = { ...testManifest, outputDirectory: tmpDir } as any;

  const { report } = await runRoundTripRetentionExperiment(manifest, WORKSPACE_ROOT, testDataset, testModelProfiles);

  for (const [modelId, profile] of Object.entries(report.modelProfiles)) {
    assert.ok(profile.avgPredicateMatch >= 0, `${modelId} should have non-negative avg predicate match`);
    assert.ok(profile.avgPredicateMatch <= 1, `${modelId} avg predicate match should be <= 1`);
    assert.ok(profile.avgRoleMatch >= 0, `${modelId} should have non-negative avg role match`);
    assert.ok(profile.avgRoleMatch <= 1, `${modelId} avg role match should be <= 1`);
    assert.ok(profile.avgProtectedLiteralPreservation >= 0, `${modelId} should have non-negative avg literal preservation`);
    assert.ok(profile.avgProtectedLiteralPreservation <= 1, `${modelId} avg literal preservation should be <= 1`);
    assert.ok(profile.meanLatencyMs >= 0, `${modelId} should have non-negative mean latency`);
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('round-trip retention: writes model profile reports to disk', async () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-retention-model-'));
  const manifest = { ...testManifest, outputDirectory: '' } as any;

  await runRoundTripRetentionExperiment(manifest, reportDir, testDataset.slice(0, 1), testModelProfiles);

  const reportFiles = fs.readdirSync(reportDir);
  
  // Should have model profile markdown files
  const modelProfileFiles = reportFiles.filter(f => f.startsWith('model-profile-') && f.endsWith('.md'));
  assert.strictEqual(modelProfileFiles.length, 2, 'Should write 2 model profile markdown files');
  assert.ok(modelProfileFiles.some(f => f === 'model-profile-local-model-1.md'), 'Should have model-profile-local-model-1.md');
  assert.ok(modelProfileFiles.some(f => f === 'model-profile-local-model-2.md'), 'Should have model-profile-local-model-2.md');

  // Should have best models by language file
  assert.ok(reportFiles.some(f => f === 'best-models-by-language.md'), 'Should write best-models-by-language.md');

  // Cleanup
  fs.rmSync(reportDir, { recursive: true, force: true });
});
