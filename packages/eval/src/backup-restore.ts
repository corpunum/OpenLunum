import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Describes a single file in a backup. */
export interface BackupFileEntry {
  relativePath: string;
  sha256: string;
  sizeBytes: number;
}

/** Top-level manifest written to the backup directory. */
export interface BackupManifest {
  version: '1.0';
  timestamp: string;
  files: BackupFileEntry[];
  totalBytes: number;
}

/** Result of verifying a backup against its manifest. */
export interface BackupVerification {
  valid: boolean;
  missingFiles: string[];
  corruptFiles: string[];
}

/** Result of restoring files from a backup. */
export interface RestoreResult {
  restored: boolean;
  filesRestored: number;
  errors: string[];
}

/** Result of a rollback operation. */
export interface RollbackResult {
  success: boolean;
  verification: BackupVerification;
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/**
 * Copies each source file into `targetDir` preserving relative paths,
 * computes SHA-256 hashes, and writes a `manifest.json`.
 */
export async function createBackup(
  sourcePaths: string[],
  targetDir: string,
): Promise<BackupManifest> {
  await mkdir(targetDir, { recursive: true });

  const files: BackupFileEntry[] = [];
  let totalBytes = 0;

  for (const src of sourcePaths) {
    const relativePath = path.basename(src);
    const dest = path.join(targetDir, relativePath);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(src, dest);
    const hash = await sha256(dest);
    const info = await stat(dest);
    files.push({ relativePath, sha256: hash, sizeBytes: info.size });
    totalBytes += info.size;
  }

  const manifest: BackupManifest = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    files,
    totalBytes,
  };

  await writeFile(
    path.join(targetDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

/**
 * Reads a backup manifest and verifies every listed file still exists
 * with a matching SHA-256 hash.
 */
export async function verifyBackup(
  manifestPath: string,
): Promise<BackupVerification> {
  const backupDir = path.dirname(manifestPath);
  const manifest: BackupManifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  );

  const missingFiles: string[] = [];
  const corruptFiles: string[] = [];

  for (const entry of manifest.files) {
    const filePath = path.join(backupDir, entry.relativePath);
    try {
      const hash = await sha256(filePath);
      if (hash !== entry.sha256) {
        corruptFiles.push(entry.relativePath);
      }
    } catch {
      missingFiles.push(entry.relativePath);
    }
  }

  return {
    valid: missingFiles.length === 0 && corruptFiles.length === 0,
    missingFiles,
    corruptFiles,
  };
}

/**
 * Copies every file listed in a backup manifest into `targetDir`
 * and verifies integrity after the copy.
 */
export async function restoreBackup(
  manifestPath: string,
  targetDir: string,
): Promise<RestoreResult> {
  const backupDir = path.dirname(manifestPath);
  const manifest: BackupManifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  );

  const errors: string[] = [];
  let filesRestored = 0;

  for (const entry of manifest.files) {
    const src = path.join(backupDir, entry.relativePath);
    const dest = path.join(targetDir, entry.relativePath);
    try {
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      const hash = await sha256(dest);
      if (hash !== entry.sha256) {
        errors.push(`Integrity mismatch after copy: ${entry.relativePath}`);
      } else {
        filesRestored++;
      }
    } catch (err) {
      errors.push(
        `Failed to restore ${entry.relativePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    restored: errors.length === 0,
    filesRestored,
    errors,
  };
}

/**
 * Restores files from backup into `targetDir` and then verifies
 * the target state matches the manifest.
 */
export async function rollbackToBackup(
  manifestPath: string,
  targetDir: string,
): Promise<RollbackResult> {
  await restoreBackup(manifestPath, targetDir);

  // Build a temporary manifest pointing at the target directory to verify
  const backupDir = path.dirname(manifestPath);
  const manifest: BackupManifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  );

  // Write a copy of the manifest into targetDir so verifyBackup can work
  const targetManifestPath = path.join(targetDir, 'manifest.json');
  await writeFile(
    targetManifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  const verification = await verifyBackup(targetManifestPath);

  return {
    success: verification.valid,
    verification,
  };
}
