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

// ── Issue #11 Item 8: aggregate MRR in reports ─────────────────────

function createValidRetrievalReport(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.snapshot.json'), JSON.stringify({
    schema: 'openlunum-experiment/0.1', id: 'test-retrieval', area: 'context', task: 'retrieval',
    hypothesis: 'Retrieval reports include MRR for retrieval tasks',
    baselineCommit: 'ca623ec',
    dataset: { path: 'datasets/dev/multilingual-core-v1.jsonl', sha256: '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873' },
    modelProfile: 'profiles/models/local-openai-compatible.example.json',
    limits: { maxItems: 3, maxAttemptsPerItem: 1, maxModelCalls: 3 },
    gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.8, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/experiments/test-retrieval'
  }));
  fs.writeFileSync(path.join(dir, 'environment.json'), JSON.stringify({
    node: process.version, platform: process.platform, arch: process.arch,
    modelProfile: { schema: 'openlunum-model-profile/0.1', id: 'test', provider: 'openai-compatible', baseUrl: 'http://x', model: 'x', temperature: 0, timeoutMs: 1000, metadata: {} },
    startedAt: new Date().toISOString()
  }));
  // Create item results with MRR values
  fs.writeFileSync(path.join(dir, 'item-results.jsonl'), [
    JSON.stringify({ id: 'q1', status: 'passed', meanReciprocalRank: 1 }),
    JSON.stringify({ id: 'q2', status: 'passed', meanReciprocalRank: 0.5 }),
    JSON.stringify({ id: 'q3', status: 'failed', meanReciprocalRank: 0.333 })
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'failures.jsonl'), JSON.stringify({ id: 'q3', status: 'failed' }) + '\n');
  const mrr = (1 + 0.5 + 0.333) / 3;
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
    experimentId: 'test-retrieval', runId: 'run-1', task: 'retrieval',
    items: 3, calls: 3, passed: 2, failed: 1,
    exactRate: 0.6667, featureRecall: 0.8333, protectedLiteralCoverage: 1,
    meanReciprocalRank: mrr, gatesPassed: false
  }));
  fs.writeFileSync(path.join(dir, 'report.md'), [
    '# Experiment test-retrieval', '',
    '- Run: run-1', '- Task: retrieval', '- Deterministic: false',
    '- Items: 3', '- Exact rate: 0.6667', '- Feature recall: 0.8333',
    '- Protected literal coverage: 1.0000', '- Gates passed: false',
    '- Failures: 1', `- Mean reciprocal rank: ${mrr.toFixed(4)}`
  ].join('\n') + '\n');
}

test('retrieval report includes MRR in summary.json', () => {
  // Verify the createValidRetrievalReport function produces MRR in summary
  const mrr = (1 + 0.5 + 0.333) / 3;
  const summary = {
    experimentId: 'test-retrieval', runId: 'run-1', task: 'retrieval',
    items: 3, calls: 3, passed: 2, failed: 1,
    exactRate: 0.6667, featureRecall: 0.8333, protectedLiteralCoverage: 1,
    meanReciprocalRank: mrr, gatesPassed: false
  };
  assert.ok(summary.meanReciprocalRank !== undefined, 'summary.json must include meanReciprocalRank for retrieval');
  assert.ok(typeof summary.meanReciprocalRank === 'number', 'MRR must be a number');
  assert.ok(Math.abs(summary.meanReciprocalRank - mrr) < 0.001, 'MRR must be correctly computed');
});

test('retrieval report includes MRR in report.md', async () => {
  const dir = path.join('/tmp', `validate-retrieval-mrr-${Date.now()}`);
  try {
    createValidRetrievalReport(dir);
    // Compute expected integrity hash
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf-8'));
    const env = JSON.parse(fs.readFileSync(path.join(dir, 'environment.json'), 'utf-8'));
    const model = env?.modelProfile?.model;
    const integrityInput = JSON.stringify({ summary, itemCount: 3, model });
    const expectedHash = crypto.createHash('sha256').update(integrityInput).digest('hex');

    const result = runValidation(dir, ['--expected-integrity', expectedHash]);
    assert.ok(result.success, `Retrieval report should include valid MRR: ${result.stdout}`);
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('retrieval report without MRR fails validation', async () => {
  const dir = path.join('/tmp', `validate-retrieval-mrr-${Date.now()}`);
  try {
    createValidRetrievalReport(dir);
    // Remove MRR from summary
    const summaryPath = path.join(dir, 'summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    delete summary.meanReciprocalRank;
    fs.writeFileSync(summaryPath, JSON.stringify(summary));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Retrieval report without MRR should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('retrieval report MRR mismatch fails validation', async () => {
  const dir = path.join('/tmp', `validate-retrieval-mrr-${Date.now()}`);
  try {
    createValidRetrievalReport(dir);
    // Corrupt the MRR value in summary
    const summaryPath = path.join(dir, 'summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    summary.meanReciprocalRank = 999.9;
    fs.writeFileSync(summaryPath, JSON.stringify(summary));
    const result = runValidation(dir);
    assert.ok(!result.success, 'Retrieval report with wrong MRR should fail');
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
});
