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
    maxItems: 2,
    maxAttemptsPerItem: 1,
    maxModelCalls: 0
  },
  gates: {
    minimumFeatureRecall: 0.5,
    minimumExactRate: 0.5,
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
  const results = await runRetrievalExperiment(mockManifest, process.cwd(), '/tmp/output');
  
  // Check that we got results
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  
  // Check specific properties
  const result = results[0];
  assert.ok(result);
  assert.ok(result.id); // Should have an ID
  assert.ok(result.status === 'passed' || result.status === 'failed');
  assert.ok(result.queryId); // Should have query ID
  assert.ok(result.candidateIds); // Should have candidates
  assert.ok(result.expectedRelevantIds); // Should have expected relevant IDs
  assert.ok(result.rankedResultIds); // Should have ranked results
  assert.ok(result.featureRecall !== undefined); // Should have recall
  assert.ok(result.featurePrecision !== undefined); // Should have precision
  assert.ok(result.latencyMs !== undefined); // Should have latency
  assert.ok(result.reciprocalRank !== undefined); // Should have reciprocal rank
  assert.ok(result.meanReciprocalRank !== undefined); // Should have mean reciprocal rank
  assert.ok(result.falsePositives !== undefined); // Should have false positives
  assert.ok(result.falseNegatives !== undefined); // Should have false negatives
  assert.ok(result.hasFalseEquivalence !== undefined); // Should have false equivalence
  assert.ok(result.isNearSemantic !== undefined); // Should have near semantic flag
});

test('retrieval runner validates fixtures', async () => {
  // Test with a manifest that has invalid configuration
  const invalidManifest: RetrievalManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-retrieval-invalid',
    area: 'retrieval',
    task: 'retrieval',
    deterministic: true,
    hypothesis: 'Test invalid retrieval',
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
    outputDirectory: 'reports/experiments/test-retrieval-invalid',
    retrievalConfig: {
      k: 0, // Invalid k value
      mode: 'exact'
    }
  };
  
  // Should throw an error due to invalid k
  try {
    await runRetrievalExperiment(invalidManifest, process.cwd(), '/tmp/output');
    assert.fail('Should have thrown an error for invalid k');
  } catch (error: any) {
    assert.ok(error.message.includes('Invalid k value:'));
  }
});