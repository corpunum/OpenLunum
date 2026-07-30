import type { ProfileType } from './profiles.js';

export const RENDERER_PROFILES_VERSION = '1.0.0';

/**
 * Tokenizer identity information for a model.
 * Includes complete identification: name, version, and vocabulary size.
 */
export interface TokenizerIdentity {
  /** Tokenizer name (e.g., 'qwen', 'llama', 'gemma') */
  name: string;
  /** Tokenizer version (e.g., '2.1', '3.0') */
  version: string;
  /** Vocabulary size in tokens */
  vocabSize: number;
}

/**
 * Template identity information for a model's chat format.
 */
export interface TemplateIdentity {
  /** Template type (e.g., 'chatml', 'llama3', 'gemma') */
  type: string;
  /** Template version (e.g., '1.0', '1.1') */
  version: string;
}

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
  /** @deprecated Use tokenizerIdentity instead */
  tokenizer: string;
  /** Complete tokenizer identity including version and vocab size */
  tokenizerIdentity: TokenizerIdentity;
  /** Complete template identity including version */
  templateIdentity: TemplateIdentity;
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
    tokenizerIdentity: { name: 'qwen', version: '3.0', vocabSize: 152064 },
    templateIdentity: { type: 'chatml', version: '1.0' },
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
    tokenizerIdentity: { name: 'qwen', version: '3.0', vocabSize: 152064 },
    templateIdentity: { type: 'chatml', version: '1.0' },
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
    tokenizerIdentity: { name: 'qwen', version: '3.0', vocabSize: 152064 },
    templateIdentity: { type: 'chatml', version: '1.0' },
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
    tokenizerIdentity: { name: 'llama', version: '3.3', vocabSize: 128256 },
    templateIdentity: { type: 'llama3', version: '1.0' },
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
    tokenizerIdentity: { name: 'llama', version: '3.1', vocabSize: 128256 },
    templateIdentity: { type: 'llama3', version: '1.0' },
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
    tokenizerIdentity: { name: 'gemma', version: '2.0', vocabSize: 256000 },
    templateIdentity: { type: 'gemma', version: '1.0' },
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
    tokenizerIdentity: { name: 'gemma', version: '2.0', vocabSize: 256000 },
    templateIdentity: { type: 'gemma', version: '1.0' },
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
    tokenizerIdentity: { name: 'gemma', version: '3.0', vocabSize: 256000 },
    templateIdentity: { type: 'gemma', version: '1.1' },
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

/** Error result for profile selection rejection */
export interface ProfileSelectionRejection {
  kind: 'rejection';
  reason: string;
  modelId?: string;
  environment?: string;
}

/**
 * Validates that a model family is supported.
 * @throws ProfileSelectionRejection if the family is unknown
 */
export function validateModelFamily(family: string): void {
  const supported = listSupportedFamilies();
  if (!supported.includes(family)) {
    throw {
      kind: 'rejection',
      reason: `Unknown model family: ${family}. Supported families: ${supported.join(', ')}`,
    } as ProfileSelectionRejection;
  }
}

/**
 * Validates that a profile is supported by a model.
 * @throws ProfileSelectionRejection if the profile is not supported
 */
export function validateProfileSupport(
  modelId: string,
  requestedProfile: string,
): void {
  const profile = getProfileForModel(modelId);
  if (!profile) {
    throw {
      kind: 'rejection',
      reason: `Unknown model: ${modelId}`,
      modelId,
    } as ProfileSelectionRejection;
  }

  if (!profile.acceptedProfiles.includes(requestedProfile as any)) {
    throw {
      kind: 'rejection',
      reason: `Profile '${requestedProfile}' not supported for model ${modelId}. Accepted profiles: ${profile.acceptedProfiles.join(', ')}`,
      modelId,
      environment: `profile:${requestedProfile}`,
    } as ProfileSelectionRejection;
  }
}

/**
 * Validates tokenizer identity compatibility between two profiles.
 * @throws ProfileSelectionRejection if tokenizers are incompatible
 */
export function validateTokenizerCompatibility(
  profile1: ModelRendererProfile,
  profile2: ModelRendererProfile,
): void {
  if (
    profile1.tokenizerIdentity.name !== profile2.tokenizerIdentity.name ||
    profile1.tokenizerIdentity.version !== profile2.tokenizerIdentity.version ||
    profile1.tokenizerIdentity.vocabSize !== profile2.tokenizerIdentity.vocabSize
  ) {
    throw {
      kind: 'rejection',
      reason: `Tokenizer mismatch: ${profile1.modelId} (${profile1.tokenizerIdentity.name} v${profile1.tokenizerIdentity.version}) vs ${profile2.modelId} (${profile2.tokenizerIdentity.name} v${profile2.tokenizerIdentity.version})`,
      modelId: `${profile1.modelId};${profile2.modelId}`,
    } as ProfileSelectionRejection;
  }
}

/**
 * Validates template identity compatibility between two profiles.
 * @throws ProfileSelectionRejection if templates are incompatible
 */
export function validateTemplateCompatibility(
  profile1: ModelRendererProfile,
  profile2: ModelRendererProfile,
): void {
  if (
    profile1.templateIdentity.type !== profile2.templateIdentity.type ||
    profile1.templateIdentity.version !== profile2.templateIdentity.version
  ) {
    throw {
      kind: 'rejection',
      reason: `Template mismatch: ${profile1.modelId} (${profile1.templateIdentity.type} v${profile1.templateIdentity.version}) vs ${profile2.modelId} (${profile2.templateIdentity.type} v${profile2.templateIdentity.version})`,
      modelId: `${profile1.modelId};${profile2.modelId}`,
    } as ProfileSelectionRejection;
  }
}
