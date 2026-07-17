import { test } from 'node:test';
import assert from 'node:assert';
import { PromptQualityGates } from '../src/prompt-gates.js';

// Helper to create mock records
const createMockRecord = (text: string, fingerprint: string) => ({
  recordVersion: 'lunum-record/0.1-draft',
  source: { text, language: 'en', role: null, ref: null },
  sem: { 
    schema: 'lunum-sem/0.1-draft', 
    world: 'test', 
    kind: 'test', 
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }] 
  },
  fingerprint,
  renderings: {},
  policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
  meta: {}
});

test('PromptQualityGates validates prompt', () => {
  const gates = new PromptQualityGates();
  
  const record = createMockRecord('Hello world', 'test-fp');
  const result = gates.validate(record);
  
  assert.ok(result.passed);
  assert.ok(result.tokens > 0);
});

test('PromptQualityGates rejects prompt exceeding token limit', () => {
  const gates = new PromptQualityGates({ maxTokens: 5 });
  
  const record = createMockRecord('Hello world this is a long text', 'test-fp');
  const result = gates.validate(record);
  
  assert.strictEqual(result.passed, false);
  assert.ok(result.errors);
});

test('PromptQualityGates warns when approaching token limit', () => {
  const gates = new PromptQualityGates({ maxTokens: 100 });
  
  const record = createMockRecord('Hello world', 'test-fp');
  const result = gates.validate(record);
  
  // Should pass but may have warnings
  if (result.tokens > 80) {
    assert.ok(result.warnings);
  }
});

test('PromptQualityGates rejects prompt with low semantic preservation', () => {
  const gates = new PromptQualityGates({ minSemanticPreservation: 0.9 });
  
  const record = createMockRecord('Hello world', 'test-fp');
  record.source.text = ''; // Remove text to lower semantic score
  
  const result = gates.validate(record);
  
  // Should fail due to low semantic preservation
  assert.strictEqual(result.passed, false);
  assert.ok(result.errors);
});

test('PromptQualityGates validates batch', () => {
  const gates = new PromptQualityGates();
  
  const records = [
    createMockRecord('Hello', 'fp-1'),
    createMockRecord('World', 'fp-2')
  ];
  
  const results = gates.validateBatch(records);
  
  assert.strictEqual(results.length, 2);
});

test('PromptQualityGates config can be updated', () => {
  const gates = new PromptQualityGates();
  
  gates.setConfig({ maxTokens: 2048, minSemanticPreservation: 0.9 });
  
  const config = gates.getConfig();
  assert.strictEqual(config.maxTokens, 2048);
  assert.strictEqual(config.minSemanticPreservation, 0.9);
});