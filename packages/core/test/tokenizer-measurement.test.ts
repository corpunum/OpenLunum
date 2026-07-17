import { test } from 'node:test';
import assert from 'node:assert';
import { 
  TokenizerMeasurementFramework,
  type TokenizerConfig
} from '../src/tokenizer-measurement.js';

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

test('TokenizerMeasurementFramework measures tokens', () => {
  const framework = new TokenizerMeasurementFramework({ name: 'test' });
  
  const record = createMockRecord('Hello world', 'test-fp');
  const measurement = framework.measure(record);
  
  assert.ok(measurement.averageTokens > 0);
  assert.ok(measurement.results.length > 0);
});

test('TokenizerMeasurementFramework measures with exact tokenizer', () => {
  const framework = new TokenizerMeasurementFramework({ name: 'exact', exact: true });
  
  const record = createMockRecord('Hello world', 'test-fp');
  const tokenizer = (text: string) => ({
    tokens: 3,
    tokenList: ['Hello', 'world', '!']
  });
  
  const measurement = framework.measure(record, tokenizer);
  
  assert.strictEqual(measurement.averageTokens, 3);
  assert.ok(measurement.results[0].tokenList);
  assert.strictEqual(measurement.results[0].tokenList!.length, 3);
});

test('TokenizerMeasurementFramework measures batch', () => {
  const framework = new TokenizerMeasurementFramework({ name: 'batch' });
  
  const records = [
    createMockRecord('Hello', 'fp-1'),
    createMockRecord('World', 'fp-2')
  ];
  
  const measurements = framework.measureBatch(records);
  
  assert.strictEqual(measurements.length, 2);
});

test('TokenizerMeasurementFramework gets stats', () => {
  const framework = new TokenizerMeasurementFramework({ name: 'stats' });
  
  const record = createMockRecord('Hello world', 'test-fp');
  framework.measure(record);
  framework.measure(record);
  
  const stats = framework.getStats();
  
  assert.strictEqual(stats.totalMeasurements, 2);
  assert.ok(stats.averageTokens > 0);
  assert.ok(stats.minTokens >= 0);
  assert.ok(stats.maxTokens >= 0);
});

test('TokenizerMeasurementFramework clears measurements', () => {
  const framework = new TokenizerMeasurementFramework({ name: 'clear' });
  
  const record = createMockRecord('Hello world', 'test-fp');
  framework.measure(record);
  framework.clear();
  
  const measurements = framework.getMeasurements();
  assert.strictEqual(measurements.length, 0);
});

test('TokenizerMeasurementFramework config can be updated', () => {
  const framework = new TokenizerMeasurementFramework();
  
  framework.setConfig({ name: 'updated', maxTokens: 2048 });
  
  const config = framework.getConfig();
  assert.strictEqual(config.name, 'updated');
  assert.strictEqual(config.maxTokens, 2048);
});