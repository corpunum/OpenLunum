import { test } from 'node:test';
import * as crypto from 'node:crypto';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const VALIDATE_SCRIPT = path.join(WORKSPACE_ROOT, 'scripts', 'validate-report.cjs');

function createValidReport(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.snapshot.json'), JSON.stringify({
    schema: 'openlunum-experiment/0.1', id: 'test-exp', area: 'test', task: 'parse',
    hypothesis: 'Test hypothesis long enough to pass validation',
    baselineCommit: 'ca623ec',
    dataset: { path: 'datasets/dev/multilingual-core-v1.jsonl', sha256: '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873' },
    modelProfile: 'profiles/models/local-openai-compatible.example.json',
    limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 },
    gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.8, requireProtectedLiteralCoverage: true },
    outputDirectory: 'reports/experiments/test'
  }));
  fs.writeFileSync(path.join(dir, 'environment.json'), JSON.stringify({
    node: process.version, platform: process.platform, arch: process.arch,
    modelProfile: { schema: 'openlunum-model-profile/0.1', id: 'test', provider: 'openai-compatible', baseUrl: 'http://x', model: 'x', temperature: 0, timeoutMs: 1000, metadata: { test: true } },
    startedAt: new Date().toISOString()
  }));
  fs.writeFileSync(path.join(dir, 'item-results.jsonl'), JSON.stringify({ id: '1', status: 'passed' }) + '\n');
  fs.writeFileSync(path.join(dir, 'failures.jsonl'), '');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
    experimentId: 'test-exp', runId: 'run-1', task: 'parse', total: 1,
    calls: 1, passed: 1, failed: 0, exactRate: 1, featureRecall: 1,
    protectedLiteralCoverage: 1, gatesPassed: true
  }));
  fs.writeFileSync(path.join(dir, 'report.md'), '# Test');
}

function runValidation(reportDir: string, extraArgs: string[] = []): { success: boolean; stdout: string } {
  const result = spawnSync('node', [VALIDATE_SCRIPT, reportDir, '--repo-root', WORKSPACE_ROOT, ...extraArgs], {
    encoding: 'utf-8', timeout: 30000
  });
  return { success: result.status === 0, stdout: result.stdout + result.stderr };
}

test('valid report bundle passes validation', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const expectedHash = '92025b866e1837d013bd651977ff299f73ec8a980e395e949bf9c877cea5a80d';
    const result = runValidation(dir, ['--expected-integrity', expectedHash]);
    assert.ok(result.success, `Valid report should pass: ${result.stdout}`);
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('missing baseline commit fails validation', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.snapshot.json'), 'utf-8'));
    manifest.baselineCommit = 'ca623ec000000000000000000000000000000000';
    fs.writeFileSync(path.join(dir, 'manifest.snapshot.json'), JSON.stringify(manifest));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Missing baseline commit should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('wrong dataset hash fails validation', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.snapshot.json'), 'utf-8'));
    manifest.dataset.sha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    fs.writeFileSync(path.join(dir, 'manifest.snapshot.json'), JSON.stringify(manifest));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Wrong dataset hash should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('missing required file fails validation', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    fs.unlinkSync(path.join(dir, 'summary.json'));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Missing summary.json should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('wrong item counts fail validation', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf-8'));
    summary.total = 100; // Wrong
    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Wrong item counts should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('integrity hash mismatch detected', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const summaryPath = path.join(dir, 'summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    const envPath = path.join(dir, 'environment.json');
    const env = fs.existsSync(envPath) ? JSON.parse(fs.readFileSync(envPath, 'utf-8')) : null;
    const model = env?.modelProfile?.model;
    const integrityInput = JSON.stringify({ summary, itemCount: 1, model });
    const expectedHash = crypto.createHash('sha256').update(integrityInput).digest('hex');

    // Tamper
    summary.passed = 999;
    fs.writeFileSync(summaryPath, JSON.stringify(summary));

    const result = runValidation(dir, ['--expected-integrity', expectedHash]);
    assert.ok(!result.success, 'Tampered report should fail integrity check');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('integrity hash matches on untampered report', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const summaryPath = path.join(dir, 'summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    const envPath = path.join(dir, 'environment.json');
    const env = fs.existsSync(envPath) ? JSON.parse(fs.readFileSync(envPath, 'utf-8')) : null;
    const model = env?.modelProfile?.model;
    const integrityInput = JSON.stringify({ summary, itemCount: 1, model });
    const expectedHash = crypto.createHash('sha256').update(integrityInput).digest('hex');

    const result = runValidation(dir, ['--expected-integrity', expectedHash]);
    assert.ok(result.success, 'Untampered report should pass integrity check');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('incomplete model profile fails validation', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    // Change modelProfile to point to a non-existent file
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.snapshot.json'), 'utf-8'));
    manifest.modelProfile = 'profiles/models/nonexistent.json';
    fs.writeFileSync(path.join(dir, 'manifest.snapshot.json'), JSON.stringify(manifest));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Non-existent model profile should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('validation script exists and is executable', async () => {
  assert.ok(fs.existsSync(VALIDATE_SCRIPT), 'validate-report.cjs must exist');
});

test('report-validation schema exists', async () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'report-validation.schema.json');
  assert.ok(fs.existsSync(schemaPath), 'report-validation.schema.json must exist');
});

test('integrity hash mismatch detected', async () => {
  const dir = path.join('/tmp', `validate-test-${Date.now()}`);
  try {
    createValidReport(dir);
    const result = runValidation(dir, ['--expected-integrity', '0000000000000000000000000000000000000000000000000000000000000000']);
    assert.ok(!result.success, 'Wrong integrity hash should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});
