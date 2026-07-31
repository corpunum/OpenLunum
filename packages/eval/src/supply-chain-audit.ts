/**
 * Dependency, provenance and supply-chain controls.
 *
 * Implements R15.4: lockfile integrity verification, dependency
 * provenance auditing, known-vulnerability checking, and artifact
 * integrity verification via SHA-256.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

// ── Types ──────────────────────────────────────────────────────────

export interface LockfileVerification {
  readonly exists: boolean;
  readonly nonEmpty: boolean;
  readonly valid: boolean;
}

export interface PackageDep {
  readonly name: string;
  readonly version: string;
  readonly registry: string;
}

export interface ProvenanceReport {
  readonly total: number;
  readonly knownRegistry: number;
  readonly unknownRegistry: readonly PackageDep[];
  readonly allKnown: boolean;
}

export interface KnownVulnerability {
  readonly package: string;
  readonly versionRange: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
}

export interface VulnerablePackage {
  readonly dep: PackageDep;
  readonly vulnerability: KnownVulnerability;
}

export interface VulnerabilityReport {
  readonly checked: number;
  readonly vulnerable: readonly VulnerablePackage[];
  readonly clean: boolean;
}

export interface ArtifactVerification {
  readonly path: string;
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly matches: boolean;
}

export interface SupplyChainReport {
  readonly lockfile: LockfileVerification;
  readonly provenance: ProvenanceReport;
  readonly vulnerabilities: VulnerabilityReport;
  readonly artifacts: readonly ArtifactVerification[];
}

// ── Known registries ───────────────────────────────────────────────

const KNOWN_REGISTRIES: ReadonlySet<string> = new Set(['npmjs', 'github']);

// ── Known vulnerabilities (example entries) ────────────────────────

export const KNOWN_VULNERABILITIES: readonly KnownVulnerability[] = [
  {
    package: 'evil-logger',
    versionRange: '*',
    severity: 'critical',
    description: 'Exfiltrates environment variables to a remote server',
  },
  {
    package: 'bad-parser',
    versionRange: '>=1.0.0',
    severity: 'high',
    description: 'Remote code execution via crafted input',
  },
  {
    package: 'leaky-cache',
    versionRange: '<2.0.0',
    severity: 'medium',
    description: 'Sensitive data written to world-readable temp files',
  },
  {
    package: 'shady-crypto',
    versionRange: '*',
    severity: 'high',
    description: 'Uses broken hash algorithm for signature verification',
  },
];

// ── Lockfile integrity ─────────────────────────────────────────────

export async function verifyLockfileIntegrity(lockfilePath: string): Promise<LockfileVerification> {
  try {
    const info = await stat(lockfilePath);
    const exists = info.isFile();
    const nonEmpty = exists && info.size > 0;
    return { exists, nonEmpty, valid: exists && nonEmpty };
  } catch {
    return { exists: false, nonEmpty: false, valid: false };
  }
}

// ── Dependency provenance ──────────────────────────────────────────

export function auditDependencyProvenance(deps: readonly PackageDep[]): ProvenanceReport {
  const unknownRegistry: PackageDep[] = [];
  for (const dep of deps) {
    if (!KNOWN_REGISTRIES.has(dep.registry)) {
      unknownRegistry.push(dep);
    }
  }
  const knownRegistry = deps.length - unknownRegistry.length;
  return {
    total: deps.length,
    knownRegistry,
    unknownRegistry,
    allKnown: unknownRegistry.length === 0,
  };
}

// ── Vulnerability checking ─────────────────────────────────────────

export function checkForKnownVulnerabilities(deps: readonly PackageDep[]): VulnerabilityReport {
  const vulnerable: VulnerablePackage[] = [];
  for (const dep of deps) {
    const match = KNOWN_VULNERABILITIES.find((v) => v.package === dep.name);
    if (match) {
      vulnerable.push({ dep, vulnerability: match });
    }
  }
  return {
    checked: deps.length,
    vulnerable,
    clean: vulnerable.length === 0,
  };
}

// ── Artifact integrity ─────────────────────────────────────────────

export async function verifyArtifactIntegrity(
  artifactPath: string,
  expectedHash: string,
): Promise<ArtifactVerification> {
  const content = await readFile(artifactPath);
  const actualHash = createHash('sha256').update(content).digest('hex');
  return {
    path: artifactPath,
    expectedHash,
    actualHash,
    matches: actualHash === expectedHash,
  };
}
