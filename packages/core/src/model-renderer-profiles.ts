import type { ModelIdentity } from './model-identity.js';
import type { ProfileType } from './profiles.js';

export interface AcceptedRendererProfile {
  family: string;
  displayName: string;
  identity: Partial<ModelIdentity>;
  acceptedProfiles: ProfileType[];
  defaultProfile: ProfileType;
  tokenizer: {
    model: string;
    vocabSize: number;
    bos?: string;
    eos?: string;
    chatTemplate?: string;
  };
  retentionBaseline?: {
    safePreservation: number;
    shortPreservation: number;
    tightPreservation: number;
  };
}

const QWEN3_PROFILE: AcceptedRendererProfile = {
  family: 'qwen',
  displayName: 'Qwen 3.x',
  identity: { family: 'qwen', name: 'Qwen3' },
  acceptedProfiles: ['safe', 'short', 'tight'],
  defaultProfile: 'short',
  tokenizer: {
    model: 'qwen2',
    vocabSize: 151936,
    bos: '<|im_start|>',
    eos: '<|im_end|>',
    chatTemplate: 'chatml',
  },
  retentionBaseline: {
    safePreservation: 1.0,
    shortPreservation: 0.95,
    tightPreservation: 0.88,
  },
};

const LLAMA3_PROFILE: AcceptedRendererProfile = {
  family: 'llama',
  displayName: 'Llama 3.x',
  identity: { family: 'llama', name: 'Llama-3' },
  acceptedProfiles: ['safe', 'short'],
  defaultProfile: 'safe',
  tokenizer: {
    model: 'gpt2',
    vocabSize: 128256,
    bos: '<|begin_of_text|>',
    eos: '<|end_of_text|>',
    chatTemplate: 'llama3',
  },
  retentionBaseline: {
    safePreservation: 1.0,
    shortPreservation: 0.92,
    tightPreservation: 0.82,
  },
};

const GEMMA_PROFILE: AcceptedRendererProfile = {
  family: 'gemma',
  displayName: 'Gemma / SuperGemma',
  identity: { family: 'gemma', name: 'Gemma' },
  acceptedProfiles: ['safe', 'short', 'tight'],
  defaultProfile: 'short',
  tokenizer: {
    model: 'llama-bpe',
    vocabSize: 256000,
    bos: '<bos>',
    eos: '<eos>',
    chatTemplate: 'gemma',
  },
  retentionBaseline: {
    safePreservation: 1.0,
    shortPreservation: 0.94,
    tightPreservation: 0.86,
  },
};

const REGISTRY = new Map<string, AcceptedRendererProfile>([
  ['qwen', QWEN3_PROFILE],
  ['llama', LLAMA3_PROFILE],
  ['gemma', GEMMA_PROFILE],
]);

export function getAcceptedRendererProfile(family: string): AcceptedRendererProfile | undefined {
  return REGISTRY.get(family.toLowerCase());
}

export function listAcceptedRendererProfiles(): AcceptedRendererProfile[] {
  return [...REGISTRY.values()];
}

export function resolveProfileForModel(identity: ModelIdentity): {
  profile: AcceptedRendererProfile;
  recommendedType: ProfileType;
} | undefined {
  const familyProfile = REGISTRY.get(identity.family.toLowerCase());
  if (!familyProfile) return undefined;
  return {
    profile: familyProfile,
    recommendedType: familyProfile.defaultProfile,
  };
}

export function isProfileAccepted(family: string, profileType: ProfileType): boolean {
  const profile = REGISTRY.get(family.toLowerCase());
  if (!profile) return false;
  return profile.acceptedProfiles.includes(profileType);
}

export const ACCEPTED_PROFILES_REGISTRY_SIZE = REGISTRY.size;
