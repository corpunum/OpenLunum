import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  isLunumRecord,
  loadProtectedRecords,
  normalizeProcessExit,
  parseRunnerArguments,
  recordsFromJson,
} from './run-quality-gates-ci.mjs';

const record = {
  recordVersion: 'lunum-record/0.1-draft',
  source: { text: 'test', language: 'en', role: 'user', ref: null },
  sem: {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'test', roles: {}, negated: false }],
  },
  fingerprint: 'lfp:0.1:sha256:0000000000000000',
  renderings: {},
  policy: {
    eligible: true,
    category: 'test',
    risk: 'low',
    confidence: 1,
    reasons: [],
  },
  meta: {},
};

test('quality-gate runner recognizes current record shape', () => {
  assert.equal(isLunumRecord(record), true);
  assert.equal(isLunumRecord({ ...record, sem: null }), false);
  assert.equal(isLunumRecord({
    ...record,
    recordVersion: 'lunum-record/0.2',
    sem: { ...record.sem, schema: 'lunum-sem/0.2' },
    fingerprint: 'lfp:0.2:sha256:0000000000000000',
  }), true);
  assert.equal(isLunumRecord({
    ...record,
    recordVersion: 'lunum-record/0.2',
  }), false, 'record and semantic schema versions must agree');
});

test('quality-gate runner extracts records from supported containers', () => {
  assert.deepEqual(recordsFromJson(record), [record]);
  assert.throws(() => recordsFromJson([record, { nope: true }]), /only valid Lunum records/);
  assert.deepEqual(recordsFromJson({ records: [record] }), [record]);
  assert.deepEqual(recordsFromJson({ items: [record] }), [record]);
  assert.deepEqual(recordsFromJson({ data: [record] }), [record]);
  assert.throws(() => recordsFromJson({ unrelated: [] }), /does not contain/);
});

test('quality-gate runner requires fallback-only mode to be explicit', () => {
  assert.deepEqual(parseRunnerArguments(['--fallback-only']), {
    fallbackOnly: true,
    protectedDir: join(process.cwd(), 'datasets', 'protected'),
  });
  assert.throws(() => parseRunnerArguments(['--fallback-only', '--protected-dir=/tmp/fixtures']), /cannot be combined/);
  assert.throws(() => parseRunnerArguments(['--unknown']), /Unknown argument/);
});

test('protected fixture loading rejects malformed and structurally invalid files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quality-gate-invalid-'));
  try {
    await writeFile(join(directory, 'broken.json'), '{broken', 'utf8');
    await assert.rejects(loadProtectedRecords(directory), /Cannot read protected fixture broken.json/);
    await writeFile(join(directory, 'broken.json'), JSON.stringify([record, { nope: true }]), 'utf8');
    await assert.rejects(loadProtectedRecords(directory), /must contain only valid Lunum records/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('protected fixture loading rejects missing or empty fixture directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quality-gate-empty-'));
  try {
    await assert.rejects(loadProtectedRecords(directory), /No protected JSON fixtures/);
    await assert.rejects(loadProtectedRecords(join(directory, 'missing')), /Cannot inspect protected fixture directory/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('quality-gate process exit preserves warning contract unless strict', () => {
  assert.equal(normalizeProcessExit(0, false), 0);
  assert.equal(normalizeProcessExit(1, false), 0);
  assert.equal(normalizeProcessExit(1, true), 1);
  assert.equal(normalizeProcessExit(2, false), 2);
  assert.equal(normalizeProcessExit(2, true), 2);
});

test('runner executes fallback-only mode end to end and reports a passing gate suite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quality-gate-e2e-'));
  try {
    const outputPath = join(directory, 'output.txt');
    const summaryPath = join(directory, 'summary.md');
    const result = spawnSync(process.execPath, ['scripts/run-quality-gates-ci.mjs', '--fallback-only'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputPath, GITHUB_STEP_SUMMARY: summaryPath },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Quality gate input mode: fallback-only/);
    assert.match(result.stdout, /Overall Score: 100\.0%/);
    assert.match(await readFile(outputPath, 'utf8'), /gate_exit_code=0/);
    assert.match(await readFile(outputPath, 'utf8'), /input_mode=fallback-only/);
    assert.match(await readFile(summaryPath, 'utf8'), /Quality Gate CI Report/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runner fails closed end to end when protected fixtures are invalid', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quality-gate-e2e-invalid-'));
  try {
    await writeFile(join(directory, 'invalid.json'), '{invalid', 'utf8');
    const result = spawnSync(process.execPath, [
      'scripts/run-quality-gates-ci.mjs',
      `--protected-dir=${directory}`,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Cannot read protected fixture invalid.json/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
