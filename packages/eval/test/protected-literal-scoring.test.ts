import { test } from 'node:test';
import assert from 'node:assert';
import { 
  ProtectedLiteralDetector,
  SemanticScorer,
  type ProtectedLiteral
} from '../src/protected-literal-scoring.js';

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

// ── Protected Literal Detector Tests ───────────────────────────────

test('ProtectedLiteralDetector detects person names', () => {
  const detector = new ProtectedLiteralDetector();
  
  const record = createMockRecord('test-fp-1', 'Apple Inc.', 'en', [
    { predicate: 'statement', roles: { subject: 'Apple', object: 'Company' } }
  ]);

  const literals = detector.detect(record);
  
  const appleLiteral = literals.find(l => l.text === 'Apple');
  assert.ok(appleLiteral);
  assert.strictEqual(appleLiteral.type, 'name');
  assert.ok(appleLiteral.confidence >= 0);
});

test('ProtectedLiteralDetector detects version numbers', () => {
  const detector = new ProtectedLiteralDetector();
  
  const record = createMockRecord('test-fp-2', 'Version 2.0.1', 'en', [
    { predicate: 'statement', roles: { subject: 'v2.0.1' } }
  ]);

  const literals = detector.detect(record);
  
  const versionLiteral = literals.find(l => l.text === 'v2.0.1');
  assert.ok(versionLiteral);
  assert.strictEqual(versionLiteral.type, 'term');
  assert.strictEqual(versionLiteral.confidence, 0.95);
});

test('ProtectedLiteralDetector detects URLs', () => {
  const detector = new ProtectedLiteralDetector();
  
  const record = createMockRecord('test-fp-3', 'URL test', 'en', [
    { predicate: 'link', roles: { url: 'https://example.com/page' } }
  ]);

  const literals = detector.detect(record);
  
  const urlLiteral = literals.find(l => l.text === 'https://example.com/page');
  assert.ok(urlLiteral);
  assert.strictEqual(urlLiteral.type, 'url');
  assert.strictEqual(urlLiteral.confidence, 0.99);
});

test('ProtectedLiteralDetector detects ISO dates', () => {
  const detector = new ProtectedLiteralDetector();
  
  const record = createMockRecord('test-fp-4', 'Date test', 'en', [
    { predicate: 'time', roles: { date: '2024-01-15' } }
  ]);

  const literals = detector.detect(record);
  
  const dateLiteral = literals.find(l => l.text === '2024-01-15');
  assert.ok(dateLiteral);
  assert.strictEqual(dateLiteral.type, 'date');
  assert.strictEqual(dateLiteral.confidence, 0.95);
});

test('ProtectedLiteralDetector registers and retrieves literals', () => {
  const detector = new ProtectedLiteralDetector();
  
  const literal: ProtectedLiteral = {
    text: 'Google',
    language: 'en',
    type: 'name',
    confidence: 0.9
  };

  detector.register('test-fp-5', literal);
  
  const record = createMockRecord('test-fp-5', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test' } }
  ]);

  const literals = detector.detect(record);
  const googleLiteral = literals.find(l => l.text === 'Google');
  assert.ok(googleLiteral);
});

test('ProtectedLiteralDetector getStats returns correct information', () => {
  const detector = new ProtectedLiteralDetector();
  
  const stats = detector.getStats();
  assert.ok(stats.ruleCount > 0);
  assert.strictEqual(stats.totalRegistered, 0);
});

test('ProtectedLiteralDetector clears registered literals', () => {
  const detector = new ProtectedLiteralDetector();
  
  detector.register('test-fp-6', {
    text: 'Test',
    language: 'en',
    type: 'name',
    confidence: 0.9
  });

  detector.clearRegistered();
  
  const stats = detector.getStats();
  assert.strictEqual(stats.totalRegistered, 0);
});

// ── Semantic Scorer Tests ──────────────────────────────────────────

test('SemanticScorer scores complete records highly', () => {
  const scorer = new SemanticScorer();
  
  const record = createMockRecord('test-fp-7', 'Test', 'en', [
    { predicate: 'statement', roles: { subject: 'test', object: 'value' } }
  ]);

  const score = scorer.score(record);
  
  assert.ok(score.overall >= 0);
  assert.ok(score.overall <= 1);
  assert.ok(score.components.completeness > 0);
  assert.strictEqual(score.metadata.clausesEvaluated, 1);
});

test('SemanticScorer scores empty records low', () => {
  const scorer = new SemanticScorer();
  
  const record = createMockRecord('test-fp-8', 'Test', 'en', []);

  const score = scorer.score(record);
  
  assert.strictEqual(score.components.completeness, 0);
  assert.strictEqual(score.overall, 0);
});

test('SemanticScorer scores protected literals', () => {
  const scorer = new SemanticScorer();
  
  const record = createMockRecord('test-fp-9', 'Apple is testing', 'en', [
    { predicate: 'statement', roles: { subject: 'Apple', object: 'testing' } }
  ]);

  const literals: ProtectedLiteral[] = [
    { text: 'Apple', language: 'en', type: 'name', confidence: 0.9 }
  ];

  const score = scorer.score(record, literals);
  
  assert.ok(score.components.protectedLiteralPreservation >= 0);
  assert.strictEqual(score.metadata.protectedLiteralsFound, 1);
});

test('SemanticScorer generates warnings for low scores', () => {
  const scorer = new SemanticScorer();
  
  const record = createMockRecord('test-fp-10', 'Test', 'en', []);

  const score = scorer.score(record);
  
  assert.ok(score.warnings.length > 0);
  assert.ok(score.warnings.some(w => w.includes('completeness')));
});

test('SemanticScorer respects scoring options', () => {
  const scorer = new SemanticScorer({
    minCompleteness: 0.9,
    minConsistency: 0.8,
    protectedLiteralWeight: 0.3
  });

  const options = scorer.getOptions();
  assert.strictEqual(options.minCompleteness, 0.9);
  assert.strictEqual(options.minConsistency, 0.8);
  assert.strictEqual(options.protectedLiteralWeight, 0.3);
});

test('SemanticScorer scores records with multiple clauses', () => {
  const scorer = new SemanticScorer();
  
  const record = createMockRecord('test-fp-11', 'Multiple clauses', 'en', [
    { predicate: 'statement', roles: { subject: 'A', object: 'B' } },
    { predicate: 'location', roles: { subject: 'C', location: 'D' } },
    { predicate: 'action', roles: { subject: 'E', verb: 'F' } }
  ]);

  const score = scorer.score(record);
  
  assert.strictEqual(score.metadata.clausesEvaluated, 3);
  assert.ok(score.overall > 0);
});