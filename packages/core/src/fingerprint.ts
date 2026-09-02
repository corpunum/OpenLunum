import crypto from 'node:crypto';
import { FP_VERSION } from './constants.js';
import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { normalizeSemanticCandidate } from './semantic-registry.js';
import type { LunumClause, LunumSem } from './types.js';

/**
 * New identity projection. The legacy `fingerprintSem` output is preserved
 * because it is already stored in records and referenced by migration docs.
 * This version makes the semantic/metadata boundary explicit instead of
 * silently changing the meaning of `lfp:0.1`.
 */
/**
 * Version 2.1 makes the reference identity/evidence boundary explicit.  The
 * 2.0 projection accidentally hashed provider/source-language fields such as
 * a pronoun token.  Keep 2.0 readable for migration, but never silently
 * change its durable meaning.
 */
export const SEMANTIC_IDENTITY_FINGERPRINT_VERSION = '2.1' as const;

function identityClause(clause: LunumClause): LunumClause {
  const { annotations: _annotations, conditions, consequences, ...rest } = clause;
  return {
    ...rest,
    ...(conditions?.length ? { conditions: conditions.map(identityClause) } : {}),
    ...(consequences?.length ? { consequences: consequences.map(identityClause) } : {})
  };
}

/** Return only proposition-bearing Sem fields; provenance and annotations are metadata. */
export function semanticIdentityProjection(sem: LunumSem): Record<string, unknown> {
  const semanticReferences = (sem.references ?? []).flatMap((reference) => {
    if (reference.referenceKind === 'surface-evidence') return [];
    // `ref` is the grounded, language-neutral referent. `token`, `surface`,
    // `language`, and reference type describe source evidence and must not
    // alter proposition identity. An ungrounded reference remains preserved
    // in the Sem, but cannot assert exact identity.
    const ref = typeof reference.ref === 'string' ? reference.ref.trim() : '';
    const id = typeof reference.id === 'string' ? reference.id.trim() : '';
    const grounded = ref || id;
    return grounded ? [{ ref: grounded.normalize('NFKC').replace(/\s+/gu, '_').toLocaleLowerCase('und') }] : [];
  });
  return {
    protocol: 'lunum-protocol/0.1',
    schema: sem.schema,
    world: sem.world,
    kind: sem.kind,
    clauses: sem.clauses.map(identityClause),
    ...(semanticReferences.length ? { references: semanticReferences } : {})
  };
}

/**
 * Fingerprint a protocol-canonical Sem with metadata excluded. Unknown
 * controlled symbols are rejected rather than becoming durable identity.
 */
export function semanticFingerprint(sem: unknown, options: { length?: number } = {}): string {
  const normalization = normalizeSemanticCandidate(sem);
  if (!normalization.sem || !normalization.canonical) {
    throw new TypeError('Cannot compute semantic identity for a non-canonical protocol candidate');
  }
  const projection = semanticIdentityProjection(canonicalizeSem(normalization.sem));
  const digest = crypto.createHash('sha256').update(stableStringify(projection)).digest('hex');
  return `lfp:${SEMANTIC_IDENTITY_FINGERPRINT_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 32))}`;
}

/**
 * Fingerprint version and format specification (lunum-fp/1.0)
 *
 * Fingerprints are version-tagged strings with a canonical format:
 *   PREFIX:VERSION:ALGORITHM:DIGEST[0:LENGTH]
 *
 * Example:
 *   lfp:1.0:sha256:a1b2c3d4e5f6...
 *   lsf:1.0:sha256:f6e5d4c3b2a1...
 *
 * Where:
 * - PREFIX: "lfp" (lunum fingerprint) for semantic content, "lsf" for surface text
 * - VERSION: Fingerprint algorithm version (e.g., "1.0")
 * - ALGORITHM: Hash algorithm (sha256)
 * - DIGEST: Hex-encoded hash, optionally truncated to LENGTH (default 32 for lfp, 24 for lsf)
 *
 * The version field enables migration when the fingerprinting algorithm changes.
 * Fingerprints of different versions can coexist in the same dataset.
 */

/**
 * Ensure fingerprint digest length is within bounds.
 * Minimum 16 characters ensures sufficient collision resistance.
 * Maximum 64 characters (full SHA-256 hex) for maximum uniqueness.
 */
function boundedLength(length: number): number {
  return Math.max(16, Math.min(64, Math.trunc(length)));
}

/**
 * Compute a semantic fingerprint for a Lunum-Sem object.
 *
 * This is the canonical fingerprinting function for semantic content.
 * Process:
 * 1. Canonicalize the semantic object (normalize, sort, omit empty fields)
 * 2. Stable-stringify the canonical form (sorted object keys)
 * 3. Compute SHA-256 hash of the stringified content
 * 4. Truncate to bounded length (default 32 hex chars)
 * 5. Format as "lfp:VERSION:sha256:DIGEST"
 *
 * Properties:
 * - Deterministic: identical semantic content always produces identical fingerprints
 * - Collision-resistant: different semantic content produces different fingerprints (with high probability)
 * - Version-tagged: enables algorithm migration
 * - Default length 32 provides ~128 bits of collision resistance
 */
export function fingerprintSem(sem: unknown, options: { length?: number } = {}): string {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  return `lfp:${FP_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 32))}`;
}

/**
 * Compute a surface fingerprint for source text.
 *
 * This fingerprints the original source text (not the semantic representation).
 * Useful for detecting duplicates and near-duplicates at the text level.
 *
 * Process:
 * 1. Normalize text: NFKC Unicode, trim, consolidate whitespace, lowercase
 * 2. Compute SHA-256 hash of normalized text
 * 3. Truncate to bounded length (default 24 hex chars)
 * 4. Format as "lsf:VERSION:sha256:DIGEST"
 *
 * Properties:
 * - Text-level deduplication: detects textual duplicates
 * - Case-insensitive: normalizes case differences
 * - Whitespace-normalized: ignores leading/trailing/multiple spaces
 * - Version-tagged: enables algorithm migration
 * - Shorter default length (24) due to high collision likelihood with text normalization
 */
export function surfaceFingerprint(text: unknown, options: { length?: number } = {}): string {
  const normalized = String(text ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  return `lsf:${FP_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 24))}`;
}
