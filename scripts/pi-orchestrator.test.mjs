import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('scripts/pi-orchestrator.sh');

test('STUCK recovery preserves dirty tracked edits in the stash', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-orch-'));
  try {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'a@example.test');
    git('config', 'user.name', 'tester');
    await writeFile(path.join(dir, 'file.txt'), 'one\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    await writeFile(path.join(dir, 'file.txt'), 'local edit\n');
    await mkdir(path.join(dir, 'reports/pi-loop'), { recursive: true });
    await mkdir(path.join(dir, 'reports/orchestrator'), { recursive: true });
    await writeFile(path.join(dir, 'reports/pi-loop/STUCK'), 'failure_count: 3\n');
    const bin = path.join(dir, 'bin');
    await mkdir(bin);
    for (const name of ['gh', 'systemctl', 'notify-send']) {
      await writeFile(path.join(bin, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    }
    spawnSync('bash', [script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, OPENLUNUM_REPO: dir, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.match(git('stash', 'list').stdout, /orchestrator-autofix/);
    assert.match(git('stash', 'show', '-p').stdout, /local edit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
