import crypto from 'node:crypto';
import { FP_VERSION } from './constants.js';
import { canonicalizeSem, stableStringify } from './canonicalize.js';

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
