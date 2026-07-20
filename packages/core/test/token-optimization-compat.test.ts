import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { runTokenizerOptimizationPass, tokenAtlasExports } from '../src/index.js';
import type { AtlasEntry } from '../src/token-atlas.js';
import type { LunumRecord } from '../src/types.js';

function record(): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'The user prefers concise answers.', language: 'en', role: 'user', ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'concise_answers' } }]
    },
    fingerprint: 'lfp:0.1:sha256:stale-attached-value',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: ['test'] },
    meta: {}
  };
}

function entry(overrides: Partial<AtlasEntry> = {}): AtlasEntry {
  const source = record();
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

test('public tokenizer optimization recomputes stale fingerprints and selects only verified candidates', () => {
  const source = entry();
  const result = runTokenizerOptimizationPass([source]);
  assert.equal(result.allSemanticsPreserved, true);
  assert.equal(result.results.length, 1);
  const optimized = result.results[0]!;
  assert.equal(optimized.originalFingerprint, fingerprintSem(source.record.sem));
  assert.notEqual(optimized.originalFingerprint, source.fingerprint);
  assert.equal(optimized.optimizedFingerprint, optimized.originalFingerprint);
  assert.equal(optimized.bestProfile, 'tight');
  assert.equal(optimized.bestTokenCount, 20);
});

test('aggregate tokenAtlasExports exposes the verified compatibility function', () => {
  assert.equal(tokenAtlasExports[1], runTokenizerOptimizationPass);
  const result = tokenAtlasExports[1]([entry()]);
  assert.equal(result.allSemanticsPreserved, true);
  assert.notEqual(result.results[0]?.originalFingerprint, entry().fingerprint);
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
