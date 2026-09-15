import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repo = path.resolve('.');
const script = path.join(repo, 'scripts/agent-eval/run-tier2.sh');

function run(provider, model = 'provider/model') {
  return spawnSync('bash', [script, model], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, OPENLUNUM_PI_PROVIDER: provider },
  });
}

test('tier-2 evaluator rejects missing or local provider before setup', () => {
  const missing = spawnSync('bash', [script, 'provider/model'], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, OPENLUNUM_PI_PROVIDER: '' },
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /OPENLUNUM_PI_PROVIDER is required/);

  const local = run('local-llama');
  assert.equal(local.status, 2);
  assert.match(local.stderr, /disallowed Pi provider/);
});

test('tier-2 evaluator rejects local endpoint/model before setup', () => {
  const result = run('openai-codex', 'local-llama');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /disallowed or malformed cloud model selection/);
});
