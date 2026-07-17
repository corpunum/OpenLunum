import { test } from 'node:test';
import assert from 'node:assert';
import { 
  ShadowModeAdapter,
  type ShadowModeConfig
} from '../src/shadow-mode.js';

// Helper to create mock records
const createMockRecord = (fingerprint: string, text: string) => ({
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

test('ShadowModeAdapter disabled by default', () => {
  const adapter = new ShadowModeAdapter();
  const config = adapter.getConfig();
  
  assert.strictEqual(config.enabled, false);
});

test('ShadowModeAdapter processes record when enabled', () => {
  const adapter = new ShadowModeAdapter({ enabled: true });
  
  const record = createMockRecord('test-fp-1', 'Test');
  const shadowSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };

  const result = adapter.process(record, shadowSem);
  
  assert.ok(result.shadow);
  assert.ok(result.shadow!.fingerprint.startsWith('lfp:shadow:'));
});

test('ShadowModeAdapter returns null shadow when disabled', () => {
  const adapter = new ShadowModeAdapter({ enabled: false });
  
  const record = createMockRecord('test-fp-2', 'Test');
  const shadowSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };

  const result = adapter.process(record, shadowSem);
  
  assert.strictEqual(result.shadow, null);
});

test('ShadowModeAdapter compares records when enabled', () => {
  const adapter = new ShadowModeAdapter({ 
    enabled: true,
    compareWithProduction: true
  });
  
  const record = createMockRecord('test-fp-3', 'Test');
  const shadowSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };

  const result = adapter.process(record, shadowSem);
  
  assert.ok(result.comparison);
  assert.ok(result.comparison!.fingerprintsMatch === false);
});

test('ShadowModeAdapter stores shadow records', () => {
  const adapter = new ShadowModeAdapter({ enabled: true });
  
  const record = createMockRecord('test-fp-4', 'Test');
  const shadowSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };

  adapter.process(record, shadowSem);
  adapter.process(record, shadowSem);
  
  const records = adapter.getShadowRecords();
  assert.strictEqual(records.length, 2);
});

test('ShadowModeAdapter enforces max records', () => {
  const adapter = new ShadowModeAdapter({ 
    enabled: true,
    maxRecords: 2
  });
  
  const record = createMockRecord('test-fp-5', 'Test');
  const shadowSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };

  adapter.process(record, shadowSem);
  adapter.process(record, shadowSem);
  adapter.process(record, shadowSem);
  
  const records = adapter.getShadowRecords();
  assert.strictEqual(records.length, 2);
});

test('ShadowModeAdapter gets stats', () => {
  const adapter = new ShadowModeAdapter({ enabled: true, maxRecords: 100 });
  
  const stats = adapter.getStats();
  
  assert.strictEqual(stats.enabled, true);
  assert.strictEqual(stats.maxRecords, 100);
  assert.strictEqual(stats.totalRecords, 0);
});

test('ShadowModeAdapter clears records', () => {
  const adapter = new ShadowModeAdapter({ enabled: true });
  
  const record = createMockRecord('test-fp-6', 'Test');
  const shadowSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };

  adapter.process(record, shadowSem);
  adapter.clear();
  
  const records = adapter.getShadowRecords();
  assert.strictEqual(records.length, 0);
});

test('ShadowModeAdapter config can be updated', () => {
  const adapter = new ShadowModeAdapter();
  
  adapter.setConfig({ enabled: true, maxRecords: 500 });
  
  const config = adapter.getConfig();
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.maxRecords, 500);
});