/**
 * Compatibility Matrix — schema versions ↔ package versions
 *
 * This module defines which Lunum-Sem schema versions are compatible
 * with which package versions. It is used by CI to verify that
 * deployed schemas work with the current package.
 *
 * Architecture:
 * - The matrix is a simple lookup: packageVersion → set of compatible schemaVersions
 * - Each schema version is tracked with its release date and deprecation status
 * - The matrix is tested in CI to detect incompatibilities early
 *
 * Example usage:
 * ```typescript
 * import { compatibilityMatrix, checkCompatibility } from './compatibility-matrix.js';
 * const compatible = checkCompatibility('0.2.0', 'lunum-sem/0.1-draft');
 * ```
 */

// ── Schema Version Registry ─────────────────────────────────────────

/**
 * A registered schema version with metadata.
 */
export interface SchemaVersion {
  /** Schema identifier (e.g., 'lunum-sem/0.1-draft') */
  id: string;
  /** Package version when this schema was released */
  releasedAt: string;
  /** Whether this schema is deprecated */
  deprecated: boolean;
  /** Description of the schema */
  description: string;
}

/**
 * Registry of all known schema versions.
 */
export const SCHEMA_REGISTRY: Readonly<Record<string, SchemaVersion>> = Object.freeze({
  'lunum-sem/0.1-draft': {
    id: 'lunum-sem/0.1-draft',
    releasedAt: '0.1.0',
    deprecated: false,
    description: 'Initial Lunum-Sem schema draft'
  },
  'lunum-record/0.1-draft': {
    id: 'lunum-record/0.1-draft',
    releasedAt: '0.1.0',
    deprecated: false,
    description: 'Initial Lunum-Record schema draft'
  },
  'openlunum-experiment/0.1': {
    id: 'openlunum-experiment/0.1',
    releasedAt: '0.1.0',
    deprecated: false,
    description: 'Experiment manifest schema'
  },
  'openlunum-model-profile/0.1': {
    id: 'openlunum-model-profile/0.1',
    releasedAt: '0.1.0',
    deprecated: false,
    description: 'Model profile schema'
  },
  'openlunum-renderer-profile/0.1': {
    id: 'openlunum-renderer-profile/0.1',
    releasedAt: '0.1.0',
    deprecated: false,
    description: 'Renderer profile schema'
  }
} as const);

// ── Compatibility Matrix ───────────────────────────────────────────

/**
 * Compatibility entry: a package version and the schema versions it supports.
 */
export interface CompatibilityEntry {
  /** Package version (e.g., '0.2.0') */
  packageVersion: string;
  /** Schema versions compatible with this package version */
  compatibleSchemas: string[];
  /** Notes about any special compatibility constraints */
  notes?: string;
}

/**
 * The full compatibility matrix mapping package versions to compatible schemas.
 */
export const COMPATIBILITY_MATRIX: Readonly<CompatibilityEntry[]> = Object.freeze([
  {
    packageVersion: '0.1.0',
    compatibleSchemas: [
      'lunum-sem/0.1-draft',
      'lunum-record/0.1-draft',
      'openlunum-experiment/0.1',
      'openlunum-model-profile/0.1',
      'openlunum-renderer-profile/0.1'
    ]
  },
  {
    packageVersion: '0.2.0',
    compatibleSchemas: [
      'lunum-sem/0.1-draft',
      'lunum-record/0.1-draft',
      'openlunum-experiment/0.1',
      'openlunum-model-profile/0.1',
      'openlunum-renderer-profile/0.1'
    ],
    notes: 'Backward compatible with 0.1.0 schemas'
  }
] as const);

// ── Query Functions ─────────────────────────────────────────────────

/**
 * Check if a schema version is compatible with a given package version.
 *
 * @param packageVersion - The package version to check (e.g., '0.2.0')
 * @param schemaVersion - The schema version to check (e.g., 'lunum-sem/0.1-draft')
 * @returns true if the schema is compatible with the package version
 */
export function isCompatible(
  packageVersion: string,
  schemaVersion: string
): boolean {
  const entry = COMPATIBILITY_MATRIX.find(e => e.packageVersion === packageVersion);
  if (!entry) return false;
  return entry.compatibleSchemas.includes(schemaVersion);
}

/**
 * Get all compatible schemas for a package version.
 *
 * @param packageVersion - The package version to query
 * @returns Array of compatible schema IDs, or empty array if not found
 */
export function getCompatibleSchemas(packageVersion: string): string[] {
  const entry = COMPATIBILITY_MATRIX.find(e => e.packageVersion === packageVersion);
  return entry ? [...entry.compatibleSchemas] : [];
}

/**
 * Get all known schema versions.
 *
 * @returns Array of all schema IDs in the registry
 */
export function getAllSchemaVersions(): string[] {
  return Object.keys(SCHEMA_REGISTRY);
}

/**
 * Check if a schema version is registered.
 *
 * @param schemaVersion - The schema version to check
 * @returns true if the schema is in the registry
 */
export function isRegistered(schemaVersion: string): boolean {
  return schemaVersion in SCHEMA_REGISTRY;
}

/**
 * Get schema metadata from the registry.
 *
 * @param schemaVersion - The schema version to look up
 * @returns Schema version metadata, or undefined if not found
 */
export function getSchemaMetadata(schemaVersion: string): SchemaVersion | undefined {
  return SCHEMA_REGISTRY[schemaVersion];
}

// ── CI Verification ─────────────────────────────────────────────────

/**
 * Verify that all schemas referenced in the registry are also in the
 * compatibility matrix for the current package version.
 *
 * @param packageVersion - The package version to verify against
 * @returns Verification result with passed/failed schemas
 */
export function verifyCompatibility(packageVersion: string): {
  passed: string[];
  failed: string[];
  allPassed: boolean;
} {
  const entry = COMPATIBILITY_MATRIX.find(e => e.packageVersion === packageVersion);
  if (!entry) {
    return { passed: [], failed: getAllSchemaVersions(), allPassed: false };
  }

  const passed: string[] = [];
  const failed: string[] = [];

  for (const schemaId of getAllSchemaVersions()) {
    if (entry.compatibleSchemas.includes(schemaId)) {
      passed.push(schemaId);
    } else {
      failed.push(schemaId);
    }
  }

  return { passed, failed, allPassed: failed.length === 0 };
}

// ── Export ──────────────────────────────────────────────────────────

export const compatibilityMatrixExports = [
  SCHEMA_REGISTRY,
  COMPATIBILITY_MATRIX,
  isCompatible,
  getCompatibleSchemas,
  getAllSchemaVersions,
  isRegistered,
  getSchemaMetadata,
  verifyCompatibility
] as const;
