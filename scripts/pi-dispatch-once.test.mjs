import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('scripts/pi-dispatch-once.sh');
const assignedBranch = 'work/dispatcher/296-enforce-assigned-branch';

async function withTempDir(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'openlunum-dispatch-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'OpenLunum Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'OpenLunum Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });

  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  return result;
}

async function setupGitRepo(root) {
  const origin = path.join(root, 'origin.git');
  const workdir = path.join(root, 'worktree');
  await mkdir(workdir, { recursive: true });

  runGit(['init', '--bare', origin], root);
  runGit(['init'], workdir);
  runGit(['checkout', '-b', 'main'], workdir);
  runGit(['config', 'user.name', 'OpenLunum Test'], workdir);
  runGit(['config', 'user.email', 'test@example.com'], workdir);
  await writeFile(path.join(workdir, 'README.md'), 'openlunum\n', 'utf8');
  await writeFile(
    path.join(workdir, '.gitignore'),
    [
      'reports/orchestrator/WORKER_ASSIGNMENT.md',
      'reports/orchestrator/assignments/',
      'reports/orchestrator/worker-runs/',
      'reports/orchestrator/status.log',
      'reports/orchestrator/last-llm-advice.txt',
      'reports/orchestrator/stale-prs.log',
      'reports/orchestrator/velocity.csv',
      'reports/orchestrator/NEEDS_CLOUD',
      '',
    ].join('\n'),
    'utf8',
  );
  runGit(['add', 'README.md'], workdir);
  runGit(['add', '.gitignore'], workdir);
  runGit(['commit', '-m', 'initial commit'], workdir);
  runGit(['remote', 'add', 'origin', origin], workdir);
  runGit(['push', '-u', 'origin', 'main'], workdir);

  return { origin, workdir };
}

async function writeAssignment(workdir, overrides = {}) {
  const assignmentDir = path.join(workdir, 'reports/orchestrator');
  await mkdir(assignmentDir, { recursive: true });
  const assignment = {
    assignment_id: 'dispatch-296',
    issue: '296',
    worker: 'dispatcher',
    branch: assignedBranch,
    tier: '2',
    ...overrides,
  };

  await writeFile(
    path.join(assignmentDir, 'WORKER_ASSIGNMENT.md'),
    [
      `assignment_id: ${assignment.assignment_id}`,
      `issue: ${assignment.issue}`,
      `worker: ${assignment.worker}`,
      `branch: ${assignment.branch}`,
      `tier: ${assignment.tier}`,
      '',
    ].join('\n'),
    'utf8',
  );

  return path.join(assignmentDir, 'WORKER_ASSIGNMENT.md');
}

async function writeFakePi(root, body) {
  const binDir = path.join(root, 'bin');
  await mkdir(binDir, { recursive: true });
  const marker = path.join(root, 'pi-invoked.marker');
  const pi = path.join(binDir, 'pi');
  await writeFile(
    pi,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${FAKE_PI_MARKER:-}" ]]; then
  : >"$FAKE_PI_MARKER"
fi
${body}
`,
    'utf8',
  );
  await chmod(pi, 0o755);
  return { binDir, marker };
}

async function readArchivedAssignment(workdir) {
  const archiveDir = path.join(workdir, 'reports/orchestrator/assignments');
  const entries = await readdir(archiveDir, { withFileTypes: true });
  const file = entries.find(
    (entry) => entry.isFile() && entry.name.startsWith('dispatch-296-') && entry.name.endsWith('.md'),
  );

  assert.ok(file, `expected archived assignment in ${archiveDir}`);

  return readFile(path.join(archiveDir, file.name), 'utf8');
}

function dispatch(workdir, env = {}) {
  return spawnSync('bash', [script, workdir], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      OPENLUNUM_ASSIGNMENT_FILE:
        env.OPENLUNUM_ASSIGNMENT_FILE ??
        path.join(workdir, 'reports/orchestrator/WORKER_ASSIGNMENT.md'),
    },
  });
}

test('exits idle without invoking git or a model when no assignment exists', async () => {
  await withTempDir(async (workdir) => {
    const result = dispatch(workdir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /IDLE: no explicit worker assignment/);
  });
});

test('fails closed when the assigned branch is invalid', async () => {
  await withTempDir(async (workdir) => {
    await writeAssignment(workdir, { branch: 'main' });
    const result = dispatch(workdir);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /branch must match/);
  });
});

test('fails closed before branch creation when the starting worktree is dirty', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    await writeFile(path.join(workdir, 'dirty.txt'), 'dirty\n', 'utf8');
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(root, 'echo "unexpected pi invocation" >&2\nexit 88\n');

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /dirty starting worktree/);
    await assert.rejects(readFile(marker, 'utf8'));
  });
});

test('creates and checks out the assigned branch before invoking pi', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(
      root,
      `current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$EXPECTED_BRANCH" ]]; then
  echo "unexpected branch: $current_branch" >&2
  exit 91
fi
`,
    );

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
      EXPECTED_BRANCH: assignedBranch,
      PI_TIMEOUT_SECONDS: '30',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DISPATCH COMPLETE/);
    assert.equal(await readFile(marker, 'utf8'), '');
    assert.equal(
      spawnSync('git', ['branch', '--show-current'], {
        cwd: workdir,
        encoding: 'utf8',
      }).stdout.trim(),
      assignedBranch,
    );
  });
});

test('fails closed when a local branch already exists', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    runGit(['branch', assignedBranch], workdir);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(root, 'echo "unexpected pi invocation" >&2\nexit 88\n');

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /local branch already exists/);
    await assert.rejects(readFile(marker, 'utf8'));
  });
});

test('fails closed when a remote branch already exists', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    runGit(['push', 'origin', 'HEAD:refs/heads/' + assignedBranch], workdir);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(root, 'echo "unexpected pi invocation" >&2\nexit 88\n');

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /remote branch already exists/);
    await assert.rejects(readFile(marker, 'utf8'));
  });
});

test('fails closed when pi switches to a different branch', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(
      root,
      `git switch main >/dev/null
`,
    );

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
      PI_TIMEOUT_SECONDS: '30',
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /branch switched during worker dispatch/);
    assert.equal(await readFile(marker, 'utf8'), '');
    const archive = await readArchivedAssignment(workdir);
    assert.match(archive, /dispatch_exit_code: 0/);
    assert.match(archive, /dispatch_log: .*worker-runs\/dispatch-296-/);
  });
});

test('fails closed on unauthorized local branch mutation', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(
      root,
      `git branch side-channel >/dev/null
`,
    );

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
      PI_TIMEOUT_SECONDS: '30',
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /unauthorized local branch mutation detected/);
    assert.equal(await readFile(marker, 'utf8'), '');
    const archive = await readArchivedAssignment(workdir);
    assert.match(archive, /dispatch_exit_code: 0/);
    assert.match(archive, /dispatch_log: .*worker-runs\/dispatch-296-/);
  });
});

test('fails closed when worker exits nonzero and refs stay unchanged', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(root, 'exit 7\n');

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
      PI_TIMEOUT_SECONDS: '30',
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /worker dispatch exited with code 7/);
    assert.equal(await readFile(marker, 'utf8'), '');
  });
});

test('fails closed on practical remote mutation', async () => {
  await withTempDir(async (root) => {
    const { workdir } = await setupGitRepo(root);
    await writeAssignment(workdir);
    const { binDir, marker } = await writeFakePi(
      root,
      `git push origin HEAD:refs/heads/side-channel >/dev/null
`,
    );

    const result = dispatch(workdir, {
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_PI_MARKER: marker,
      PI_TIMEOUT_SECONDS: '30',
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /unauthorized remote branch mutation detected/);
    assert.equal(await readFile(marker, 'utf8'), '');
    const archive = await readArchivedAssignment(workdir);
    assert.match(archive, /dispatch_exit_code: 0/);
    assert.match(archive, /dispatch_log: .*worker-runs\/dispatch-296-/);
  });
});
