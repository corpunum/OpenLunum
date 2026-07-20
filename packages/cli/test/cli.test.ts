import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('CLI inspect returns a non-semantic surface record', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const result = spawnSync(process.execPath, [cli, 'inspect', '--text', 'Hello world'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout) as { lunumMeta: { semantic: boolean } };
  assert.equal(value.lunumMeta.semantic, false);
});

function makeRecord(id: string, semVersion: string): unknown {
  // Resolve the proper schema version string (0.1 maps to 0.1-draft, 0.2 maps to 0.2)
  const fullSchema = semVersion === '0.2' ? 'lunum-sem/0.2' : 'lunum-sem/0.1-draft';
  const fullRecordVersion = semVersion === '0.2' ? 'lunum-record/0.2' : 'lunum-record/0.1-draft';
  const fpVersion = semVersion === '0.2' ? '0.2' : '0.1';
  return {
    id,
    recordVersion: fullRecordVersion,
    source: { text: `Test record ${id}.`, language: 'en', role: 'user', ref: null },
    sem: { schema: fullSchema, world: 'real', kind: 'preference', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: id } }, negated: false }] },
    fingerprint: `lfp:${fpVersion}:sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    renderings: {},
    policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9 },
    meta: semVersion === '0.2' ? { schemaVersion: '0.2' } : {}
  };
}

test('CLI migrate: dry-run reports changes without modifying file', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  const filePath = path.join(tmpDir, 'record.json');
  await writeFile(filePath, JSON.stringify(makeRecord('dry-test', '0.1'), null, 2));

  const result = spawnSync(process.execPath, [cli, 'migrate', filePath, '--from', '0.1', '--to', '0.2', '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.dryRun, true);
  assert.equal(output.migrated, 1);
  assert.equal(output.total, 1);
  assert.equal(output.failed, 0);
  assert.equal(output.changes[0].oldSchema, 'lunum-sem/0.1-draft');
  assert.equal(output.changes[0].newSchema, 'lunum-sem/0.2');

  // File should be unchanged
  const unchanged = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(unchanged.sem.schema, 'lunum-sem/0.1-draft');

  await rm(tmpDir, { recursive: true, force: true });
});

test('CLI migrate: in-place migration upgrades schema, recordVersion, and fingerprint', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  const filePath = path.join(tmpDir, 'record.json');
  await writeFile(filePath, JSON.stringify(makeRecord('inplace-test', '0.1'), null, 2));

  const result = spawnSync(process.execPath, [cli, 'migrate', filePath, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.dryRun, false);
  assert.equal(output.migrated, 1);
  assert.equal(output.total, 1);

  // File should be updated
  const updated = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(updated.sem.schema, 'lunum-sem/0.2');
  assert.equal(updated.recordVersion, 'lunum-record/0.2');
  assert.ok(updated.fingerprint?.startsWith('lfp:0.2:'), 'fingerprint should be version 0.2');

  await rm(tmpDir, { recursive: true, force: true });
});

test('CLI migrate: backward migration (0.2 → 0.1) downgrades correctly', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  const filePath = path.join(tmpDir, 'record.json');
  await writeFile(filePath, JSON.stringify(makeRecord('backward-test', '0.2'), null, 2));

  const result = spawnSync(process.execPath, [cli, 'migrate', filePath, '--from', '0.2', '--to', '0.1'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.migrated, 1);

  const updated = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(updated.sem.schema, 'lunum-sem/0.1-draft');
  assert.equal(updated.recordVersion, 'lunum-record/0.1-draft');
  assert.ok(updated.fingerprint?.startsWith('lfp:0.1:'), 'fingerprint should be version 0.1');

  await rm(tmpDir, { recursive: true, force: true });
});

test('CLI migrate: array of records migrates all items', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  const filePath = path.join(tmpDir, 'records.json');
  await writeFile(filePath, JSON.stringify([makeRecord('a', '0.1'), makeRecord('b', '0.1')], null, 2));

  const result = spawnSync(process.execPath, [cli, 'migrate', filePath, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.migrated, 2);
  assert.equal(output.total, 2);

  const updated = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(updated.length, 2);
  assert.equal(updated[0].sem.schema, 'lunum-sem/0.2');
  assert.equal(updated[1].sem.schema, 'lunum-sem/0.2');

  await rm(tmpDir, { recursive: true, force: true });
});

test('CLI migrate: atomic write (temp file then rename)', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'lunum-migrate-'));
  const filePath = path.join(tmpDir, 'atomic-test.json');
  await writeFile(filePath, JSON.stringify(makeRecord('atomic', '0.1'), null, 2));

  const originalStat = (await import('node:fs').then(m => m.statSync))(filePath);
  const originalMtime = originalStat.mtimeMs;

  await new Promise<void>((resolve, reject) => {
    const result = spawnSync(process.execPath, [cli, 'migrate', filePath, '--from', '0.1', '--to', '0.2'], { encoding: 'utf8' });
    if (result.status === 0) resolve();
    else reject(new Error(result.stderr));
  });

  // File should have been updated with a newer mtime
  const newStat = (await import('node:fs').then(m => m.statSync(filePath)));
  assert.ok(newStat.mtimeMs > originalMtime, 'File mtime should have changed (atomic write)');

  // No temp file should remain
  const entries = (await import('node:fs').then(m => m.readdirSync(tmpDir)));
  assert.ok(entries.every(e => !e.endsWith('.tmp.')), 'No temp files should remain');

  await rm(tmpDir, { recursive: true, force: true });
});
