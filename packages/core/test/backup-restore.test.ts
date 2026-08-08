import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBackup,
  verifyBackup,
  restoreFromBackup,
  createRollbackPlan,
  executeRollback,
  BackupExercise,
} from '../src/backup-restore.js';

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function setupSourceDir(): Promise<string> {
  const dir = await makeTempDir('backup-src-');
  await writeFile(join(dir, 'config.json'), '{"key":"value"}');
  await writeFile(join(dir, 'data.txt'), 'important data');
  await mkdir(join(dir, 'sub'), { recursive: true });
  await writeFile(join(dir, 'sub', 'nested.txt'), 'nested content');
  return dir;
}

describe('backup-restore', () => {
  describe('createBackup', () => {
    it('produces valid manifest with checksums', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');

      const manifest = await createBackup([src], backupDir);

      assert.ok(manifest.id.startsWith('backup-'));
      assert.equal(manifest.version, '1.0');
      assert.equal(manifest.totalFiles, 3);
      assert.ok(manifest.totalBytes > 0);
      assert.equal(manifest.checksums.length, 3);

      for (const c of manifest.checksums) {
        assert.ok(c.sha256.length === 64);
        assert.ok(c.sizeBytes > 0);
      }

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    });

    it('handles empty source gracefully', async () => {
      const src = await makeTempDir('backup-empty-');
      const backupDir = await makeTempDir('backup-out-');

      const manifest = await createBackup([src], backupDir);

      assert.equal(manifest.totalFiles, 0);
      assert.equal(manifest.totalBytes, 0);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    });

    it('handles nonexistent source path', async () => {
      const backupDir = await makeTempDir('backup-out-');
      const manifest = await createBackup(['/nonexistent/path/xyz'], backupDir);
      assert.equal(manifest.totalFiles, 0);
      await rm(backupDir, { recursive: true, force: true });
    });
  });

  describe('verifyBackup', () => {
    it('passes for untampered backup', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');

      const manifest = await createBackup([src], backupDir);
      const result = await verifyBackup(manifest, backupDir);

      assert.equal(result.valid, true);
      assert.equal(result.checkedFiles, 3);
      assert.equal(result.mismatches.length, 0);
      assert.equal(result.missing.length, 0);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    });

    it('detects tampered files', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');

      const manifest = await createBackup([src], backupDir);
      await writeFile(join(backupDir, manifest.checksums[0]!.path), 'tampered');
      const result = await verifyBackup(manifest, backupDir);

      assert.equal(result.valid, false);
      assert.equal(result.mismatches.length, 1);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    });

    it('detects missing files', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');

      const manifest = await createBackup([src], backupDir);
      const emptyDir = await makeTempDir('backup-empty-');
      const result = await verifyBackup(manifest, emptyDir);

      assert.equal(result.valid, false);
      assert.equal(result.missing.length, 3);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('restoreFromBackup', () => {
    it('recovers original content', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');
      const restoreDir = await makeTempDir('backup-restore-');

      const manifest = await createBackup([src], backupDir);
      const result = await restoreFromBackup(manifest, backupDir, restoreDir);

      assert.equal(result.success, true);
      assert.equal(result.restoredFiles, 3);
      assert.equal(result.verification.valid, true);

      const restored = await readFile(join(restoreDir, 'data.txt'), 'utf-8');
      assert.equal(restored, 'important data');

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      await rm(restoreDir, { recursive: true, force: true });
    });
  });

  describe('createRollbackPlan', () => {
    it('generates correct step ordering', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');

      const manifest = await createBackup([src], backupDir);
      const plan = createRollbackPlan(manifest, '/target');

      assert.ok(plan.id.startsWith('rollback-'));
      const restoreSteps = plan.steps.filter((s) => s.action === 'restore');
      const verifySteps = plan.steps.filter((s) => s.action === 'verify');
      const cleanupSteps = plan.steps.filter((s) => s.action === 'cleanup');

      assert.equal(restoreSteps.length, 3);
      assert.equal(verifySteps.length, 1);
      assert.equal(cleanupSteps.length, 1);

      const verifyIdx = plan.steps.findIndex((s) => s.action === 'verify');
      const lastRestoreIdx = plan.steps.map((s, i) => s.action === 'restore' ? i : -1).filter((i) => i >= 0).pop()!;
      assert.ok(verifyIdx > lastRestoreIdx);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    });
  });

  describe('executeRollback', () => {
    it('restores from rollback plan', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-out-');
      const restoreDir = await makeTempDir('backup-rollback-');

      const manifest = await createBackup([src], backupDir);
      const plan = createRollbackPlan(manifest, restoreDir);
      const result = await executeRollback(plan, backupDir);

      assert.equal(result.success, true);
      assert.equal(result.verification.valid, true);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      await rm(restoreDir, { recursive: true, force: true });
    });
  });

  describe('BackupExercise', () => {
    it('full cycle: backup → corrupt → restore → verify', async () => {
      const src = await setupSourceDir();
      const backupDir = await makeTempDir('backup-exercise-bak-');
      const restoreDir = await makeTempDir('backup-exercise-restore-');

      const exercise = new BackupExercise(src, backupDir, restoreDir);
      const result = await exercise.run();

      assert.equal(result.backupCreated, true);
      assert.equal(result.corruptionSimulated, true);
      assert.equal(result.restoreCompleted, true);
      assert.equal(result.verificationPassed, true);
      assert.ok(result.manifest !== null);
      assert.ok(result.restoreResult !== null);

      await rm(src, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      await rm(restoreDir, { recursive: true, force: true });
    });
  });
});
