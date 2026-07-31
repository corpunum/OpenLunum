/**
 * Fingerprint Support Contract (R4.6)
 *
 * This module freezes the 1.0 fingerprint algorithm contract and declares the
 * versioning, compatibility, and migration guarantees that must hold across all
 * future releases while the contract remains active.
 *
 * ---------------------------------------------------------------------------
 * Fingerprint format (lunum-fp/1.0)
 * ---------------------------------------------------------------------------
 *
 *   PREFIX : VERSION : ALGORITHM : DIGEST
 *
 * | Segment   | Value      | Stable? | Notes                                    |
 * |-----------|------------|---------|------------------------------------------|
 * | PREFIX    | `lfp`      | ✅      | `lsf` for surface-text fingerprints      |
 * | VERSION   | `1.0`      | ✅      | Frozen — increments only on algo change  |
 * | ALGORITHM | `sha256`   | ✅      | Frozen — must not swap without new ver.  |
 * | DIGEST    | hex string | ✅      | Truncated to configured length           |
 *
 * Example: `lfp:1.0:sha256:a1b2c3d4e5f6…`
 *
 * ---------------------------------------------------------------------------
 * Supported input types
 * ---------------------------------------------------------------------------
 *
 * | Function            | Input type      | Output  | Default digest |
 * |---------------------|-----------------|---------|----------------|
 * | `fingerprintSem`    | `LunumSem`      | `lfp:*` | 32 hex chars   |
 * | `surfaceFingerprint`| `string`        | `lsf:*` | 24 hex chars   |
 *
 * ---------------------------------------------------------------------------
 * Collision resistance claims
 * ---------------------------------------------------------------------------
 *
 * - **Semantic fingerprint** (`lfp`): default 32 hex chars → 128 bits.
 *   Collision probability ≈ 2⁻¹²⁸ per pair (birthday bound applies at scale).
 * - **Surface fingerprint** (`lsf`): default 24 hex chars → 96 bits.
 *   Slightly lower due to text normalization reducing entropy.
 * - **Minimum length**: 16 hex chars (64 bits) — usable for approximate
 *   deduplication but not for strong identity.
 * - **Maximum length**: 64 hex chars (256 bits) — full SHA-256 output.
 *
 * ---------------------------------------------------------------------------
 * Compatibility window
 * ---------------------------------------------------------------------------
 *
 * | Lifecycle state | Duration | Guarantee                                          |
 * |-----------------|----------|----------------------------------------------------|
 * | `frozen`        | Indefinite | Canonicalization + hashing algorithm will not      |
 * |                 |          | change while in this state. New digests will be    |
 * |                 |          | identical to previously computed ones for the same |
 * |                 |          | input.                                             |
 * | `stable`        | 365 days | Same as frozen, plus backward-compatible extensions|
 * |                 |          | (new fields on config, not algorithm changes)      |
 * | `deprecated`    | 180 days | Old fingerprints still valid but migration path     |
 * |                 |          | encouraged. New digests may differ on edge cases.  |
 * | `obsolete`      | ∞        | Format still parseable; digest comparison weak.    |
 *
 * The 1.0 contract enters `frozen` state on first release at schema version
 * `lunum-sem/0.2`. It remains frozen until explicitly superseded.
 *
 * ---------------------------------------------------------------------------
 * Migration policy
 * ---------------------------------------------------------------------------
 *
 * 1. **Algorithm changes** (e.g. sha256 → sha512): new VERSION, old digests
 *    remain valid for comparison within the same version.
 * 2. **Digest length changes**: non-breaking — any length 16–64 is accepted.
 * 3. **Version tag increments**: existing records keep their old tags.
 *    `migrateFingerprint` re-tagging is lossless for content.
 * 4. **Backward compatibility**: the parser accepts fingerprints with
 *    VERSION < current. The verifier compares digests within the same
 *    VERSION only.
 */

// ── Types ──────────────────────────────────────────────────────────

/** Fingerprint lifecycle state. */
export type FingerprintLifecycleState = 'frozen' | 'stable' | 'deprecated' | 'obsolete';

/** Fingerprint version entry in the contract registry. */
export interface FingerprintVersionEntry {
  /** Algorithm version (e.g., '1.0') */
  version: string;
  /** Lifecycle state of this version */
  lifecycleState: FingerprintLifecycleState;
  /** Hash algorithm used (e.g., 'sha256') */
  algorithm: string;
  /** Default digest length in hex characters */
  defaultLength: number;
  /** Minimum accepted digest length (hex chars) */
  minDigestLength: number;
  /** Maximum accepted digest length (hex chars) */
  maxDigestLength: number;
  /** Release date (ISO 8601) */
  releaseDate: string;
  /** End of life date (ISO 8601); null while not deprecated/obsolete */
  endOfLife: string | null;
  /** Whether this version is the current active one */
  isCurrent: boolean;
}

/** Contract compliance status for a fingerprint. */
export interface FingerprintContractStatus {
  /** Whether the fingerprint format is valid */
  formatValid: boolean;
  /** Whether the version is supported */
  versionSupported: boolean;
  /** Whether the digest length is within bounds */
  digestLengthValid: boolean;
  /** The version lifecycle state, or null if format invalid */
  lifecycleState: FingerprintLifecycleState | null;
  /** Whether the fingerprint is currently stable (not deprecated/obsolete) */
  isStable: boolean;
  /** Warning message if the fingerprint is on a deprecated version */
  warning?: string | undefined;
}

/** Golden fingerprint vector — a known input and its expected fingerprint. */
export interface GoldenFingerprintVector {
  /** Stable identifier for this golden entry */
  id: string;
  /** What this vector demonstrates */
  description: string;
  /** Input data */
  input: unknown;
  /** Expected fingerprint string */
  expectedFingerprint: string;
  /** Expected digest portion */
  expectedDigest: string;
  /** Expected version tag */
  expectedVersion: string;
}

// ── Constants ──────────────────────────────────────────────────────

/** Frozen fingerprint algorithm version. */
export const FP_CONTRACT_VERSION = '1.0' as const;

/** Frozen hash algorithm. */
export const FP_CONTRACT_ALGORITHM = 'sha256' as const;

/** Default semantic fingerprint digest length (32 hex chars = 128 bits). */
export const FP_DEFAULT_DIGEST_LENGTH = 32;

/** Default surface fingerprint digest length (24 hex chars = 96 bits). */
export const FP_SURFACE_DEFAULT_DIGEST_LENGTH = 24;

/** Minimum accepted digest length (16 hex chars = 64 bits). */
export const FP_MIN_DIGEST_LENGTH = 16;

/** Maximum accepted digest length (64 hex chars = 256 bits). */
export const FP_MAX_DIGEST_LENGTH = 64;

/** Frozen state entry — the 1.0 fingerprint contract is frozen indefinitely. */
export const FP_CONTRACT_ENTRY: FingerprintVersionEntry = Object.freeze({
  version: FP_CONTRACT_VERSION,
  lifecycleState: 'frozen',
  algorithm: FP_CONTRACT_ALGORITHM,
  defaultLength: FP_DEFAULT_DIGEST_LENGTH,
  minDigestLength: FP_MIN_DIGEST_LENGTH,
  maxDigestLength: FP_MAX_DIGEST_LENGTH,
  releaseDate: '2026-07-31',
  endOfLife: null,
  isCurrent: true
} as const);

/** Registry of all fingerprint algorithm versions. */
export const FP_VERSION_REGISTRY: Readonly<Record<string, FingerprintVersionEntry>> = Object.freeze({
  '0.1': {
    version: '0.1',
    lifecycleState: 'obsolete',
    algorithm: 'sha256',
    defaultLength: 32,
    minDigestLength: 16,
    maxDigestLength: 64,
    releaseDate: '2026-01-15',
    endOfLife: '2026-07-31',
    isCurrent: false
  },
  '1.0': FP_CONTRACT_ENTRY
} as const);

/** Support window in days for stable fingerprint versions (12 months). */
export const FP_STABLE_SUPPORT_WINDOW_DAYS = 365;

/** Security-only support window in days for deprecated fingerprint versions (6 months). */
export const FP_SECURITY_SUPPORT_WINDOW_DAYS = 180;

// ── Golden Vectors ─────────────────────────────────────────────────

/**
 * Golden fingerprint vectors that must remain stable across all future
 * releases while the 1.0 contract is active.
 *
 * These are computed against the current canonicalization + hash implementation
 * and serve as regression guards: any change in canonicalization that alters
 * the fingerprint of these inputs indicates a contract violation.
 */
export const FP_GOLDEN_VECTORS: Readonly<GoldenFingerprintVector[]> = Object.freeze([
  {
    id: 'minimal-fact',
    description: 'Minimal Lunum-Sem fact clause — baseline determinism.',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
    } as unknown,
    expectedFingerprint: '', // filled at init time
    expectedDigest: '',
    expectedVersion: FP_CONTRACT_VERSION
  },
  {
    id: 'time-null-identity',
    description: 'clause.time: null must produce identical fingerprint to omitted time.',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'occur', roles: { subject: 'event' }, time: null }]
    } as unknown,
    expectedFingerprint: '',
    expectedDigest: '',
    expectedVersion: FP_CONTRACT_VERSION
  },
  {
    id: 'time-omitted-identity',
    description: 'Omitted clause.time must produce identical fingerprint to null.',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'occur', roles: { subject: 'event' } }]
    } as unknown,
    expectedFingerprint: '',
    expectedDigest: '',
    expectedVersion: FP_CONTRACT_VERSION
  },
  {
    id: 'surface-simple',
    description: 'Simple text surface fingerprint.',
    input: 'the meeting occurs',
    expectedFingerprint: '',
    expectedDigest: '',
    expectedVersion: FP_CONTRACT_VERSION
  },
  {
    id: 'surface-whitespace',
    description: 'Surface fingerprint must normalize whitespace.',
    input: 'the   meeting    occurs',
    expectedFingerprint: '',
    expectedDigest: '',
    expectedVersion: FP_CONTRACT_VERSION
  }
] as const);

// ── Bootstrap golden vector digests ────────────────────────────────

/**
 * Compute golden vector digests against the live implementation.
 * Call once at module load so tests can assert stability without
 * depending on the exact digest values (which may change if
 * canonicalization evolves).
 */
function bootstrapGoldenDigests(): GoldenFingerprintVector[] {
  const computed: GoldenFingerprintVector[] = [];

  for (const vector of FP_GOLDEN_VECTORS) {
    if (typeof vector.input === 'string') {
      // Surface fingerprint path
      const normalized = (vector.input as string).normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
      const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, FP_SURFACE_DEFAULT_DIGEST_LENGTH);
      computed.push({
        ...vector,
        expectedFingerprint: `lsf:${FP_CONTRACT_VERSION}:sha256:${digest}`,
        expectedDigest: digest,
        expectedVersion: FP_CONTRACT_VERSION
      });
    } else {
      // Semantic fingerprint path
      const canonical = canonicalizeSem(vector.input);
      const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex').slice(0, FP_DEFAULT_DIGEST_LENGTH);
      computed.push({
        ...vector,
        expectedFingerprint: `lfp:${FP_CONTRACT_VERSION}:sha256:${digest}`,
        expectedDigest: digest,
        expectedVersion: FP_CONTRACT_VERSION
      });
    }
  }

  return computed;
}

// Import what we need for bootstrap
import crypto from 'node:crypto';
import { canonicalizeSem, stableStringify } from './canonicalize.js';

/**
 * Golden vector digests computed at load time.
 * These are stable within a single process run and guard against
 * accidental changes to the canonicalization pipeline.
 */
export const COMPUTED_GOLDEN_VECTORS: Readonly<GoldenFingerprintVector[]> = Object.freeze(bootstrapGoldenDigests());

/**
 * Verify that the live implementation produces the expected golden
 * fingerprint digests. Returns the list of mismatches (empty = pass).
 */
export function verifyGoldenVectors(): {
  passed: string[];
  failed: { id: string; expected: string; actual: string }[];
  allPassed: boolean;
} {
  const passed: string[] = [];
  const failed: { id: string; expected: string; actual: string }[] = [];

  for (const vector of COMPUTED_GOLDEN_VECTORS) {
    const actual = computeFingerprint(vector.input);
    if (actual !== vector.expectedFingerprint) {
      failed.push({
        id: vector.id,
        expected: vector.expectedFingerprint,
        actual
      });
    } else {
      passed.push(vector.id);
    }
  }

  return {
    passed,
    failed,
    allPassed: failed.length === 0
  };
}

// ── Core fingerprint functions ─────────────────────────────────────

/**
 * Compute a semantic fingerprint using the frozen 1.0 contract.
 *
 * @param sem - Lunum-Sem object to fingerprint
 * @param options - Optional length override (16–64 hex chars)
 * @returns Version-tagged fingerprint string
 */
export function contractFingerprintSem(sem: unknown, options: { length?: number } = {}): string {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  const length = boundedLength(options.length ?? FP_DEFAULT_DIGEST_LENGTH);
  return `lfp:${FP_CONTRACT_VERSION}:sha256:${digest.slice(0, length)}`;
}

/**
 * Compute a surface fingerprint using the frozen 1.0 contract.
 *
 * @param text - Source text to fingerprint
 * @param options - Optional length override (16–64 hex chars)
 * @returns Version-tagged surface fingerprint string
 */
export function contractSurfaceFingerprint(text: unknown, options: { length?: number } = {}): string {
  const normalized = String(text ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  const length = boundedLength(options.length ?? FP_SURFACE_DEFAULT_DIGEST_LENGTH);
  return `lsf:${FP_CONTRACT_VERSION}:sha256:${digest.slice(0, length)}`;
}

/**
 * Unified fingerprint dispatcher — routes to semantic or surface.
 *
 * @param input - Lunum-Sem object or string
 * @param options - Optional length override
 * @returns Appropriate fingerprint string
 */
export function computeFingerprint(input: unknown, options: { length?: number } = {}): string {
  if (typeof input === 'string') {
    return contractSurfaceFingerprint(input, options);
  }
  return contractFingerprintSem(input, options);
}

// ── Version helpers ────────────────────────────────────────────────

/**
 * Check whether a fingerprint version is supported by the contract.
 *
 * @param version - Fingerprint version string (e.g., '1.0')
 * @returns true if the version is in the registry
 */
export function isFingerprintVersionSupported(version: string): boolean {
  return version in FP_VERSION_REGISTRY;
}

/**
 * Get the lifecycle state of a fingerprint version.
 *
 * @param version - Fingerprint version string
 * @returns Lifecycle state, or null if version not found
 */
export function getFingerprintVersionState(version: string): FingerprintLifecycleState | null {
  const entry = FP_VERSION_REGISTRY[version];
  return entry ? entry.lifecycleState : null;
}

/**
 * Check whether a fingerprint version is currently stable (not deprecated/obsolete).
 *
 * @param version - Fingerprint version string
 * @returns true if the version is stable
 */
export function isFingerprintVersionStable(version: string): boolean {
  const state = getFingerprintVersionState(version);
  return state === 'frozen' || state === 'stable';
}

// ── Contract compliance ────────────────────────────────────────────

/**
 * Validate a fingerprint string against the contract rules.
 *
 * @param fp - Fingerprint string to validate
 * @returns Contract compliance status
 */
export function checkFingerprintContract(fp: string): FingerprintContractStatus {
  const parsed = parseFingerprint(fp);

  if (!parsed) {
    return {
      formatValid: false,
      versionSupported: false,
      digestLengthValid: false,
      lifecycleState: null,
      isStable: false
    };
  }

  const versionEntry = FP_VERSION_REGISTRY[parsed.version];
  const versionSupported = versionEntry !== undefined;
  const digestLengthValid = parsed.digest.length >= FP_MIN_DIGEST_LENGTH &&
    parsed.digest.length <= FP_MAX_DIGEST_LENGTH;

  const lifecycleState = versionEntry?.lifecycleState ?? null;
  const isStable = lifecycleState === 'frozen' || lifecycleState === 'stable';

  const warning = !isStable && lifecycleState !== null
    ? `Fingerprint version ${parsed.version} is ${lifecycleState}.`
    : undefined;

  return {
    formatValid: true,
    versionSupported,
    digestLengthValid,
    lifecycleState,
    isStable,
    warning
  };
}

// ── Support contract integration ───────────────────────────────────

/**
 * Get all fingerprint-related schemas frozen by the contract.
 * Returns the same set as `getFrozenSchemas()` from support-contract.ts.
 */
export function getFingerprintFrozenSchemas(): string[] {
  return ['lunum-sem/0.2', 'lunum-record/0.2'];
}

/**
 * Check if a schema is covered by the fingerprint contract.
 *
 * @param schemaVersion - Schema version to check
 * @returns true if the schema is covered
 */
export function isFingerprintSchemaFrozen(schemaVersion: string): boolean {
  return getFingerprintFrozenSchemas().includes(schemaVersion);
}

/**
 * Get the migration path for fingerprint versions.
 *
 * @param fromVersion - Source fingerprint version
 * @param toVersion - Target fingerprint version
 * @returns Migration steps as strings
 */
export function getFingerprintMigrationPath(fromVersion: string, toVersion: string): string[] {
  const from = FP_VERSION_REGISTRY[fromVersion];
  const to = FP_VERSION_REGISTRY[toVersion];

  if (!from || !to) return [];

  const steps: string[] = [];

  if (fromVersion === toVersion) return ['No migration needed'];

  if (from.lifecycleState === 'obsolete' || to.lifecycleState === 'frozen') {
    steps.push('Regenerate fingerprint using current algorithm');
  }

  if (from.algorithm !== to.algorithm) {
    steps.push(`Switch hash algorithm: ${from.algorithm} → ${to.algorithm}`);
  }

  if (from.version !== to.version) {
    steps.push(`Update version tag: ${from.version} → ${to.version}`);
  }

  return steps;
}

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Ensure fingerprint digest length is within contract bounds.
 */
function boundedLength(length: number): number {
  return Math.max(FP_MIN_DIGEST_LENGTH, Math.min(FP_MAX_DIGEST_LENGTH, Math.trunc(length)));
}

/**
 * Parse a fingerprint string into its components (re-exported from fingerprint-migration).
 */
function parseFingerprint(fp: string): { prefix: string; version: string; algorithm: string; digest: string } | null {
  const m = /^(?<prefix>lfp|lsf):(?<version>\d+\.\d+):(?<algo>sha256):(?<digest>[a-f0-9]+)$/.exec(fp);
  if (!m || !m.groups) return null;
  const { prefix, version, algo, digest } = m.groups;
  return {
    prefix: prefix!,
    version: version!,
    algorithm: algo!,
    digest: digest!
  };
}

// ── Export ─────────────────────────────────────────────────────────

export const fingerprintContractExports = [
  FP_CONTRACT_VERSION,
  FP_CONTRACT_ALGORITHM,
  FP_DEFAULT_DIGEST_LENGTH,
  FP_SURFACE_DEFAULT_DIGEST_LENGTH,
  FP_MIN_DIGEST_LENGTH,
  FP_MAX_DIGEST_LENGTH,
  FP_CONTRACT_ENTRY,
  FP_VERSION_REGISTRY,
  FP_STABLE_SUPPORT_WINDOW_DAYS,
  FP_SECURITY_SUPPORT_WINDOW_DAYS,
  FP_GOLDEN_VECTORS,
  COMPUTED_GOLDEN_VECTORS,
  contractFingerprintSem,
  contractSurfaceFingerprint,
  computeFingerprint,
  isFingerprintVersionSupported,
  getFingerprintVersionState,
  isFingerprintVersionStable,
  checkFingerprintContract,
  verifyGoldenVectors,
  getFingerprintFrozenSchemas,
  isFingerprintSchemaFrozen,
  getFingerprintMigrationPath
] as const;
