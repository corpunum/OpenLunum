import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { runTokenizerOptimizationPass, tokenAtlasExports } from '../src/index.js';
import type { AtlasEntry } from '../src/token-atlas.js';
import type { LunumRecord } from '../src/types.js';

function record(staleFingerprint = false): LunumRecord {
  const sem: LunumRecord['sem'] = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'concise_answers' } }]
  };
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'The user prefers concise answers.', language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: staleFingerprint ? 'lfp:0.1:sha256:stale-attached-value' : fingerprintSem(sem),
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: ['test'] },
    meta: {}
  };
}

function entry(overrides: Partial<AtlasEntry> = {}, staleFingerprint = false): AtlasEntry {
  const source = record(staleFingerprint);
  return {
    record: source,
    fingerprint: source.fingerprint,
    sourceLength: source.source.text.length,
    measurements: {
      model: {
        natural: { profile: 'natural', tokenCount: 100 },
        safe: { profile: 'safe', tokenCount: 60 },
        short: { profile: 'short', tokenCount: 40 },
        tight: { profile: 'tight', tokenCount: 20 }
      }
    },
    tokenizerProfiles: { model: { model: 'model-tokenizer', addBos: true, addEos: false } },
    measuredAt: 1,
    ...overrides
  };
}

test('public tokenizer optimization selects only independently verified candidates', () => {
  const source = entry();
  const result = runTokenizerOptimizationPass([source]);
  assert.equal(result.allSemanticsPreserved, true);
  assert.equal(result.results.length, 1);
  const optimized = result.results[0]!;
  assert.equal(optimized.originalFingerprint, fingerprintSem(source.record.sem));
  assert.equal(optimized.originalFingerprint, source.fingerprint);
  assert.equal(optimized.optimizedFingerprint, optimized.originalFingerprint);
  assert.equal(optimized.bestProfile, 'tight');
  assert.equal(optimized.bestTokenCount, 20);
});

test('public tokenizer optimization rejects stale attached fingerprints', () => {
  const result = runTokenizerOptimizationPass([entry({}, true)]);
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.results.length, 0);
  assert.match(result.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);
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
