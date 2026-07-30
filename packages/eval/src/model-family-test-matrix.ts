import { createHash } from 'node:crypto';

export const MATRIX_VERSION = '0.1.0' as const;

export interface ModelFamilyProfile {
  family: string;
  modelId: string;
  quantization: string;
  chatTemplate: string;
  contextLength: number;
  profileHash: string;
  frozen: boolean;
}

export interface ModelFamilyTestMatrix {
  version: string;
  families: ModelFamilyProfile[];
  testCategories: string[];
  expectedMinParse: number;
  expectedMinRetention: number;
}

function computeProfileHash(profile: Omit<ModelFamilyProfile, 'profileHash'>): string {
  const profileJson = JSON.stringify(profile, null, 2);
  return createHash('sha256').update(profileJson).digest('hex');
}

function createFrozenProfile(
  family: string,
  modelId: string,
  quantization: string,
  chatTemplate: string,
  contextLength: number,
): ModelFamilyProfile {
  const profileWithoutHash: Omit<ModelFamilyProfile, 'profileHash'> = {
    family,
    modelId,
    quantization,
    chatTemplate,
    contextLength,
    frozen: true,
  };

  const profileHash = computeProfileHash(profileWithoutHash);

  return {
    ...profileWithoutHash,
    profileHash,
  };
}

const QWEN_PROFILES: ModelFamilyProfile[] = [
  createFrozenProfile('qwen', 'Qwen3-Coder-30B-A3B-Q4_K_M', 'Q4_K_M', 'qwen', 32768),
  createFrozenProfile('qwen', 'Qwen3.6-35B-A3B-Q4_K_M', 'Q4_K_M', 'qwen', 32768),
];

const GEMMA_PROFILES: ModelFamilyProfile[] = [
  createFrozenProfile('gemma', 'SuperGemma4-E4B-Q5_K_M', 'Q5_K_M', 'gemma', 8192),
  createFrozenProfile('gemma', 'Gemma-2-27B-Q4_K_M', 'Q4_K_M', 'gemma', 8192),
];

const LLAMA_PROFILES: ModelFamilyProfile[] = [
  createFrozenProfile('llama', 'Llama-3.3-70B-Q4_K_M', 'Q4_K_M', 'llama', 8192),
  createFrozenProfile('llama', 'Llama-3.1-8B-Q4_K_M', 'Q4_K_M', 'llama', 8192),
];

const ALL_PROFILES = [...QWEN_PROFILES, ...GEMMA_PROFILES, ...LLAMA_PROFILES];

export const MODEL_FAMILY_TEST_MATRIX: ModelFamilyTestMatrix = {
  version: MATRIX_VERSION,
  families: ALL_PROFILES,
  testCategories: ['parse', 'retention', 'latency', 'schema-validation'],
  expectedMinParse: 0.85,
  expectedMinRetention: 0.8,
};

export function validateProfile(profile: ModelFamilyProfile): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile.family) {
    errors.push('missing family');
  }

  if (!profile.modelId) {
    errors.push('missing modelId');
  }

  if (!profile.quantization) {
    errors.push('missing quantization');
  }

  if (!profile.chatTemplate) {
    errors.push('missing chatTemplate');
  }

  if (typeof profile.contextLength !== 'number' || profile.contextLength <= 0) {
    errors.push('invalid contextLength');
  }

  if (!profile.profileHash || !/^[a-f0-9]{64}$/u.test(profile.profileHash)) {
    errors.push('invalid or missing profileHash (must be 64 hex chars)');
  }

  if (typeof profile.frozen !== 'boolean') {
    errors.push('invalid frozen field');
  }

  // Verify hash is correct
  if (profile.profileHash) {
    const expectedHash = computeProfileHash({
      family: profile.family,
      modelId: profile.modelId,
      quantization: profile.quantization,
      chatTemplate: profile.chatTemplate,
      contextLength: profile.contextLength,
      frozen: profile.frozen,
    });

    if (profile.profileHash !== expectedHash) {
      errors.push(`hash mismatch: expected ${expectedHash}, got ${profile.profileHash}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function getProfilesForFamily(family: string): ModelFamilyProfile[] {
  return ALL_PROFILES.filter(p => p.family === family);
}
