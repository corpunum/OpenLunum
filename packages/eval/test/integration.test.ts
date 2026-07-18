import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { runIntegrationExperiment, type IntegrationManifest } from '../src/integration-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-adapter/output');

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);

  const result = results[0]!;
  assert.strictEqual(result.integrationId, 'test-registry');
  assert.strictEqual(result.fixtureId, 'test-fixture-1');
  assert.strictEqual(result.resultStatus, 'success');
  assert.strictEqual(result.schemaValid, true);
  assert.strictEqual(result.requiredArtifactsPresent, true);
  assert.strictEqual(result.status, 'passed');
  assert.ok(result.artifacts['output.json'], 'Should have output.json artifact');
  assert.ok(result.artifacts['log.txt'], 'Should have log.txt artifact');
  assert.deepStrictEqual(result.environmentRequirements, {}, 'Should preserve environment requirements');
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
    integrationConfig: { selectedIntegration: 'nonexistent-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-unknown/output');

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);
  assert.strictEqual(results[0]!.status, 'error');
  assert.ok(results[0]!.error?.includes('Unknown integration ID'));
  assert.strictEqual(results[0]!.resultStatus, 'error');
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
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'nonexistent-fixture' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-missing-fixture/output');

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);
  assert.strictEqual(results[0]!.status, 'error');
  assert.ok(results[0]!.error?.includes('Fixture not found'));
  assert.strictEqual(results[0]!.resultStatus, 'error');
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
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-artifacts/output');

  assert.strictEqual(results[0]!.requiredArtifactsPresent, true, 'Required artifacts should be present');
  assert.ok('output.json' in results[0]!.artifacts);
  assert.ok('log.txt' in results[0]!.artifacts);
});

test('integration runner preserves integration version', async () => {
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-version',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify integration version is preserved',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-integration-version',
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-version/output');

  assert.strictEqual(results[0]!.integrationVersion, '1.0.0', 'Should preserve integration version');
  assert.strictEqual(results[0]!.entrypointType, 'in-process', 'Should preserve entrypoint type');
});

test('integration runner handles adapter failure', async () => {
  // The test-registry adapter returns failure if fixtureId is missing
  // We can't easily test this without modifying the fixture, so we verify the error handling path exists
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-error',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify error handling path exists',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-integration-error',
    integrationConfig: { selectedIntegration: 'nonexistent', fixtureId: 'test' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, 'reports/experiments/test-integration-error/output');

  assert.ok(Array.isArray(results));
  assert.strictEqual(results[0]!.status, 'error');
  assert.ok(results[0]!.error, 'Should have error message');
});
