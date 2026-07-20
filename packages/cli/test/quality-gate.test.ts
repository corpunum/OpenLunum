import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fingerprintSem } from '@corpunum/lunum';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../src/cli.js');

function record02(predicate = 'test', sourceText = `${predicate} source`) {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate, roles: { subject: 'entity' }, negated: false }],
  };
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: sourceText, language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: fingerprintSem(sem),
    renderings: {},
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low',
      confidence: 1,
      reasons: ['test'],
    },
    meta: {},
  };
}

async function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'openlunum-cli-quality-gate-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('CLI quality-gate accepts a single record via --input file and exits 0 on pass', async () => {
  await withTempDir(async (directory) => {
    const file = path.join(directory, 'record.json');
    await writeFile(file, JSON.stringify(record02('file_input')), 'utf8');
    const result = spawnSync(process.execPath, [cli, 'quality-gate', '--input', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { exitCode: number; gates: Array<{ name: string }> };
    assert.equal(report.exitCode, 0);
    assert.ok(report.gates.length > 0);
  });
});

test('CLI quality-gate reads a JSON array from stdin', () => {
  const payload = JSON.stringify([record02('stdin_one'), record02('stdin_two')]);
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { exitCode: number };
  assert.equal(report.exitCode, 0);
});

test('CLI quality-gate reads a wrapped-object container ({records: [...]})', () => {
  const payload = JSON.stringify({ records: [record02('wrapped')] });
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI quality-gate reads JSONL (one record per line)', () => {
  const payload = `${JSON.stringify(record02('jsonl_one'))}\n${JSON.stringify(record02('jsonl_two'))}\n`;
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { exitCode: number };
  assert.equal(report.exitCode, 0);
});

test('CLI quality-gate rejects malformed JSON input with exit 2 and a stderr message', () => {
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: '{"recordVersion":' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /malformed JSON input/i);
});

test('CLI quality-gate rejects a structurally invalid record (valid JSON, fails schema) with exit 2', () => {
  const invalid = record02('invalid') as Record<string, unknown>;
  delete (invalid as any).policy;
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: JSON.stringify(invalid) });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /invalid record/i);
  assert.match(result.stderr, /record\.policy must be an object/);
});

test('CLI quality-gate fails the whole batch when only one record of many is invalid (no partial evaluation)', () => {
  const invalid = record02('invalid_two') as Record<string, unknown>;
  invalid.recordVersion = 'lunum-record/not-a-version';
  const payload = JSON.stringify([record02('valid_one'), invalid]);
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /record\[1\]/);
});

test('CLI quality-gate rejects an empty batch with exit 2', () => {
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: '[]' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /empty batch/i);
});

test('CLI quality-gate rejects empty stdin with exit 2', () => {
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: '' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Error:/);
});

test('CLI quality-gate exits 1 (warn) with --strict when a gate reports warnings, and 0 without --strict', () => {
  // A source long enough to land in PromptQualityGates' "approaching token
  // limit" warning band (>80% of the 4096-token default limit) without
  // exceeding it (which would be a hard failure instead of a warning).
  const longText = `warn ${'lorem ipsum dolor sit amet '.repeat(500)}`.slice(0, 14000);
  const payload = JSON.stringify(record02('warn_case', longText));

  const strict = spawnSync(process.execPath, [cli, 'quality-gate', '--strict'], { encoding: 'utf8', input: payload });
  assert.equal(strict.status, 1, strict.stderr);
  const strictReport = JSON.parse(strict.stdout) as { exitCode: number; warnings: string[] };
  assert.equal(strictReport.exitCode, 1);
  assert.ok(strictReport.warnings.length > 0);

  const nonStrict = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: payload });
  assert.equal(nonStrict.status, 0, nonStrict.stderr);
  const nonStrictReport = JSON.parse(nonStrict.stdout) as { exitCode: number };
  assert.equal(nonStrictReport.exitCode, 0);
});

test('CLI quality-gate exits 2 (fail) when a gate genuinely fails', () => {
  // An empty predicate is invalid per the CLI's own record-schema
  // validation, so use a record that passes CLI validation but is
  // engineered to fail a real quality gate: exceed the hard token limit.
  const tooLong = `fail ${'x'.repeat(20000)}`;
  const payload = JSON.stringify(record02('fail_case', tooLong));
  const result = spawnSync(process.execPath, [cli, 'quality-gate'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout) as { exitCode: number; gates: Array<{ name: string; passed: boolean }> };
  assert.equal(report.exitCode, 2);
  assert.ok(report.gates.some((gate) => gate.name === 'prompt-gates' && gate.passed === false));
});

test('CLI quality-gate writes --output atomically (temp file + rename, never a partial final file)', async () => {
  await withTempDir(async (directory) => {
    const outputPath = path.join(directory, 'report.json');
    const payload = JSON.stringify(record02('output_case'));
    const result = spawnSync(process.execPath, [cli, 'quality-gate', '--output', outputPath], { encoding: 'utf8', input: payload });
    assert.equal(result.status, 0, result.stderr);

    const entries = await import('node:fs/promises').then((fs) => fs.readdir(directory));
    assert.deepEqual(entries, ['report.json']);
    assert.ok(!entries.some((name) => name.includes('.tmp-')));

    const written = JSON.parse(await readFile(outputPath, 'utf8')) as { exitCode: number };
    assert.equal(written.exitCode, 0);
  });
});

test('CLI quality-gate does not leave a temp file behind when --output cannot be written', async () => {
  await withTempDir(async (directory) => {
    const outputPath = path.join(directory, 'missing-subdir', 'report.json');
    const payload = JSON.stringify(record02('output_failure_case'));
    const result = spawnSync(process.execPath, [cli, 'quality-gate', '--output', outputPath], { encoding: 'utf8', input: payload });
    assert.equal(result.status, 2);
    const entries = await import('node:fs/promises').then((fs) => fs.readdir(directory).catch(() => []));
    assert.deepEqual(entries, []);
  });
});

test('CLI quality-gate supports explicit --input - for stdin', () => {
  const payload = JSON.stringify(record02('explicit_stdin'));
  const result = spawnSync(process.execPath, [cli, 'quality-gate', '--input', '-'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI usage output mentions quality-gate', () => {
  const result = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /quality-gate/);
});

test('CLI quality-gate --format markdown delegates to the core markdown report', () => {
  const payload = JSON.stringify(record02('markdown_case'));
  const result = spawnSync(process.execPath, [cli, 'quality-gate', '--format', 'markdown'], { encoding: 'utf8', input: payload });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# Quality Gate CI Report/);
});
