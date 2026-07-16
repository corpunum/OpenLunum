import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runIntegrationExperiment } from '../src/integration-runner.js';
import type { IntegrationManifest } from '../src/integration-runner.js';

const mockManifest: IntegrationManifest = {
  schema: 'openlunum-experiment/0.1',
  id: 'test-integration',
  area: 'integration',
  task: 'integration',
  deterministic: true,
  hypothesis: 'Test integration',
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
  outputDirectory: 'reports/experiments/test-integration',
  integrationConfig: {
    selectedIntegration: 'test-registry',
    fixtureId: 'test-fixture-1'
  }
};

test('integration runner handles basic case', async () => {
  // Run the integration experiment
  const results = await runIntegrationExperiment(mockManifest, process.cwd(), '/tmp/output');
  
  // Check that we got results
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  
  // Check specific properties
  const result = results[0];
  assert.ok(result);
  assert.ok(result.id === 'test-fixture-1');
  assert.ok(result.status === 'passed' || result.status === 'failed');
  assert.ok(result.integrationId === 'test-registry');
  assert.ok(result.fixtureId === 'test-fixture-1');
  assert.ok(result.resultStatus !== undefined);
  assert.ok(result.artifacts !== undefined);
  assert.ok(result.exact !== undefined);
});

test('integration runner validates fixtures', async () => {
  // Test with a manifest that references a non-existent fixture
  const invalidManifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-invalid',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Test invalid integration',
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
    outputDirectory: 'reports/experiments/test-integration-invalid',
    integrationConfig: {
      selectedIntegration: 'test-registry',
      fixtureId: 'non-existent-fixture'
    }
  };
  
  const results = await runIntegrationExperiment(invalidManifest, process.cwd(), '/tmp/output');
  
  // Check that we got results
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 0);
  
  // Should have an error result
  const result = results[0];
  assert.ok(result);
  assert.ok(result.status === 'error');
});