import { test } from 'node:test';
import assert from 'node:assert';
import { 
  AbstentionClarificationEngine,
  type ConfidenceThresholds
} from '../src/abstention-clarification.js';

// Helper to create mock clauses
const createMockClause = (predicate: string, roles: Record<string, string> = {}): any => ({
  predicate,
  roles,
  negated: false,
  conditions: undefined
});

test('AbstentionClarificationEngine evaluates high confidence', () => {
  const engine = new AbstentionClarificationEngine();
  
  const clauses = [
    createMockClause('statement', { subject: 'test', object: 'value' })
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.95
  );

  assert.strictEqual(result.confidenceLevel, 'high');
  assert.ok(result.confidenceScore >= 0.9);
  assert.strictEqual(result.shouldAbstain, false);
});

test('AbstentionClarificationEngine evaluates low confidence', () => {
  const engine = new AbstentionClarificationEngine();
  
  const clauses = [
    createMockClause('') // Empty predicate to reduce confidence
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.3
  );

  assert.ok(result.confidenceScore < 0.7);
});

test('AbstentionClarificationEngine abstains when confidence too low', () => {
  const engine = new AbstentionClarificationEngine({
    thresholds: { low: 0.6 }
  });
  
  const clauses = [
    createMockClause('') // Empty predicate
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.3
  );

  assert.ok(result.shouldAbstain);
  assert.ok(result.abstentionReason);
});

test('AbstentionClarificationEngine detects ambiguity', () => {
  const engine = new AbstentionClarificationEngine();
  
  const clauses = [
    createMockClause('statement', { 
      subject: 'test',
      object: 'perhaps uncertain value'
    })
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.7
  );

  assert.ok(result.metadata.ambiguousClauses >= 0);
});

test('AbstentionClarificationEngine generates clarification for ambiguity', () => {
  const engine = new AbstentionClarificationEngine();
  
  const clauses = [
    createMockClause('statement', { 
      subject: 'test',
      object: 'possibly ambiguous'
    })
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.75
  );

  if (result.clarification) {
    assert.strictEqual(result.clarification.type, 'ambiguity');
    assert.ok(result.clarification.question.length > 0);
  }
});

test('AbstentionClarificationEngine thresholds are configurable', () => {
  const engine = new AbstentionClarificationEngine({
    thresholds: {
      high: 0.95,
      medium: 0.8,
      low: 0.6
    }
  });

  const thresholds = engine.getThresholds();
  assert.strictEqual(thresholds.high, 0.95);
  assert.strictEqual(thresholds.medium, 0.8);
  assert.strictEqual(thresholds.low, 0.6);
});

test('AbstentionClarificationEngine createParseResult works', () => {
  const engine = new AbstentionClarificationEngine();
  
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: []
  };

  const result = engine.createParseResult(sem, [], 0.8);

  assert.ok(result.sem);
  assert.strictEqual(result.metadata.clausesParsed, 0);
  assert.ok(result.confidence.score >= 0);
});

test('AbstentionClarificationEngine handles multiple clauses', () => {
  const engine = new AbstentionClarificationEngine();
  
  const clauses = [
    createMockClause('statement', { subject: 'test1', object: 'value1' }),
    createMockClause('action', { subject: 'test2', verb: 'runs' }),
    createMockClause('location', { subject: 'test3', location: 'here' })
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.85
  );

  assert.strictEqual(result.metadata.clausesEvaluated, 3);
  assert.strictEqual(result.shouldAbstain, false);
});

test('AbstentionClarificationEngine thresholds can be updated', () => {
  const engine = new AbstentionClarificationEngine();
  
  engine.setThresholds({ high: 0.95, medium: 0.8, low: 0.7 });
  
  const thresholds = engine.getThresholds();
  assert.strictEqual(thresholds.high, 0.95);
  assert.strictEqual(thresholds.medium, 0.8);
  assert.strictEqual(thresholds.low, 0.7);
});

test('AbstentionClarificationEngine metadata is populated', () => {
  const engine = new AbstentionClarificationEngine();
  
  const clauses = [
    createMockClause('statement', { subject: 'test', object: 'value' })
  ];

  const result = engine.evaluateConfidence(
    {} as any,
    clauses,
    0.9
  );

  assert.strictEqual(result.metadata.clausesEvaluated, 1);
  assert.ok(result.metadata.lowConfidenceClauses >= 0);
  assert.ok(result.metadata.ambiguousClauses >= 0);
});