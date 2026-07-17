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
    source: { text: 'Hello world', language: 'en' },
    sem: { clauses: [{ predicate: 'greeting' }] },
    fingerprint: 'test-fp-1'
  };

  index.add(mockRecord);
  
  const stats = index.getStats();
  assert.strictEqual(stats.totalRecords, 1);
  assert.strictEqual(stats.recordsByLanguage.en, 1);
});

test('MultilingualRetrievalIndex indexes by language', () => {
  const index = new MultilingualRetrievalIndex();
  
  const enRecord = {
    source: { text: 'Hello world', language: 'en' },
    sem: { clauses: [{ predicate: 'greeting' }] },
    fingerprint: 'en-1'
  };

  const elRecord = {
    source: { text: 'Γεια σου κόσμε', language: 'el' },
    sem: { clauses: [{ predicate: 'greeting' }] },
    fingerprint: 'el-1'
  };

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
    source: { text: 'The quick brown fox jumps', language: 'en' },
    sem: { clauses: [{ predicate: 'action' }] },
    fingerprint: 'test-1'
  };

  index.add(record);
  
  const query: RetrievalQuery = {
    text: 'quick brown fox',
    language: 'en',
    maxResults: 10
  };

  const results = index.search(query);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 'test-1');
  assert.ok(results[0].score > 0);
});

test('MultilingualRetrievalIndex cross-language search with false equivalences', () => {
  const index = new MultilingualRetrievalIndex();
  
  const enRecord = {
    source: { text: 'The cat sits on the mat', language: 'en' },
    sem: { clauses: [{ predicate: 'location' }] },
    fingerprint: 'en-cat'
  };

  const esRecord = {
    source: { text: 'El gato se sienta en la alfombra', language: 'es' },
    sem: { clauses: [{ predicate: 'location' }] },
    fingerprint: 'es-cat'
  };

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
    source: { text: 'Test', language: 'en' },
    sem: { clauses: [{ predicate: 'test' }] },
    fingerprint: 'test-clear'
  });

  index.clear();
  
  const stats = index.getStats();
  assert.strictEqual(stats.totalRecords, 0);
  assert.strictEqual(Object.keys(stats.recordsByLanguage).length, 0);
});

test('False equivalence detection works', () => {
  const index = new MultilingualRetrievalIndex();
  
  const record = {
    source: { text: 'Test record', language: 'en' },
    sem: { clauses: [] }, // Empty clauses for testing
    fingerprint: 'test-fp'
  };

  const eq = index.detectFalseEquivalence('en', 'el', record);
  assert.ok(eq);
  assert.strictEqual(eq.languages[0], 'en');
  assert.strictEqual(eq.languages[1], 'el');
  assert.ok(eq.confidence > 0);
});