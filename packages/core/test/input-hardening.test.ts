import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBackup, restoreFromBackup, type BackupManifest } from '../src/backup-restore.js';
import { hashAgentState, detectTampering } from '../src/agent-state-tamper-evidence.js';
import type { AgentState } from '../src/agent-state.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const manifestFor = (path: string, content: string) =>
  ({ checksums: [{ path, sha256: sha(content), sizeBytes: content.length }] }) as unknown as BackupManifest;

test('backup: restore rejects a manifest path that leaves the directories and writes nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hard-'));
  try {
    const backup = join(root, 'backup');
    const target = join(root, 'target');
    await mkdir(backup, { recursive: true });
    await writeFile(join(root, 'outside.txt'), 'x');
    await writeFile(join(backup, 'ok.txt'), 'ok');
    const manifest = {
      checksums: [
        { path: 'ok.txt', sha256: sha('ok'), sizeBytes: 2 },
        { path: '../outside.txt', sha256: sha('x'), sizeBytes: 1 },
      ],
    } as unknown as BackupManifest;
    await assert.rejects(restoreFromBackup(manifest, backup, target), /escapes base directory/);
    await assert.rejects(readFile(join(target, 'ok.txt')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup: verify reports an escaping path as missing instead of reading it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hard-'));
  try {
    await mkdir(join(root, 'base'), { recursive: true });
    await writeFile(join(root, 'outside.txt'), 'x');
    const result = await verifyBackup(manifestFor('../outside.txt', 'x'), join(root, 'base'));
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ['../outside.txt']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tamper evidence: nested changes change the state hash; legacy hashes still verify', () => {
  const a = { planId: 'p', steps: [{ id: 1, note: 'a' }] } as unknown as AgentState;
  const b = { planId: 'p', steps: [{ id: 1, note: 'b' }] } as unknown as AgentState;
  assert.ok(hashAgentState(a).startsWith('v2:'));
  assert.notEqual(hashAgentState(a), hashAgentState(b));
  assert.equal(detectTampering(a, hashAgentState(a)).tampered, false);
  assert.equal(detectTampering(b, hashAgentState(a)).tampered, true);
  const legacy = createHash('sha256').update(JSON.stringify(a, Object.keys(a).sort())).digest('hex');
  assert.equal(detectTampering(a, legacy).tampered, false);
});
