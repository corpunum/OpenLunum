import { test } from 'node:test';
import assert from 'node:assert';
import { ProfileGenerator } from '../src/profiles.js';

// Helper to create mock records
const createMockRecord = (text: string, fingerprint: string) => ({
  recordVersion: 'lunum-record/0.1-draft',
  source: { text, language: 'en', role: null, ref: null },
  sem: { 
    schema: 'lunum-sem/0.1-draft', 
    world: 'test', 
    kind: 'test', 
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }],
    annotations: { key: 'value' },
    provenance: { source: 'test' }
  },
  fingerprint,
  renderings: { en: { code: 'test', tokens: 10 } },
  policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
  meta: {}
});

test('ProfileGenerator profiles safe', () => {
  const generator = new ProfileGenerator();
  
  const record = createMockRecord('Hello world', 'test-fp');
  const result = generator.profileSafe(record);
  
  assert.strictEqual(result.type, 'safe');
  assert.ok(result.originalTokens > 0);
  assert.ok(result.profiledTokens >= 0);
  assert.ok(result.preservation >= 0 && result.preservation <= 1);
});

test('ProfileGenerator profiles short', () => {
  const generator = new ProfileGenerator();
  
  const record = createMockRecord('Hello world', 'test-fp');
  const result = generator.profileShort(record);
  
  assert.strictEqual(result.type, 'short');
  assert.ok(result.reduction >= 0);
});

test('ProfileGenerator profiles tight', () => {
  const generator = new ProfileGenerator();
  
  const record = createMockRecord('Hello world', 'test-fp');
  const result = generator.profileTight(record);
  
  assert.strictEqual(result.type, 'tight');
  assert.ok(result.reduction >= 0);
});

test('ProfileGenerator generates warnings', () => {
  const generator = new ProfileGenerator();
  
  const record = createMockRecord('Hello world', 'test-fp');
  const result = generator.profileTight(record);
  
  assert.ok(result.warnings);
  assert.ok(result.warnings!.length > 0);
});

test('ProfileGenerator gets config', () => {
  const generator = new ProfileGenerator();
  
  const config = generator.getConfig('safe');
  
  assert.strictEqual(config.type, 'safe');
  assert.strictEqual(config.preserveAnnotations, true);
});

test('ProfileGenerator sets config', () => {
  const generator = new ProfileGenerator();
  
  generator.setConfig('safe', { preserveAnnotations: false });
  
  const config = generator.getConfig('safe');
  assert.strictEqual(config.preserveAnnotations, false);
});