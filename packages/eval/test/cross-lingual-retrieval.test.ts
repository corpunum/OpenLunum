import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import os from 'node:os';
import {
  CrossLingualIndex,
  runCrossLingualRetrieval,
  createCrossLingualQueries,
  areSemanticallyEquivalent,
  extractSemanticGroup,
  type CrossLingualQuery,
  type ParallelRecordGroup
} from '../src/cross-lingual-retrieval.js';
import type { LunumRecord } from '@corpunum/lunum';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTempDir(prefix: string = 'cross-lingual-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeRecord(overrides: Partial<LunumRecord> = {}): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text: 'Test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement', clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'item' } }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9 },
    meta: {},
    ...overrides
  } as LunumRecord;
}

// ---------------------------------------------------------------------------
// Semantic group extraction tests
// ---------------------------------------------------------------------------

test('extractSemanticGroup: returns groupId from annotations', () => {
  const record = makeRecord({
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'actual',
      kind: 'statement',
      clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'item' } }],
      annotations: { groupId: 'group-001', confidence: 0.9 }
    } as any
  });

  assert.equal(extractSemanticGroup(record), 'group-001');
});

test('extractSemanticGroup: returns undefined when no groupId', () => {
  const record = makeRecord({
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'actual',
      kind: 'statement',
      clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'item' } }]
    } as any
  });

  assert.equal(extractSemanticGroup(record), undefined);
});

// ---------------------------------------------------------------------------
// Semantic equivalence tests
// ---------------------------------------------------------------------------

test('areSemanticallyEquivalent: returns true for same semantic group', () => {
  const record1 = makeRecord({
    fingerprint: 'lfp:0.1:sha256:sharedDigest1234567890abcdef',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'actual',
      kind: 'statement',
      clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'item' } }],
      annotations: { groupId: 'shared-group' }
    } as any
  });

  const record2 = makeRecord({
    fingerprint: 'lfp:0.1:sha256:sharedDigest1234567890abcdef',
    source: { text: 'Un autre texte', language: 'fr', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'actual',
      kind: 'statement',
      clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'item' } }],
      annotations: { groupId: 'shared-group' }
    } as any
  });

  assert.equal(areSemanticallyEquivalent(record1, record2), true);
});

test('areSemanticallyEquivalent: returns true for same fingerprint digest', () => {
  const record1 = makeRecord({
    fingerprint: 'lfp:0.1:sha256:digest1234567890abcdef1234567890ab'
  });

  const record2 = makeRecord({
    source: { text: 'Different text', language: 'de', role: null, ref: null },
    fingerprint: 'lfp:0.1:sha256:digest1234567890abcdef1234567890ab'
  });

  assert.equal(areSemanticallyEquivalent(record1, record2), true);
});

test('areSemanticallyEquivalent: returns false for different groups', () => {
  const record1 = makeRecord({
    fingerprint: 'lfp:0.1:sha256:digestAAAABBBBCCCCDDDD111122223333',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'actual',
      kind: 'statement',
      clauses: [{ predicate: 'is', roles: { subject: 'a', object: 'b' } }],
      annotations: { groupId: 'group-a' }
    } as any
  });

  const record2 = makeRecord({
    fingerprint: 'lfp:0.1:sha256:digestAAAA1111BBBB2222CCCC3333DDDD',
    source: { text: 'Autre chose', language: 'fr', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'actual',
      kind: 'statement',
      clauses: [{ predicate: 'is', roles: { subject: 'x', object: 'y' } }],
      annotations: { groupId: 'group-b' }
    } as any
  });

  assert.equal(areSemanticallyEquivalent(record1, record2), false);
});

// ---------------------------------------------------------------------------
// CrossLingualIndex tests
// ---------------------------------------------------------------------------

test('CrossLingualIndex: indexes records by language and semantic group', () => {
  const index = new CrossLingualIndex();

  const records: LunumRecord[] = [
    makeRecord({
      source: { text: 'Hello world', language: 'en', role: null, ref: null },
      fingerprint: 'lfp:0.1:sha256:digest1111111111111111111111111111',
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'greet', roles: { subject: 'user', object: 'world' } }],
        annotations: { groupId: 'greeting-001' }
      } as any
    } as LunumRecord),
    makeRecord({
      source: { text: 'Bonjour le monde', language: 'fr', role: null, ref: null },
      fingerprint: 'lfp:0.1:sha256:digest1111111111111111111111111111',
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'greet', roles: { subject: 'user', object: 'world' } }],
        annotations: { groupId: 'greeting-001' }
      } as any
    } as LunumRecord)
  ];

  index.add(records);

  assert.equal(index.getIdsByLanguage('en').length, 1);
  assert.equal(index.getIdsByLanguage('fr').length, 1);
  assert.equal(index.getLanguages().length, 2);
  assert.equal(index.getStats().semanticGroups, 1);
});

test('CrossLingualIndex: findEquivalentInLanguage finds cross-lingual matches', () => {
  const index = new CrossLingualIndex();

  const records: LunumRecord[] = [
    makeRecord({
      source: { text: 'The sky is blue', language: 'en', role: null, ref: null },
      fingerprint: 'lfp:0.1:sha256:skyblue00000000000000000000000',
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'is', roles: { subject: 'sky', object: 'blue' } }],
        annotations: { groupId: 'sky-color' }
      } as any
    } as LunumRecord),
    makeRecord({
      source: { text: 'Le ciel est bleu', language: 'fr', role: null, ref: null },
      fingerprint: 'lfp:0.1:sha256:skyblue00000000000000000000000',
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'is', roles: { subject: 'sky', object: 'blue' } }],
        annotations: { groupId: 'sky-color' }
      } as any
    } as LunumRecord),
    makeRecord({
      source: { text: 'Cest rouge', language: 'fr', role: null, ref: null },
      fingerprint: 'lfp:0.1:sha256:redcolor000000000000000000000000',
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'is', roles: { subject: 'it', object: 'red' } }],
        annotations: { groupId: 'red-thing' }
      } as any
    } as LunumRecord)
  ];

  index.add(records);

  const enRecord = index.getById(index.getIdsByLanguage('en')[0]!);
  assert.ok(enRecord);

  const equivalents = index.findEquivalentInLanguage(enRecord, 'fr');
  assert.equal(equivalents.length, 1);
  assert.equal(equivalents[0]!.source.text, 'Le ciel est bleu');
});

// ---------------------------------------------------------------------------
// Query creation tests
// ---------------------------------------------------------------------------

test('createCrossLingualQueries: generates queries from parallel groups', () => {
  const groups: ParallelRecordGroup[] = [
    {
      groupId: 'parallel-001',
      records: [
        makeRecord({
          source: { text: 'Water boils at 100 degrees Celsius', language: 'en' },
          fingerprint: 'lfp:0.1:sha256:waterboil0000000000000000000000000',
          sem: {
            schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
            clauses: [{ predicate: 'boils', roles: { subject: 'water', object: '100C' } }],
            annotations: { groupId: 'parallel-001' }
          } as any
        } as LunumRecord),
        makeRecord({
          source: { text: 'L\'eau bout à 100 degrés Celsius', language: 'fr' },
          fingerprint: 'lfp:0.1:sha256:waterboil0000000000000000000000000',
          sem: {
            schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
            clauses: [{ predicate: 'boils', roles: { subject: 'water', object: '100C' } }],
            annotations: { groupId: 'parallel-001' }
          } as any
        } as LunumRecord)
      ]
    }
  ];

  const queries = createCrossLingualQueries(groups);

  assert.ok(queries.length > 0, 'Should generate at least one query');
  // Each query should have expectedIds
  for (const q of queries) {
    assert.ok(q.expectedIds.length > 0, `Query should have expectedIds`);
    assert.ok(q.queryLanguage !== q.targetLanguage, 'Query language should differ from target');
  }
});

// ---------------------------------------------------------------------------
// Integration test: cross-lingual index with semantic groups
// ---------------------------------------------------------------------------

test('cross-lingual retrieval: indexes parallel records and finds equivalents', () => {
  const index = new CrossLingualIndex();

  // Create parallel records across languages with shared semantic group
  const records: LunumRecord[] = [];
  const groupId = 'shared-group-001';
  const langs: string[] = ['en', 'fr', 'de', 'es'];

  for (const lang of langs) {
    records.push(makeRecord({
      source: { text: `${lang}: parallel record`, language: lang },
      fingerprint: `lfp:0.1:sha256:sharedDigest${lang}000000000000000000`,
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'parallel' } }],
        annotations: { groupId }
      } as any
    } as LunumRecord));
  }

  // Add a different semantic group
  for (const lang of langs) {
    records.push(makeRecord({
      source: { text: `${lang}: different record`, language: lang },
      fingerprint: `lfp:0.1:sha256:differentDigest${lang}00000000000000000`,
      sem: {
        schema: 'lunum-sem/0.1-draft', world: 'actual', kind: 'statement',
        clauses: [{ predicate: 'is', roles: { subject: 'test', object: 'different' } }],
        annotations: { groupId: 'different-group' }
      } as any
    } as LunumRecord));
  }

  index.add(records);

  // Verify index stats
  const stats = index.getStats();
  assert.equal(stats.totalRecords, 8);
  assert.equal(stats.semanticGroups, 2);

  // Create a query from English to French
  const enId = index.getIdsByLanguage('en')[0];
  assert.ok(enId);
  const sourceRecord = index.getById(enId);
  assert.ok(sourceRecord);

  // Find equivalent records in French
  const equivalents = index.findEquivalentInLanguage(sourceRecord, 'fr');
  // Should find the French record with the same semantic group
  assert.ok(equivalents.length >= 1);
  assert.equal(equivalents[0]!.source.language, 'fr');

  // Verify semantic group index
  const groupIds = index.getIdsBySemanticGroup(groupId);
  assert.equal(groupIds.length, 4); // One per language
});
