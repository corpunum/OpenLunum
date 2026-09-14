/**
 * Fingerprint 1.0 Support Contract (R4.6)
 *
 * This module freezes the 1.0 fingerprint support contract with versioned
 * compatibility guarantees, a deprecation timeline, and migration tooling
 * requirements. It is the operational complement to
 * `fingerprint-contract.ts` (which defines the algorithmic contract itself).
 *
 * Architecture:
 * - Version Registry: Known fingerprint versions and their lifecycle state
 * - Deprecation Policy: Timelines for stable → deprecated → obsolete
 * - Migration Requirements: Tooling obligations when versions change
 * - Validation: Runtime checks that a fingerprint version is supported
 *
 * -----------------------------------------------------------------------
 * Version lifecycle
 * -----------------------------------------------------------------------
 *
 * | State      | Duration       | Guarantee                                 |
 * |------------|----------------|-------------------------------------------|
 * | supported  | 365 days       | Full compatibility, no digest changes     |
 * | deprecated | 180 days       | Digests still valid, migration encouraged  |
 * | obsolete   | ∞              | Format parseable, comparison weak         |
 *
 * -----------------------------------------------------------------------
 * Supported fingerprint versions
 * -----------------------------------------------------------------------
 *
 * | Version | Status     | Notes                                  |
 * |---------|------------|----------------------------------------|
 * | 0.1     | obsolete   | Original format; superseded by 0.2     |
 * | 0.2     | deprecated | Intermediate; superseded by 1.0        |
 * | 1.0     | supported  | Current frozen contract                |
 *
 * -----------------------------------------------------------------------
 * Migration tooling requirements
 * -----------------------------------------------------------------------
 *
 * 1. `migrateFingerprint` must accept a source fingerprint and produce a
 *    target-version fingerprint with identical digest content.
 * 2. `validateFingerprintVersion` must reject versions not in the supported
 *    list at the point of use.
 * 3. `getFingerprintDeprecationStatus` must report the remaining support
 *    days for any registered version.
 */

// ── Types ──────────────────────────────────────────────────────────

/** Lifecycle state of a fingerprint version. */
export type FingerprintSupportState = 'supported' | 'deprecated' | 'obsolete';

/** Minimum supported fingerprint version. */
export const FP_SUPPORT_MIN_VERSION = '0.1' as const;

/** Latest supported fingerprint version. */
export const FP_SUPPORT_MAX_VERSION = '1.0' as const;

/** Supported fingerprint version registry. */
export const FP_SUPPORTED_VERSIONS = Object.freeze(['0.1', '0.2', '1.0'] as const);

/** Stable support window in days (12 months). */
export const FP_SUPPORT_STABLE_DAYS = 365;

/** Security-only support window in days (6 months). */
export const FP_SUPPORT_DEPRECATION_DAYS = 180;

/** Deprecation notice period in days before a version becomes obsolete. */
export const FP_DEPRECATION_NOTICE_DAYS = 180;

/** Migration tooling requirement for cross-version fingerprint conversion. */
export interface MigrationRequirement {
  /** Source fingerprint version */
  fromVersion: string;
  /** Target fingerprint version */
  toVersion: string;
  /** Required tooling: name of the migration function or tool */
  tool: string;
  /** Whether the migration is lossless (same digest) */
  lossless: boolean;
  /** Description of what the migration does */
  description: string;
}

/** Deprecation timeline entry for a fingerprint version. */
export interface DeprecationPolicy {
  /** Version string */
  version: string;
  /** Current lifecycle state */
  state: FingerprintSupportState;
  /** Release date (ISO 8601) */
  releasedAt: string;
  /** Date when deprecation notice begins (ISO 8601) */
  deprecatedAt: string | null;
  /** Date when version becomes obsolete (ISO 8601); null if not deprecated */
  obsoleteAt: string | null;
  /** Days from release until deprecation */
  stableWindowDays: number;
  /** Days from deprecation until obsolete */
  deprecationWindowDays: number;
}

/** Frozen support contract object. */
export interface FingerprintSupportContract {
  /** Contract version (semver string) */
  version: string;
  /** List of currently supported fingerprint versions */
  supportedVersions: readonly string[];
  /** Deprecation timeline policy */
  deprecationPolicy: DeprecationPolicy;
  /** Migration tooling requirements */
  migrationRequirements: readonly MigrationRequirement[];
  /** Minimum support duration in days for supported versions */
  minSupportDays: number;
  /** Deprecation notice period in days */
  deprecationNoticeDays: number;
  /** Whether the contract is immutable (frozen) */
  frozen: true;
}

/** Deprecation status for a fingerprint version. */
export interface FingerprintDeprecationStatus {
  /** Version string */
  version: string;
  /** Current lifecycle state */
  state: FingerprintSupportState;
  /** Whether the version is currently supported */
  isSupported: boolean;
  /** Days remaining in the current support window (-1 if obsolete) */
  daysRemaining: number;
  /** Deprecation notice period in days */
  deprecationNoticeDays: number;
  /** Warning message if the version is deprecated or obsolete */
  warning?: string;
}

// ── Constants ──────────────────────────────────────────────────────

/**
 * Deprecation timeline policy for the 1.0 fingerprint support contract.
 *
 * All versions are frozen at their declared lifecycle states. New versions
 * must be added to FP_SUPPORTED_VERSIONS and have a corresponding policy
 * entry before they can be validated.
 */
export const FP_DEPRECATION_POLICY: DeprecationPolicy = Object.freeze({
  version: '1.0',
  state: 'supported',
  releasedAt: '2026-07-31',
  deprecatedAt: null,
  obsoleteAt: null,
  stableWindowDays: FP_SUPPORT_STABLE_DAYS,
  deprecationWindowDays: FP_SUPPORT_DEPRECATION_DAYS
} as const);

/**
 * Migration tooling requirements for cross-version fingerprint conversion.
 */
export const FP_MIGRATION_REQUIREMENTS: readonly MigrationRequirement[] = Object.freeze([
  {
    fromVersion: '0.1',
    toVersion: '1.0',
    tool: 'migrateFingerprint',
    lossless: true,
    description: 'Migrate 0.1 fingerprints to 1.0 contract; digest content preserved.'
  },
  {
    fromVersion: '0.2',
    toVersion: '1.0',
    tool: 'migrateFingerprint',
    lossless: true,
    description: 'Migrate 0.2 fingerprints to 1.0 contract; digest content preserved.'
  }
] as const);

/**
 * Frozen 1.0 fingerprint support contract.
 *
 * This object must never be mutated. All properties are declared as const
 * and the object is frozen with Object.freeze to catch accidental edits
 * at runtime during development.
 */

const SUPPORTED_VERSIONS_ARRAY = Object.freeze(['0.1', '0.2'] as const);

export const FINGERPRINT_SUPPORT_CONTRACT: FingerprintSupportContract = Object.freeze({
  version: '1.0.0',
  supportedVersions: SUPPORTED_VERSIONS_ARRAY,
  deprecationPolicy: FP_DEPRECATION_POLICY,
  migrationRequirements: FP_MIGRATION_REQUIREMENTS,
  minSupportDays: FP_SUPPORT_STABLE_DAYS,
  deprecationNoticeDays: FP_SUPPORT_DEPRECATION_DAYS,
  frozen: true
} as const);

// ── Validation functions ───────────────────────────────────────────

/**
 * Check whether a fingerprint version is currently supported.
 *
 * @param version - Fingerprint version string (e.g., '1.0')
 * @returns true if the version is in the supported versions list
 */
export function validateFingerprintVersion(version: string): boolean {
  return FINGERPRINT_SUPPORT_CONTRACT.supportedVersions.includes(version);
}

/**
 * Get the deprecation status for a fingerprint version.
 *
 * @param version - Fingerprint version string
 * @returns Deprecation status with state, remaining days, and optional warning
 */
export function getFingerprintDeprecationStatus(version: string): FingerprintDeprecationStatus {
  const isSupported = validateFingerprintVersion(version);

  let state: FingerprintSupportState;
  let daysRemaining: number;
  let warning: string | undefined;

  if (isSupported) {
    // Check if this version is 0.1 (obsolete per the registry in fingerprint-contract.ts)
    if (version === '0.1') {
      state = 'obsolete';
      daysRemaining = -1;
      warning = 'Version 0.1 is obsolete. Migrate to 1.0 for full compatibility.';
    } else if (version === '0.2') {
      state = 'deprecated';
      daysRemaining = FP_SUPPORT_DEPRECATION_DAYS;
      warning = 'Version 0.2 is deprecated. Migrate to 1.0 for full compatibility.';
    } else {
      state = 'supported';
      daysRemaining = FP_SUPPORT_STABLE_DAYS;
    }
  } else {
    state = 'obsolete';
    daysRemaining = -1;
    warning = `Version ${version} is not in the supported versions list [${FINGERPRINT_SUPPORT_CONTRACT.supportedVersions.join(', ')}].`;
  }

  const result: FingerprintDeprecationStatus = {
    version,
    state,
    isSupported,
    daysRemaining,
    deprecationNoticeDays: FINGERPRINT_SUPPORT_CONTRACT.deprecationNoticeDays
  };

  if (warning !== undefined) {
    result.warning = warning;
  }

  return result;
}

// ── Query helpers ──────────────────────────────────────────────────

/**
 * Get the current contract version.
 *
 * @returns Contract version string (semver)
 */
export function getContractVersion(): string {
  return FINGERPRINT_SUPPORT_CONTRACT.version;
}

/**
 * Get the list of supported fingerprint versions.
 *
 * @returns Readonly copy of the supported versions list
 */
export function getSupportedVersions(): readonly string[] {
  return FINGERPRINT_SUPPORT_CONTRACT.supportedVersions;
}

/**
 * Get all migration requirements for a specific version.
 *
 * @param version - Fingerprint version to check
 * @returns Migration requirements for this version
 */
export function getMigrationRequirements(version: string): readonly MigrationRequirement[] {
  return FP_MIGRATION_REQUIREMENTS.filter(
    (req) => req.fromVersion === version || req.toVersion === version
  );
}

/**
 * Check if a migration requirement exists between two versions.
 *
 * @param fromVersion - Source version
 * @param toVersion - Target version
 * @returns true if a migration path is defined
 */
export function hasMigrationPath(fromVersion: string, toVersion: string): boolean {
  return FP_MIGRATION_REQUIREMENTS.some(
    (req) => req.fromVersion === fromVersion && req.toVersion === toVersion
  );
}

/**
 * Get the deprecation policy for the current contract.
 *
 * @returns The frozen deprecation policy
 */
export function getDeprecationPolicy(): DeprecationPolicy {
  return FINGERPRINT_SUPPORT_CONTRACT.deprecationPolicy;
}

/**
 * Check if the support contract is frozen (immutable).
 *
 * @returns true if frozen
 */
export function isContractFrozen(): boolean {
  return FINGERPRINT_SUPPORT_CONTRACT.frozen;
}

// ── Export ─────────────────────────────────────────────────────────

export const fingerprintSupportContractExports = [
  FINGERPRINT_SUPPORT_CONTRACT,
  FP_DEPRECATION_POLICY,
  FP_MIGRATION_REQUIREMENTS,
  FP_SUPPORT_MIN_VERSION,
  FP_SUPPORT_MAX_VERSION,
  FP_SUPPORTED_VERSIONS,
  FP_SUPPORT_STABLE_DAYS,
  FP_SUPPORT_DEPRECATION_DAYS,
  FP_DEPRECATION_NOTICE_DAYS,
  validateFingerprintVersion,
  getFingerprintDeprecationStatus,
  getContractVersion,
  getSupportedVersions,
  getMigrationRequirements,
  hasMigrationPath,
  getDeprecationPolicy,
  isContractFrozen
] as const;
