import type { ProfileType } from './profiles.js';

/**
 * Renderer profiles version.
 */
export const RENDERER_PROFILES_VERSION = '1.0.0';

/**
 * Model-specific renderer profile with quantization details.
 */
export interface ModelRendererProfile {
  /** Model family (qwen, llama, gemma) */
  modelFamily: string;
  /** Model ID (e.g., "Qwen3-Coder-30B-A3B") */
  modelId: string;
  /** Quantization format (e.g., "Q4_K_M") */
  quantization: string;
  /** Chat template format (e.g., "chatml", "llama3", "gemma") */
  chatTemplate: string;
  /** Recommended renderer profile type (safe, short, tight) */
  rendererProfile: ProfileType;
  /** Token efficiency metric (0-1, higher is better) */
  tokenEfficiency: number;
  /** ISO 8601 timestamp of verification */
  verifiedAt: string;
}

/**
 * Qwen model profiles
 */
const QWEN_PROFILES: ModelRendererProfile[] = [
  {
    modelFamily: 'qwen',
    modelId: 'Qwen3-Coder-30B-A3B',
    quantization: 'Q4_K_M',
    chatTemplate: 'chatml',
    rendererProfile: 'short',
    tokenEfficiency: 0.92,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'qwen',
    modelId: 'Qwen3.6-35B-A3B',
    quantization: 'Q4_K_M',
    chatTemplate: 'chatml',
    rendererProfile: 'short',
    tokenEfficiency: 0.91,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'qwen',
    modelId: 'Qwen3.5-4B-MTP',
    quantization: 'Q4_K_M',
    chatTemplate: 'chatml',
    rendererProfile: 'safe',
    tokenEfficiency: 0.88,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
];

/**
 * Llama model profiles
 */
const LLAMA_PROFILES: ModelRendererProfile[] = [
  {
    modelFamily: 'llama',
    modelId: 'Llama-3.3-70B',
    quantization: 'Q4_K_M',
    chatTemplate: 'llama3',
    rendererProfile: 'safe',
    tokenEfficiency: 0.89,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'llama',
    modelId: 'Llama-3.1-8B',
    quantization: 'Q4_K_M',
    chatTemplate: 'llama3',
    rendererProfile: 'short',
    tokenEfficiency: 0.87,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
];

/**
 * Gemma model profiles
 */
const GEMMA_PROFILES: ModelRendererProfile[] = [
  {
    modelFamily: 'gemma',
    modelId: 'Gemma-2-27B',
    quantization: 'Q4_K_M',
    chatTemplate: 'gemma',
    rendererProfile: 'short',
    tokenEfficiency: 0.90,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'gemma',
    modelId: 'Gemma-2-9B',
    quantization: 'Q4_K_M',
    chatTemplate: 'gemma',
    rendererProfile: 'short',
    tokenEfficiency: 0.85,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'gemma',
    modelId: 'SuperGemma4-E4B',
    quantization: 'Q4_K_M',
    chatTemplate: 'gemma',
    rendererProfile: 'tight',
    tokenEfficiency: 0.93,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
];

/**
 * Complete registry of model renderer profiles
 */
export const MODEL_RENDERER_PROFILES: ModelRendererProfile[] = [
  ...QWEN_PROFILES,
  ...LLAMA_PROFILES,
  ...GEMMA_PROFILES,
];

/**
 * Get renderer profile for a specific model ID.
 * @param modelId - The model ID to look up
 * @returns The renderer profile or undefined if not found
 */
export function getProfileForModel(modelId: string): ModelRendererProfile | undefined {
  return MODEL_RENDERER_PROFILES.find(p => p.modelId === modelId);
}

/**
 * List all supported model families.
 * @returns Array of unique family names
 */
export function listSupportedFamilies(): string[] {
  const families = new Set(MODEL_RENDERER_PROFILES.map(p => p.modelFamily));
  return Array.from(families).sort();
}

/**
 * Get all profiles for a specific model family.
 * @param family - The model family name
 * @returns Array of profiles for that family
 */
export function getProfilesByFamily(family: string): ModelRendererProfile[] {
  return MODEL_RENDERER_PROFILES.filter(p => p.modelFamily === family);
}

/**
 * List all renderer profiles for a given model ID.
 * @returns Array of all profiles in the registry
 */
export function listAllProfiles(): ModelRendererProfile[] {
  return [...MODEL_RENDERER_PROFILES];
}
