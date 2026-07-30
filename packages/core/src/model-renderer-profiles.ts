import type { ProfileType } from './profiles.js';

export const RENDERER_PROFILES_VERSION = '1.0.0';

export interface ModelRendererProfile {
  modelFamily: string;
  modelId: string;
  displayName: string;
  identity: string;
  quantization: string;
  chatTemplate: string;
  rendererProfile: ProfileType;
  acceptedProfiles: ProfileType[];
  defaultProfile: ProfileType;
  tokenizer: string;
  tokenEfficiency: number;
  verifiedAt: string;
}

const QWEN_PROFILES: ModelRendererProfile[] = [
  {
    modelFamily: 'qwen',
    modelId: 'Qwen3-Coder-30B-A3B',
    displayName: 'Qwen3 Coder 30B A3B',
    identity: 'qwen3-coder-30b-a3b',
    quantization: 'Q4_K_M',
    chatTemplate: 'chatml',
    rendererProfile: 'short',
    acceptedProfiles: ['safe', 'short'],
    defaultProfile: 'short',
    tokenizer: 'qwen',
    tokenEfficiency: 0.92,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'qwen',
    modelId: 'Qwen3.6-35B-A3B',
    displayName: 'Qwen3.6 35B A3B',
    identity: 'qwen36-35b-a3b',
    quantization: 'Q4_K_M',
    chatTemplate: 'chatml',
    rendererProfile: 'short',
    acceptedProfiles: ['safe', 'short'],
    defaultProfile: 'short',
    tokenizer: 'qwen',
    tokenEfficiency: 0.91,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'qwen',
    modelId: 'Qwen3.5-4B-MTP',
    displayName: 'Qwen3.5 4B MTP',
    identity: 'qwen35-4b-mtp',
    quantization: 'Q4_K_M',
    chatTemplate: 'chatml',
    rendererProfile: 'safe',
    acceptedProfiles: ['safe'],
    defaultProfile: 'safe',
    tokenizer: 'qwen',
    tokenEfficiency: 0.88,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
];

const LLAMA_PROFILES: ModelRendererProfile[] = [
  {
    modelFamily: 'llama',
    modelId: 'Llama-3.3-70B',
    displayName: 'Llama 3.3 70B',
    identity: 'llama-33-70b',
    quantization: 'Q4_K_M',
    chatTemplate: 'llama3',
    rendererProfile: 'safe',
    acceptedProfiles: ['safe'],
    defaultProfile: 'safe',
    tokenizer: 'llama',
    tokenEfficiency: 0.89,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'llama',
    modelId: 'Llama-3.1-8B',
    displayName: 'Llama 3.1 8B',
    identity: 'llama-31-8b',
    quantization: 'Q4_K_M',
    chatTemplate: 'llama3',
    rendererProfile: 'short',
    acceptedProfiles: ['safe', 'short'],
    defaultProfile: 'short',
    tokenizer: 'llama',
    tokenEfficiency: 0.87,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
];

const GEMMA_PROFILES: ModelRendererProfile[] = [
  {
    modelFamily: 'gemma',
    modelId: 'Gemma-2-27B',
    displayName: 'Gemma 2 27B',
    identity: 'gemma-2-27b',
    quantization: 'Q4_K_M',
    chatTemplate: 'gemma',
    rendererProfile: 'short',
    acceptedProfiles: ['safe', 'short'],
    defaultProfile: 'short',
    tokenizer: 'gemma',
    tokenEfficiency: 0.90,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'gemma',
    modelId: 'Gemma-2-9B',
    displayName: 'Gemma 2 9B',
    identity: 'gemma-2-9b',
    quantization: 'Q4_K_M',
    chatTemplate: 'gemma',
    rendererProfile: 'short',
    acceptedProfiles: ['safe', 'short'],
    defaultProfile: 'short',
    tokenizer: 'gemma',
    tokenEfficiency: 0.85,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
  {
    modelFamily: 'gemma',
    modelId: 'SuperGemma4-E4B',
    displayName: 'SuperGemma4 E4B',
    identity: 'supergemma4-e4b',
    quantization: 'Q4_K_M',
    chatTemplate: 'gemma',
    rendererProfile: 'tight',
    acceptedProfiles: ['safe', 'short', 'tight'],
    defaultProfile: 'tight',
    tokenizer: 'gemma',
    tokenEfficiency: 0.93,
    verifiedAt: '2026-07-30T00:00:00Z',
  },
];

export const MODEL_RENDERER_PROFILES: ModelRendererProfile[] = [
  ...QWEN_PROFILES,
  ...LLAMA_PROFILES,
  ...GEMMA_PROFILES,
];

export function getProfileForModel(modelId: string): ModelRendererProfile | undefined {
  return MODEL_RENDERER_PROFILES.find(p => p.modelId === modelId);
}

export function listSupportedFamilies(): string[] {
  const families = new Set(MODEL_RENDERER_PROFILES.map(p => p.modelFamily));
  return Array.from(families).sort();
}

export function getProfilesByFamily(family: string): ModelRendererProfile[] {
  return MODEL_RENDERER_PROFILES.filter(p => p.modelFamily === family);
}

export function listAllProfiles(): ModelRendererProfile[] {
  return [...MODEL_RENDERER_PROFILES];
}
