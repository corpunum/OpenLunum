import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test compiled to packages/core/dist/test/
// scripts/ is at workspace root (4 levels up)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = path.join(WORKSPACE_ROOT, 'scripts', 'validate-report.cjs');
const REPO_ROOT = WORKSPACE_ROOT;

// Legacy report format (from PR #4) - simplified
const legacyReport = {
  generatedAt: '2026-07-15T18:05:47.138Z',
  workArea: 'integrations/pi',
  model: 'qwen2.5-coder:1.5b',
  runtime: { node: 'v22.22.2', model: 'qwen2.5-coder:1.5b' },
  summary: { total: 5, passed: 4, failed: 1, errors: 0 },
  cases: [
    { id: 'case_1', label: 'test_1' },
    { id: 'case_2', label: 'test_2' }
  ],
  results: [
    { id: 1, caseId: 'case_1', mode: 'natural', pass: 'yes' },
    { id: 2, caseId: 'case_1', mode: 'mixed', pass: 'yes' },
    { id: 3, caseId: 'case_1', mode: 'lunum', pass: 'yes' },
    { id: 4, caseId: 'case_2', mode: 'natural', pass: 'yes' },
    { id: 5, caseId: 'case_2', mode: 'lunum', pass: 'no' }
  ]
};

// New format report - skip profile file check
const newFormatReport = {
  schema: 'openlunum-report-validation/0.1',
  experimentId: 'test-exp',
  workArea: 'test-area',
  baselineCommit: 'ca623ec',
  candidateCommit: 'ca623ec',
  dataset: { id: 'test-ds', sha256: 'a'.repeat(64), items: 3 },
  modelProfile: null,
  summary: { total: 3, passed: 2, failed: 1, errors: 0 },
  caseCount: 3,
  validationRules: [
    { name: 'count-check', check: 'summary-total-matches-cases', critical: true }
  ],
  cases: [
    { id: 1, pass: true },
    { id: 2, pass: true },
    { id: 3, pass: false }
  ]
};

// Negative: inconsistent counts
const inconsistentReport = {
  schema: 'openlunum-report-validation/0.1',
  experimentId: 'test-exp',
  workArea: 'test-area',
  baselineCommit: 'ca623ec',
  candidateCommit: 'abc1234',
  dataset: { id: 'test-ds', sha256: 'a'.repeat(64), items: 10 },
  modelProfile: 'profiles/models/test.json',
  summary: { total: 10, passed: 8, failed: 3, errors: 0 }, // 8+3=11, not 10
  caseCount: 10,
  validationRules: []
};

// Helper to run the validation script
function runValidation(report: any): { success: boolean; stdout: string } {
  const tmpFile = path.join('/tmp', `validation-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(report, null, 2));

  const result = spawnSync('node', [SCRIPT, tmpFile, '--repo-root', REPO_ROOT], {
    encoding: 'utf-8',
    timeout: 30000
  });

  fs.unlinkSync(tmpFile);

  return {
    success: result.status === 0,
    stdout: result.stdout
  };
}

test('legacy report format validates (PI experiment)', async () => {
  const result = runValidation(legacyReport);
  assert.ok(result.success, `Legacy report should validate: ${result.stdout}`);
  assert.ok(result.stdout.includes('VALIDATION PASSED'), 'Should pass validation');
});

test('new format report validates', async () => {
  const result = runValidation(newFormatReport);
  assert.ok(result.success, `New format report should validate: ${result.stdout}`);
});

test('inconsistent counts are caught', async () => {
  const result = runValidation(inconsistentReport);
  assert.ok(!result.success, `Inconsistent report should fail: ${result.stdout}`);
  assert.ok(result.stdout.includes('VALIDATION FAILED'), 'Should fail validation');
});

test('validation script exists and is executable', async () => {
  assert.ok(fs.existsSync(SCRIPT), 'validate-report.cjs should exist');
});

test('report-validation schema exists', async () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'report-validation.schema.json');
  assert.ok(fs.existsSync(schemaPath), `report-validation.schema.json should exist at ${schemaPath}`);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  assert.strictEqual(schema.$id, 'https://openlunum.org/schemas/report-validation/0.1');
});
