/**
 * End-to-end tests exercising the CLI from built artifacts (R11.6).
 *
 * Runs the compiled CLI binary (dist/src/cli.js) as a subprocess,
 * verifying parse, encode, validate, fingerprint, and streaming
 * commands produce correct output and exit codes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.js');
const NODE = process.execPath;

function runCli(args: string[], opts?: { input?: string; cwd?: string }): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync(NODE, [CLI_PATH, ...args], {
      encoding: 'utf8',
      input: opts?.input,
      cwd: opts?.cwd,
      timeout: 15_000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? '', exitCode: err.status ?? 1 };
  }
}

function makeTempDir(): string {
  const dir = join(tmpdir(), `lunum-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const VALID_SEM = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'fact',
  clauses: [{
    predicate: 'location',
    roles: { subject: { type: 'entity', id: 'paris' } },
    negated: false,
  }],
  references: [],
  provenance: { source: 'test', timestamp: '2026-01-01T00:00:00Z' },
  annotations: {},
};

describe('e2e installed CLI', () => {
  it('contract command outputs valid JSON with version and commands', () => {
    const { stdout, exitCode } = runCli(['contract']);
    assert.equal(exitCode, 0);
    const manifest = JSON.parse(stdout);
    assert.ok(manifest.version);
    assert.ok(Array.isArray(manifest.commands));
    assert.ok(manifest.commands.length > 0);
  });

  it('encode command validates and fingerprints a sem file', () => {
    const dir = makeTempDir();
    try {
      const semPath = join(dir, 'test.sem.json');
      writeFileSync(semPath, JSON.stringify(VALID_SEM));
      const { stdout, exitCode } = runCli(['encode', '--sem', semPath]);
      assert.equal(exitCode, 0);
      const result = JSON.parse(stdout);
      assert.ok(result.fingerprint, 'Expected fingerprint in output');
      assert.ok(result.rendering, 'Expected rendering in output');
      assert.deepEqual(result.sem.schema, 'lunum-sem/0.1-draft');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('encode command fails with non-zero exit for invalid sem', () => {
    const dir = makeTempDir();
    try {
      const semPath = join(dir, 'bad.sem.json');
      writeFileSync(semPath, JSON.stringify({ schema: 'wrong', world: 'real' }));
      const { exitCode } = runCli(['encode', '--sem', semPath]);
      assert.notEqual(exitCode, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('inspect command produces sidecar JSON', () => {
    const { stdout, exitCode } = runCli(['inspect', '--text', 'Paris is the capital of France']);
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.ok(result, 'Expected JSON output from inspect');
  });

  it('compile command produces context output', () => {
    const dir = makeTempDir();
    try {
      const messagesPath = join(dir, 'messages.json');
      writeFileSync(messagesPath, JSON.stringify([
        { role: 'user', content: 'Hello world' },
      ]));
      const { stdout, exitCode } = runCli(['compile', '--messages', messagesPath]);
      assert.equal(exitCode, 0);
      const result = JSON.parse(stdout);
      assert.ok(result, 'Expected compiled context output');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('process-jsonl validates line-by-line', () => {
    const dir = makeTempDir();
    try {
      const jsonlPath = join(dir, 'input.jsonl');
      writeFileSync(jsonlPath, JSON.stringify({ sem: VALID_SEM }) + '\n');
      const { stdout, exitCode } = runCli(['process-jsonl', '--input', jsonlPath, '--operation', 'validate']);
      assert.equal(exitCode, 0);
      const line = JSON.parse(stdout.trim().split('\n')[0]!);
      assert.ok('ok' in line, 'Expected ok field in validation output');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('process-jsonl fingerprints line-by-line', () => {
    const dir = makeTempDir();
    try {
      const jsonlPath = join(dir, 'input.jsonl');
      writeFileSync(jsonlPath, JSON.stringify({ sem: VALID_SEM }) + '\n');
      const { stdout, exitCode } = runCli(['process-jsonl', '--input', jsonlPath, '--operation', 'fingerprint']);
      assert.equal(exitCode, 0);
      const line = JSON.parse(stdout.trim().split('\n')[0]!);
      assert.ok(line.ok === true, 'Expected ok=true for valid fingerprint');
      assert.ok(line.output?.fingerprint, 'Expected fingerprint in output');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unknown command exits with non-zero code', () => {
    const { exitCode } = runCli(['nonexistent-command']);
    assert.notEqual(exitCode, 0);
  });

  it('encode without --sem flag exits with error', () => {
    const { exitCode } = runCli(['encode']);
    assert.notEqual(exitCode, 0);
  });

  it('process-jsonl with multi-line JSONL processes all lines', () => {
    const dir = makeTempDir();
    try {
      const jsonlPath = join(dir, 'multi.jsonl');
      const lines = [JSON.stringify({ sem: VALID_SEM }), JSON.stringify({ sem: VALID_SEM }), JSON.stringify({ sem: VALID_SEM })];
      writeFileSync(jsonlPath, lines.join('\n') + '\n');
      const { stdout, exitCode } = runCli(['process-jsonl', '--input', jsonlPath, '--operation', 'validate']);
      assert.equal(exitCode, 0);
      const outputLines = stdout.trim().split('\n').filter(l => l.length > 0);
      assert.equal(outputLines.length, 3, 'Expected 3 output lines for 3 input lines');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
