import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Extract only the json_get helper from the script and run it in bash.
function jsonGet(json, field, def, marker) {
  const script = `eval "$(sed -n '/^json_get() {/,/^}/p' scripts/verify-audit-endpoints.sh)"; json_get "$1" "$2" "$3"`;
  return spawnSync('bash', ['-c', script, 'x', json, field, def], { encoding: 'utf8' });
}

test('json_get reads a field from valid input', () => {
  assert.equal(jsonGet('{"model":"m1"}', 'model', 'd').stdout.trim(), 'm1');
});

test('json_get rejects malformed input without executing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jg-'));
  const marker = join(dir, 'marker');
  const bad = `{"a":"x"}''')\n  import os\n  os.system('touch ${marker}')\n  ('''`;
  const r = jsonGet(bad, 'a', 'dflt');
  assert.equal(r.stdout.trim(), 'dflt');
  assert.equal(existsSync(marker), false);
  rmSync(dir, { recursive: true, force: true });
});
