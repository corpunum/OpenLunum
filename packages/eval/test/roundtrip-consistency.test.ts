import { test } from 'node:test';
import assert from 'node:assert';
import { 
  RoundTripChecker,
  type RoundTripResult
} from '../src/roundtrip-consistency.js';

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

test('RoundTripChecker performs basic round-trip check', () => {
  const checker = new RoundTripChecker();
  
  const record = createMockRecord('test-fp-1', 'Hello everyone', 'en', [
    { predicate: 'greeting', roles: { subject: 'everyone' } }
  ]);

  const result = checker.checkConsistency(record, 'Hello everyone', []);
  
  assert.ok(result.originalFingerprint === 'test-fp-1');
  assert.ok(result.realizedText === 'Hello everyone');
  assert.ok(result.parsedFingerprint.startsWith('rtf:'));
  assert.ok(result.consistencyScore >= 0);
  assert.ok(result.consistencyScore <= 1);
});

test('RoundTripChecker calculates predicate match', () => {
  const checker = new RoundTripChecker();
  
  const record = createMockRecord('test-fp-2', 'Test statement', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } }
  ]);

  const result = checker.checkConsistency(record, 'This is a test statement', []);
  
  assert.ok(result.components.predicateMatch > 0);
  assert.ok(result.components.predicateMatch <= 1);
});

test('RoundTripChecker calculates role match', () => {
  const checker = new RoundTripChecker();
  
  const record = createMockRecord('test-fp-3', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test', object: 'value' } }
  ]);

  const result = checker.checkConsistency(record, 'Test statement value', []);
  
  assert.ok(result.components.roleMatch >= 0);
  assert.ok(result.components.roleMatch <= 1);
});

test('RoundTripChecker calculates protected literal preservation', () => {
  const checker = new RoundTripChecker();
  
  const record = createMockRecord('test-fp-4', 'Apple test', 'en', [
    { predicate: 'statement', roles: { subject: 'Apple' } }
  ]);

  const literals = [
    { text: 'Apple', type: 'name' }
  ];

  const result = checker.checkConsistency(record, 'Apple is testing', literals);
  
  assert.ok(result.components.protectedLiteralPreservation >= 0);
  assert.ok(result.components.protectedLiteralPreservation <= 1);
});

test('RoundTripChecker generates warnings for low scores', () => {
  const checker = new RoundTripChecker({ minConsistencyScore: 0.9 });
  
  const record = createMockRecord('test-fp-5', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } }
  ]);

  // Use different text to trigger low predicate match
  const result = checker.checkConsistency(record, 'Completely different text here', []);
  
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.metadata.originalClauses === 1);
  assert.ok(result.metadata.protectedLiteralsFound === 0);
});

test('RoundTripChecker isConsistent checks threshold', () => {
  const checker = new RoundTripChecker({ minConsistencyScore: 0.5 });
  
  const record = createMockRecord('test-fp-6', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } }
  ]);

  const result = checker.checkConsistency(record, 'Test statement', []);
  
  assert.strictEqual(checker.isConsistent(result), true);
});

test('RoundTripChecker getMinConsistencyScore returns correct value', () => {
  const checker = new RoundTripChecker({ minConsistencyScore: 0.8 });
  
  assert.strictEqual(checker.getMinConsistencyScore(), 0.8);
});

test('RoundTripChecker setMinConsistencyScore updates value', () => {
  const checker = new RoundTripChecker();
  
  assert.strictEqual(checker.getMinConsistencyScore(), 0.7); // Default
  
  checker.setMinConsistencyScore(0.9);
  assert.strictEqual(checker.getMinConsistencyScore(), 0.9);
});

test('RoundTripChecker handles empty clauses', () => {
  const checker = new RoundTripChecker();
  
  const record = createMockRecord('test-fp-7', 'Test', 'en', []);

  const result = checker.checkConsistency(record, 'Test', []);
  
  assert.ok(result.components.predicateMatch === 1);
  assert.ok(result.components.roleMatch === 0);
  assert.ok(result.components.protectedLiteralPreservation === 1);
});

test('RoundTripChecker metadata is populated', () => {
  const checker = new RoundTripChecker();
  
  const record = createMockRecord('test-fp-8', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } },
    { predicate: 'action', roles: { subject: 'test', verb: 'runs' } }
  ]);

  const literals = [
    { text: 'Test', type: 'name' }
  ];

  const result = checker.checkConsistency(record, 'Test statement action runs', literals);
  
  assert.strictEqual(result.metadata.originalClauses, 2);
  assert.strictEqual(result.metadata.protectedLiteralsFound, 1);
  assert.ok(result.metadata.parsedClauses >= 0);
});