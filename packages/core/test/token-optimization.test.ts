import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { LlamaTokenizer } from '../src/llama-tokenizer.js';
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
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: ['test'] },
    meta: {},
  };
}

function modelProfile(name = 'model'): ModelTokenizerProfile {
  return { name, tokenizer: { model: `${name}-tokenizer`, addBos: true, addEos: false } };
}

function measuredProfiles(
  record: LunumRecord,
  model: ModelTokenizerProfile,
  generator: ProfileGenerator = new ProfileGenerator(),
): AtlasProfileMeasures {
  const tokenizer = new LlamaTokenizer(model.tokenizer);
  const count = (text: string): number => tokenizer.countTokens(text).tokens;
  return {
    natural: { profile: 'natural', tokenCount: count(record.source.text) },
    safe: { profile: 'safe', tokenCount: count(generator.profile(record, 'safe').record.renderings.safe!.code) },
    short: { profile: 'short', tokenCount: count(generator.profile(record, 'short').record.renderings.short!.code) },
    tight: { profile: 'tight', tokenCount: count(generator.profile(record, 'tight').record.renderings.tight!.code) },
  };
}

function entry(
  record: LunumRecord,
  modelProfiles: ModelTokenizerProfile[] = [modelProfile()],
  generator: ProfileGenerator = new ProfileGenerator(),
): AtlasEntry {
  return {
    record,
    fingerprint: record.fingerprint,
    sourceLength: record.source.text.length,
    measurements: Object.fromEntries(modelProfiles.map((model) => [model.name, measuredProfiles(record, model, generator)])),
    tokenizerProfiles: Object.fromEntries(modelProfiles.map((model) => [model.name, model.tokenizer])),
    measuredAt: 1,
  };
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
  const generator = new SemanticsMutatingProfileGenerator();
  const result = runVerifiedTokenizerOptimizationPass([entry(record, [modelProfile()], generator)], {
    modelProfiles: [modelProfile()],
    profileGenerator: generator,
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
});

test('verified optimization selects the lowest-token current semantic match', () => {
  const record = recordWithRole('short value', false);
  const measured = entry(record);
  const result = runVerifiedTokenizerOptimizationPass([measured], { modelProfiles: [modelProfile()] });

  const model = result.results[0];
  assert.ok(model);
  assert.equal(model.selectedProfile, 'tight');
  assert.equal(model.bestTokenCount, measured.measurements.model?.tight.tokenCount);
  assert.equal(model.semanticsPreserved, true);
  assert.equal(model.optimizedFingerprint, fingerprintSem(model.optimizedRecord?.sem));
  assert.equal(result.artifacts[0]?.valid, true);
  assert.equal(result.artifacts[0]?.selections[0]?.recordFingerprint, fingerprintSem(record.sem));
});

test('verified optimization rejects stale record and atlas fingerprints before candidate selection', () => {
  const staleRecord = recordWithRole('stale record', false, true);
  const staleRecordResult = runVerifiedTokenizerOptimizationPass([entry(staleRecord)], { modelProfiles: [modelProfile()] });
  assert.equal(staleRecordResult.results.length, 0);
  assert.match(staleRecordResult.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);

  const currentRecord = recordWithRole('stale atlas', false);
  const staleAtlas = entry(currentRecord);
  staleAtlas.fingerprint = 'lfp:0.1:sha256:stale-atlas-fingerprint';
  const staleAtlasResult = runVerifiedTokenizerOptimizationPass([staleAtlas], { modelProfiles: [modelProfile()] });
  assert.equal(staleAtlasResult.results.length, 0);
  assert.match(staleAtlasResult.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);
});

test('verified optimization rejects token counts that do not match current renderer output', () => {
  const record = recordWithRole('stale measurement', false);
  const measured = entry(record);
  measured.measurements.model!.tight.tokenCount += 1;
  const result = runVerifiedTokenizerOptimizationPass([measured], { modelProfiles: [modelProfile()] });

  assert.equal(result.results.length, 0);
  assert.equal(result.allSemanticsPreserved, false);
  assert.match(result.warnings.join('\n'), /does not match current output count/u);
});

test('verified optimization fails closed on missing, errored, zero, or wrong-tokenizer measurements', () => {
  const record = recordWithRole('invalid measurements', false);

  const missing = entry(record);
  missing.measurements = {};
  const missingResult = runVerifiedTokenizerOptimizationPass([missing], { modelProfiles: [modelProfile()] });
  assert.equal(missingResult.results.length, 0);
  assert.match(missingResult.warnings.join('\n'), /Missing measurement/u);

  const invalid = entry(record);
  invalid.measurements.model!.short.tokenCount = 0;
  invalid.measurements.model!.tight.errors = ['tokenizer unavailable'];
  const invalidResult = runVerifiedTokenizerOptimizationPass([invalid], { modelProfiles: [modelProfile()] });
  assert.equal(invalidResult.results.length, 0);
  assert.match(invalidResult.warnings.join('\n'), /positive safe integer/u);
  assert.match(invalidResult.warnings.join('\n'), /tokenizer unavailable/u);

  const wrongTokenizer = entry(record);
  wrongTokenizer.tokenizerProfiles.model = { model: 'different-tokenizer' };
  const wrongResult = runVerifiedTokenizerOptimizationPass([wrongTokenizer], { modelProfiles: [modelProfile()] });
  assert.equal(wrongResult.results.length, 0);
  assert.match(wrongResult.warnings.join('\n'), /configuration does not match artifact/u);
});

test('verified optimization fails closed on empty input, no model profiles, and incomplete model coverage', () => {
  const empty = runVerifiedTokenizerOptimizationPass([], { modelProfiles: [modelProfile()] });
  assert.equal(empty.allSemanticsPreserved, false);
  assert.match(empty.warnings.join('\n'), /at least one measured record/u);

  const record = recordWithRole('unbound', false);
  const noProfiles = runVerifiedTokenizerOptimizationPass([entry(record)], { modelProfiles: [] });
  assert.equal(noProfiles.allSemanticsPreserved, false);
  assert.match(noProfiles.warnings.join('\n'), /at least one named model profile/u);
  assert.match(noProfiles.warnings.join('\n'), /unconfigured model/u);

  const alpha = modelProfile('alpha');
  const beta = modelProfile('beta');
  const first = entry(recordWithRole('first', false), [alpha, beta]);
  const second = entry(recordWithRole('second', false), [alpha]);
  const incomplete = runVerifiedTokenizerOptimizationPass([first, second], { modelProfiles: [alpha, beta] });
  assert.equal(incomplete.allSemanticsPreserved, false);
  assert.equal(incomplete.artifacts.find((artifact) => artifact.modelName === 'alpha')?.valid, true);
  assert.equal(incomplete.artifacts.find((artifact) => artifact.modelName === 'beta')?.valid, false);
});
