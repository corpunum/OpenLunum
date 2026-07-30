/**
 * Model Weight Hash Verification (R13.3)
 *
 * This module provides model-weight hash verification to ensure exact identity
 * of model weights across evaluations. Each model weight is verified against a
 * SHA-256 hash and includes provenance metadata (source, size, verification timestamp).
 */

export const MODEL_WEIGHT_HASH_VERSION = '0.1.0';

/**
 * A record of a model's weight file, including its hash and provenance.
 */
export interface ModelWeightRecord {
  /** Unique model identifier (e.g., "Qwen3-Coder-30B-A3B") */
  modelId: string;
  /** Quantization format (e.g., "GGUF Q4_K_M") */
  quantization: string;
  /** SHA-256 hash of the weight file (64 hex characters) */
  fileHash: string;
  /** File size in bytes */
  fileSize: number;
  /** Source where the weight was obtained (e.g., URL or local path) */
  source: string;
  /** ISO 8601 timestamp when this record was verified */
  verifiedAt: string;
}

/**
 * A registry of model weights with their hashes and verification status.
 */
export interface WeightHashRegistry {
  version: string;
  entries: Map<string, ModelWeightRecord>;
}

/**
 * Result of a weight verification operation.
 */
export interface WeightVerificationResult {
  verified: boolean;
  modelId: string;
  expectedHash: string;
  actualHash?: string;
  error?: string;
}

/**
 * Create a new, empty weight hash registry.
 */
export function createWeightHashRegistry(): WeightHashRegistry {
  return {
    version: MODEL_WEIGHT_HASH_VERSION,
    entries: new Map()
  };
}

/**
 * Register a model weight in the registry. Throws if a different entry
 * already exists for this modelId.
 */
export function registerModelWeight(
  registry: WeightHashRegistry,
  record: ModelWeightRecord
): void {
  const key = `${record.modelId}:${record.quantization}`;
  const existing = registry.entries.get(key);

  if (existing && existing.fileHash !== record.fileHash) {
    throw new Error(
      `Duplicate model weight for ${key}: existing hash ${existing.fileHash} differs from ${record.fileHash}`
    );
  }

  registry.entries.set(key, record);
}

/**
 * Verify that a model weight matches the expected hash in the registry.
 * Returns a result object indicating success or failure.
 */
export function verifyModelWeight(
  registry: WeightHashRegistry,
  modelId: string,
  expectedHash: string,
  quantization: string = 'default'
): WeightVerificationResult {
  const key = `${modelId}:${quantization}`;
  const entry = registry.entries.get(key);

  if (!entry) {
    return {
      verified: false,
      modelId,
      expectedHash,
      error: `Model weight ${key} not found in registry`
    };
  }

  if (entry.fileHash !== expectedHash) {
    return {
      verified: false,
      modelId,
      expectedHash,
      actualHash: entry.fileHash,
      error: `Hash mismatch for ${key}`
    };
  }

  return {
    verified: true,
    modelId,
    expectedHash
  };
}

/**
 * Audit all entries in the registry to ensure they have complete provenance
 * (source, hash, and size are all present).
 *
 * Returns a list of any entries that fail the audit.
 */
export function auditWeightProvenance(
  registry: WeightHashRegistry
): Array<{ modelId: string; issue: string }> {
  const issues: Array<{ modelId: string; issue: string }> = [];

  for (const [key, entry] of registry.entries) {
    if (!entry.source) {
      issues.push({ modelId: key, issue: 'missing source' });
    }
    if (!entry.fileHash) {
      issues.push({ modelId: key, issue: 'missing fileHash' });
    }
    if (!entry.fileSize || entry.fileSize <= 0) {
      issues.push({ modelId: key, issue: 'missing fileSize' });
    }
  }

  return issues;
}

/**
 * The curated registry of known model weight identities used in OpenLunum.
 *
 * IMPORTANT: The SHA-256 hashes below are PLACEHOLDER values and must be replaced
 * with the actual hashes from the real GGUF files using:
 *   sha256sum <path-to-gguf-file>
 */
export const KNOWN_MODEL_WEIGHTS: ModelWeightRecord[] = [
  {
    modelId: 'Qwen3-Coder-30B-A3B',
    quantization: 'GGUF Q4_K_M',
    // PLACEHOLDER: Replace with real hash from: sha256sum Qwen3-Coder-30B-A3B.Q4_K_M.gguf
    fileHash: 'a'.repeat(64),
    fileSize: 0,
    source: 'huggingface://path/to/Qwen3-Coder-30B-A3B.Q4_K_M.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  },
  {
    modelId: 'SuperQwen-AgentWorld-35B',
    quantization: 'GGUF default',
    // PLACEHOLDER: Replace with real hash from: sha256sum SuperQwen-AgentWorld-35B.gguf
    fileHash: 'b'.repeat(64),
    fileSize: 0,
    source: 'huggingface://path/to/SuperQwen-AgentWorld-35B.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  },
  {
    modelId: 'Qwen3.6-35B-A3B',
    quantization: 'GGUF default',
    // PLACEHOLDER: Replace with real hash from: sha256sum Qwen3.6-35B-A3B.gguf
    fileHash: 'c'.repeat(64),
    fileSize: 0,
    source: 'huggingface://path/to/Qwen3.6-35B-A3B.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  },
  {
    modelId: 'SuperGemma4-E4B',
    quantization: 'GGUF default',
    // PLACEHOLDER: Replace with real hash from: sha256sum SuperGemma4-E4B.gguf
    fileHash: 'd'.repeat(64),
    fileSize: 0,
    source: 'huggingface://path/to/SuperGemma4-E4B.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  },
  {
    modelId: 'Qwen3.5-4B-MTP',
    quantization: 'GGUF default',
    // PLACEHOLDER: Replace with real hash from: sha256sum Qwen3.5-4B-MTP.gguf
    fileHash: 'e'.repeat(64),
    fileSize: 0,
    source: 'huggingface://path/to/Qwen3.5-4B-MTP.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  }
];

/**
 * Create a registry populated with the known model weights.
 */
export function createKnownWeightRegistry(): WeightHashRegistry {
  const registry = createWeightHashRegistry();
  for (const record of KNOWN_MODEL_WEIGHTS) {
    registerModelWeight(registry, record);
  }
  return registry;
}
