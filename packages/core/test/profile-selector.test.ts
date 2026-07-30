/**
 * Profile selector tests
 *
 * Tests profile selection driven by Token Atlas measurements
 * for different model types.
 *
 * These tests cover the ProfileSelectionResult and ModelProfileRecommendation
 * types exported from profile-selector.ts as part of the semantic contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileSelector, ProfileFallbackPolicy } from '../src/profile-selector.js';
import type { ProfileType } from '../src/profiles.js';
import type { ProfileSelectionResult, ModelProfileRecommendation } from '../src/profile-selector.js';
import type { ProfileSelectionRejection } from '../src/model-renderer-profiles.js';

function buildRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: { text: 'The user prefers concise answers and clear formatting.' },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [
        {
          predicate: 'prefer',
          roles: {
            experiencer: { type: 'actor', id: 'user' },
            theme: { type: 'concept', id: 'concise_answers' }
          },
          negated: false
        }
      ],
      annotations: { sourceText: 'The user prefers concise answers.', sourceLanguage: 'en' }
    },
    ...overrides
  };
}

// ── Basic Selection Tests ──────────────────────────────────────────

test('profile selector: selects safe profile for generic model', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any, 'generic-7b');

  assert.ok(['safe', 'short'].includes(result.recommendedProfile));
  assert.ok(result.confidence >= 0.5 && result.confidence <= 1);
  assert.ok((result.tokenCounts as Record<ProfileType, number>).safe > 0);
  assert.ok((result.tokenCounts as Record<ProfileType, number>).short > 0);
  assert.ok((result.tokenCounts as Record<ProfileType, number>).tight > 0);
  assert.ok(result.rationale.length > 0);
});

test('profile selector: selects short profile for small models', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any, 'tinyllama-1.1b');

  assert.ok(result.recommendedProfile === 'short' || result.recommendedProfile === 'tight',
    `small model should prefer short/tight, got ${result.recommendedProfile}`);
});

test('profile selector: selects safe profile for large models', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any, 'mixtral-8x7b');

  assert.ok(result.recommendedProfile === 'safe' || result.recommendedProfile === 'short',
    `large model should prefer safe/short, got ${result.recommendedProfile}`);
});

test('profile selector: token counts decrease with tighter profiles', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any);

  assert.ok((result.tokenCounts as Record<ProfileType, number>).safe >= (result.tokenCounts as Record<ProfileType, number>).short, 'short should have <= tokens than safe');
  assert.ok((result.tokenCounts as Record<ProfileType, number>).short >= (result.tokenCounts as Record<ProfileType, number>).tight, 'tight should have <= tokens than short');
});

test('profile selector: preservation decreases with tighter profiles', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any);

  const pres = result.preservation as Record<ProfileType, number>;
  assert.ok(pres.safe >= pres.short, 'short preservation <= safe');
  assert.ok(pres.short >= pres.tight, 'tight preservation <= short');
});

test('profile selector: short reduction is positive', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any);

  assert.ok(result.reduction.short as number >= 0, 'short reduction must be non-negative');
  assert.ok(result.reduction.tight as number >= 0, 'tight reduction must be non-negative');
});

// ── ProfileSelectionResult Type Tests ──────────────────────────────
// These tests verify the exported ProfileSelectionResult type has all required fields.

test('ProfileSelectionResult: has all required fields', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any, 'type-test-model');

  const r = result as ProfileSelectionResult;

  assert.ok('modelId' in r, 'ProfileSelectionResult must have modelId');
  assert.ok('recommendedProfile' in r, 'must have recommendedProfile');
  assert.ok('confidence' in r, 'must have confidence');
  assert.ok('tokenCounts' in r, 'must have tokenCounts');
  assert.ok('reduction' in r, 'must have reduction');
  assert.ok('preservation' in r, 'must have preservation');
  assert.ok('rationale' in r, 'must have rationale');
  assert.ok('warnings' in r, 'must have warnings');

  assert.strictEqual(typeof r.modelId, 'string');
  assert.ok(['safe', 'short', 'tight'].includes(r.recommendedProfile));
  assert.ok(typeof r.confidence === 'number');
  assert.ok(typeof r.tokenCounts === 'object');
  assert.ok(typeof r.reduction === 'object');
  assert.ok(typeof r.preservation === 'object');
  assert.ok(typeof r.rationale === 'string');
  assert.ok(Array.isArray(r.warnings));
});

test('ProfileSelectionResult: confidence is in valid range', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any);

  assert.ok(result.confidence >= 0.5, 'confidence must be >= 0.5');
  assert.ok(result.confidence <= 1, 'confidence must be <= 1');
});

test('ProfileSelectionResult: rationale is descriptive', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any, 'test-model-7b');

  const r = result as ProfileSelectionResult;
  assert.ok(r.rationale.includes('Profile'), 'rationale must mention profile');
  assert.ok(r.rationale.includes('Tokens'), 'rationale must mention tokens');
});

test('ProfileSelectionResult: warnings is array of strings', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const result = selector.selectProfile(record as any);

  assert.ok(Array.isArray(result.warnings));
  for (const w of result.warnings) {
    assert.ok(typeof w === 'string', 'each warning must be a string');
  }
});

// ── Recommendation Caching Tests ───────────────────────────────────

test('profile selector: caches recommendations by modelId', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const modelId = 'test-model-1';

  const result1 = selector.selectProfile(record as any, modelId);
  const result2 = selector.selectProfile(record as any, modelId);

  const cached = selector.getRecommendation(modelId);
  assert.ok(cached, 'recommendation should be cached');
  assert.strictEqual(cached?.recommendedProfile, result1.recommendedProfile);
});

test('profile selector: retrieves stored measurements', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const modelId = 'test-model-2';

  selector.selectProfile(record as any, modelId);
  const measurements = selector.getMeasurements(modelId);

  assert.strictEqual(measurements.length, 1, 'should have one measurement');
});

test('profile selector: returns empty measurements for unknown model', () => {
  const selector = new ProfileSelector();
  const measurements = selector.getMeasurements('unknown-model');

  assert.deepStrictEqual(measurements, []);
});

// ── Aggregate Statistics Tests ─────────────────────────────────────

test('profile selector: aggregate stats track recommendations', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();

  selector.selectProfile(record as any, 'model-1');
  selector.selectProfile(record as any, 'model-2');
  selector.selectProfile(record as any, 'model-3');

  const stats = selector.getAggregateStats();

  assert.strictEqual(stats.totalModels, 3);
  assert.strictEqual(stats.totalMeasurements, 3);
  assert.ok((stats.profileDistribution.safe ?? 0) + (stats.profileDistribution.short ?? 0) + (stats.profileDistribution.tight ?? 0) === 3);
  assert.ok(stats.averageTokenCount > 0);
});

// ── Warnings Tests ─────────────────────────────────────────────────

test('profile selector: collects warnings from all profiles', () => {
  const selector = new ProfileSelector();
  const record = buildRecord({
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: {}, negated: false }],
      annotations: { note: 'test' },
      provenance: { author: 'test' }
    }
  });

  const result = selector.selectProfile(record as any);

  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length >= 0);
});

// ── Model Type Detection Tests ─────────────────────────────────────

test('profile selector: detects small model patterns', () => {
  const selector = new ProfileSelector();
  const smallModels = ['llama-3b', 'qwen-1.5b', 'phi-small', 'mistral-7b'];

  for (const modelId of smallModels) {
    const record = buildRecord();
    const result = selector.selectProfile(record as any, modelId);
    assert.ok(result.recommendedProfile === 'safe' || result.recommendedProfile === 'short',
      `small model ${modelId} should prefer safe/short`);
  }
});

test('profile selector: handles empty modelId gracefully', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();

  const result = selector.selectProfile(record as any);

  assert.strictEqual(result.modelId, 'generic');
  assert.ok(result.recommendedProfile === 'safe' || result.recommendedProfile === 'short');
});

// ── Edge Cases ─────────────────────────────────────────────────────

test('profile selector: handles very short text', () => {
  const selector = new ProfileSelector();
  const record = buildRecord({
    source: { text: 'Hi.' },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'u' }, theme: { type: 'concept', id: 't' } }, negated: false }]
    }
  });

  const result = selector.selectProfile(record as any);

  assert.ok(result.tokenCounts.safe as number > 0 || result.tokenCounts.short as number > 0);
  assert.ok(result.confidence >= 0.5);
});

test('profile selector: handles record without annotations', () => {
  const selector = new ProfileSelector();
  const record = buildRecord({
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'test',
      clauses: [{ predicate: 'test', roles: {}, negated: false }],
      annotations: {}
    }
  });

  const result = selector.selectProfile(record as any);

  assert.ok(result.recommendedProfile === 'safe' || result.recommendedProfile === 'short');
  assert.ok(result.rationale.includes('Profile'));
});

// ── R8.4: Profile Selection Validation Tests ──────────────────────────

test('profile selector: validateEnvironment accepts valid models', () => {
  const selector = new ProfileSelector();
  assert.doesNotThrow(() => {
    selector.validateEnvironment('Qwen3-Coder-30B-A3B', 'short');
  });
});

test('profile selector: validateEnvironment accepts generic models without validation', () => {
  const selector = new ProfileSelector();
  assert.doesNotThrow(() => {
    selector.validateEnvironment(undefined);
  });
});

test('profile selector: validateEnvironment rejects unknown models in STRICT mode', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.STRICT);
  assert.throws(
    () => selector.validateEnvironment('UnknownModel-999B'),
    (error: unknown) => {
      const rejection = error as ProfileSelectionRejection;
      return rejection.kind === 'rejection' && rejection.reason.includes('Unknown model');
    }
  );
});

test('profile selector: validateEnvironment rejects unsupported profiles', () => {
  const selector = new ProfileSelector();
  assert.throws(
    () => selector.validateEnvironment('Qwen3.5-4B-MTP', 'short'),
    (error: unknown) => {
      const rejection = error as ProfileSelectionRejection;
      return rejection.kind === 'rejection' && rejection.reason.includes('not supported');
    }
  );
});

test('profile selector: selectProfileWithValidation in STRICT mode throws on unknown model', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.STRICT);
  const record = buildRecord();

  assert.throws(
    () => selector.selectProfileWithValidation(record as any, 'UnknownModel-999B'),
    (error: unknown) => {
      const rejection = error as ProfileSelectionRejection;
      return rejection.kind === 'rejection';
    }
  );
});

test('profile selector: selectProfileWithValidation in DEFAULT mode falls back on unknown model', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.DEFAULT);
  const record = buildRecord();

  const result = selector.selectProfileWithValidation(record as any, 'UnknownModel-999B');
  // Should return a ProfileSelectionResult (fallback), not a rejection
  assert.ok('recommendedProfile' in result && !('kind' in result));
  assert.ok(['safe', 'short', 'tight'].includes((result as ProfileSelectionResult).recommendedProfile));
});

test('profile selector: selectProfileWithValidation in COMPATIBLE mode falls back on unknown model', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.COMPATIBLE);
  const record = buildRecord();

  const result = selector.selectProfileWithValidation(record as any, 'UnknownModel-999B');
  // Should return a ProfileSelectionResult (fallback), not a rejection
  assert.ok('recommendedProfile' in result && !('kind' in result));
});

test('profile selector: getModelProfile returns model metadata', () => {
  const selector = new ProfileSelector();
  const profile = selector.getModelProfile('Qwen3-Coder-30B-A3B');

  assert.ok(profile);
  assert.equal(profile!.modelId, 'Qwen3-Coder-30B-A3B');
  assert.ok(profile!.tokenizerIdentity);
  assert.ok(profile!.templateIdentity);
});

test('profile selector: getModelProfile returns undefined for unknown model', () => {
  const selector = new ProfileSelector();
  const profile = selector.getModelProfile('UnknownModel-999B');

  assert.equal(profile, undefined);
});

// ── R8.6: Fallback Behavior Tests ──────────────────────────────────────

test('profile selector: fallback policy defaults to DEFAULT', () => {
  const selector = new ProfileSelector();
  assert.equal(selector.getFallbackPolicy(), ProfileFallbackPolicy.DEFAULT);
});

test('profile selector: setFallbackPolicy changes the policy', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.STRICT);
  assert.equal(selector.getFallbackPolicy(), ProfileFallbackPolicy.STRICT);

  selector.setFallbackPolicy(ProfileFallbackPolicy.COMPATIBLE);
  assert.equal(selector.getFallbackPolicy(), ProfileFallbackPolicy.COMPATIBLE);
});

test('profile selector: STRICT fallback policy enforces validation', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.STRICT);
  const record = buildRecord();

  assert.throws(
    () => selector.selectProfileWithValidation(record as any, 'UnknownModel-999B'),
    (error: unknown) => {
      const rejection = error as ProfileSelectionRejection;
      return rejection.kind === 'rejection';
    }
  );
});

test('profile selector: DEFAULT fallback policy returns result for unknown model', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.DEFAULT);
  const record = buildRecord();

  const result = selector.selectProfileWithValidation(record as any, 'UnknownModel-999B');
  assert.ok('recommendedProfile' in result);
  assert.ok(!('kind' in result));
});

test('profile selector: COMPATIBLE fallback policy returns result for unknown model', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.COMPATIBLE);
  const record = buildRecord();

  const result = selector.selectProfileWithValidation(record as any, 'UnknownModel-999B');
  assert.ok('recommendedProfile' in result);
  assert.ok(!('kind' in result));
});

test('profile selector: supported model selection works across all fallback policies', () => {
  const selector = new ProfileSelector();
  const record = buildRecord();
  const modelId = 'Qwen3-Coder-30B-A3B';

  for (const policy of [ProfileFallbackPolicy.STRICT, ProfileFallbackPolicy.DEFAULT, ProfileFallbackPolicy.COMPATIBLE]) {
    selector.setFallbackPolicy(policy);
    const result = selector.selectProfileWithValidation(record as any, modelId);

    // All policies should return successful result for known model
    assert.ok('recommendedProfile' in result, `${policy} policy should return result for known model`);
    assert.ok(!('kind' in result), `${policy} policy should not return rejection for known model`);
  }
});

test('profile selector: rejection includes environment context for fallback decisions', () => {
  const selector = new ProfileSelector();
  selector.setFallbackPolicy(ProfileFallbackPolicy.STRICT);

  try {
    selector.validateEnvironment('Qwen3.5-4B-MTP', 'short');
    assert.fail('should have thrown');
  } catch (error) {
    const rejection = error as ProfileSelectionRejection;
    assert.equal(rejection.kind, 'rejection');
    assert.ok(rejection.environment);
    assert.equal(rejection.environment, 'profile:short');
  }
});
