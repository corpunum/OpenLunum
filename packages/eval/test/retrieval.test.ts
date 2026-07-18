import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { runRetrievalExperiment, type RetrievalManifest, type RetrievalFixture } from '../src/retrieval-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace root for fixture paths (dist/test -> dist -> eval -> packages -> OpenLunum)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

test('retrieval runner loads fixtures and computes correct metrics', async () => {
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
    outputDirectory: 'reports/experiments/test-retrieval-metrics',
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-retrieval-metrics/output');

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

test('retrieval runner validates k threshold', async () => {
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
    outputDirectory: 'reports/experiments/test-retrieval-k',
    retrievalConfig: { k: 1, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-retrieval-k/output');

  // With k=1, results should be sliced to 1 item
  for (const result of results) {
    assert.ok(result.rankedResultIds.length <= 1, `With k=1, rankedResultIds should have at most 1 item, got ${result.rankedResultIds.length}`);
  }
});

test('retrieval runner detects false positives and false negatives', async () => {
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
    outputDirectory: 'reports/experiments/test-retrieval-fp-fn',
    retrievalConfig: { k: 3, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-retrieval-fp-fn/output');

  // At least one fixture should have false positives or false negatives
  const hasFpOrFn = results.some(r => r.falsePositives.length > 0 || r.falseNegatives.length > 0);
  assert.ok(hasFpOrFn, 'At least one result should have false positives or false negatives');
});

test('retrieval runner rejects invalid k', async () => {
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
    outputDirectory: 'reports/experiments/test-retrieval-invalid-k',
    retrievalConfig: { k: 0, mode: 'exact' }
  };

  await assert.rejects(
    runRetrievalExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-retrieval-invalid-k/output'),
    { message: /Invalid k value: 0/ }
  );
});

test('retrieval runner computes precision and recall correctly', async () => {
  // Test with k=1 to verify metrics with a simple case
  // Using sample-query-1.json which has expectedRelevant=["paris"] and rankedResults=["paris","london","berlin"]
  // With k=1, topK=["paris"], so precision=1/1=1, recall=1/1=1, rr=1
  const manifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-precise',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Verify precise metric computation',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-retrieval-precise',
    retrievalConfig: { k: 1, mode: 'exact' }
  };

  const results = await runRetrievalExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-retrieval-precise/output');
  assert.ok(results.length > 0);
  assert.ok(results.length >= 1, 'Should have at least one result');

  // Find the result for sample-query-1 which has expectedRelevant=["paris"]
  const query1Result = results.find(r => r.queryId === 'sample-query-1');
  assert.ok(query1Result, 'Should have result for sample-query-1');

  // With k=1, topK=["paris"], precision=1/1=1 (perfect), recall=1/1=1 (perfect)
  assert.strictEqual(query1Result!.precisionAtK, 1, 'precision@k should be 1 for perfect top-1');
  assert.strictEqual(query1Result!.recallAtK, 1, 'recall@k should be 1 for perfect top-1');
  assert.strictEqual(query1Result!.reciprocalRank, 1, 'reciprocal rank should be 1');
  assert.strictEqual(query1Result!.falsePositives.length, 0, 'no false positives for perfect top-1');
  assert.strictEqual(query1Result!.falseNegatives.length, 0, 'no false negatives for perfect top-1');
  assert.strictEqual(query1Result!.status, 'passed', 'Should pass gate');
});
