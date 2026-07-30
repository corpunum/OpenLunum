import { test } from 'node:test';
import assert from 'node:assert';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  AUDIT_VERSION,
  auditSchemaNeutrality,
} from '../src/schema-neutrality-audit.js';
import { findWorkspaceRoot } from '../src/io.js';

test('AUDIT_VERSION is 0.1.0', () => {
  assert.strictEqual(AUDIT_VERSION, '0.1.0');
});

test('auditSchemaNeutrality returns passing verdict for clean core schema', async () => {
  const result = await auditSchemaNeutrality();

  assert.strictEqual(result.schema, 'openlunum-neutrality-audit/0.1');
  assert.strictEqual(result.version, '0.1.0');
  assert.strictEqual(result.verdict, 'pass');
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.findings.length >= 5);
  assert.match(result.sha, /^[a-f0-9]{64}$/);

  for (const finding of result.findings) {
    assert.strictEqual(finding.passed, true, `Finding ${finding.id} failed: ${finding.message}`);
  }
});

test('auditSchemaNeutrality saves results to eval-results/neutrality/schema-neutrality-audit.json', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const jsonPath = path.join(
    workspaceRoot,
    'eval-results/neutrality/schema-neutrality-audit.json'
  );

  const result = await auditSchemaNeutrality({ outputPath: jsonPath, saveResult: true });

  const fileContent = await readFile(jsonPath, 'utf8');
  const savedData = JSON.parse(fileContent);

  assert.strictEqual(savedData.schema, 'openlunum-neutrality-audit/0.1');
  assert.strictEqual(savedData.version, '0.1.0');
  assert.strictEqual(savedData.verdict, 'pass');
  assert.strictEqual(savedData.sha, result.sha);
  assert.deepStrictEqual(savedData.findings, result.findings);
});

test('auditSchemaNeutrality detects product-specific string leakage in core schema', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const tmpCoreDir = path.join(workspaceRoot, 'packages/eval/scratch/tmp-core-test');

  await mkdir(tmpCoreDir, { recursive: true });

  try {
    // Write fake core files with product leakage
    await writeFile(
      path.join(tmpCoreDir, 'types.ts'),
      `export interface LunumSem { jiraTicketId: string; slackChannel: string; }`,
      'utf8'
    );
    await writeFile(
      path.join(tmpCoreDir, 'constants.ts'),
      `export const SLACK_SCHEMA = 'slack/0.1';`,
      'utf8'
    );
    await writeFile(
      path.join(tmpCoreDir, 'index.ts'),
      `export function parseSlackMessage(input: string) {}`,
      'utf8'
    );
    await writeFile(
      path.join(tmpCoreDir, 'policy.ts'),
      `export function classifyEligibility() { if (input.product === 'jira') return false; }`,
      'utf8'
    );
    await writeFile(
      path.join(tmpCoreDir, 'policy-classifier.ts'),
      `export const ELIGIBLE_CATEGORIES = new Set();`,
      'utf8'
    );
    await writeFile(
      path.join(tmpCoreDir, 'model-renderer-profiles.ts'),
      `export interface AcceptedRendererProfile { family: string; }`,
      'utf8'
    );

    const result = await auditSchemaNeutrality({
      coreDir: tmpCoreDir,
      saveResult: false,
    });

    assert.strictEqual(result.verdict, 'fail');
    assert.ok(result.findings.some((f) => !f.passed));
  } finally {
    await rm(tmpCoreDir, { recursive: true, force: true });
  }
});
