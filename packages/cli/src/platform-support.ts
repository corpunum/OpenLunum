import os from 'node:os';
import { execSync } from 'node:child_process';

export type SupportTier = 'primary' | 'secondary' | 'unsupported';

export interface PlatformEntry {
  os: string;
  arch: string[];
  tier: SupportTier;
  notes: string;
  minNodeVersion: number;
}

export const PLATFORM_MATRIX: readonly PlatformEntry[] = Object.freeze([
  {
    os: 'linux',
    arch: ['x64', 'arm64'],
    tier: 'primary',
    notes: 'Fully tested in CI (Ubuntu 22.04/24.04). Primary development platform.',
    minNodeVersion: 22,
  },
  {
    os: 'darwin',
    arch: ['x64', 'arm64'],
    tier: 'secondary',
    notes: 'Expected to work but not tested in CI. No known platform-specific code.',
    minNodeVersion: 22,
  },
  {
    os: 'win32',
    arch: ['x64'],
    tier: 'secondary',
    notes: 'Expected to work via Node.js but path handling may differ. Not tested in CI.',
    minNodeVersion: 22,
  },
]);

export interface PlatformCheckResult {
  platform: string;
  arch: string;
  nodeVersion: string;
  nodeMajor: number;
  tier: SupportTier;
  supported: boolean;
  warnings: string[];
}

export function detectPlatform(): PlatformCheckResult {
  const platform = os.platform();
  const arch = os.arch();
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);

  const entry = PLATFORM_MATRIX.find(
    e => e.os === platform && e.arch.includes(arch),
  );

  const warnings: string[] = [];

  if (!entry) {
    warnings.push(`Platform ${platform}/${arch} is not in the supported matrix.`);
  }

  if (nodeMajor < 22) {
    warnings.push(`Node.js ${nodeVersion} is below minimum required version 22.`);
  }

  if (entry?.tier === 'secondary') {
    warnings.push(`Platform ${platform}/${arch} is secondary-tier: ${entry.notes}`);
  }

  return {
    platform,
    arch,
    nodeVersion,
    nodeMajor,
    tier: entry?.tier ?? 'unsupported',
    supported: entry !== undefined && nodeMajor >= 22,
    warnings,
  };
}

export function checkShellAvailability(): { shell: string; available: boolean } {
  const platform = os.platform();
  const shell = platform === 'win32' ? 'cmd.exe' : '/bin/sh';

  try {
    execSync(`${platform === 'win32' ? 'echo ok' : 'echo ok'}`, {
      shell,
      stdio: 'pipe',
      timeout: 5000,
    });
    return { shell, available: true };
  } catch {
    return { shell, available: false };
  }
}

export function getPlatformDegradations(platform: string): string[] {
  const degradations: string[] = [];

  if (platform === 'win32') {
    degradations.push('Path separators: backslash used natively; normalize with path.posix for fingerprints');
    degradations.push('File locking: advisory locks may behave differently than POSIX');
    degradations.push('Signal handling: SIGTERM/SIGHUP may not be available');
  }

  if (platform === 'darwin') {
    degradations.push('File system: case-insensitive by default (HFS+/APFS); case-sensitive paths may collide');
  }

  return degradations;
}

export function generatePlatformReport(): string {
  const check = detectPlatform();
  const shell = checkShellAvailability();
  const degradations = getPlatformDegradations(check.platform);

  const lines: string[] = [
    `Platform: ${check.platform}/${check.arch}`,
    `Node.js: ${check.nodeVersion}`,
    `Support tier: ${check.tier}`,
    `Supported: ${check.supported}`,
    `Shell: ${shell.shell} (${shell.available ? 'available' : 'unavailable'})`,
  ];

  if (check.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of check.warnings) lines.push(`  - ${w}`);
  }

  if (degradations.length > 0) {
    lines.push('Known degradations:');
    for (const d of degradations) lines.push(`  - ${d}`);
  }

  return lines.join('\n');
}
