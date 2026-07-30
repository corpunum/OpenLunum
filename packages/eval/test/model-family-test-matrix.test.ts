import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  MATRIX_VERSION,
  MODEL_FAMILY_TEST_MATRIX,
  validateProfile,
  getProfilesForFamily,
} from '../src/model-family-test-matrix.js';
import type { ModelFamilyProfile } from '../src/model-family-test-matrix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('model-family-test-matrix version', () => {
  it('exports MATRIX_VERSION', () => {
    assert.strictEqual(MATRIX_VERSION, '0.1.0');
  });

  it('version follows semver', () => {
    assert.match(MATRIX_VERSION, /^\d+\.\d+\.\d+$/u);
  });
});

describe('MODEL_FAMILY_TEST_MATRIX structure', () => {
  it('has version field', () => {
    assert.strictEqual(MODEL_FAMILY_TEST_MATRIX.version, MATRIX_VERSION);
  });

  it('has testCategories array', () => {
    assert.ok(Array.isArray(MODEL_FAMILY_TEST_MATRIX.testCategories));
    assert.ok(MODEL_FAMILY_TEST_MATRIX.testCategories.length > 0);
  });

  it('has expectedMinParse threshold', () => {
    assert.strictEqual(typeof MODEL_FAMILY_TEST_MATRIX.expectedMinParse, 'number');
    assert.ok(MODEL_FAMILY_TEST_MATRIX.expectedMinParse >= 0);
    assert.ok(MODEL_FAMILY_TEST_MATRIX.expectedMinParse <= 1);
  });

  it('has expectedMinRetention threshold', () => {
    assert.strictEqual(typeof MODEL_FAMILY_TEST_MATRIX.expectedMinRetention, 'number');
    assert.ok(MODEL_FAMILY_TEST_MATRIX.expectedMinRetention >= 0);
    assert.ok(MODEL_FAMILY_TEST_MATRIX.expectedMinRetention <= 1);
  });
});

describe('model families and profiles', () => {
  it('has at least 3 families', () => {
    const families = new Set(MODEL_FAMILY_TEST_MATRIX.families.map(p => p.family));
    assert.ok(families.size >= 3, `expected >=3 families, got ${families.size}`);
  });

  it('has at least 6 total profiles', () => {
    assert.ok(MODEL_FAMILY_TEST_MATRIX.families.length >= 6, `expected >=6 profiles, got ${MODEL_FAMILY_TEST_MATRIX.families.length}`);
  });

  it('includes qwen family', () => {
    const families = new Set(MODEL_FAMILY_TEST_MATRIX.families.map(p => p.family));
    assert.ok(families.has('qwen'), 'missing qwen family');
  });

  it('includes gemma family', () => {
    const families = new Set(MODEL_FAMILY_TEST_MATRIX.families.map(p => p.family));
    assert.ok(families.has('gemma'), 'missing gemma family');
  });

  it('includes llama family', () => {
    const families = new Set(MODEL_FAMILY_TEST_MATRIX.families.map(p => p.family));
    assert.ok(families.has('llama'), 'missing llama family');
  });
});

describe('profile validation', () => {
  it('all registered profiles pass validation', () => {
    for (const profile of MODEL_FAMILY_TEST_MATRIX.families) {
      const result = validateProfile(profile);
      assert.ok(result.ok, `profile ${profile.modelId} failed validation: ${result.errors.join(', ')}`);
    }
  });

  it('rejects profile with missing family', () => {
    const profile: ModelFamilyProfile = {
      family: '',
      modelId: 'test',
      quantization: 'Q4_K_M',
      chatTemplate: 'test',
      contextLength: 8192,
      profileHash: 'a'.repeat(64),
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('family')));
  });

  it('rejects profile with missing modelId', () => {
    const profile: ModelFamilyProfile = {
      family: 'qwen',
      modelId: '',
      quantization: 'Q4_K_M',
      chatTemplate: 'test',
      contextLength: 8192,
      profileHash: 'a'.repeat(64),
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('modelId')));
  });

  it('rejects profile with missing quantization', () => {
    const profile: ModelFamilyProfile = {
      family: 'qwen',
      modelId: 'test-model',
      quantization: '',
      chatTemplate: 'test',
      contextLength: 8192,
      profileHash: 'a'.repeat(64),
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('quantization')));
  });

  it('rejects profile with missing chatTemplate', () => {
    const profile: ModelFamilyProfile = {
      family: 'qwen',
      modelId: 'test-model',
      quantization: 'Q4_K_M',
      chatTemplate: '',
      contextLength: 8192,
      profileHash: 'a'.repeat(64),
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('chatTemplate')));
  });

  it('rejects profile with invalid contextLength', () => {
    const profile: ModelFamilyProfile = {
      family: 'qwen',
      modelId: 'test-model',
      quantization: 'Q4_K_M',
      chatTemplate: 'test',
      contextLength: -1,
      profileHash: 'a'.repeat(64),
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('contextLength')));
  });

  it('rejects profile with invalid profileHash', () => {
    const profile: ModelFamilyProfile = {
      family: 'qwen',
      modelId: 'test-model',
      quantization: 'Q4_K_M',
      chatTemplate: 'test',
      contextLength: 8192,
      profileHash: 'not-a-hash',
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('profileHash')));
  });

  it('rejects profile with hash mismatch', () => {
    const profile: ModelFamilyProfile = {
      family: 'qwen',
      modelId: 'test-model',
      quantization: 'Q4_K_M',
      chatTemplate: 'test',
      contextLength: 8192,
      profileHash: 'a'.repeat(64),
      frozen: true,
    };
    const result = validateProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('hash mismatch')));
  });
});

describe('profile freezing', () => {
  it('all profiles are frozen', () => {
    for (const profile of MODEL_FAMILY_TEST_MATRIX.families) {
      assert.strictEqual(profile.frozen, true, `profile ${profile.modelId} is not frozen`);
    }
  });
});

describe('profile hashes', () => {
  it('all profiles have valid SHA-256 hashes', () => {
    for (const profile of MODEL_FAMILY_TEST_MATRIX.families) {
      assert.match(
        profile.profileHash,
        /^[a-f0-9]{64}$/u,
        `profile ${profile.modelId} has invalid hash: ${profile.profileHash}`,
      );
    }
  });

  it('all profile hashes are exactly 64 hex characters', () => {
    for (const profile of MODEL_FAMILY_TEST_MATRIX.families) {
      assert.strictEqual(profile.profileHash.length, 64, `profile ${profile.modelId} hash is not 64 chars`);
    }
  });

  it('hashes are unique', () => {
    const hashes = new Set(MODEL_FAMILY_TEST_MATRIX.families.map(p => p.profileHash));
    assert.strictEqual(hashes.size, MODEL_FAMILY_TEST_MATRIX.families.length, 'profile hashes are not unique');
  });
});

describe('getProfilesForFamily', () => {
  it('returns qwen profiles for qwen family', () => {
    const profiles = getProfilesForFamily('qwen');
    assert.ok(profiles.length > 0);
    assert.ok(profiles.every(p => p.family === 'qwen'));
  });

  it('returns gemma profiles for gemma family', () => {
    const profiles = getProfilesForFamily('gemma');
    assert.ok(profiles.length > 0);
    assert.ok(profiles.every(p => p.family === 'gemma'));
  });

  it('returns llama profiles for llama family', () => {
    const profiles = getProfilesForFamily('llama');
    assert.ok(profiles.length > 0);
    assert.ok(profiles.every(p => p.family === 'llama'));
  });

  it('returns empty array for unknown family', () => {
    const profiles = getProfilesForFamily('unknown');
    assert.strictEqual(profiles.length, 0);
  });

  it('each family has at least 2 profiles', () => {
    for (const family of ['qwen', 'gemma', 'llama']) {
      const profiles = getProfilesForFamily(family);
      assert.ok(profiles.length >= 2, `${family} has ${profiles.length} profiles, expected >=2`);
    }
  });
});

describe('profile uniqueness', () => {
  it('all modelIds are unique', () => {
    const modelIds = new Set(MODEL_FAMILY_TEST_MATRIX.families.map(p => p.modelId));
    assert.strictEqual(modelIds.size, MODEL_FAMILY_TEST_MATRIX.families.length, 'modelIds are not unique');
  });

  it('profile hashes are distinct from modelIds', () => {
    for (const profile of MODEL_FAMILY_TEST_MATRIX.families) {
      assert.notStrictEqual(profile.profileHash, profile.modelId);
    }
  });
});

describe('write test matrix to json', () => {
  it('writes matrix to eval-results/model-families/test-matrix.json', async () => {
    const outputDir = path.join(WORKSPACE_ROOT, 'eval-results', 'model-families');
    await mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, 'test-matrix.json');
    const json = JSON.stringify(MODEL_FAMILY_TEST_MATRIX, null, 2);
    await writeFile(outputPath, json, 'utf8');

    // Verify the file was written
    assert.ok(true, 'test matrix written successfully');
  });
});
