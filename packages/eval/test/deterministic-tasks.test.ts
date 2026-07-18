import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'url';
import { runExperiment } from '../src/runner.js';
import { writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// ---- End-to-end tests: runExperiment with retrieval and integration tasks ----

test('retrieval experiment executes through runExperiment', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-retrieval-e2e-'));
  try {
    const manifest = path.join(temp, 'experiment.json');
    const output = path.join(temp, 'reports');
    await writeFile(manifest, JSON.stringify({
      schema: 'openlunum-experiment/0.1',
      id: 'retrieval-e2e',
      area: 'retrieval',
      task: 'retrieval',
      hypothesis: 'End-to-end retrieval experiment through runExperiment',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      deterministic: true,
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: output,
      retrievalConfig: { k: 3, mode: 'exact' }
    }), 'utf8');

    const runDir = await runExperiment(manifest);

    // Verify summary
    const summaryRaw = await readFile(path.join(runDir, 'summary.json'), 'utf8');
    const summary = JSON.parse(summaryRaw);
    assert.strictEqual(summary.experimentId, 'retrieval-e2e');
    assert.strictEqual(summary.task, 'retrieval');
    assert.strictEqual(summary.deterministic, true);
    assert.ok(summary.items > 0, 'Should have executed items');
    assert.ok(summary.passed + summary.failed >= summary.items);

    // Verify item results exist
    const resultsRaw = await readFile(path.join(runDir, 'item-results.jsonl'), 'utf8');
    const results = resultsRaw.trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    assert.ok(results.length > 0, 'Should have item results');

    // Verify each result has retrieval-specific fields
    for (const r of results) {
      assert.ok(r.queryId, 'Result must have queryId');
      assert.ok(r.featurePrecision !== undefined, 'Result must have precisionAtK');
      assert.ok(r.featureRecall !== undefined, 'Result must have recallAtK');
      assert.ok(r.reciprocalRank !== undefined, 'Result must have reciprocalRank');
    }

    // Verify report files exist
    assert.ok(await fileExists(path.join(runDir, 'manifest.snapshot.json')));
    assert.ok(await fileExists(path.join(runDir, 'environment.json')));
    assert.ok(await fileExists(path.join(runDir, 'item-results.jsonl')));
    assert.ok(await fileExists(path.join(runDir, 'failures.jsonl')));
    assert.ok(await fileExists(path.join(runDir, 'summary.json')));
    assert.ok(await fileExists(path.join(runDir, 'report.md')));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('integration experiment executes through runExperiment', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-integration-e2e-'));
  try {
    const manifest = path.join(temp, 'experiment.json');
    const output = path.join(temp, 'reports');
    await writeFile(manifest, JSON.stringify({
      schema: 'openlunum-experiment/0.1',
      id: 'integration-e2e',
      area: 'integration',
      task: 'integration',
      hypothesis: 'End-to-end integration experiment through runExperiment',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      deterministic: true,
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: output,
      integrationConfig: { selectedIntegration: 'test-registry', fixtureId: 'test-fixture-1' }
    }), 'utf8');

    const runDir = await runExperiment(manifest);

    // Verify summary
    const summaryRaw = await readFile(path.join(runDir, 'summary.json'), 'utf8');
    const summary = JSON.parse(summaryRaw);
    assert.strictEqual(summary.experimentId, 'integration-e2e');
    assert.strictEqual(summary.task, 'integration');
    assert.strictEqual(summary.deterministic, true);
    assert.ok(summary.items > 0, 'Should have executed items');

    // Verify item results
    const resultsRaw = await readFile(path.join(runDir, 'item-results.jsonl'), 'utf8');
    const results = resultsRaw.trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    assert.ok(results.length > 0, 'Should have item results');

    // Verify each result has integration-specific fields
    for (const r of results) {
      assert.ok(r.selectedIntegration, 'Result must have selectedIntegration');
      assert.ok(r.fixtureId, 'Result must have fixtureId');
      assert.ok(r.resultStatus !== undefined, 'Result must have resultStatus');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('report validation with integrity hash', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-report-validation-'));
  try {
    const manifest = path.join(temp, 'experiment.json');
    const output = path.join(temp, 'reports');
    await writeFile(manifest, JSON.stringify({
      schema: 'openlunum-experiment/0.1',
      id: 'report-validation',
      area: 'retrieval',
      task: 'retrieval',
      hypothesis: 'Verify report validation passes',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      deterministic: true,
      limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: output,
      retrievalConfig: { k: 3, mode: 'exact' }
    }), 'utf8');

    const runDir = await runExperiment(manifest);

    // Verify report directory has all expected files
    assert.ok(await fileExists(path.join(runDir, 'manifest.snapshot.json')));
    assert.ok(await fileExists(path.join(runDir, 'environment.json')));
    assert.ok(await fileExists(path.join(runDir, 'item-results.jsonl')));
    assert.ok(await fileExists(path.join(runDir, 'summary.json')));
    assert.ok(await fileExists(path.join(runDir, 'report.md')));

    // Validate report with the validate-report.cjs script
    const scriptsPath = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'validate-report.cjs');
    const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
    
    // Load the summary to compute expected integrity hash
    const summaryRaw = await readFile(path.join(runDir, 'summary.json'), 'utf8');
    const summary = JSON.parse(summaryRaw);
    const envRaw = await readFile(path.join(runDir, 'environment.json'), 'utf8');
    const environment = JSON.parse(envRaw);
    
    const crypto = await import('node:crypto');
    const integrityData = JSON.stringify({
      summary,
      itemCount: summary.items ?? 0,
      model: environment?.modelProfile?.model
    });
    const expectedHash = crypto.createHash('sha256').update(integrityData).digest('hex');

    // Run validation with expected integrity hash (passing case)
    execFileSync('node', [scriptsPath, runDir, '--repo-root', workspaceRoot, '--expected-integrity', expectedHash], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 30000
    });

    // Now tamper the summary and confirm validation fails with a wrong hash
    const summaryPath = path.join(runDir, 'summary.json');
    const tamperedSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    tamperedSummary.passed = 999; // Tamper the data
    fs.writeFileSync(summaryPath, JSON.stringify(tamperedSummary));

    // Recompute the hash from the original (untampered) data, but the file is now tampered
    // So validation should fail because the hash no longer matches
    const { spawnSync } = await import('node:child_process');
    const tamperedResult = spawnSync('node', [scriptsPath, runDir, '--repo-root', workspaceRoot, '--expected-integrity', expectedHash], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 30000
    });
    assert.notStrictEqual(tamperedResult.status, 0, 'Tampered report should fail integrity check');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('retrieval experiment produces correct aggregate metrics', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-retrieval-metrics-'));
  try {
    const manifest = path.join(temp, 'experiment.json');
    const output = path.join(temp, 'reports');
    await writeFile(manifest, JSON.stringify({
      schema: 'openlunum-experiment/0.1',
      id: 'retrieval-metrics',
      area: 'retrieval',
      task: 'retrieval',
      hypothesis: 'Verify aggregate metrics are computed correctly',
      baselineCommit: '5ca28b9c0f0366a46eac5edd163b65b7024714ff',
      deterministic: true,
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0.0, minimumExactRate: 0.0, requireProtectedLiteralCoverage: false },
      outputDirectory: output,
      retrievalConfig: { k: 3, mode: 'exact' }
    }), 'utf8');

    const runDir = await runExperiment(manifest);

    const summaryRaw = await readFile(path.join(runDir, 'summary.json'), 'utf8');
    const summary = JSON.parse(summaryRaw);

    // Verify metrics are recomputable from JSONL
    const resultsRaw = await readFile(path.join(runDir, 'item-results.jsonl'), 'utf8');
    const results = resultsRaw.trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

    const recomputedRecall = results.reduce((sum, r) => sum + (r.featureRecall ?? 0), 0) / results.length;
    const recomputedExact = results.filter(r => r.exact === true).length / results.length;

    assert.ok(Math.abs(summary.featureRecall - recomputedRecall) < 0.001, 'Feature recall must be recomputable');
    assert.ok(Math.abs(summary.exactRate - recomputedExact) < 0.001, 'Exact rate must be recomputable');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p, 'utf8');
    return true;
  } catch {
    return false;
  }
}
