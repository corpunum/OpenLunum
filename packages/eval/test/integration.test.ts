import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { runIntegrationExperiment, type IntegrationManifest } from '../src/integration-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace root for fixture paths
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

test('integration runner executes adapter and validates schema', async () => {
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-adapter',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify integration adapter executes and validates',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-integration-adapter',
    integrationConfig: { integrationId: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-adapter/output');

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);

  assert.ok(results.length >= 1, 'Should have at least one result');
  const result = results[0]!;
  assert.strictEqual(result.integrationId, 'test-registry');
  assert.strictEqual(result.fixtureId, 'test-fixture-1');
  assert.strictEqual(result.resultStatus, 'success');
  assert.strictEqual(result.schemaValid, true);
  assert.strictEqual(result.requiredArtifactsPresent, true);
  assert.strictEqual(result.status, 'passed');
  assert.ok(result.artifacts['output.json'], 'Should have output.json artifact');
  assert.ok(result.artifacts['log.txt'], 'Should have log.txt artifact');
});

test('integration runner rejects unknown integration ID', async () => {
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-unknown',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify unknown integration ID is rejected',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-integration-unknown',
    integrationConfig: { integrationId: 'nonexistent-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-unknown/output');

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);
  const errResult = results[0]!;
  assert.strictEqual(errResult.status, 'error');
  assert.ok(errResult.error?.includes('Unknown integration ID'));
});

test('integration runner rejects missing fixture', async () => {
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-missing-fixture',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify missing fixture is rejected',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-integration-missing-fixture',
    integrationConfig: { integrationId: 'test-registry', fixtureId: 'nonexistent-fixture' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-missing-fixture/output');

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);
  const errResult2 = results[0]!;
  assert.strictEqual(errResult2.status, 'error');
  assert.ok(errResult2.error?.includes('Fixture not found'));
});

test('integration runner validates required artifacts', async () => {
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-artifacts',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify required artifacts are present',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-integration-artifacts',
    integrationConfig: { integrationId: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-artifacts/output');

  assert.strictEqual(results[0]!.requiredArtifactsPresent, true, 'Required artifacts should be present');
  assert.ok('output.json' in results[0]!.artifacts);
  assert.ok('log.txt' in results[0]!.artifacts);
});
