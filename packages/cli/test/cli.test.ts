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

function record01(predicate = 'test') {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate, roles: { subject: 'entity' }, negated: false }],
    annotations: { confidence: 1 },
    provenance: { source: 'test' },
  };
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: `${predicate} source`, language: 'en', role: 'user', ref: null },
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

async function withTempFile(value: unknown, run: (file: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'openlunum-cli-'));
  const file = path.join(directory, 'records.json');
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    await run(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('CLI inspect returns a non-semantic surface record', () => {
  const result = spawnSync(process.execPath, [cli, 'inspect', '--text', 'Hello world'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout) as { lunumMeta: { semantic: boolean } };
  assert.equal(value.lunumMeta.semantic, false);
});

test('CLI migrate dry-run reports a full migration without changing bytes', async () => {
  await withTempFile(record01('dry_run'), async (file) => {
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2', '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(file, 'utf8'), before);

    const report = JSON.parse(result.stdout) as {
      dryRun: boolean;
      migrated: number;
      failed: number;
      results: Array<{ newRecordVersion: string; newSchema: string; newFingerprint: string }>;
    };
    assert.equal(report.dryRun, true);
    assert.equal(report.migrated, 1);
    assert.equal(report.failed, 0);
    assert.equal(report.results[0]?.newRecordVersion, 'lunum-record/0.2');
    assert.equal(report.results[0]?.newSchema, 'lunum-sem/0.2');
    assert.match(report.results[0]?.newFingerprint ?? '', /^lfp:0\.2:sha256:/);
  });
});

test('CLI migrate writes a complete forward migration', async () => {
  await withTempFile(record01('forward'), async (file) => {
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const migrated = JSON.parse(await readFile(file, 'utf8')) as ReturnType<typeof record01>;
    assert.equal(migrated.recordVersion, 'lunum-record/0.2');
    assert.equal(migrated.sem.schema, 'lunum-sem/0.2');
    assert.match(migrated.fingerprint, /^lfp:0\.2:sha256:/);
    assert.equal(migrated.sem.clauses[0]?.predicate, 'forward');
  });
});

test('CLI migrate supports a complete backward migration', async () => {
  await withTempFile(record01('round_trip'), async (file) => {
    const forward = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(forward.status, 0, forward.stderr);

    const backward = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.2', '--to', '0.1'], { encoding: 'utf8' });
    assert.equal(backward.status, 0, backward.stderr);

    const migrated = JSON.parse(await readFile(file, 'utf8')) as ReturnType<typeof record01>;
    assert.equal(migrated.recordVersion, 'lunum-record/0.1-draft');
    assert.equal(migrated.sem.schema, 'lunum-sem/0.1-draft');
    assert.match(migrated.fingerprint, /^lfp:0\.1:sha256:/);
  });
});

test('CLI migrate rejects unsupported directions without changing bytes', async () => {
  await withTempFile(record01('unsupported'), async (file) => {
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.2', '--to', '0.3'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsupported migration direction/);
    assert.equal(await readFile(file, 'utf8'), before);
  });
});

test('CLI migrate fails the whole batch and writes nothing when any source is invalid', async () => {
  const invalid = { ...record01('invalid'), recordVersion: 'lunum-record/0.2' };
  await withTempFile([record01('valid'), invalid], async (file) => {
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(await readFile(file, 'utf8'), before);

    const report = JSON.parse(result.stderr) as { migrated: number; failed: number };
    assert.equal(report.migrated, 1);
    assert.equal(report.failed, 1);
  });
});

test('CLI migrate rejects a malformed clause and leaves the source untouched', async () => {
  const malformed = record01('malformed');
  malformed.sem.clauses[0] = { predicate: '', roles: { subject: 'entity' }, negated: false };
  await withTempFile(malformed, async (file) => {
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.match(result.stderr, /clauses\[0\]\.predicate must be a non-empty string/);
  });
});

test('CLI migrate rejects a stale source fingerprint digest and leaves the source untouched', async () => {
  const stale = record01('stale');
  stale.fingerprint = `lfp:0.1:sha256:${'a'.repeat(32)}`;
  await withTempFile(stale, async (file) => {
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.match(result.stderr, /fingerprint digest does not match canonical semantic content/);
  });
});

test('CLI migrate rejects a source fingerprint from the wrong version and leaves the source untouched', async () => {
  const wrongVersion = record01('wrong_version');
  wrongVersion.fingerprint = wrongVersion.fingerprint.replace('lfp:0.1:', 'lfp:0.2:');
  await withTempFile(wrongVersion, async (file) => {
    const before = await readFile(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, 'migrate', file, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.match(result.stderr, /fingerprint version must equal 0\.1/);
  });
});
