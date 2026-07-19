import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { runVerifiedTokenizerOptimizationPass } from '../src/token-optimization.js';
import type { AtlasEntry, AtlasProfileMeasures } from '../src/token-atlas.js';
import type { LunumRecord } from '../src/types.js';

function recordWithRole(value: string, metadata = true): LunumRecord {
  const sem = {
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
    fingerprint: 'lfp:0.1:sha256:stale-attached-fingerprint',
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
    measuredAt: 1,
  };
}

test('verified optimization rejects lower-token profiles that alter canonical semantics', () => {
  const record = recordWithRole('x'.repeat(80), true);
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: measures({ natural: 100, safe: 60, short: 30, tight: 10 }) }),
  ]);

  const model = result.results[0];
  assert.ok(model);
  assert.equal(model.selectedProfile, 'safe');
  assert.equal(model.semanticsPreserved, true);
  assert.equal(model.originalFingerprint, fingerprintSem(record.sem));
  assert.notEqual(model.originalFingerprint, record.fingerprint);
  assert.equal(model.optimizedFingerprint, model.originalFingerprint);
  assert.ok(model.candidates.find((candidate) => candidate.profile === 'short' && !candidate.semanticsPreserved));
  assert.ok(model.candidates.find((candidate) => candidate.profile === 'tight' && !candidate.semanticsPreserved));
  assert.match(model.warnings.join('\n'), /short rejected/);
  assert.match(model.warnings.join('\n'), /tight rejected/);
});

test('verified optimization selects the lowest-token profile among semantic matches', () => {
  const record = recordWithRole('short value', false);
  const result = runVerifiedTokenizerOptimizationPass([
    entry(record, { model: measures({ natural: 80, safe: 50, short: 30, tight: 20 }) }),
  ]);

  const model = result.results[0];
  assert.ok(model);
  assert.equal(model.selectedProfile, 'tight');
  assert.equal(model.bestTokenCount, 20);
  assert.equal(model.reductionPct, 75);
  assert.equal(model.semanticsPreserved, true);
  assert.equal(model.optimizedFingerprint, fingerprintSem(model.optimizedRecord?.sem));
});

test('verified optimization reports records with no model measurements', () => {
  const record = recordWithRole('no measurements', false);
  const result = runVerifiedTokenizerOptimizationPass([entry(record, {})]);

  assert.equal(result.results.length, 0);
  assert.equal(result.recordCount, 1);
  assert.equal(result.allSemanticsPreserved, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? '', /No model measurements/);
});

test('verified optimization handles an empty batch', () => {
  const result = runVerifiedTokenizerOptimizationPass([]);
  assert.deepEqual(result.models, []);
  assert.deepEqual(result.results, []);
  assert.equal(result.recordCount, 0);
  assert.equal(result.allSemanticsPreserved, true);
  assert.deepEqual(result.warnings, []);
});
