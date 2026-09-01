import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditEvidenceRun, buildEvidenceValidityManifest, type EvidenceValidityManifest } from '../src/evidence-validity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DATASET = 'datasets/dev/multilingual-core-v1.jsonl';
const DATASET_HASH = '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873';

function head(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WORKSPACE_ROOT, encoding: 'utf8' }).trim();
}

async function fixture(options: { valid?: boolean; placeholder?: boolean; mutateHash?: boolean; nestedRaw?: boolean } = {}): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evidence-validity-'));
  const manifest = {
    schema: 'openlunum-experiment/0.1', id: 'evidence-fixture', area: 'multilingual-parse', task: 'parse',
    deterministic: false, baselineCommit: head(), dataset: { path: DATASET, sha256: options.mutateHash ? 'a'.repeat(64) : DATASET_HASH }
  };
  const environment = options.valid ? {
    startedAt: '2026-09-01T00:00:00.000Z', codeCommit: head(),
    modelProfile: { model: options.placeholder ? 'replace-with-server-model-id' : 'test-model' },
    modelIdentity: { verified: true, reportedModelId: options.placeholder ? 'replace-with-server-model-id' : 'test-model', endpoint: 'http://127.0.0.1/v1', weightsSha256: 'b'.repeat(64) },
    prompt: { version: 'parse-v1', systemSha256: 'c'.repeat(64) }
  } : { modelProfile: { model: 'test-model' } };
  await writeFile(path.join(directory, 'manifest.snapshot.json'), JSON.stringify(manifest));
  await writeFile(path.join(directory, 'environment.json'), JSON.stringify(environment));
  await writeFile(path.join(directory, 'parse-summary.json'), JSON.stringify({ runId: 'run' }));
  const rawPath = options.nestedRaw ? path.join(directory, 'raw', 'items.jsonl') : path.join(directory, 'parse-results-en.jsonl');
  if (options.nestedRaw) await mkdir(path.dirname(rawPath), { recursive: true });
  await writeFile(rawPath, JSON.stringify({ id: '1', status: 'passed', rawOutput: '{"ok":true}' }) + '\n');
  return directory;
}

test('evidence validity accepts a fully attested live-model fixture', async () => {
  const directory = await fixture({ valid: true });
  try {
    const result = await auditEvidenceRun(WORKSPACE_ROOT, path.join(directory, 'manifest.snapshot.json'));
    assert.equal(result.validity, 'VALID_EMPIRICAL');
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('evidence validity rejects missing prompt and execution provenance', async () => {
  const directory = await fixture();
  try {
    const result = await auditEvidenceRun(WORKSPACE_ROOT, path.join(directory, 'manifest.snapshot.json'));
    assert.equal(result.validity, 'INVALID_EMPIRICAL');
    assert.ok(result.issues.some((issue) => issue.code === 'missing_prompt_provenance'));
    assert.ok(result.issues.some((issue) => issue.code === 'missing_execution_commit'));
    assert.ok(result.issues.some((issue) => issue.code === 'unverified_model_identity'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('evidence validity accepts nested raw items emitted by false-positive review runs', async () => {
  const directory = await fixture({ valid: true, nestedRaw: true });
  try {
    const result = await auditEvidenceRun(WORKSPACE_ROOT, path.join(directory, 'manifest.snapshot.json'));
    assert.equal(result.validity, 'VALID_EMPIRICAL');
    assert.equal(result.rawOutputFiles.length, 1);
    assert.ok(result.rawOutputFiles[0]!.endsWith('/raw/items.jsonl'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('evidence validity catches a placeholder model and a changed dataset hash', async () => {
  const directory = await fixture({ valid: true, placeholder: true, mutateHash: true });
  try {
    const result = await auditEvidenceRun(WORKSPACE_ROOT, path.join(directory, 'manifest.snapshot.json'));
    assert.equal(result.validity, 'INVALID_EMPIRICAL');
    assert.ok(result.issues.some((issue) => issue.code === 'placeholder_model_id'));
    assert.ok(result.issues.some((issue) => issue.code === 'dataset_hash_mismatch'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('evidence validity labels deterministic runs as non-empirical even when their bundle is incomplete', async () => {
  const directory = await fixture({ valid: true });
  try {
    const manifestPath = path.join(directory, 'manifest.snapshot.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.deterministic = true;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await auditEvidenceRun(WORKSPACE_ROOT, manifestPath);
    assert.equal(result.validity, 'DETERMINISTIC_ONLY');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('repository audit finds visible heldout data and does not count it as protected evidence', async () => {
  const manifest: EvidenceValidityManifest = await buildEvidenceValidityManifest(WORKSPACE_ROOT);
  assert.ok(manifest.globalFindings.some((issue) => issue.code === 'heldout_dataset_is_repo_visible'));
  assert.ok(manifest.totals.INVALID_EMPIRICAL > 0);
});
