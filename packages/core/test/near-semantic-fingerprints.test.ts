import { test } from 'node:test';
import assert from 'node:assert';
import { 
  NearSemanticFingerprintGenerator,
  type NearSemanticFingerprint
} from '../src/near-semantic-fingerprints.js';

// Helper to create mock semantic representations
const createMockSem = (overrides = {}) => ({
  schema: 'lunum-sem/0.1-draft',
  world: 'test',
  kind: 'test',
  clauses: [{ 
    predicate: 'test', 
    roles: { subject: 'test' },
    ...overrides
  }],
  references: [],
  provenance: {},
  annotations: {}
});

test('NearSemanticFingerprintGenerator generates fingerprints', () => {
  const generator = new NearSemanticFingerprintGenerator();
  
  const sem = createMockSem();
  const fingerprint = generator.generate(sem);
  
  assert.ok(fingerprint.startsWith('nfp:'));
});

test('NearSemanticFingerprintGenerator generates from record', () => {
  const generator = new NearSemanticFingerprintGenerator();
  
  const record = {
    sem: createMockSem(),
    fingerprint: 'test-fp'
  } as any;
  
  const fingerprint = generator.generateFromRecord(record);
  
  assert.ok(fingerprint.startsWith('nfp:'));
});

test('NearSemanticFingerprintGenerator compares identical fingerprints', () => {
  const generator = new NearSemanticFingerprintGenerator();
  
  const fp1 = 'nfp:12345678';
  const fp2 = 'nfp:12345678';
  
  const result = generator.compare(fp1, fp2);
  
  assert.strictEqual(result.similarity, 1.0);
  assert.strictEqual(result.similar, true);
});

test('NearSemanticFingerprintGenerator compares different fingerprints', () => {
  const generator = new NearSemanticFingerprintGenerator();
  
  const fp1 = 'nfp:12345678';
  const fp2 = 'nfp:87654321';
  
  const result = generator.compare(fp1, fp2);
  
  assert.ok(result.similarity >= 0 && result.similarity <= 1);
});

test('NearSemanticFingerprintGenerator compares records', () => {
  const generator = new NearSemanticFingerprintGenerator();
  
  const record1 = { sem: createMockSem() } as any;
  const record2 = { sem: createMockSem() } as any;
  
  const result = generator.compareRecords(record1, record2);
  
  assert.ok(result.similarity >= 0 && result.similarity <= 1);
});

test('NearSemanticFingerprintGenerator threshold works', () => {
  const generator = new NearSemanticFingerprintGenerator(0.9);
  
  const threshold = generator.getThreshold();
  assert.strictEqual(threshold, 0.9);
  
  generator.setThreshold(0.95);
  assert.strictEqual(generator.getThreshold(), 0.95);
});