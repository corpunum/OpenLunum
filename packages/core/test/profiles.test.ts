import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeSem } from '../src/canonicalize.js';
import {
  decodeProfileSem,
  encodeProfileSem,
  ProfileGenerator,
  type ProfileType,
} from '../src/profiles.js';
import type { LunumRecord } from '../src/types.js';

function createMockRecord(text = 'Hello world'): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text, language: 'en', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'test',
      clauses: [{ predicate: 'test', roles: { subject: 'test' } }],
      annotations: { key: 'value' },
      provenance: { source: 'test' },
    },
    fingerprint: 'test-fp',
    renderings: { en: { code: 'test', tokens: 10, profile: 'test' } },
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.9, reasons: [] },
    meta: {},
  };
}

test('ProfileGenerator emits distinct reversible renderings and preserves the record wrapper', () => {
  const generator = new ProfileGenerator();
  const record = createMockRecord();
  const codes = new Set<string>();

  for (const profile of ['safe', 'short', 'tight'] as ProfileType[]) {
    const result = generator.profile(record, profile);
    const rendering = result.record.renderings[profile];
    assert.ok(rendering);
    assert.equal(result.type, profile);
    assert.equal(rendering.profile, `${profile}/0.1`);
    assert.equal(result.profiledTokens, rendering.tokens);
    assert.equal(result.preservation, 1);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(decodeProfileSem(rendering.code, profile), canonicalizeSem(record.sem));
    assert.deepEqual(result.record.source, record.source);
    assert.deepEqual(result.record.sem, record.sem);
    assert.equal(result.record.fingerprint, record.fingerprint);
    assert.deepEqual(result.record.policy, record.policy);
    assert.deepEqual(result.record.meta, record.meta);
    assert.deepEqual(result.record.renderings.en, record.renderings.en);
    codes.add(rendering.code);
  }

  assert.equal(codes.size, 3);
});

test('safe, short, and tight encodings become progressively more compact', () => {
  const record = createMockRecord('A deliberately long natural-language source sentence used to compare the three renderer encodings.');
  const safe = encodeProfileSem(record.sem, 'safe');
  const short = encodeProfileSem(record.sem, 'short');
  const tight = encodeProfileSem(record.sem, 'tight');

  assert.ok(short.length < safe.length, `short=${short.length}, safe=${safe.length}`);
  assert.ok(tight.length < short.length, `tight=${tight.length}, short=${short.length}`);
});

test('ProfileGenerator rejects semantic-loss configuration', () => {
  const generator = new ProfileGenerator();
  assert.throws(() => generator.setConfig('safe', { preserveAnnotations: false }), /cannot discard canonical semantics or provenance/u);
  assert.throws(() => generator.setConfig('tight', { preserveProvenance: false }), /cannot discard canonical semantics or provenance/u);
});

test('all profiles default to Reference and retain level across non-semantic configuration changes', () => {
  const generator = new ProfileGenerator();
  for (const type of ['safe', 'short', 'tight'] as ProfileType[]) {
    assert.equal(generator.getConfig(type).level, 'Reference');
    assert.equal(generator.isReferenceLevel(type), true);
  }
  assert.equal(generator.allProfilesReference(), true);

  generator.setConfig('safe', { maxTokenReduction: 0.2 });
  assert.equal(generator.getConfig('safe').level, 'Reference');
  assert.equal(generator.getConfig('safe').maxTokenReduction, 0.2);
});

test('Reference status is explicit configuration rather than inferred from the type name', () => {
  const generator = new ProfileGenerator();
  generator.setConfig('safe', { level: 'Experiment' });
  assert.equal(generator.isReferenceLevel('safe'), false);
  assert.equal(generator.allProfilesReference(), false);
});
