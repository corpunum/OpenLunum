import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { runRetrievalExperiment, type RetrievalManifest, type RetrievalFixture } from '../src/retrieval-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Track temp dirs for cleanup
const tempDirs = new Set<string>();

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `openlunum-retrieval-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tempDirs.add(dir);
  return dir;
}

after(async () => {
  for (const dir of tempDirs) {
    try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tempDirs.clear();
});

test('retrieval runner loads fixtures and computes correct metrics', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-metrics',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify retrieval metrics compute correctly from fixtures',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.5, minimumExactRate: 0.5, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0, 'Should have results from fixtures');

  for (const result of results) {
    assert.ok(result.id, 'Each result must have an id');
    assert.ok(result.queryId, 'Each result must have queryId');
    assert.ok(Array.isArray(result.candidateIds), 'Must have candidateIds');
    assert.ok(Array.isArray(result.expectedRelevantIds), 'Must have expectedRelevantIds');
    assert.ok(Array.isArray(result.rankedResultIds), 'Must have rankedResultIds');
    assert.ok(typeof result.precisionAtK === 'number', 'Must have precisionAtK');
    assert.ok(typeof result.recallAtK === 'number', 'Must have recallAtK');
    assert.ok(typeof result.reciprocalRank === 'number', 'Must have reciprocalRank');
    assert.ok(typeof result.meanReciprocalRank === 'number', 'Must have meanReciprocalRank');
    assert.ok(Array.isArray(result.falsePositives), 'Must have falsePositives');
    assert.ok(Array.isArray(result.falseNegatives), 'Must have falseNegatives');
    assert.ok(typeof result.hasFalseEquivalence === 'boolean', 'Must have hasFalseEquivalence');
    assert.ok(result.status === 'passed' || result.status === 'failed', 'Status must be passed or failed');
  }
});

test('retrieval runner respects k threshold', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-k',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify k threshold is respected',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 1, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  // With k=1, results should be sliced to 1 item
  for (const result of results) {
    assert.ok(result.rankedResultIds.length <= 1, `With k=1, rankedResultIds should have at most 1 item, got ${result.rankedResultIds.length}`);
  }
});

test('retrieval runner detects false positives and false negatives', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-fp-fn',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify false positive/negative detection',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  // At least one fixture should have false positives or false negatives
  const hasFpOrFn = results.some(r => r.falsePositives.length > 0 || r.falseNegatives.length > 0);
  assert.ok(hasFpOrFn, 'At least one result should have false positives or false negatives');
});

test('retrieval runner rejects invalid k', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-invalid-k',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify invalid k is rejected',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 0, mode: 'exact' }
  };

  await assert.rejects(
    runRetrievalExperiment(manifest, WORKSPACE_ROOT, output),
    { message: /Invalid k value: 0/ }
  );
});

test('retrieval runner rejects duplicate IDs in candidates', async () => {
  const testDir = createTempDir();
  const stdFixturesDir = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retrieval', 'fixtures');
  const dupFixturePath = path.join(stdFixturesDir, 'test-dup-candidates.json');

  // Write a fixture with duplicate candidate IDs to the standard fixtures dir
  await writeFile(dupFixturePath, JSON.stringify({
    queryId: 'test-dup-candidates',
    query: 'Test duplicate candidates',
    candidates: ['a', 'b', 'a'], // duplicate 'a'
    expectedRelevant: ['a'],
    rankedResults: ['a', 'b'],
    mode: 'exact'
  }, null, 2));

  try {
    const manifest: RetrievalManifest = {
      schema: 'openlunum-experiment/0.1',
      id: 'test-retrieval-dup-candidates',
      area: 'retrieval',
      task: 'retrieval',
      deterministic: true,
      hypothesis: 'Verify duplicate candidate IDs produce error results',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: testDir,
      retrievalConfig: { k: 3, mode: 'exact' }
    };

    // The runner catches the error per-fixture and returns error result
    const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, testDir);
    const errorResult = results.find(r => r.id === 'test-dup-candidates');
    assert.ok(errorResult, 'Should have error result for duplicate fixture');
    assert.strictEqual(errorResult!.status, 'error', 'Error result status should be error');
    assert.ok(errorResult!.error?.includes('duplicate IDs in candidates'), 'Error should mention duplicates');
    // Evidence bundle should still be written
    const resultsPath = path.join(testDir, 'retrieval-results.json');
    const resultsContent = JSON.parse(await readFile(resultsPath, 'utf8'));
    assert.ok(resultsContent.results, 'Should have evidence bundle');
  } finally {
    await rm(dupFixturePath, { force: true });
  }
});

test('retrieval runner rejects duplicate IDs in expectedRelevant', async () => {
  const testDir = createTempDir();
  const stdFixturesDir = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retrieval', 'fixtures');
  const dupFixturePath = path.join(stdFixturesDir, 'test-dup-expected.json');

  // Write a fixture with duplicate expectedRelevant IDs to the standard fixtures dir
  await writeFile(dupFixturePath, JSON.stringify({
    queryId: 'test-dup-expected',
    query: 'Test duplicate expected relevant',
    candidates: ['a', 'b', 'c'],
    expectedRelevant: ['a', 'a'], // duplicate 'a'
    rankedResults: ['a', 'b', 'c'],
    mode: 'exact'
  }, null, 2));

  try {
    const manifest: RetrievalManifest = {
      schema: 'openlunum-experiment/0.1',
      id: 'test-retrieval-dup-expected',
      area: 'retrieval',
      task: 'retrieval',
      deterministic: true,
      hypothesis: 'Verify duplicate expectedRelevant IDs produce error results',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: testDir,
      retrievalConfig: { k: 3, mode: 'exact' }
    };

    // The runner catches the error per-fixture and returns error result
    const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, testDir);
    const errorResult = results.find(r => r.id === 'test-dup-expected');
    assert.ok(errorResult, 'Should have error result for duplicate fixture');
    assert.strictEqual(errorResult!.status, 'error', 'Error result status should be error');
    assert.ok(errorResult!.error?.includes('duplicate IDs in expectedRelevant'), 'Error should mention duplicates');
  } finally {
    await rm(dupFixturePath, { force: true });
  }
});

test('retrieval runner respects limits.maxItems', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-maxitems',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify limits.maxItems is respected',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(results.length <= 1, 'Should respect limits.maxItems=1');
});

test('retrieval runner detects near-semantic mode', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-near-semantic',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify near-semantic mode is detected',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 3, mode: 'near-semantic' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  const nearSemanticResult = results.find(r => r.isNearSemantic);
  assert.ok(nearSemanticResult, 'Should detect near-semantic mode');
  assert.strictEqual(nearSemanticResult!.mode, 'near-semantic');
});

test('retrieval runner detects false equivalence', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-false-eq',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify false equivalence detection without contradicting expected-relevant',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  const result = results[0];
  assert.ok(result, 'Should have a result');
  assert.ok(result.hasFalseEquivalence, 'Should detect false equivalence in top-k');
  // Verify the fix: falseEquivalenceIds (english) is NOT in expectedRelevant (french)
  // so a correct hit on french does not also count as false-equivalent
  assert.ok(!result.falsePositives.includes('french'),
    'french should NOT be a false-positive since it is in expectedRelevant');
  assert.ok(result.falsePositives.includes('english'),
    'english IS a false-positive since it is in topK but not in expectedRelevant');
});

test('retrieval runner computes aggregate MRR', async () => {
  const output = createTempDir();
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-mrr',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify MRR is computed',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  await runRetrievalExperiment(manifest, WORKSPACE_ROOT, output);

  // Check that the output file contains MRR
  const resultsPath = path.join(output, 'retrieval-results.json');
  const resultsContent = JSON.parse(await readFile(resultsPath, 'utf8'));

  assert.ok(resultsContent.aggregateMetrics, 'Should have aggregateMetrics');
  assert.ok(typeof resultsContent.aggregateMetrics.meanReciprocalRank === 'number', 'Should have meanReciprocalRank');
});

test('retrieval runner produces evidence bundle when malformed fixture aborts', async () => {
  const testDir = createTempDir();
  const stdFixturesDir = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retrieval', 'fixtures');
  const malformedFixturePath = path.join(stdFixturesDir, 'test-malformed.json');

  // Write a malformed fixture (missing queryId)
  await writeFile(malformedFixturePath, JSON.stringify({
    query: 'Test malformed',
    candidates: ['a', 'b'],
    expectedRelevant: ['a'],
    rankedResults: ['a', 'b'],
    mode: 'exact'
  }, null, 2));

  try {
    const manifest: RetrievalManifest = {
      schema: 'openlunum-experiment/0.1',
      id: 'test-retrieval-malformed',
      area: 'retrieval',
      task: 'retrieval',
      deterministic: true,
      hypothesis: 'Verify malformed fixtures produce error results and evidence bundle',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: testDir,
      retrievalConfig: { k: 3, mode: 'exact' }
    };

    // Runner should NOT throw — it should catch the error per-fixture
    const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, testDir);

    // Evidence bundle should exist
    const resultsPath = path.join(testDir, 'retrieval-results.json');
    const resultsContent = JSON.parse(await readFile(resultsPath, 'utf8'));
    assert.ok(resultsContent, 'Should have evidence bundle');
    assert.ok(Array.isArray(resultsContent.results), 'Should have results array');

    // Should have at least one error result
    const errorResult = results.find(r => r.status === 'error');
    assert.ok(errorResult, 'Should have at least one error result');
    assert.strictEqual(errorResult!.status, 'error', 'Error result status should be error');
    assert.ok(errorResult!.error?.includes('queryId'), 'Error should mention missing queryId');
    // Other results should still be present (not all aborted)
    const nonErrorResults = results.filter(r => r.status !== 'error');
    assert.ok(nonErrorResults.length > 0, 'Should have non-error results too');
  } finally {
    await rm(malformedFixturePath, { force: true });
  }
});
