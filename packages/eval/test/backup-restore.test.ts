import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createBackup,
  verifyBackup,
  restoreBackup,
  rollbackToBackup,
} from '../src/backup-restore.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'backup-restore-test-'));
}

describe('backup-restore', () => {
  it('createBackup produces manifest with correct file count and hashes', async () => {
    const srcDir = await makeTmpDir();
    const backupDir = await makeTmpDir();
    try {
      const fileA = path.join(srcDir, 'a.txt');
      const fileB = path.join(srcDir, 'b.txt');
      await writeFile(fileA, 'hello', 'utf8');
      await writeFile(fileB, 'world', 'utf8');

      const manifest = await createBackup([fileA, fileB], backupDir);

      assert.equal(manifest.version, '1.0');
      assert.equal(manifest.files.length, 2);
      assert.equal(manifest.totalBytes, 10); // 5 + 5
      for (const entry of manifest.files) {
        assert.ok(entry.sha256.length === 64);
        assert.ok(entry.sizeBytes > 0);
      }
    } finally {
      await rm(srcDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    }
  });

  it('verifyBackup passes for intact backup', async () => {
    const srcDir = await makeTmpDir();
    const backupDir = await makeTmpDir();
    try {
      const file = path.join(srcDir, 'data.txt');
      await writeFile(file, 'intact data', 'utf8');
      await createBackup([file], backupDir);

      const result = await verifyBackup(path.join(backupDir, 'manifest.json'));
      assert.equal(result.valid, true);
      assert.equal(result.missingFiles.length, 0);
      assert.equal(result.corruptFiles.length, 0);
    } finally {
      await rm(srcDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    }
  });

  it('verifyBackup detects missing file', async () => {
    const srcDir = await makeTmpDir();
    const backupDir = await makeTmpDir();
    try {
      const file = path.join(srcDir, 'gone.txt');
      await writeFile(file, 'will vanish', 'utf8');
      await createBackup([file], backupDir);

      // Remove the backed-up file
      await unlink(path.join(backupDir, 'gone.txt'));

      const result = await verifyBackup(path.join(backupDir, 'manifest.json'));
      assert.equal(result.valid, false);
      assert.equal(result.missingFiles.length, 1);
      assert.equal(result.missingFiles[0], 'gone.txt');
    } finally {
      await rm(srcDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    }
  });

  it('verifyBackup detects corrupted file', async () => {
    const srcDir = await makeTmpDir();
    const backupDir = await makeTmpDir();
    try {
      const file = path.join(srcDir, 'secret.txt');
      await writeFile(file, 'original', 'utf8');
      await createBackup([file], backupDir);

      // Corrupt the backed-up file
      await writeFile(path.join(backupDir, 'secret.txt'), 'tampered', 'utf8');

      const result = await verifyBackup(path.join(backupDir, 'manifest.json'));
      assert.equal(result.valid, false);
      assert.equal(result.corruptFiles.length, 1);
      assert.equal(result.corruptFiles[0], 'secret.txt');
    } finally {
      await rm(srcDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    }
  });

  it('restoreBackup restores files to new directory', async () => {
    const srcDir = await makeTmpDir();
    const backupDir = await makeTmpDir();
    const restoreDir = await makeTmpDir();
    try {
      const file = path.join(srcDir, 'restore-me.txt');
      await writeFile(file, 'precious data', 'utf8');
      await createBackup([file], backupDir);

      const result = await restoreBackup(
        path.join(backupDir, 'manifest.json'),
        restoreDir,
      );
      assert.equal(result.restored, true);
      assert.equal(result.filesRestored, 1);
      assert.equal(result.errors.length, 0);

      const content = await readFile(
        path.join(restoreDir, 'restore-me.txt'),
        'utf8',
      );
      assert.equal(content, 'precious data');
    } finally {
      await rm(srcDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      await rm(restoreDir, { recursive: true, force: true });
    }
  });

  it('rollbackToBackup restores and verifies', async () => {
    const srcDir = await makeTmpDir();
    const backupDir = await makeTmpDir();
    const targetDir = await makeTmpDir();
    try {
      const fileA = path.join(srcDir, 'x.txt');
      const fileB = path.join(srcDir, 'y.txt');
      await writeFile(fileA, 'alpha', 'utf8');
      await writeFile(fileB, 'beta', 'utf8');
      await createBackup([fileA, fileB], backupDir);

      const result = await rollbackToBackup(
        path.join(backupDir, 'manifest.json'),
        targetDir,
      );
      assert.equal(result.success, true);
      assert.equal(result.verification.valid, true);
      assert.equal(result.verification.missingFiles.length, 0);
      assert.equal(result.verification.corruptFiles.length, 0);
    } finally {
      await rm(srcDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it('empty file list produces empty manifest', async () => {
    const backupDir = await makeTmpDir();
    try {
      const manifest = await createBackup([], backupDir);
      assert.equal(manifest.version, '1.0');
      assert.equal(manifest.files.length, 0);
      assert.equal(manifest.totalBytes, 0);
    } finally {
      await rm(backupDir, { recursive: true, force: true });
    }
  });
});
