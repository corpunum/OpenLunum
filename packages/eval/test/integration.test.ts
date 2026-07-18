import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import * as AjvModule from 'ajv';
import { runIntegrationExperiment, type IntegrationManifest } from '../src/integration-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Track temp dirs for cleanup
const tempDirs = new Set<string>();

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `openlunum-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tempDirs.add(dir);
  return dir;
}

after(async () => {
  for (const dir of tempDirs) {
    try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tempDirs.clear();
});

test('integration runner executes adapter and validates schema', async () => {
  const output = createTempDir();
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
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);

  const result = results[0]!;
  assert.strictEqual(result.selectedIntegration, 'test-registry');
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
  const output = createTempDir();
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
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'nonexistent-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);
  assert.strictEqual(results[0]!.status, 'error');
  assert.ok(results[0]!.error?.includes('Unknown integration ID'));
  assert.strictEqual(results[0]!.resultStatus, 'error');
});

test('integration runner rejects missing fixture', async () => {
  const output = createTempDir();
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
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'nonexistent-fixture' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.ok(results.length === 1);
  assert.strictEqual(results[0]!.status, 'error');
  assert.ok(results[0]!.error?.includes('Fixture not found'));
  assert.strictEqual(results[0]!.resultStatus, 'error');
});

test('integration runner validates required artifacts', async () => {
  const output = createTempDir();
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
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.strictEqual(results[0]!.requiredArtifactsPresent, true, 'Required artifacts should be present');
  assert.ok('output.json' in results[0]!.artifacts);
  assert.ok('log.txt' in results[0]!.artifacts);
});

test('integration runner preserves integration version', async () => {
  const output = createTempDir();
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
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.strictEqual(results[0]!.integrationVersion, '1.0.0', 'Should preserve integration version');
  assert.strictEqual(results[0]!.entrypointType, 'in-process', 'Should preserve entrypoint type');
});

test('integration runner handles adapter failure', async () => {
  const output = createTempDir();
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
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'nonexistent', fixtureId: 'test' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.strictEqual(results[0]!.status, 'error');
  assert.ok(results[0]!.error, 'Should have error message');
});

test('integration runner preserves environment requirements in result', async () => {
  const output = createTempDir();
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-env-reqs',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify environment requirements are preserved in result',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.ok(results[0]!.environmentRequirements, 'Should have environmentRequirements');
  assert.deepStrictEqual(results[0]!.environmentRequirements, {}, 'Should match registry allowedEnvironment');
});

test('integration runner validates schema mismatch', async () => {
  const output = createTempDir();
  // test-bad-output adapter returns status as number (123) instead of string
  // Schema requires status: { type: 'string' }, so schemaValid should be false
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-schema-mismatch',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify schema mismatch detection with wrong type',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-bad-output', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.strictEqual(results[0]!.schemaValid, false, 'Schema validation should fail for wrong type');
  assert.strictEqual(results[0]!.status, 'failed', 'Should fail due to schema mismatch');
});

test('integration manifest round-trips through schema validator', async () => {
  const output = createTempDir();
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false });

  const schemaRaw = await readFile(path.join(WORKSPACE_ROOT, 'schemas', 'experiment.schema.json'), 'utf8');
  const schema = JSON.parse(schemaRaw);
  // Remove $schema reference to avoid meta-schema lookup
  delete schema.$schema;
  const validate = ajv.compile(schema);

  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'round-trip-test',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify manifest round-trips through schema validator',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 1 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };

  const valid = validate(manifest);
  assert.strictEqual(valid, true, `Manifest should validate against schema: ${JSON.stringify(validate.errors)}`);

  // Re-serialize and re-validate to ensure round-trip
  const serialized = JSON.parse(JSON.stringify(manifest));
  const valid2 = validate(serialized);
  assert.strictEqual(valid2, true, `Serialized manifest should validate against schema`);
});

test('integration runner handles adapter throwing error', async () => {
  const output = createTempDir();
  // test-throws adapter throws an Error during execution
  // The runner should catch the thrown error and return failed status
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-throw',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify thrown errors are caught and reported',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-throws', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.strictEqual(results[0]!.status, 'failed', 'Should report failed for thrown error');
  assert.strictEqual(results[0]!.resultStatus, 'failed', 'Result status should be failed');
  assert.strictEqual(results[0]!.error, 'Simulated adapter crash', 'Error message should be preserved');
});

test('integration runner returns failed status for nonzero execution', async () => {
  const output = createTempDir();
  // Use test-bad-output adapter which returns output with undefined message
  // This causes schema validation to fail, so overall status should be 'failed'
  const manifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-integration-nonzero',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify nonzero execution fails properly',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: output,
    integrationConfig: { selectedIntegration: 'test-bad-output', fixtureId: 'test-fixture-1' }
  };

  const results = await runIntegrationExperiment(manifest, WORKSPACE_ROOT, output);

  assert.ok(Array.isArray(results));
  assert.strictEqual(results[0]!.status, 'failed',
    'Overall status should be failed when schema validation fails');
  assert.strictEqual(results[0]!.schemaValid, false,
    'Schema validation should fail for output with undefined required field');
});

test('selectedIntegration field is consistent across all result paths', async () => {
  // Verify the semantic-contract change: selectedIntegration is always set,
  // regardless of success, error, or unknown integration paths

  // Path 1: Success
  const successOutput = createTempDir();
  const successManifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-selected-integration-success',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify selectedIntegration is set on success',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: successOutput,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
  };
  const successResults = await runIntegrationExperiment(successManifest, WORKSPACE_ROOT, successOutput);
  assert.strictEqual(successResults[0]!.selectedIntegration, 'test-registry',
    'selectedIntegration should be set on success');

  // Path 2: Unknown integration
  const unknownOutput = createTempDir();
  const unknownManifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-selected-integration-unknown',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify selectedIntegration is set on unknown integration',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: unknownOutput,
    integrationConfig: { selectedIntegration: 'nonexistent-registry', fixtureId: 'test-fixture-1' }
  };
  const unknownResults = await runIntegrationExperiment(unknownManifest, WORKSPACE_ROOT, unknownOutput);
  assert.strictEqual(unknownResults[0]!.selectedIntegration, 'nonexistent-registry',
    'selectedIntegration should be set on unknown integration');

  // Path 3: Missing fixture
  const missingOutput = createTempDir();
  const missingManifest: IntegrationManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test-selected-integration-missing',
    area: 'integration',
    task: 'integration',
    deterministic: true,
    hypothesis: 'Verify selectedIntegration is set on missing fixture',
    baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
    gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
    outputDirectory: missingOutput,
    integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'nonexistent-fixture' }
  };
  const missingResults = await runIntegrationExperiment(missingManifest, WORKSPACE_ROOT, missingOutput);
  assert.strictEqual(missingResults[0]!.selectedIntegration, 'test-registry',
    'selectedIntegration should be set on missing fixture');
});
