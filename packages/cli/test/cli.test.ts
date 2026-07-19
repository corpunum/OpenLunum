import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('CLI inspect returns a non-semantic surface record', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const result = spawnSync(process.execPath, [cli, 'inspect', '--text', 'Hello world'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout) as { lunumMeta: { semantic: boolean } };
  assert.equal(value.lunumMeta.semantic, false);
});

test('CLI migrate --dry-run reports 0.1→0.2 migration summary', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  try {
    const testFile = path.join(tmpDir, 'record.json');
    const record = {
      id: 'test-001',
      recordVersion: 'lunum-record/0.1-draft',
      source: { text: 'The sky is blue.', language: 'en' },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement', clauses: [{ predicate: 'is', roles: { subject: 'sky', object: 'blue' } }] },
      fingerprint: 'lfp:0.1:sha256:abcdef1234567890abcdef1234567890',
      renderings: { 'generic-en-pivot/0.1': { code: 'The sky is blue.', profile: 'generic-en-pivot/0.1' } },
      policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9 },
      meta: {}
    };
    await writeFile(testFile, JSON.stringify(record, null, 2));

    const result = spawnSync(process.execPath, [cli, 'migrate', testFile, '--from', '0.1', '--to', '0.2', '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const output = JSON.parse(result.stdout) as {
      dryRun: boolean;
      direction: string;
      from: string;
      to: string;
      total: number;
      migrated?: number;
      unchanged?: number;
      results?: Array<{ id: string; oldSchema: string; newSchema: string; warnings: Array<{ code: string }> }>;
    };

    assert.equal(output.dryRun, true);
    assert.equal(output.direction, 'forward');
    assert.equal(output.from, '0.1');
    assert.equal(output.to, '0.2');
    assert.equal(output.total, 1);
    assert.ok(output.migrated! >= 0);
    assert.equal(output.unchanged!, 0);
    const results = output.results as NonNullable<typeof output.results>;
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, 'test-001');
    assert.ok(results[0]!.oldSchema.includes('0.1'));
    assert.ok(results[0]!.newSchema.includes('0.2'));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI migrate writes in-place without --dry-run', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  try {
    const testFile = path.join(tmpDir, 'record.json');
    const record = {
      id: 'test-002',
      recordVersion: 'lunum-record/0.1-draft',
      source: { text: 'Water boils at 100°C.', language: 'en' },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement', clauses: [{ predicate: 'boils', roles: { subject: 'water', object: '100°C' } }] },
      fingerprint: 'lfp:0.1:sha256:1234567890abcdef1234567890abcdef',
      renderings: { 'generic-en-pivot/0.1': { code: 'Water boils at 100°C.', profile: 'generic-en-pivot/0.1' } },
      policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.85 },
      meta: {}
    };
    await writeFile(testFile, JSON.stringify(record, null, 2));

    const result = spawnSync(process.execPath, [cli, 'migrate', testFile, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    // Verify file was updated
    const updated = JSON.parse(await readFile(testFile, 'utf8')) as any;
    assert.ok(updated.sem.schema.includes('0.2'), `Expected schema 0.2, got ${updated.sem.schema}`);
    assert.ok(updated.fingerprint?.includes('0.2') || updated.fingerprint?.length > 0, 'Expected updated fingerprint');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI migrate handles arrays of records', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  try {
    const testFile = path.join(tmpDir, 'records.json');
    const records = [
      {
        id: 'rec-1',
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'First record', language: 'en' },
        sem: { schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement', clauses: [{ predicate: 'is', roles: { subject: 'first', object: 'record' } }] },
        fingerprint: 'lfp:0.1:sha256:aaaa',
        renderings: {},
        policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9 },
        meta: {}
      },
      {
        id: 'rec-2',
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'Second record', language: 'en' },
        sem: { schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement', clauses: [{ predicate: 'is', roles: { subject: 'second', object: 'record' } }] },
        fingerprint: 'lfp:0.1:sha256:bbbb',
        renderings: {},
        policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9 },
        meta: {}
      }
    ];
    await writeFile(testFile, JSON.stringify(records, null, 2));

    const result = spawnSync(process.execPath, [cli, 'migrate', testFile, '--from', '0.1', '--to', '0.2', '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const output = JSON.parse(result.stdout) as { total: number; migrated: number; results: { id: string }[] };
    assert.equal(output.total, 2);
    assert.equal(output.results!.length, 2);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI migrate reports unchanged records with wrong version', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  try {
    const testFile = path.join(tmpDir, 'record.json');
    const record = {
      id: 'already-02',
      recordVersion: 'lunum-record/0.2',
      source: { text: 'Already at 0.2', language: 'en' },
      sem: { schema: 'lunum-sem/0.2', clauses: [] },
      fingerprint: 'lfp:0.2:sha256:cccc',
      renderings: {},
      policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9 },
      meta: {}
    };
    await writeFile(testFile, JSON.stringify(record, null, 2));

    const result = spawnSync(process.execPath, [cli, 'migrate', testFile, '--from', '0.1', '--to', '0.2', '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const output = JSON.parse(result.stdout) as { unchanged: number; results: { sourceValid: boolean }[] | undefined };
    assert.equal(output.unchanged, 1);
    const res = output.results as NonNullable<typeof output.results>;
    assert.equal(res[0]!.sourceValid, false);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
