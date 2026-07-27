import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAcceptedRendererProfile,
  listAcceptedRendererProfiles,
  resolveProfileForModel,
  isProfileAccepted,
  ACCEPTED_PROFILES_REGISTRY_SIZE,
  type AcceptedRendererProfile,
} from '../src/model-renderer-profiles.js';
import type { ModelIdentity } from '../src/model-identity.js';

const REQUIRED_FAMILIES = ['qwen', 'llama', 'gemma'];

test('registry has profiles for Qwen, Llama, Gemma', () => {
  assert.ok(ACCEPTED_PROFILES_REGISTRY_SIZE >= 3);
  for (const family of REQUIRED_FAMILIES) {
    const profile = getAcceptedRendererProfile(family);
    assert.ok(profile, `missing profile for ${family}`);
    assert.equal(profile.family, family);
  }
});

test('listAcceptedRendererProfiles returns all registered profiles', () => {
  const profiles = listAcceptedRendererProfiles();
  assert.equal(profiles.length, ACCEPTED_PROFILES_REGISTRY_SIZE);
  const families = new Set(profiles.map(p => p.family));
  for (const family of REQUIRED_FAMILIES) {
    assert.ok(families.has(family), `missing ${family} in list`);
  }
});

test('each profile has tokenizer identity', () => {
  const profiles = listAcceptedRendererProfiles();
  for (const profile of profiles) {
    assert.ok(profile.tokenizer, `${profile.family} missing tokenizer`);
    assert.ok(profile.tokenizer.model, `${profile.family} missing tokenizer.model`);
    assert.ok(profile.tokenizer.vocabSize > 0, `${profile.family} vocabSize must be positive`);
  }
});

test('each profile has retention baseline', () => {
  const profiles = listAcceptedRendererProfiles();
  for (const profile of profiles) {
    assert.ok(profile.retentionBaseline, `${profile.family} missing retentionBaseline`);
    assert.ok(profile.retentionBaseline.safePreservation >= 0.9);
    assert.ok(profile.retentionBaseline.shortPreservation >= 0.8);
    assert.ok(profile.retentionBaseline.tightPreservation >= 0.7);
  }
});

test('each profile has at least one accepted profile type', () => {
  const profiles = listAcceptedRendererProfiles();
  for (const profile of profiles) {
    assert.ok(profile.acceptedProfiles.length > 0, `${profile.family} has no accepted profiles`);
    assert.ok(profile.acceptedProfiles.includes(profile.defaultProfile),
      `${profile.family} default profile not in accepted list`);
  }
});

test('resolveProfileForModel returns profile for known family', () => {
  const identity: ModelIdentity = { family: 'qwen', name: 'Qwen3-30B-A3B' };
  const result = resolveProfileForModel(identity);
  assert.ok(result);
  assert.equal(result.profile.family, 'qwen');
  assert.equal(result.recommendedType, 'short');
});

test('resolveProfileForModel returns undefined for unknown family', () => {
  const identity: ModelIdentity = { family: 'unknown', name: 'SomeModel' };
  const result = resolveProfileForModel(identity);
  assert.equal(result, undefined);
});

test('isProfileAccepted checks profile type against family', () => {
  assert.equal(isProfileAccepted('qwen', 'tight'), true);
  assert.equal(isProfileAccepted('llama', 'tight'), false);
  assert.equal(isProfileAccepted('llama', 'safe'), true);
  assert.equal(isProfileAccepted('unknown', 'safe'), false);
});

test('getAcceptedRendererProfile is case-insensitive', () => {
  assert.ok(getAcceptedRendererProfile('Qwen'));
  assert.ok(getAcceptedRendererProfile('LLAMA'));
  assert.ok(getAcceptedRendererProfile('Gemma'));
});

test('Qwen profile uses chatml template and qwen2 tokenizer', () => {
  const profile = getAcceptedRendererProfile('qwen')!;
  assert.equal(profile.tokenizer.model, 'qwen2');
  assert.equal(profile.tokenizer.chatTemplate, 'chatml');
  assert.equal(profile.tokenizer.vocabSize, 151936);
});

test('Llama profile uses gpt2 tokenizer', () => {
  const profile = getAcceptedRendererProfile('llama')!;
  assert.equal(profile.tokenizer.model, 'gpt2');
  assert.equal(profile.tokenizer.vocabSize, 128256);
});

test('Gemma profile uses llama-bpe tokenizer with large vocab', () => {
  const profile = getAcceptedRendererProfile('gemma')!;
  assert.equal(profile.tokenizer.model, 'llama-bpe');
  assert.equal(profile.tokenizer.vocabSize, 256000);
});
