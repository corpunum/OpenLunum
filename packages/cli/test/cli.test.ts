import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('CLI inspect returns a non-semantic surface record', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.resolve(here, '../src/cli.js');
  const result = spawnSync(process.execPath, [cli, 'inspect', '--text', 'Hello world'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout) as { lunumMeta: { semantic: boolean } };
  assert.equal(value.lunumMeta.semantic, false);
});
