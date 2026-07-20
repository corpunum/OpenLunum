import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalizeSem } from '../src/canonicalize.js';
import { decodeProfileSem, ProfileGenerator, type ProfileType } from '../src/profiles.js';
import type { LunumRecord, LunumSem } from '../src/types.js';
import { approvedRendererCodes } from './fixtures/renderer-profile-exact-goldens.js';

function fixtureFingerprint(name: string): string {
  return `lfp:0.1:sha256:${createHash('sha256').update(name).digest('hex').slice(0, 32)}`;
}

function makeRecord(
  name: string,
  sem: LunumSem,
  renderings: LunumRecord['renderings'] = {},
): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: name, language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: fixtureFingerprint(name),
    renderings,
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low',
      confidence: 1,
      reasons: ['golden'],
    },
    meta: { fixture: name },
  };
}

export const fixtures: Array<{ name: keyof typeof approvedRendererCodes; record: LunumRecord }> = [
  {
    name: 'simple',
    record: makeRecord('simple', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'like', roles: { experiencer: 'user', theme: 'coffee' } }],
    }),
  },
  {
    name: 'negated',
    record: makeRecord('negated', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'accept', roles: { agent: 'system', theme: 'token' }, negated: true }],
    }),
  },
  {
    name: 'conditions',
    record: makeRecord('conditions', {
      schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'instruction',
      clauses: [{
        predicate: 'grant', roles: { agent: 'system', target: 'access' },
        conditions: [
          { predicate: 'authenticate', roles: { agent: 'user' } },
          { predicate: 'validate', roles: { subject: 'token' } },
        ],
      }],
    }),
  },
  {
    name: 'modality',
    record: makeRecord('modality', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'prediction',
      clauses: [{ predicate: 'rain', roles: {}, modality: 'possibility' }],
    }),
  },
  {
    name: 'annotations',
    record: makeRecord('annotations', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'dark_mode' } }],
      annotations: { confidence: 0.95, tags: ['ui'] },
    }),
  },
  {
    name: 'provenance',
    record: makeRecord('provenance', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'state', roles: { source: 'document', theme: 'fact' } }],
      provenance: { source: 'manual', author: 'alice' },
    }),
  },
  {
    name: 'metadata-rendering',
    record: makeRecord('metadata-rendering', {
      schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'rule',
      clauses: [{ predicate: 'access', roles: { agent: 'user', theme: 'resource' } }],
      annotations: { confidence: 0.8 },
      provenance: { source: 'spec' },
    }, {
      generic: { code: 'A(user,resource)', profile: 'generic', tokens: 4 },
    }),
  },
  {
    name: 'long-role',
    record: makeRecord('long-role', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{
        predicate: 'process',
        roles: {
          agent: 'system',
          subject: 'An extremely long descriptive text that exceeds fifty characters and must be snapshotted',
        },
      }],
    }),
  },
  {
    name: 'references',
    record: makeRecord('references', {
      schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'instruction',
      clauses: [{ predicate: 'see', roles: { agent: 'reader', theme: 'doc' } }],
      references: [{ type: 'source', ref: 'docs', value: 'Manual' }],
    }),
  },
  {
    name: 'multiple-clauses',
    record: makeRecord('multiple-clauses', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
      clauses: [
        { predicate: 'like', roles: { experiencer: 'alice', theme: 'coffee' } },
        { predicate: 'prefer', roles: { experiencer: 'bob', theme: 'tea' } },
      ],
    }),
  },
];

test('renderer profiles match approved exact full-code goldens and decode to canonical semantics', () => {
  const generator = new ProfileGenerator();
  const profiles: ProfileType[] = ['safe', 'short', 'tight'];

  assert.equal(fixtures.length, 10);

  for (const fixture of fixtures) {
    const generatedCodes = new Set<string>();
    const { renderings: originalRenderings, ...originalWrapper } = fixture.record;

    for (const profile of profiles) {
      const result = generator.profile(fixture.record, profile);
      const rendering = result.record.renderings[profile];
      const expected = approvedRendererCodes[fixture.name][profile];
      assert.ok(rendering, `${fixture.name}/${profile} must emit a rendering`);
      assert.equal(rendering.profile, `${profile}/0.1`);
      assert.equal(
        rendering.code,
        expected.code,
        `${fixture.name}/${profile} output drifted; inspect the complete human-readable code before approval`,
      );
      assert.equal(
        createHash('sha256').update(rendering.code).digest('hex'),
        expected.sha256,
        `${fixture.name}/${profile} exact-code hash drifted`,
      );
      assert.equal(rendering.tokens, Math.max(1, Math.ceil(rendering.code.length / 4)));
      assert.deepEqual(decodeProfileSem(rendering.code, profile), canonicalizeSem(fixture.record.sem));
      assert.equal(result.preservation, 1);
      assert.deepEqual(result.warnings, []);

      const { renderings: profiledRenderings, ...profiledWrapper } = result.record;
      assert.deepEqual(profiledWrapper, originalWrapper, `${fixture.name}/${profile} changed a non-rendering record field`);
      for (const [name, original] of Object.entries(originalRenderings)) {
        assert.deepEqual(profiledRenderings[name], original, `${fixture.name}/${profile} changed existing rendering ${name}`);
      }
      generatedCodes.add(rendering.code);
    }

    assert.equal(generatedCodes.size, 3, `${fixture.name} must have three distinct profile encodings`);
  }
});

test('profile decoder fails closed for unknown, mismatched, and malformed encodings', () => {
  assert.throws(() => decodeProfileSem('unknown:{}'), /Unknown renderer-profile encoding/u);
  assert.throws(
    () => decodeProfileSem(approvedRendererCodes.simple.safe.code, 'tight'),
    /Expected tight renderer profile/u,
  );
  assert.throws(() => decodeProfileSem('LUNUM-SHORT/0.1:{}', 'short'), /Invalid short-profile semantic payload/u);
  assert.throws(() => decodeProfileSem('LUNUM-TIGHT/0.1:[]', 'tight'), /Invalid tight-profile semantic payload/u);
});
