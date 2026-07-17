import { test } from 'node:test';
import assert from 'node:assert';
import { 
  RealizationEngine,
  SUPPORTED_REALIZATION_LANGUAGES,
  type RealizationLanguage,
  type ProtectedLiteral
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

test('RealizationEngine realizes English text', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-1', 'Hello world', 'en', [
    { predicate: 'greeting', roles: { subject: 'everyone' } }
  ]);

  const result = engine.realize(record, 'en');
  
  assert.strictEqual(result.language, 'en');
  assert.ok(result.text.includes('Greetings'));
  assert.ok(result.text.includes('everyone'));
  assert.strictEqual(result.metadata.clausesProcessed, 1);
});

test('RealizationEngine realizes Greek text', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-2', 'Γεια σου', 'el', [
    { predicate: 'greeting', roles: { subject: 'Κόσμε' } }
  ]);

  const result = engine.realize(record, 'el');
  
  assert.strictEqual(result.language, 'el');
  assert.ok(result.text.includes('Γειά σου'));
  assert.ok(result.text.includes('Κόσμε'));
});

test('RealizationEngine preserves semantic identity', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-3', 'Test statement', 'en', [
    { predicate: 'statement', roles: { subject: 'Test', verb: 'is', object: 'testing' } }
  ]);

  const result = engine.realize(record, 'en');
  
  assert.strictEqual(result.semanticIdentity.originalFingerprint, 'test-fp-3');
  assert.ok(result.semanticIdentity.realizationFingerprint.startsWith('rfp:'));
  assert.ok(result.semanticIdentity.matchConfidence >= 0);
});

test('RealizationEngine extracts protected literals', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-4', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'Apple', verb: 'is', object: 'testing' } }
  ]);

  const result = engine.realize(record, 'en');
  
  assert.ok(result.protectedLiterals.length > 0);
  const appleLiteral = result.protectedLiterals.find(l => l.text === 'Apple');
  assert.ok(appleLiteral);
  assert.strictEqual(appleLiteral.type, 'name');
});

test('SUPPORTED_REALIZATION_LANGUAGES contains en and el', () => {
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('en'));
  assert.ok(SUPPORTED_REALIZATION_LANGUAGES.has('el'));
  assert.strictEqual(SUPPORTED_REALIZATION_LANGUAGES.size, 2);
});

test('RealizationEngine handles unsupported language', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-5', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } }
  ]);

  assert.throws(
    () => engine.realize(record, 'es' as RealizationLanguage),
    /Realization not supported for language/
  );
});

test('RealizationEngine getStats returns correct information', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-6', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'Google' } }
  ]);

  engine.registerProtectedLiterals('test-fp-6', [
    { text: 'Google', language: 'en', type: 'name' }
  ]);

  const stats = engine.getStats();
  assert.strictEqual(stats.totalProtectedLiterals, 1);
  assert.ok(stats.supportedLanguages.includes('en'));
  assert.ok(stats.supportedLanguages.includes('el'));
});

test('RealizationEngine handles clauses without matching rules', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-7', 'Test', 'en', [
    { predicate: 'unknown_predicate', roles: {} }
  ]);

  const result = engine.realize(record, 'en');
  
  assert.ok(result.metadata.warnings);
  assert.ok(result.metadata.warnings!.length > 0);
  assert.strictEqual(result.metadata.clausesProcessed, 0);
});

test('RealizationEngine realizes location clause', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-8', 'Location test', 'en', [
    { predicate: 'location', roles: { subject: 'Paris', location: 'France' } }
  ]);

  const result = engine.realize(record, 'en');
  
  assert.ok(result.text.includes('located at'));
  assert.ok(result.text.includes('Paris'));
  assert.ok(result.text.includes('France'));
});

test('RealizationEngine realizes action clause', () => {
  const engine = new RealizationEngine();
  
  const record = createMockRecord('test-fp-9', 'Action test', 'en', [
    { predicate: 'action', roles: { subject: 'Developer', verb: 'write', object: 'code' } }
  ]);

  const result = engine.realize(record, 'en');
  
  assert.ok(result.text.includes('writes'));
  assert.ok(result.text.includes('Developer'));
  assert.ok(result.text.includes('code'));
});