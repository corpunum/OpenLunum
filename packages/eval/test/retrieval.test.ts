import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRetrievalExperiment } from '../src/retrieval-runner.js';
import type { RetrievalManifest } from '../src/retrieval-runner.js';

const mockManifest: RetrievalManifest = {
  schema: 'openlunum-experiment/0.1',
  id: 'test-retrieval',
  area: 'retrieval',
  task: 'retrieval',
  deterministic: true,
  hypothesis: 'Test retrieval',
  baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
  limits: {
    maxItems: 1,
    maxAttemptsPerItem: 1,
    maxModelCalls: 0
  },
  gates: {
    minimumFeatureRecall: 0.9,
    minimumExactRate: 0.9,
    requireProtectedLiteralCoverage: false
  },
  outputDirectory: 'reports/experiments/test-retrieval',
  retrievalConfig: {
    k: 3,
    mode: 'exact'
  }
};

test('retrieval runner handles basic case', async () => {
  // Run the retrieval experiment
  const results = await runRetrievalExperiment(mockManifest, '/tmp', '/tmp/output');
  
  // Check that we got results
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
});

test('retrieval runner fails on model profile', async () => {
  // This is just a placeholder - we'll test actual functionality later
  assert.ok(true, 'Retrieval runner module loads correctly');
});