import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJsonlLedger } from '../src/io.js';

test('readJsonlLedger preserves complete records and rejects a truncated tail', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lunum-ledger-'));
  const file = path.join(directory, 'items.jsonl');
  try {
    await writeFile(file, '{"id":"one"}\n{"id":"two"}\n', 'utf8');
    assert.deepEqual(await readJsonlLedger<{ id: string }>(file), [{ id: 'one' }, { id: 'two' }]);
    await writeFile(file, '{"id":"one"}\n{"id":"two"', 'utf8');
    await assert.rejects(readJsonlLedger(file), /Malformed JSONL ledger.*refusing resume/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
