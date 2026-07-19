import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ProfileGenerator, type ProfileType } from '../src/profiles.js';
import type { LunumRecord, LunumSem } from '../src/types.js';
import { approvedRendererSnapshots } from './fixtures/renderer-profile-exact-goldens.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  const entries = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
  return `{${entries.join(',')}}`;
}

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

export const fixtures: Array<{ name: string; record: LunumRecord }> = [
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

const approvedHashes: Record<string, Record<ProfileType, string>> = {
  simple: {
    safe: '4543eee033f187478c809c5dd244fca6a93c924bcde0c0b0b2d962628d75f6f2',
    short: 'e0f64f9a0307c7266c5e3a6b6cb639b8a56344d5b9867f06220eba1f64d27606',
    tight: 'f57202d4141c3fc749534dfd9c009d79e5bfa2aca0ff8c609aedfa9a939f2db2',
  },
  negated: {
    safe: 'e5501910475b01d673d22c23c7275a7e31c1ce69e8bc5173906e1bb8e1c06f32',
    short: 'f287e8063add7989bba0431d16c261349ad7737e3dba5362ee2a8ebdee9be2c4',
    tight: '4ce2515ef33c1db0a92ed2d090d3b9e5c4c9f20672c98aad64e3e75e44976ebb',
  },
  conditions: {
    safe: '01b8f9fd08efe89978fb7ef60a6540b696baa522c8d41b709fa42633695f15e9',
    short: '98670775bea0862dae96330fdfa5d09c2e77fbc36ac043f9e6229a44c24914a7',
    tight: 'da0364173507d0f75652abb8ce7e3d053d9300fafaa4d328f2ccb44d02f1ac0e',
  },
  modality: {
    safe: 'd47aeade92a1923b227970b67415ad2027f5ddd17c6580814dc78bda2ccd2672',
    short: '501b5ec87c023b210e6b56d79678c38a766b7e15603bb21c7a32329ae1984f89',
    tight: 'ccede1960874ad7bbb96727bcdedef878b991e3961273f2d268b3b3b7dca7a1c',
  },
  annotations: {
    safe: 'c19d8c1ff414ffc30cd537f747c06a5c3545f4d019a7d36535506452f848ad19',
    short: 'f8e0670b8da58318f9df1e706ce00169fe0815fcf43ccd524784aa46209edda4',
    tight: '454b6c4d6c216c2d66efa7b4fa1b879a936470004e4e44dd4ddbbb25dc6c6f6e',
  },
  provenance: {
    safe: 'ff8f544820e0c7fda96e3db23eb7ed3211b8fbbba46b85d263c0dcf09f6f963c',
    short: 'ace61a811f537de876d283d91763da6a1203b10875aa86f60fe5377a35b405b0',
    tight: '88e7be92631b0d5531cce8322e3e68564d2ce9c88866137184cfa1e792deb1e9',
  },
  'metadata-rendering': {
    safe: '3c34fffb0c06920594e012e75ad9c6cbf5a3962a67058eeb5cbab8d8f7e8dcc4',
    short: 'a25c8e3f7ac374c5a631d4dd962afadc4dedb92463fcf873d5cf3a3560a7802d',
    tight: '69a9f25bb4333a6299256b06dd7890b3791ef0ed6e7138a7a86a011528a20c69',
  },
  'long-role': {
    safe: 'ab3a94c031e737615ec3f11648f0086c4c75df2ed60ef5c52cab11f3e7195878',
    short: '26cfce048fa3e0e1a5906836904d459bfe2d6bd1d8b38a0ee40eaf413cfe750e',
    tight: '27626e0eb8f37fe6f5af7038bd2653504caf94e776c355082edd37cb0c7836c5',
  },
  references: {
    safe: 'e2a5bd9b5573bfe1b272857117c345c3a43244ea66e0abc973536cbcdf293549',
    short: 'd49c1c62b3d42695e6ceff0c4b560cb8545c856216290cf89e2f5f11b4a34d05',
    tight: 'c4974dcff6edd011aa86dca9bfd4ab031db28cab0ef62b248c48f1f42ee2d813',
  },
  'multiple-clauses': {
    safe: '5d47f625dec06e992415706ec1d05e35bf761181a73d10b20dcc91f992eb7013',
    short: '2673a20094b65ec1bc5babe664bd29b6309d9ca20b5131ebc90937d4a1d4f705',
    tight: '90ecef94d7cc7ae4fe5a58f0e776736e0e68d1f833194d3c32d9d523a943b990',
  },
};

if (process.env.UPDATE_RENDERER_GOLDENS === '1') {
  const generator = new ProfileGenerator();
  const snapshots = Object.fromEntries(fixtures.map((fixture) => [
    fixture.name,
    Object.fromEntries((['safe', 'short', 'tight'] as const).map((profile) => {
      const result = generator.profile(fixture.record, profile);
      return [profile, JSON.parse(stableStringify({ record: result.record, warnings: result.warnings ?? [] }))];
    })),
  ]));
  const source = `// Generated by UPDATE_RENDERER_GOLDENS=1; review every changed value.\nexport const approvedRendererSnapshots = ${JSON.stringify(snapshots, null, 2)} as const;\n`;
  writeFileSync(new URL('../../test/fixtures/renderer-profile-exact-goldens.ts', import.meta.url), source);
}

test('renderer profiles match approved exact full-output goldens', () => {
  const generator = new ProfileGenerator();
  const profiles: ProfileType[] = ['safe', 'short', 'tight'];

  assert.equal(fixtures.length, 10);

  for (const fixture of fixtures) {
    for (const profile of profiles) {
      const result = generator.profile(fixture.record, profile);
      const snapshot = {
        record: result.record,
        warnings: result.warnings ?? [],
      };
      const reviewableSnapshot = JSON.parse(stableStringify(snapshot));
      const expectedSnapshot = approvedRendererSnapshots[fixture.name as keyof typeof approvedRendererSnapshots]?.[profile];
      assert.deepEqual(
        reviewableSnapshot,
        expectedSnapshot,
        `${fixture.name}/${profile} output drifted; inspect the human-readable golden before approving it`,
      );
      const actualHash = createHash('sha256').update(stableStringify(snapshot)).digest('hex');
      const expectedHash = approvedHashes[fixture.name]?.[profile];
      assert.equal(
        actualHash,
        expectedHash,
        `${fixture.name}/${profile} output drifted; inspect the complete output before approving a new golden hash`,
      );
    }
  }
});
