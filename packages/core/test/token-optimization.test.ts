import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { ProfileGenerator, type ProfileResult, type ProfileType } from '../src/profiles.js';
import { runVerifiedTokenizerOptimizationPass } from '../src/token-optimization.js';
import type { AtlasEntry, AtlasProfileMeasures, ModelTokenizerProfile } from '../src/token-atlas.js';
import type { LunumRecord } from '../src/types.js';

function recordWithRole(value: string, metadata = true, staleFingerprint = false): LunumRecord {
  const sem: LunumRecord['sem'] = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'remember', roles: { object: value }, negated: false }],
    ...(metadata ? { annotations: { confidence: 1 }, provenance: { source: 'test' } } : {}),
  };

  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: value, language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: staleFingerprint ? 'lfp:0.1:sha256:stale-attached-fingerprint' : fingerprintSem(sem),
    renderings: {},
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low',
      confidence: 1,
      reasons: ['test'],
    },
    meta: {},
  };
}

function measures(tokens: { natural: number; safe: number; short: number; tight: number }): AtlasProfileMeasures {
  return {
    natural: { profile: 'natural', tokenCount: tokens.natural },
    safe: { profile: 'safe', tokenCount: tokens.safe },
    short: { profile: 'short', tokenCount: tokens.short },
    tight: { profile: 'tight', tokenCount: tokens.tight },
  };
}

function entry(record: LunumRecord, modelMeasures: Record<string, AtlasProfileMeasures>): AtlasEntry {
  return {
    record,
    fingerprint: record.fingerprint,
    sourceLength: record.source.text.length,
    measurements: modelMeasures,
    tokenizerProfiles: Object.fromEntries(
      Object.keys(modelMeasures).map((name) => [name, modelProfile(name).tokenizer]),
    ),
    measuredAt: 1,
  };
}

function modelProfile(name = 'model'): ModelTokenizerProfile {
  return { name, tokenizer: { model: `${name}-tokenizer`, addBos: true, addEos: false } };
}

class SemanticsMutatingProfileGenerator extends ProfileGenerator {
  override profile(record: LunumRecord, type: ProfileType = 'safe'): ProfileResult {
    const result = super.profile(record, type);
    if (type === 'safe') return result;
    return {
      ...result,
      record: {
        ...result.record,
        sem: {
          ...result.record.sem,
          clauses: result.record.sem.clauses.map((clause) => ({
            ...clause,
            roles: { ...clause.roles, object: 'mutated' },
          })),
        },
      },
    };
  }
}

test('verified optimization rejects lower-token profiles that alter canonical semantics', () => {
  const record = recordWithRole('x'.repeat(80), true);
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: measures({ natural: 100, safe: 60, short: 30, tight: 10 }) }),
  ], {
    modelProfiles: [modelProfile()],
    profileGenerator: new SemanticsMutatingProfileGenerator(),
  });

  const model = result.results[0];
  assert.ok(model);
  assert.equal(model.selectedProfile, 'safe');
  assert.equal(model.semanticsPreserved, true);
  assert.equal(model.originalFingerprint, fingerprintSem(record.sem));
  assert.equal(model.originalFingerprint, record.fingerprint);
  assert.equal(model.optimizedFingerprint, model.originalFingerprint);
  assert.ok(model.candidates.find((candidate) => candidate.profile === 'short' && !candidate.semanticsPreserved));
  assert.ok(model.candidates.find((candidate) => candidate.profile === 'tight' && !candidate.semanticsPreserved));
  assert.match(model.warnings.join('\n'), /short rejected/);
  assert.match(model.warnings.join('\n'), /tight rejected/);
  assert.equal(result.artifacts[0]?.valid, true);
  assert.equal(result.artifacts[0]?.verifiedRecordCount, 1);
});

test('verified optimization rejects stale attached fingerprints before candidate selection', () => {
  const record = recordWithRole('stale', false, true);
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: measures({ natural: 20, safe: 15, short: 10, tight: 5 }) }),
  ], { modelProfiles: [modelProfile()] });

  assert.equal(result.results.length, 0);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.artifacts[0]?.valid, false);
  assert.equal(result.artifacts[0]?.verifiedRecordCount, 0);
  assert.match(result.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);
});

test('verified optimization rejects a stale atlas fingerprint even when the record fingerprint is current', () => {
  const record = recordWithRole('stale atlas', false);
  const measured = entry(record, { model: measures({ natural: 20, safe: 15, short: 10, tight: 5 }) });
  measured.fingerprint = 'lfp:0.1:sha256:stale-atlas-fingerprint';
  const result = runVerifiedTokenizerOptimizationPass([measured], { modelProfiles: [modelProfile()] });

  assert.equal(result.results.length, 0);
  assert.equal(result.allSemanticsPreserved, false);
  assert.match(result.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);
});

test('verified optimization selects the lowest-token profile among semantic matches', () => {
  const record = recordWithRole('short value', false);
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: measures({ natural: 80, safe: 50, short: 30, tight: 20 }) }),
  ], { modelProfiles: [modelProfile()] });

  const model = result.results[0];
  assert.ok(model);
  assert.equal(model.selectedProfile, 'tight');
  assert.equal(model.bestTokenCount, 20);
  assert.equal(model.reductionPct, 75);
  assert.equal(model.semanticsPreserved, true);
  assert.equal(model.optimizedFingerprint, fingerprintSem(model.optimizedRecord?.sem));
  const artifact = result.artifacts[0];
  assert.ok(artifact);
  assert.equal(artifact.schema, 'openlunum-model-specific-tight-profile/0.1');
  assert.match(artifact.id, /^tight\/model\/model-tokenizer\//);
  assert.deepEqual(artifact.tokenizer, { model: 'model-tokenizer', addBos: true, addEos: false });
  assert.equal(artifact.sourceRendererProfile, 'generic-en-pivot/0.1');
  assert.equal(artifact.selections[0]?.selectedProfile, 'tight');
  assert.equal(artifact.selections[0]?.recordFingerprint, fingerprintSem(record.sem));
});

test('verified optimization fails closed when a configured model lacks record coverage', () => {
  const record = recordWithRole('no measurements', false);
  const result = runVerifiedTokenizerOptimizationPass([entry(record, {})], {
    modelProfiles: [modelProfile()],
  });

  assert.equal(result.results.length, 0);
  assert.equal(result.recordCount, 1);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.artifacts[0]?.valid, false);
  assert.equal(result.artifacts[0]?.verifiedRecordCount, 0);
  assert.match(result.warnings.join('\n'), /Missing measurement/);
});

test('verified optimization fails closed on an empty batch', () => {
  const result = runVerifiedTokenizerOptimizationPass([], { modelProfiles: [modelProfile()] });
  assert.deepEqual(result.models, ['model']);
  assert.deepEqual(result.results, []);
  assert.equal(result.recordCount, 0);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.artifacts[0]?.valid, false);
  assert.match(result.warnings.join('\n'), /at least one measured record/);
});

test('verified optimization fails closed without named model profiles', () => {
  const record = recordWithRole('unbound', false);
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: measures({ natural: 8, safe: 7, short: 6, tight: 5 }) }),
  ], { modelProfiles: [] });

  assert.equal(result.allSemanticsPreserved, false);
  assert.deepEqual(result.artifacts, []);
  assert.match(result.warnings.join('\n'), /at least one named model profile/);
  assert.match(result.warnings.join('\n'), /unconfigured model/);
});

test('verified optimization rejects errored and zero token measurements', () => {
  const record = recordWithRole('bad count', false);
  const invalid = measures({ natural: 10, safe: 8, short: 0, tight: 4 });
  invalid.tight.errors = ['tokenizer unavailable'];
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: invalid }),
  ], { modelProfiles: [modelProfile()] });

  assert.equal(result.results.length, 0);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.artifacts[0]?.valid, false);
  assert.match(result.warnings.join('\n'), /short: tokenCount must be a positive safe integer/);
  assert.match(result.warnings.join('\n'), /tight: tokenizer unavailable/);
});

test('verified optimization rejects a tokenizer configuration not used by the measurement', () => {
  const record = recordWithRole('wrong tokenizer', false);
  const measured = entry(record, {
    model: measures({ natural: 10, safe: 8, short: 6, tight: 4 }),
  });
  measured.tokenizerProfiles.model = { model: 'different-tokenizer' };
  const result = runVerifiedTokenizerOptimizationPass([measured], {
    modelProfiles: [modelProfile()],
  });

  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.artifacts[0]?.valid, false);
  assert.match(result.warnings.join('\n'), /configuration does not match artifact/);
});

test('verified optimization requires every configured model on every record', () => {
  const first = recordWithRole('first', false);
  const second = recordWithRole('second', false);
  const good = measures({ natural: 10, safe: 8, short: 6, tight: 4 });
  const result = runVerifiedTokenizerOptimizationPass([
    entry(first, { alpha: good, beta: good }),
    entry(second, { alpha: good }),
  ], { modelProfiles: [modelProfile('alpha'), modelProfile('beta')] });

  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.artifacts.find((artifact) => artifact.modelName === 'alpha')?.valid, true);
  const beta = result.artifacts.find((artifact) => artifact.modelName === 'beta');
  assert.equal(beta?.valid, false);
  assert.equal(beta?.expectedRecordCount, 2);
  assert.equal(beta?.verifiedRecordCount, 1);
});
