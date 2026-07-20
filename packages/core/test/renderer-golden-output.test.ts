import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeSem } from '../src/canonicalize.js';
import {
  decodeProfileSem,
  ProfileGenerator,
  type ProfileType,
} from '../src/profiles.js';
import type { LunumRecord, LunumSem } from '../src/types.js';

function makeRecord(name: string, sem: LunumSem, renderings: LunumRecord['renderings'] = {}): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: `Natural-language source for ${name}.`, language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: `lfp:0.1:sha256:${name.padEnd(16, '0')}`,
    renderings,
    policy: { eligible: true, category: sem.kind, risk: 'low', confidence: 0.9, reasons: ['test'] },
    meta: { fixture: name },
  };
}

const diverseInputs: Array<{ name: string; record: LunumRecord }> = [
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
        conditions: [{ predicate: 'authenticate', roles: { agent: 'user' } }],
      }],
    }),
  },
  {
    name: 'consequences',
    record: makeRecord('consequences', {
      schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'rule',
      clauses: [{
        predicate: 'delete', roles: { theme: 'temporary_files' },
        conditions: [{ predicate: 'disk_full', roles: {} }],
        consequences: [{ predicate: 'free_space', roles: {} }],
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
    name: 'time',
    record: makeRecord('time', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event',
      clauses: [{ predicate: 'start', roles: { subject: 'meeting' }, time: { type: 'datetime', value: '2026-08-01T12:00:00Z' } }],
    }),
  },
  {
    name: 'annotations',
    record: makeRecord('annotations', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'dark_mode' } }],
      annotations: { confidence: 0.95, tags: ['ui', 'preference'] },
    }),
  },
  {
    name: 'provenance',
    record: makeRecord('provenance', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'claim',
      clauses: [{ predicate: 'state', roles: { source: 'document', theme: 'fact' } }],
      provenance: { source: 'manual', author: 'alice', timestamp: '2026-01-15T10:00:00Z' },
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
  {
    name: 'typed-terms',
    record: makeRecord('typed-terms', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'measurement',
      clauses: [{
        predicate: 'measure',
        roles: {
          subject: { type: 'sensor', id: 'temp-1' },
          value: { type: 'quantity', value: 25 },
        },
      }],
    }),
  },
  {
    name: 'array-terms',
    record: makeRecord('array-terms', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'set',
      clauses: [{ predicate: 'contain', roles: { collection: 'basket', members: ['apple', 'pear', 'plum'] } }],
    }),
  },
  {
    name: 'clause-annotations',
    record: makeRecord('clause-annotations', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'observe', roles: { subject: 'system' }, annotations: { confidence: 0.8, evidence: 'log-7' } }],
    }),
  },
  {
    name: 'long-text',
    record: makeRecord('long-text', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{
        predicate: 'process',
        roles: { agent: 'system', subject: 'An extremely long descriptive value that must survive every renderer profile without truncation or mutation.' },
      }],
    }),
  },
  {
    name: 'multilingual',
    record: makeRecord('multilingual', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'χρήστης', theme: { type: 'text', value: 'σύντομες απαντήσεις', language: 'el' } } }],
    }, {
      en: { code: 'The user prefers concise answers.', profile: 'natural/en', tokens: 6 },
    }),
  },
];

const profiles: ProfileType[] = ['safe', 'short', 'tight'];

test('renderer profiles are deterministic, distinct, and losslessly reversible across 15 diverse inputs', () => {
  assert.ok(diverseInputs.length >= 15);

  for (const { name, record } of diverseInputs) {
    const firstGenerator = new ProfileGenerator();
    const secondGenerator = new ProfileGenerator();
    const codes = new Set<string>();

    for (const profile of profiles) {
      const first = firstGenerator.profile(record, profile);
      const second = secondGenerator.profile(record, profile);
      const firstRendering = first.record.renderings[profile];
      const secondRendering = second.record.renderings[profile];
      assert.ok(firstRendering && secondRendering, `${name}/${profile} rendering missing`);
      assert.equal(firstRendering.code, secondRendering.code, `${name}/${profile} is not deterministic`);
      assert.deepEqual(decodeProfileSem(firstRendering.code, profile), canonicalizeSem(record.sem));
      assert.equal(first.preservation, 1);
      assert.deepEqual(first.warnings, []);
      assert.deepEqual(first.record.sem, record.sem);
      assert.deepEqual(first.record.source, record.source);
      assert.equal(first.record.fingerprint, record.fingerprint);
      assert.deepEqual(first.record.policy, record.policy);
      assert.deepEqual(first.record.meta, record.meta);
      for (const [key, rendering] of Object.entries(record.renderings)) {
        assert.deepEqual(first.record.renderings[key], rendering, `${name}/${profile} changed existing rendering ${key}`);
      }
      codes.add(firstRendering.code);
    }

    assert.equal(codes.size, 3, `${name} profile outputs are not distinct`);
  }
});

test('short and tight encodings progressively reduce the deterministic semantic payload', () => {
  for (const { name, record } of diverseInputs) {
    const generator = new ProfileGenerator();
    const safe = generator.profile(record, 'safe').record.renderings.safe!.code;
    const short = generator.profile(record, 'short').record.renderings.short!.code;
    const tight = generator.profile(record, 'tight').record.renderings.tight!.code;
    assert.ok(short.length < safe.length, `${name}: short=${short.length}, safe=${safe.length}`);
    assert.ok(tight.length < short.length, `${name}: tight=${tight.length}, short=${short.length}`);
  }
});

test('token reduction is reported honestly relative to source text and may be negative', () => {
  const generator = new ProfileGenerator();
  const record = makeRecord('tiny-source', {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
    clauses: [{ predicate: 'exist', roles: {} }],
  });
  record.source.text = 'x';

  const result = generator.profile(record, 'safe');
  assert.ok(result.originalTokens > 0);
  assert.ok(result.profiledTokens > 0);
  assert.ok(result.reduction < 0, 'larger semantic output must not be reported as token savings');
});

test('existing non-semantic renderings are retained without warnings in every profile', () => {
  const record = diverseInputs.find((entry) => entry.name === 'multilingual')!.record;
  const generator = new ProfileGenerator();
  for (const profile of profiles) {
    const result = generator.profile(record, profile);
    assert.deepEqual(result.record.renderings.en, record.renderings.en);
    assert.deepEqual(result.warnings, []);
  }
});

test('profile configuration remains explicit and cannot enable semantic loss', () => {
  const generator = new ProfileGenerator();
  for (const profile of profiles) {
    const config = generator.getConfig(profile);
    assert.equal(config.type, profile);
    assert.equal(config.level, 'Reference');
    assert.equal(config.preserveAnnotations, true);
    assert.equal(config.preserveProvenance, true);
  }
  assert.throws(() => generator.setConfig('safe', { preserveAnnotations: false }), /cannot discard canonical semantics/u);
  assert.throws(() => generator.setConfig('tight', { preserveProvenance: false }), /cannot discard canonical semantics/u);
});
