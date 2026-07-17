import { test } from 'node:test';
import assert from 'node:assert';
import { 
  RealizationEngine,
  SUPPORTED_REALIZATION_LANGUAGES,
  type RealizationLanguage
} from '../src/realization.js';

// Helper to create mock records
const createMockRecord = (
  fingerprint: string,
  text: string,
  language: string,
  clauses: Array<{ predicate: string; roles: Record<string, string> }>
) => ({
  recordVersion: 'lunum-record/0.1-draft',
  source: { text, language, role: null, ref: null },
  sem: { 
    schema: 'lunum-sem/0.1-draft', 
    world: 'test', 
    kind: 'test', 
    clauses: clauses.map(c => ({ 
      ...c, 
      roles: Object.fromEntries(Object.entries(c.roles).map(([k, v]) => [k, v])) 
    })) 
  },
  fingerprint,
  renderings: {},
  policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
  meta: {}
});

test('RealizationEngine supports Spanish', () => {
  const engine = new RealizationEngine();
  const langs = engine.getSupportedLanguages();
  
  assert.ok(langs.includes('es'));
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('es'));
});

test('RealizationEngine supports Indonesian', () => {
  const engine = new RealizationEngine();
  const langs = engine.getSupportedLanguages();
  
  assert.ok(langs.includes('id'));
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('id'));
});

test('RealizationEngine realizes Spanish greetings', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('es-test-1', 'Hola mundo', 'es', [
    { predicate: 'greeting', roles: { subject: 'todos' } }
  ]);

  const result = engine.realize(record, 'es');
  
  assert.strictEqual(result.language, 'es');
  assert.ok(result.text.includes('Saludos'));
  assert.ok(result.text.includes('todos'));
  assert.strictEqual(result.metadata.clausesProcessed, 1);
});

test('RealizationEngine realizes Spanish statements', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('es-test-2', 'Test statement', 'es', [
    { predicate: 'statement', roles: { subject: 'Apple', verb: 'is', object: 'testing' } }
  ]);

  const result = engine.realize(record, 'es');
  
  assert.strictEqual(result.language, 'es');
  assert.ok(result.text.includes('Apple'));
  assert.strictEqual(result.metadata.clausesProcessed, 1);
});

test('RealizationEngine realizes Spanish questions', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('es-test-3', 'Test question', 'es', [
    { predicate: 'question', roles: { subject: 'test', predicate: 'valid' } }
  ]);

  const result = engine.realize(record, 'es');
  
  assert.strictEqual(result.language, 'es');
  assert.ok(result.text.includes('¿Es'));
  assert.ok(result.text.includes('test'));
});

test('RealizationEngine realizes Spanish locations', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('es-test-4', 'Test location', 'es', [
    { predicate: 'location', roles: { subject: 'Madrid', location: 'España' } }
  ]);

  const result = engine.realize(record, 'es');
  
  assert.strictEqual(result.language, 'es');
  assert.ok(result.text.includes('está ubicado en'));
  assert.ok(result.text.includes('Madrid'));
  assert.ok(result.text.includes('España'));
});

test('RealizationEngine realizes Spanish actions', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('es-test-5', 'Test action', 'es', [
    { predicate: 'action', roles: { subject: 'Programador', verb: 'escribir', object: 'código' } }
  ]);

  const result = engine.realize(record, 'es');
  
  assert.strictEqual(result.language, 'es');
  assert.ok(result.text.includes('Programador'));
  assert.ok(result.text.includes('código'));
});

test('RealizationEngine realizes Indonesian greetings', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('id-test-1', 'Halo dunia', 'id', [
    { predicate: 'greeting', roles: { subject: 'semua' } }
  ]);

  const result = engine.realize(record, 'id');
  
  assert.strictEqual(result.language, 'id');
  assert.ok(result.text.includes('Salam'));
  assert.ok(result.text.includes('semua'));
  assert.strictEqual(result.metadata.clausesProcessed, 1);
});

test('RealizationEngine realizes Indonesian statements', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('id-test-2', 'Test statement', 'id', [
    { predicate: 'statement', roles: { subject: 'Google', verb: 'is', object: 'testing' } }
  ]);

  const result = engine.realize(record, 'id');
  
  assert.strictEqual(result.language, 'id');
  assert.ok(result.text.includes('Google'));
  assert.strictEqual(result.metadata.clausesProcessed, 1);
});

test('RealizationEngine realizes Indonesian questions', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('id-test-3', 'Test question', 'id', [
    { predicate: 'question', roles: { subject: 'test', predicate: 'valid' } }
  ]);

  const result = engine.realize(record, 'id');
  
  assert.strictEqual(result.language, 'id');
  assert.ok(result.text.includes('Apakah'));
  assert.ok(result.text.includes('test'));
});

test('RealizationEngine realizes Indonesian locations', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('id-test-4', 'Test location', 'id', [
    { predicate: 'location', roles: { subject: 'Jakarta', location: 'Indonesia' } }
  ]);

  const result = engine.realize(record, 'id');
  
  assert.strictEqual(result.language, 'id');
  assert.ok(result.text.includes('terletak di'));
  assert.ok(result.text.includes('Jakarta'));
  assert.ok(result.text.includes('Indonesia'));
});

test('RealizationEngine realizes Indonesian actions', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('id-test-5', 'Test action', 'id', [
    { predicate: 'action', roles: { subject: 'Developer', verb: 'write', object: 'code' } }
  ]);

  const result = engine.realize(record, 'id');
  
  assert.strictEqual(result.language, 'id');
  assert.ok(result.text.includes('Developer'));
  assert.ok(result.text.includes('code'));
});

test('SUPPORTED_REALIZATION_LANGUAGES contains all four languages', () => {
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('en'));
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('el'));
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('es'));
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('id'));
  assert.strictEqual(SUPPORTED_REALIZATION_LANGUAGES.size, 4);
});

test('RealizationEngine getSupportedLanguages returns all four languages', () => {
  const engine = new RealizationEngine();
  const langs = engine.getSupportedLanguages();
  
  assert.strictEqual(langs.length, 4);
  assert.ok(langs.includes('en'));
  assert.ok(langs.includes('el'));
  assert.ok(langs.includes('es'));
  assert.ok(langs.includes('id'));
});

test('RealizationEngine handles unsupported language', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } }
  ]);

  assert.throws(
    () => engine.realize(record, 'fr' as RealizationLanguage),
    /Realization not supported for language/
  );
});