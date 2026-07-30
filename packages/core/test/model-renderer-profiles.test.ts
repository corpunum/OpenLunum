import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENDERER_PROFILES_VERSION,
  MODEL_RENDERER_PROFILES,
  getProfileForModel,
  listSupportedFamilies,
  getProfilesByFamily,
  validateModelFamily,
  validateProfileSupport,
  validateTokenizerCompatibility,
  validateTemplateCompatibility,
  type ModelRendererProfile,
  type ProfileSelectionRejection,
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

// ── R8.2: Exact Tokenizer/Build/Template Identity Tests ──────────────

describe('R8.2: Tokenizer and Template Identity', () => {
  it('all profiles have complete tokenizer identity (name, version, vocabSize)', () => {
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.ok(profile.tokenizerIdentity, `${profile.modelId} must have tokenizerIdentity`);
      assert.strictEqual(typeof profile.tokenizerIdentity.name, 'string', `${profile.modelId} tokenizer.name must be string`);
      assert.strictEqual(typeof profile.tokenizerIdentity.version, 'string', `${profile.modelId} tokenizer.version must be string`);
      assert.strictEqual(typeof profile.tokenizerIdentity.vocabSize, 'number', `${profile.modelId} tokenizer.vocabSize must be number`);
      assert.ok(profile.tokenizerIdentity.vocabSize > 0, `${profile.modelId} vocabSize must be positive`);
    }
  });

  it('all profiles have complete template identity (type, version)', () => {
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.ok(profile.templateIdentity, `${profile.modelId} must have templateIdentity`);
      assert.strictEqual(typeof profile.templateIdentity.type, 'string', `${profile.modelId} template.type must be string`);
      assert.strictEqual(typeof profile.templateIdentity.version, 'string', `${profile.modelId} template.version must be string`);
    }
  });

  it('Qwen profiles have consistent tokenizer identity', () => {
    const qwenProfiles = getProfilesByFamily('qwen');
    for (const profile of qwenProfiles) {
      assert.equal(profile.tokenizerIdentity.name, 'qwen', `${profile.modelId} should have qwen tokenizer`);
      assert.ok(profile.tokenizerIdentity.version, `${profile.modelId} should have tokenizer version`);
      assert.equal(profile.tokenizerIdentity.vocabSize, 152064, `${profile.modelId} should have 152064 vocab size`);
    }
  });

  it('Llama profiles have consistent tokenizer identity', () => {
    const llamaProfiles = getProfilesByFamily('llama');
    for (const profile of llamaProfiles) {
      assert.equal(profile.tokenizerIdentity.name, 'llama', `${profile.modelId} should have llama tokenizer`);
      assert.equal(profile.tokenizerIdentity.vocabSize, 128256, `${profile.modelId} should have 128256 vocab size`);
    }
  });

  it('Gemma profiles have consistent tokenizer identity', () => {
    const gemmaProfiles = getProfilesByFamily('gemma');
    for (const profile of gemmaProfiles) {
      assert.equal(profile.tokenizerIdentity.name, 'gemma', `${profile.modelId} should have gemma tokenizer`);
      assert.equal(profile.tokenizerIdentity.vocabSize, 256000, `${profile.modelId} should have 256000 vocab size`);
    }
  });

  it('Qwen profiles use chatml template with version 1.0', () => {
    const qwenProfiles = getProfilesByFamily('qwen');
    for (const profile of qwenProfiles) {
      assert.equal(profile.templateIdentity.type, 'chatml', `${profile.modelId} should use chatml template`);
      assert.equal(profile.templateIdentity.version, '1.0', `${profile.modelId} should use template version 1.0`);
    }
  });

  it('Llama profiles use llama3 template with version 1.0', () => {
    const llamaProfiles = getProfilesByFamily('llama');
    for (const profile of llamaProfiles) {
      assert.equal(profile.templateIdentity.type, 'llama3', `${profile.modelId} should use llama3 template`);
      assert.equal(profile.templateIdentity.version, '1.0', `${profile.modelId} should use template version 1.0`);
    }
  });

  it('Gemma profiles use gemma template with appropriate versions', () => {
    const gemmaProfiles = getProfilesByFamily('gemma');
    for (const profile of gemmaProfiles) {
      assert.equal(profile.templateIdentity.type, 'gemma', `${profile.modelId} should use gemma template`);
      assert.ok(['1.0', '1.1'].includes(profile.templateIdentity.version), `${profile.modelId} template version must be 1.0 or 1.1`);
    }
  });
});

// ── R8.4: Profile Selection Validation Tests ──────────────────────────

describe('R8.4: Profile Selection Validation and Rejection', () => {
  it('validateModelFamily rejects unknown families', () => {
    assert.throws(
      () => validateModelFamily('unknown-family'),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Unknown model family');
      }
    );
  });

  it('validateModelFamily accepts known families', () => {
    assert.doesNotThrow(() => {
      validateModelFamily('qwen');
      validateModelFamily('llama');
      validateModelFamily('gemma');
    });
  });

  it('validateProfileSupport rejects unknown models', () => {
    assert.throws(
      () => validateProfileSupport('UnknownModel-999B', 'safe'),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Unknown model');
      }
    );
  });

  it('validateProfileSupport rejects unsupported profiles', () => {
    assert.throws(
      () => validateProfileSupport('Qwen3.5-4B-MTP', 'short'),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('not supported');
      }
    );
  });

  it('validateProfileSupport accepts supported profiles', () => {
    assert.doesNotThrow(() => {
      validateProfileSupport('Qwen3-Coder-30B-A3B', 'safe');
      validateProfileSupport('Qwen3-Coder-30B-A3B', 'short');
      validateProfileSupport('Qwen3.5-4B-MTP', 'safe');
    });
  });
});

// ── R8.5: Renderer Migration and Compatibility Tests ──────────────────

describe('R8.5: Renderer Migration and Compatibility', () => {
  it('validateTokenizerCompatibility rejects different tokenizer names', () => {
    const qwenProfile = getProfileForModel('Qwen3-Coder-30B-A3B')!;
    const llamaProfile = getProfileForModel('Llama-3.1-8B')!;
    assert.throws(
      () => validateTokenizerCompatibility(qwenProfile, llamaProfile),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Tokenizer mismatch');
      }
    );
  });

  it('validateTokenizerCompatibility rejects different tokenizer versions', () => {
    const profile1 = { ...getProfileForModel('Qwen3-Coder-30B-A3B')! };
    const profile2 = { ...getProfileForModel('Qwen3.6-35B-A3B')! };
    profile2.tokenizerIdentity = { ...profile2.tokenizerIdentity, version: '2.0' };
    assert.throws(
      () => validateTokenizerCompatibility(profile1, profile2),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Tokenizer mismatch');
      }
    );
  });

  it('validateTokenizerCompatibility rejects different vocab sizes', () => {
    const profile1 = { ...getProfileForModel('Qwen3-Coder-30B-A3B')! };
    const profile2 = { ...getProfileForModel('Qwen3.6-35B-A3B')! };
    profile2.tokenizerIdentity = { ...profile2.tokenizerIdentity, vocabSize: 160000 };
    assert.throws(
      () => validateTokenizerCompatibility(profile1, profile2),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Tokenizer mismatch');
      }
    );
  });

  it('validateTokenizerCompatibility accepts compatible tokenizers', () => {
    const qwen1 = getProfileForModel('Qwen3-Coder-30B-A3B')!;
    const qwen2 = getProfileForModel('Qwen3.6-35B-A3B')!;
    // Both Qwen models should have compatible tokenizers (same name, vocabSize)
    assert.doesNotThrow(() => {
      validateTokenizerCompatibility(qwen1, qwen2);
    });
  });

  it('validateTemplateCompatibility rejects different template types', () => {
    const qwenProfile = getProfileForModel('Qwen3-Coder-30B-A3B')!;
    const llamaProfile = getProfileForModel('Llama-3.1-8B')!;
    assert.throws(
      () => validateTemplateCompatibility(qwenProfile, llamaProfile),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Template mismatch');
      }
    );
  });

  it('validateTemplateCompatibility rejects different template versions', () => {
    const profile1 = { ...getProfileForModel('Gemma-2-27B')! };
    const profile2 = { ...getProfileForModel('SuperGemma4-E4B')! };
    profile1.templateIdentity = { ...profile1.templateIdentity, version: '1.0' };
    // Both use gemma template but different versions
    assert.throws(
      () => validateTemplateCompatibility(profile1, profile2),
      (error: unknown) => {
        const rejection = error as ProfileSelectionRejection;
        return rejection.kind === 'rejection' && rejection.reason.includes('Template mismatch');
      }
    );
  });

  it('validateTemplateCompatibility accepts compatible templates', () => {
    const qwen1 = getProfileForModel('Qwen3-Coder-30B-A3B')!;
    const qwen2 = getProfileForModel('Qwen3.6-35B-A3B')!;
    // Both Qwen models should have compatible templates
    assert.doesNotThrow(() => {
      validateTemplateCompatibility(qwen1, qwen2);
    });
  });

  it('old profile structure still works with getProfileForModel', () => {
    // Verify backward compatibility - the tokenizer string still exists
    const profile = getProfileForModel('Qwen3-Coder-30B-A3B');
    assert.ok(profile);
    assert.ok(profile.tokenizer, 'deprecated tokenizer field should still exist');
    assert.equal(profile.tokenizer, 'qwen');
  });
});

// ── R8.6: Fallback Behavior Tests ──────────────────────────────────────

describe('R8.6: Fallback Behavior for Missing/Stale Profiles', () => {
  it('profile validation provides error info for rejection handling', () => {
    try {
      validateProfileSupport('UnknownModel-999B', 'safe');
      assert.fail('should have thrown');
    } catch (error) {
      const rejection = error as ProfileSelectionRejection;
      assert.equal(rejection.kind, 'rejection');
      assert.ok(rejection.reason);
      assert.equal(rejection.modelId, 'UnknownModel-999B');
    }
  });

  it('profile rejection includes environment context', () => {
    try {
      validateProfileSupport('Qwen3.5-4B-MTP', 'short');
      assert.fail('should have thrown');
    } catch (error) {
      const rejection = error as ProfileSelectionRejection;
      assert.equal(rejection.kind, 'rejection');
      assert.equal(rejection.environment, 'profile:short');
    }
  });

  it('compatibility validation provides detailed migration info', () => {
    const profile1 = getProfileForModel('Qwen3-Coder-30B-A3B')!;
    const llamaProfile = getProfileForModel('Llama-3.1-8B')!;
    try {
      validateTokenizerCompatibility(profile1, llamaProfile);
      assert.fail('should have thrown');
    } catch (error) {
      const rejection = error as ProfileSelectionRejection;
      assert.ok(rejection.reason.includes('qwen'));
      assert.ok(rejection.reason.includes('llama'));
    }
  });

  it('all supported profiles have metadata for fallback decisions', () => {
    for (const profile of MODEL_RENDERER_PROFILES) {
      assert.ok(profile.identity, 'identity required for fallback decisions');
      assert.ok(profile.defaultProfile, 'defaultProfile required for fallback');
      assert.ok(profile.acceptedProfiles.length > 0, 'acceptedProfiles required for fallback');
    }
  });
});
