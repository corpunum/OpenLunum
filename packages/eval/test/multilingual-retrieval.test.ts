import { test } from 'node:test';
import assert from 'node:assert';
import { 
  MultilingualRetrievalIndex,
  SUPPORTED_LANGUAGES,
  type RetrievalQuery
} from '../src/multilingual-retrieval.js';

test('MultilingualRetrievalIndex adds and retrieves records', () => {
  const index = new MultilingualRetrievalIndex();
  
  const mockRecord = {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'Hello world', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'greeting', roles: {} }] },
    fingerprint: 'test-fp-1',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  };

  index.add(mockRecord);
  
  const stats = index.getStats();
  assert.strictEqual(stats.totalRecords, 1);
  assert.strictEqual(stats.recordsByLanguage.en, 1);
});

test('MultilingualRetrievalIndex indexes by language', () => {
  const index = new MultilingualRetrievalIndex();
  
  const makeRecord = (text: string, lang: string, fp: string) => ({
    recordVersion: 'lunum-record/0.1-draft',
    source: { text, language: lang, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'test', roles: {} }] },
    fingerprint: fp,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  });
  
  const enRecord = makeRecord('Hello world', 'en', 'en-1');
  const elRecord = makeRecord('Γεια σου κόσμε', 'el', 'el-1');

  index.add(enRecord);
  index.add(elRecord);
  
  const stats = index.getStats();
  assert.strictEqual(stats.totalRecords, 2);
  assert.strictEqual(stats.recordsByLanguage.en, 1);
  assert.strictEqual(stats.recordsByLanguage.el, 1);
});

test('MultilingualRetrievalIndex searches within language', () => {
  const index = new MultilingualRetrievalIndex();
  
  const record = {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'The quick brown fox jumps', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'action', roles: {} }] },
    fingerprint: 'test-1',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  };

  index.add(record);
  
  const query: RetrievalQuery = {
    text: 'quick brown fox',
    language: 'en',
    maxResults: 10
  };

  const results = index.search(query);
  assert.strictEqual(results.length, 1);
  const firstResult = results[0]!;
  assert.strictEqual(firstResult.id, 'test-1');
  assert.ok(firstResult.score > 0);
});

test('MultilingualRetrievalIndex cross-language search with false equivalences', () => {
  const index = new MultilingualRetrievalIndex();
  
  const makeRecord = (text: string, lang: string, fp: string) => ({
    recordVersion: 'lunum-record/0.1-draft',
    source: { text, language: lang, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'location', roles: {} }] },
    fingerprint: fp,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  });
  
  const enRecord = makeRecord('The cat sits on the mat', 'en', 'en-cat');
  const esRecord = makeRecord('El gato se sienta en la alfombra', 'es', 'es-cat');

  index.add(enRecord);
  index.add(esRecord);
  
  const query: RetrievalQuery = {
    text: 'cat sits',
    language: 'en',
    maxResults: 10,
    includeFalseEquivalences: true
  };

  const results = index.search(query);
  assert.ok(results.length >= 1);
});

test('SUPPORTED_LANGUAGES contains expected languages', () => {
  assert.ok(SUPPORTED_LANGUAGES.has('en'));
  assert.ok(SUPPORTED_LANGUAGES.has('el'));
  assert.ok(SUPPORTED_LANGUAGES.has('es'));
  assert.ok(SUPPORTED_LANGUAGES.has('id'));
  assert.strictEqual(SUPPORTED_LANGUAGES.size, 4);
});

test('MultilingualRetrievalIndex clears index', () => {
  const index = new MultilingualRetrievalIndex();
  
  index.add({
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'Test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'test', roles: {} }] },
    fingerprint: 'test-clear',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.9, reasons: [] },
    meta: {}
  });

  index.clear();
  
  const stats = index.getStats();
  assert.strictEqual(stats.totalRecords, 0);
  assert.strictEqual(Object.keys(stats.recordsByLanguage).length, 0);
});

test('False equivalence detection works', () => {
  const index = new MultilingualRetrievalIndex();
  
  const record = {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'Test record', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [] }, // Empty clauses for testing
    fingerprint: 'test-fp',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  };

  const eq = index.detectFalseEquivalence('en', 'el', record);
  assert.ok(eq);
  assert.strictEqual(eq.languages[0], 'en');
  assert.strictEqual(eq.languages[1], 'el');
  assert.ok(eq.confidence > 0);
});