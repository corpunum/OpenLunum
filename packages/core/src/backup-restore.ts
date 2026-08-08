import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, cp, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface FileChecksum {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface BackupManifest {
  id: string;
  version: string;
  createdAt: string;
  sourcePaths: string[];
  checksums: FileChecksum[];
  totalFiles: number;
  totalBytes: number;
}

export interface VerifyResult {
  valid: boolean;
  checkedFiles: number;
  mismatches: FileChecksum[];
  missing: string[];
}

export interface RestoreResult {
  success: boolean;
  restoredFiles: number;
  verification: VerifyResult;
}

export interface RollbackStep {
  action: 'restore' | 'verify' | 'cleanup';
  path: string;
  description: string;
}

export interface RollbackPlan {
  id: string;
  createdAt: string;
  steps: RollbackStep[];
  sourceManifest: BackupManifest;
}

export interface ExerciseResult {
  backupCreated: boolean;
  corruptionSimulated: boolean;
  restoreCompleted: boolean;
  verificationPassed: boolean;
  manifest: BackupManifest | null;
  restoreResult: RestoreResult | null;
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function generateId(): string {
  return `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function collectFiles(dir: string, base?: string): Promise<string[]> {
  const root = base ?? dir;
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, root)));
    } else if (entry.isFile()) {
      files.push(relative(root, full));
    }
  }
  return files;
}

export async function createBackup(
  sourcePaths: string[],
  outputDir: string,
): Promise<BackupManifest> {
  const id = generateId();
  const checksums: FileChecksum[] = [];
  let totalBytes = 0;

  await mkdir(outputDir, { recursive: true });

  for (const srcPath of sourcePaths) {
    const info = await stat(srcPath).catch(() => null);
    if (!info) continue;

    if (info.isDirectory()) {
      const files = await collectFiles(srcPath);
      for (const relPath of files) {
        const fullPath = join(srcPath, relPath);
        const content = await readFile(fullPath);
        const destPath = join(outputDir, relPath);
        await mkdir(join(destPath, '..'), { recursive: true });
        await writeFile(destPath, content);
        const hash = sha256(content);
        checksums.push({ path: relPath, sha256: hash, sizeBytes: content.length });
        totalBytes += content.length;
      }
    } else {
      const content = await readFile(srcPath);
      const relPath = relative(join(srcPath, '..'), srcPath);
      const destPath = join(outputDir, relPath);
      await mkdir(join(destPath, '..'), { recursive: true });
      await writeFile(destPath, content);
      const hash = sha256(content);
      checksums.push({ path: relPath, sha256: hash, sizeBytes: content.length });
      totalBytes += content.length;
    }
  }

  const manifest: BackupManifest = {
    id,
    version: '1.0',
    createdAt: new Date().toISOString(),
    sourcePaths,
    checksums,
    totalFiles: checksums.length,
    totalBytes,
  };

  await writeFile(
    join(outputDir, 'backup-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  return manifest;
}

export async function verifyBackup(
  manifest: BackupManifest,
  baseDir: string,
): Promise<VerifyResult> {
  const mismatches: FileChecksum[] = [];
  const missing: string[] = [];

  for (const entry of manifest.checksums) {
    const filePath = join(baseDir, entry.path);
    try {
      const content = await readFile(filePath);
      const hash = sha256(content);
      if (hash !== entry.sha256) {
        mismatches.push({ path: entry.path, sha256: hash, sizeBytes: content.length });
      }
    } catch {
      missing.push(entry.path);
    }
  }

  return {
    valid: mismatches.length === 0 && missing.length === 0,
    checkedFiles: manifest.checksums.length,
    mismatches,
    missing,
  };
}

export async function restoreFromBackup(
  manifest: BackupManifest,
  backupDir: string,
  targetDir: string,
): Promise<RestoreResult> {
  await mkdir(targetDir, { recursive: true });

  let restoredFiles = 0;
  for (const entry of manifest.checksums) {
    const srcPath = join(backupDir, entry.path);
    const destPath = join(targetDir, entry.path);
    await mkdir(join(destPath, '..'), { recursive: true });
    const content = await readFile(srcPath);
    await writeFile(destPath, content);
    restoredFiles++;
  }

  const verification = await verifyBackup(manifest, targetDir);

  return { success: verification.valid, restoredFiles, verification };
}

export function createRollbackPlan(
  manifest: BackupManifest,
  targetDir: string,
): RollbackPlan {
  const steps: RollbackStep[] = [];

  for (const entry of manifest.checksums) {
    steps.push({
      action: 'restore',
      path: join(targetDir, entry.path),
      description: `Restore ${entry.path} from backup`,
    });
  }

  steps.push({
    action: 'verify',
    path: targetDir,
    description: 'Verify all restored files match backup checksums',
  });

  steps.push({
    action: 'cleanup',
    path: targetDir,
    description: 'Clean up temporary restore artifacts',
  });

  return {
    id: `rollback-${Date.now()}`,
    createdAt: new Date().toISOString(),
    steps,
    sourceManifest: manifest,
  };
}

export async function executeRollback(
  plan: RollbackPlan,
  backupDir: string,
): Promise<RestoreResult> {
  const targetDir = plan.steps.find((s) => s.action === 'verify')?.path ?? '.';
  return restoreFromBackup(plan.sourceManifest, backupDir, targetDir);
}

export class BackupExercise {
  private sourceDir: string;
  private backupDir: string;
  private restoreDir: string;

  constructor(sourceDir: string, backupDir: string, restoreDir: string) {
    this.sourceDir = sourceDir;
    this.backupDir = backupDir;
    this.restoreDir = restoreDir;
  }

  async run(): Promise<ExerciseResult> {
    const result: ExerciseResult = {
      backupCreated: false,
      corruptionSimulated: false,
      restoreCompleted: false,
      verificationPassed: false,
      manifest: null,
      restoreResult: null,
    };

    const manifest = await createBackup([this.sourceDir], this.backupDir);
    result.manifest = manifest;
    result.backupCreated = true;

    if (manifest.checksums.length > 0) {
      const firstFile = join(this.sourceDir, manifest.checksums[0]!.path);
      await writeFile(firstFile, 'CORRUPTED DATA');
      result.corruptionSimulated = true;
    }

    const corruptionCheck = await verifyBackup(manifest, this.sourceDir);
    if (manifest.checksums.length > 0 && !corruptionCheck.valid) {
      result.corruptionSimulated = true;
    }

    const restoreResult = await restoreFromBackup(manifest, this.backupDir, this.restoreDir);
    result.restoreResult = restoreResult;
    result.restoreCompleted = restoreResult.success;
    result.verificationPassed = restoreResult.verification.valid;

    return result;
  }
}
