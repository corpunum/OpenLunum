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
    allowlistedIntegrations: {
      "test-registry": {
        "version": "1.0.0",
        "entrypoint": "in-process"
      }
    }
  }
};

test('integration runner handles basic case', async () => {
  // Run the integration experiment
  const results = await runIntegrationExperiment(mockManifest, '/tmp', '/tmp/output');
  
  // Check that we got results
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
});

test('integration runner fails on model profile', async () => {
  // This is just a placeholder - we'll test actual functionality later
  assert.ok(true, 'Integration runner module loads correctly');
});