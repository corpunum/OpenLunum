/**
 * Support and Compatibility Contract (R1.6)
 *
 * This module defines version lifecycle states, support windows, deprecation
 * processes, and compatibility guarantees for OpenLunum.
 *
 * Architecture:
 * - Version Registry: All known versions with metadata
 * - Support Matrix: Package version → supported features, schemas, lifetime
 * - Lifecycle States: Development → Beta → Stable → Deprecated → Obsolete
 * - Compatibility Checker: Verify version pairs for support
 *
 * Example usage:
 * ```typescript
 * import { checkVersionSupport, SUPPORT_WINDOWS } from './support-contract.js';
 * const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
 * if (result.supported) {
 *   console.log(`Supported until ${result.endOfLife}`);
 * }
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────

/** Version lifecycle state. */
export type VersionLifecycleState = 'dev' | 'beta' | 'stable' | 'deprecated' | 'obsolete';

/** Support status result. */
export interface SupportStatus {
  /** Whether the version pair is supported */
  supported: boolean;
  /** Lifecycle state of the version */
  lifecycleState: VersionLifecycleState;
  /** Release date (ISO 8601) */
  releaseDate: string;
  /** End of life date (ISO 8601) */
  endOfLife: string;
  /** Days remaining until end of life (-1 if obsolete) */
  daysRemaining: number;
  /** Whether security updates are available */
  securityUpdatesAvailable: boolean;
  /** Schemas supported by this version */
  supportedSchemas: string[];
  /** Migration path if not directly supported */
  migrationPath?: string | undefined;
  /** Warning message if version is deprecated or obsolete */
  warning?: string | undefined;
}

/** Version entry in the registry. */
export interface VersionEntry {
  /** Package version (e.g., '0.2.0') */
  version: string;
  /** Lifecycle state */
  lifecycleState: VersionLifecycleState;
  /** Release date (ISO 8601) */
  releaseDate: string;
  /** End of life date (ISO 8601) */
  endOfLife: string;
  /** Schemas supported by this version */
  supportedSchemas: string[];
  /** Previous version (for migration path) */
  previousVersion?: string;
  /** Next version (for upgrade path) */
  nextVersion?: string;
  /** Notes about this version */
  notes?: string;
}

// ── Constants ──────────────────────────────────────────────────────

/** Support window in days for stable versions (12 months). */
export const STABLE_SUPPORT_WINDOW_DAYS = 365;

/** Security-only support window in days for deprecated versions (6 months). */
export const SECURITY_SUPPORT_WINDOW_DAYS = 180;

/** Overlap window in days for concurrent support (3 months). */
export const OVERLAP_SUPPORT_WINDOW_DAYS = 90;

/** Minimum beta support window in days. */
export const MIN_BETA_SUPPORT_WINDOW_DAYS = 14;

/** Today's date reference for calculations. */
export function getCurrentDate(): Date {
  return new Date();
}

/**
 * Calculate days from a date to today.
 */
function daysSinceDate(dateStr: string): number {
  const date = new Date(dateStr);
  const today = getCurrentDate();
  const diff = today.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days from today to a date.
 */
function daysUntilDate(dateStr: string): number {
  const date = new Date(dateStr);
  const today = getCurrentDate();
  const diff = date.getTime() - today.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ── Version Registry ───────────────────────────────────────────────

/**
 * Registry of all known versions with metadata.
 */
export const VERSION_REGISTRY: Readonly<Record<string, VersionEntry>> = Object.freeze({
  '0.1.0': {
    version: '0.1.0',
    lifecycleState: 'obsolete',
    releaseDate: '2026-01-15',
    endOfLife: '2026-07-15',
    supportedSchemas: ['lunum-sem/0.1-draft', 'lunum-record/0.1-draft'],
    nextVersion: '0.2.0',
    notes: 'Initial release; now obsolete'
  },
  '0.2.0': {
    version: '0.2.0',
    lifecycleState: 'stable',
    releaseDate: '2026-04-01',
    endOfLife: '2027-04-01',
    supportedSchemas: [
      'lunum-sem/0.1-draft',
      'lunum-record/0.1-draft',
      'lunum-sem/0.2',
      'lunum-record/0.2'
    ],
    previousVersion: '0.1.0',
    nextVersion: '1.0.0',
    notes: 'Stable release; backward compatible with 0.1.0 schemas'
  }
} as const);

// ── Support Matrix ────────────────────────────────────────────────

/**
 * Support matrix for version combinations.
 */
export interface SupportMatrixEntry {
  /** Package version */
  packageVersion: string;
  /** Minimum schema version to support */
  minSchemaVersion: string;
  /** Maximum schema version to support */
  maxSchemaVersion: string;
  /** Migration required from previous version */
  migrationRequired: boolean;
  /** Breaking changes introduced */
  breakingChanges: string[];
}

/**
 * Support matrix mapping package versions to supported schema ranges.
 */
export const SUPPORT_MATRIX: Readonly<SupportMatrixEntry[]> = Object.freeze([
  {
    packageVersion: '0.1.0',
    minSchemaVersion: 'lunum-sem/0.1-draft',
    maxSchemaVersion: 'lunum-record/0.1-draft',
    migrationRequired: false,
    breakingChanges: []
  },
  {
    packageVersion: '0.2.0',
    minSchemaVersion: 'lunum-sem/0.1-draft',
    maxSchemaVersion: 'lunum-record/0.2',
    migrationRequired: false,
    breakingChanges: [
      'New schema versions introduced (0.2) alongside 0.1-draft'
    ]
  }
] as const);

// ── Support Windows ────────────────────────────────────────────────

/**
 * Support window definitions for different lifecycle states.
 */
export const SUPPORT_WINDOWS: Readonly<Record<VersionLifecycleState, number>> = Object.freeze({
  dev: 0,
  beta: MIN_BETA_SUPPORT_WINDOW_DAYS,
  stable: STABLE_SUPPORT_WINDOW_DAYS,
  deprecated: SECURITY_SUPPORT_WINDOW_DAYS,
  obsolete: 0
});

// ── Query Functions ────────────────────────────────────────────────

/**
 * Check if a package version is in the registry.
 *
 * @param version - Package version to check (e.g., '0.2.0')
 * @returns true if the version is registered
 */
export function isVersionRegistered(version: string): boolean {
  return version in VERSION_REGISTRY;
}

/**
 * Get version entry from the registry.
 *
 * @param version - Package version to look up
 * @returns Version entry, or undefined if not found
 */
export function getVersionEntry(version: string): VersionEntry | undefined {
  return VERSION_REGISTRY[version];
}

/**
 * Get all registered versions in order.
 *
 * @returns Array of all registered versions (sorted semver)
 */
export function getAllRegisteredVersions(): string[] {
  return Object.keys(VERSION_REGISTRY).sort((a, b) => {
    const aParts = a.split('.').map(x => parseInt(x, 10));
    const bParts = b.split('.').map(x => parseInt(x, 10));
    for (let i = 0; i < 3; i++) {
      const cmp = (aParts[i] ?? 0) - (bParts[i] ?? 0);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

/**
 * Check support status for a version and schema combination.
 *
 * @param packageVersion - Package version to check (e.g., '0.2.0')
 * @param schemaVersion - Schema version to check (e.g., 'lunum-sem/0.2')
 * @returns Support status with details
 */
export function checkVersionSupport(
  packageVersion: string,
  schemaVersion: string
): SupportStatus {
  const entry = getVersionEntry(packageVersion);

  if (!entry) {
    const result: SupportStatus = {
      supported: false,
      lifecycleState: 'obsolete',
      releaseDate: 'unknown',
      endOfLife: 'unknown',
      daysRemaining: -1,
      securityUpdatesAvailable: false,
      supportedSchemas: [],
      warning: `Version ${packageVersion} is not registered`
    };
    return result;
  }

  const supported = entry.supportedSchemas.includes(schemaVersion);
  const daysRemaining = daysUntilDate(entry.endOfLife);
  const securityUpdatesAvailable =
    entry.lifecycleState === 'stable' ||
    (entry.lifecycleState === 'deprecated' && daysRemaining > 0);

  const result: SupportStatus = {
    supported,
    lifecycleState: entry.lifecycleState,
    releaseDate: entry.releaseDate,
    endOfLife: entry.endOfLife,
    daysRemaining,
    securityUpdatesAvailable,
    supportedSchemas: [...entry.supportedSchemas]
  };

  if (entry.lifecycleState === 'obsolete') {
    result.warning = `Version ${packageVersion} is obsolete. Upgrade to a supported version.`;
  } else if (entry.lifecycleState === 'deprecated') {
    result.warning = `Version ${packageVersion} is deprecated. Please upgrade.`;
  }

  return result;
}

/**
 * Check if a version upgrade is supported (can upgrade from source to target).
 *
 * @param sourceVersion - Current version
 * @param targetVersion - Desired version
 * @returns true if upgrade is supported
 */
export function canUpgradeTo(
  sourceVersion: string,
  targetVersion: string
): boolean {
  const source = getVersionEntry(sourceVersion);
  const target = getVersionEntry(targetVersion);

  if (!source || !target) return false;

  // Can upgrade from any version to stable or beta
  if (target.lifecycleState === 'stable' || target.lifecycleState === 'beta') {
    return true;
  }

  // Cannot upgrade to deprecated or obsolete
  return false;
}

/**
 * Check if a version is currently supported.
 *
 * @param version - Package version to check
 * @returns true if version is currently supported
 */
export function isCurrentlySupportedVersion(version: string): boolean {
  const entry = getVersionEntry(version);
  if (!entry) return false;

  const daysRemaining = daysUntilDate(entry.endOfLife);
  return (entry.lifecycleState === 'stable' ||
          entry.lifecycleState === 'beta' ||
          (entry.lifecycleState === 'deprecated' && daysRemaining > 0));
}

/**
 * Get the recommended version to upgrade to from a given version.
 *
 * @param version - Current version
 * @returns Recommended upgrade target, or undefined if at latest
 */
export function getRecommendedUpgrade(version: string): string | undefined {
  const entry = getVersionEntry(version);
  if (!entry) return undefined;

  // If stable, no need to upgrade immediately
  if (entry.lifecycleState === 'stable') {
    const daysRemaining = daysUntilDate(entry.endOfLife);
    if (daysRemaining > 90) {
      return undefined; // Still plenty of time
    }
  }

  // If deprecated or obsolete, recommend next version
  if (entry.lifecycleState === 'deprecated' || entry.lifecycleState === 'obsolete') {
    return entry.nextVersion;
  }

  return undefined;
}

/**
 * Get all schemas that are frozen (will not change).
 *
 * @returns Array of frozen schema IDs
 */
export function getFrozenSchemas(): string[] {
  return ['lunum-sem/0.2', 'lunum-record/0.2'];
}

/**
 * Check if a schema is frozen (will not change).
 *
 * @param schemaVersion - Schema version to check
 * @returns true if schema is frozen
 */
export function isSchemeFrozen(schemaVersion: string): boolean {
  return getFrozenSchemas().includes(schemaVersion);
}

/**
 * Get the migration path between two versions.
 *
 * @param fromVersion - Source version
 * @param toVersion - Target version
 * @returns Migration steps, or empty array if no migration needed
 */
export function getMigrationPath(
  fromVersion: string,
  toVersion: string
): string[] {
  const from = getVersionEntry(fromVersion);
  const to = getVersionEntry(toVersion);

  if (!from || !to) return [];

  const steps: string[] = [];

  // Build path following nextVersion chain
  let current = from;
  while (current && current.version !== to.version) {
    if (!current.nextVersion) break;
    const next = getVersionEntry(current.nextVersion);
    if (!next) break;

    const matrixEntry = SUPPORT_MATRIX.find(m => m.packageVersion === next.version);
    if (matrixEntry) {
      if (matrixEntry.migrationRequired) {
        steps.push(`Migrate schema from ${current.version} to ${next.version}`);
      }
      if (matrixEntry.breakingChanges.length > 0) {
        steps.push(`Update code for breaking changes: ${matrixEntry.breakingChanges.join(', ')}`);
      }
    }

    current = next;
  }

  return steps;
}

/**
 * Verify that all known versions have valid support windows.
 *
 * @returns Verification result with passed/failed versions
 */
export function verifyVersionSupport(): {
  passed: string[];
  failed: string[];
  allPassed: boolean;
  warnings: string[];
} {
  const passed: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];

  for (const version of getAllRegisteredVersions()) {
    const entry = getVersionEntry(version)!;
    const releaseDate = new Date(entry.releaseDate);
    const endOfLife = new Date(entry.endOfLife);

    if (releaseDate > endOfLife) {
      failed.push(version);
    } else {
      passed.push(version);
    }

    // Warn if near end of life
    const daysRemaining = daysUntilDate(entry.endOfLife);
    if (entry.lifecycleState === 'stable' && daysRemaining < 90) {
      warnings.push(`Version ${version} will reach end-of-life in ${daysRemaining} days`);
    }
  }

  return {
    passed,
    failed,
    allPassed: failed.length === 0,
    warnings
  };
}

// ── Export ─────────────────────────────────────────────────────────

export const supportContractExports = [
  VERSION_REGISTRY,
  SUPPORT_MATRIX,
  SUPPORT_WINDOWS,
  isVersionRegistered,
  getVersionEntry,
  getAllRegisteredVersions,
  checkVersionSupport,
  canUpgradeTo,
  isCurrentlySupportedVersion,
  getRecommendedUpgrade,
  getFrozenSchemas,
  isSchemeFrozen,
  getMigrationPath,
  verifyVersionSupport
] as const;
