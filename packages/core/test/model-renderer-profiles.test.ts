import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENDERER_PROFILES_VERSION,
  MODEL_RENDERER_PROFILES,
  getProfileForModel,
  listSupportedFamilies,
  getProfilesByFamily,
  type ModelRendererProfile,
} from '../src/model-renderer-profiles.js';

const REQUIRED_FAMILIES = ['qwen', 'llama', 'gemma'];
const VALID_RENDERER_PROFILES = ['safe', 'short', 'tight'] as const;

describe('ModelRendererProfile', () => {
  it('RENDERER_PROFILES_VERSION is set to 1.0.0', () => {
    assert.equal(RENDERER_PROFILES_VERSION, '1.0.0');
  });

  it('MODEL_RENDERER_PROFILES has at least 8 profiles', () => {
    assert.ok(MODEL_RENDERER_PROFILES.length >= 8);
  });

  it('all three families (qwen, llama, gemma) are covered', () => {
    const families = listSupportedFamilies();
    for (const family of REQUIRED_FAMILIES) {
      assert.ok(families.includes(family), `missing family: ${family}`);
    }
    assert.equal(families.length, REQUIRED_FAMILIES.length);
  });

  it('getProfileForModel returns correct profile for known models', () => {
    const qwenProfile = getProfileForModel('Qwen3-Coder-30B-A3B');
    assert.ok(qwenProfile);
    assert.equal(qwenProfile.modelFamily, 'qwen');
    assert.equal(qwenProfile.modelId, 'Qwen3-Coder-30B-A3B');
    assert.equal(qwenProfile.quantization, 'Q4_K_M');
    assert.equal(qwenProfile.rendererProfile, 'short');

    const llamaProfile = getProfileForModel('Llama-3.1-8B');
    assert.ok(llamaProfile);
    assert.equal(llamaProfile.modelFamily, 'llama');
    assert.equal(llamaProfile.modelId, 'Llama-3.1-8B');

    const gemmaProfile = getProfileForModel('Gemma-2-27B');
    assert.ok(gemmaProfile);
    assert.equal(gemmaProfile.modelFamily, 'gemma');
  });

  it('getProfileForModel returns undefined for unknown models', () => {
    const unknown = getProfileForModel('UnknownModel-999B');
    assert.equal(unknown, undefined);
  });

  it('listSupportedFamilies includes all three families', () => {
    const families = listSupportedFamilies();
    for (const family of REQUIRED_FAMILIES) {
      assert.ok(families.includes(family));
    }
  });

  it('each profile references a valid renderer profile name', () => {
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.ok(
        VALID_RENDERER_PROFILES.includes(profile.rendererProfile),
        `invalid renderer profile: ${profile.rendererProfile}`
      );
    }
  });

  it('Qwen profiles use chatml template', () => {
    const qwenProfiles = getProfilesByFamily('qwen');
    assert.ok(qwenProfiles.length > 0);
    for (const profile of qwenProfiles) {
      assert.equal(profile.chatTemplate, 'chatml', `${profile.modelId} should use chatml`);
    }
  });

  it('Llama profiles use llama3 template', () => {
    const llamaProfiles = getProfilesByFamily('llama');
    assert.ok(llamaProfiles.length > 0);
    for (const profile of llamaProfiles) {
      assert.equal(profile.chatTemplate, 'llama3', `${profile.modelId} should use llama3`);
    }
  });

  it('Gemma profiles use gemma template', () => {
    const gemmaProfiles = getProfilesByFamily('gemma');
    assert.ok(gemmaProfiles.length > 0);
    for (const profile of gemmaProfiles) {
      assert.equal(profile.chatTemplate, 'gemma', `${profile.modelId} should use gemma`);
    }
  });

  it('all profiles have tokenEfficiency between 0 and 1', () => {
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.ok(profile.tokenEfficiency >= 0 && profile.tokenEfficiency <= 1,
        `${profile.modelId} tokenEfficiency must be 0-1, got ${profile.tokenEfficiency}`);
    }
  });

  it('all profiles have ISO 8601 verifiedAt timestamp', () => {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.ok(iso8601Regex.test(profile.verifiedAt),
        `${profile.modelId} verifiedAt must be ISO 8601, got ${profile.verifiedAt}`);
    }
  });

  it('Qwen family has expected models', () => {
    const qwenProfiles = getProfilesByFamily('qwen');
    const modelIds = qwenProfiles.map(p => p.modelId);
    assert.ok(modelIds.includes('Qwen3-Coder-30B-A3B'));
    assert.ok(modelIds.includes('Qwen3.6-35B-A3B'));
    assert.ok(modelIds.includes('Qwen3.5-4B-MTP'));
  });

  it('Llama family has expected models', () => {
    const llamaProfiles = getProfilesByFamily('llama');
    const modelIds = llamaProfiles.map(p => p.modelId);
    assert.ok(modelIds.includes('Llama-3.3-70B'));
    assert.ok(modelIds.includes('Llama-3.1-8B'));
  });

  it('Gemma family has expected models', () => {
    const gemmaProfiles = getProfilesByFamily('gemma');
    const modelIds = gemmaProfiles.map(p => p.modelId);
    assert.ok(modelIds.includes('Gemma-2-27B'));
    assert.ok(modelIds.includes('Gemma-2-9B'));
    assert.ok(modelIds.includes('SuperGemma4-E4B'));
  });

  it('all profiles use Q4_K_M quantization', () => {
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.equal(profile.quantization, 'Q4_K_M',
        `${profile.modelId} should use Q4_K_M quantization`);
    }
  });
});
