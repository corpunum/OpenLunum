import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { LlamaTokenizer } from '../src/llama-tokenizer.js';
import { ProfileGenerator } from '../src/profiles.js';
import { runTokenizerOptimizationPass, tokenAtlasExports } from '../src/index.js';
import type { AtlasEntry, ModelTokenizerProfile } from '../src/token-atlas.js';
import type { LunumRecord } from '../src/types.js';

const modelProfile: ModelTokenizerProfile = {
  name: 'model',
  tokenizer: { model: 'model-tokenizer', addBos: true, addEos: false },
};

function record(staleFingerprint = false): LunumRecord {
  const sem: LunumRecord['sem'] = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'concise_answers' } }],
  };
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'The user prefers concise answers.', language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: staleFingerprint ? 'lfp:0.1:sha256:stale-attached-value' : fingerprintSem(sem),
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: ['test'] },
    meta: {},
  };
}

function entry(overrides: Partial<AtlasEntry> = {}, staleFingerprint = false): AtlasEntry {
  const source = record(staleFingerprint);
  const tokenizer = new LlamaTokenizer(modelProfile.tokenizer);
  const generator = new ProfileGenerator();
  const count = (text: string): number => tokenizer.countTokens(text).tokens;
  const measured: AtlasEntry = {
    record: source,
    fingerprint: source.fingerprint,
    sourceLength: source.source.text.length,
    measurements: {
      model: {
        natural: { profile: 'natural', tokenCount: count(source.source.text) },
        safe: { profile: 'safe', tokenCount: count(generator.profile(source, 'safe').record.renderings.safe!.code) },
        short: { profile: 'short', tokenCount: count(generator.profile(source, 'short').record.renderings.short!.code) },
        tight: { profile: 'tight', tokenCount: count(generator.profile(source, 'tight').record.renderings.tight!.code) },
      },
    },
    tokenizerProfiles: { model: modelProfile.tokenizer },
    measuredAt: 1,
  };
  return { ...measured, ...overrides };
}

test('public tokenizer optimization selects only independently verified current candidates', () => {
  const source = entry();
  const result = runTokenizerOptimizationPass([source]);
  assert.equal(result.allSemanticsPreserved, true);
  assert.equal(result.results.length, 1);
  const optimized = result.results[0]!;
  assert.equal(optimized.originalFingerprint, fingerprintSem(source.record.sem));
  assert.equal(optimized.originalFingerprint, source.fingerprint);
  assert.equal(optimized.optimizedFingerprint, optimized.originalFingerprint);
  assert.equal(optimized.bestProfile, 'tight');
  assert.equal(optimized.bestTokenCount, source.measurements.model?.tight.tokenCount);
});

test('public tokenizer optimization rejects stale attached fingerprints', () => {
  const result = runTokenizerOptimizationPass([entry({}, true)]);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.results.length, 0);
  assert.match(result.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);
});

test('public tokenizer optimization rejects stale token measurements', () => {
  const source = entry();
  source.measurements.model!.short.tokenCount += 1;
  const result = runTokenizerOptimizationPass([source]);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.results.length, 0);
  assert.match(result.warnings.join('\n'), /does not match current output count/u);
});

test('aggregate tokenAtlasExports exposes the verified compatibility function', () => {
  assert.equal(tokenAtlasExports[1], runTokenizerOptimizationPass);
  const source = entry();
  const result = tokenAtlasExports[1]([source]);
  assert.equal(result.allSemanticsPreserved, true);
  assert.equal(result.results[0]?.originalFingerprint, source.fingerprint);
});

test('public tokenizer optimization fails closed for empty input', () => {
  const result = runTokenizerOptimizationPass([]);
  assert.equal(result.allSemanticsPreserved, false);
  assert.deepEqual(result.results, []);
  assert.match(result.warnings.join('\n'), /at least one measured record/u);
});

test('public tokenizer optimization fails closed when tokenizer identity is missing', () => {
  const source = entry({ tokenizerProfiles: {} });
  const result = runTokenizerOptimizationPass([source]);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.results.length, 0);
  assert.match(result.warnings.join('\n'), /missing tokenizer configuration/u);
});
