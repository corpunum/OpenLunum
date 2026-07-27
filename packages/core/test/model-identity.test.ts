import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyModelIdentity,
  formatIdentityLabel,
  identitiesMatch,
  hashBuffer,
  type ModelIdentity,
} from '../src/model-identity.js';

test('verifyModelIdentity: weight-hash method with valid SHA-256', () => {
  const identity: ModelIdentity = {
    family: 'qwen',
    name: 'Qwen3-30B-A3B',
    weightHash: { algorithm: 'sha256', hash: 'a'.repeat(64), scope: 'full-file' },
  };
  const result = verifyModelIdentity(identity);
  assert.equal(result.identified, true);
  assert.equal(result.method, 'weight-hash');
  assert.equal(result.warnings.length, 0);
});

test('verifyModelIdentity: rejects invalid weight hash', () => {
  const identity: ModelIdentity = {
    family: 'qwen',
    name: 'Qwen3-30B-A3B',
    weightHash: { algorithm: 'sha256', hash: 'not-a-hash', scope: 'full-file' },
  };
  const result = verifyModelIdentity(identity);
  assert.equal(result.identified, false);
  assert.equal(result.method, 'weight-hash');
  assert.ok(result.warnings.some(w => w.includes('not a valid')));
});

test('verifyModelIdentity: gguf-metadata method', () => {
  const identity: ModelIdentity = {
    family: 'llama',
    name: 'Llama-3.1-8B',
    ggufMetadata: {
      generalName: 'Llama-3.1-8B',
      generalArchitecture: 'llama',
      generalFileType: 7,
      tokenizerModel: 'gpt2',
      contextLength: 131072,
    },
  };
  const result = verifyModelIdentity(identity);
  assert.equal(result.identified, true);
  assert.equal(result.method, 'gguf-metadata');
  assert.equal(result.warnings.length, 0);
});

test('verifyModelIdentity: gguf-metadata warns when file_type missing', () => {
  const identity: ModelIdentity = {
    family: 'llama',
    name: 'Llama-3.1-8B',
    ggufMetadata: {
      generalName: 'Llama-3.1-8B',
      generalArchitecture: 'llama',
    },
  };
  const result = verifyModelIdentity(identity);
  assert.equal(result.identified, true);
  assert.equal(result.method, 'gguf-metadata');
  assert.ok(result.warnings.some(w => w.includes('file_type')));
});

test('verifyModelIdentity: name-only fallback with warning', () => {
  const identity: ModelIdentity = {
    family: 'gemma',
    name: 'SuperGemma-4-E4B',
  };
  const result = verifyModelIdentity(identity);
  assert.equal(result.identified, true);
  assert.equal(result.method, 'name-only');
  assert.ok(result.warnings.some(w => w.includes('name/family only')));
});

test('verifyModelIdentity: unknown when insufficient info', () => {
  const identity: ModelIdentity = { family: '', name: '' };
  const result = verifyModelIdentity(identity);
  assert.equal(result.identified, false);
  assert.equal(result.method, 'unknown');
});

test('formatIdentityLabel: includes all parts', () => {
  assert.equal(
    formatIdentityLabel({ family: 'qwen', name: 'Qwen3-30B-A3B', version: '1.0', quantization: 'Q4_K_M' }),
    'qwen/Qwen3-30B-A3B/1.0/Q4_K_M'
  );
});

test('formatIdentityLabel: omits missing parts', () => {
  assert.equal(
    formatIdentityLabel({ family: 'llama', name: 'Llama-3.1-8B' }),
    'llama/Llama-3.1-8B'
  );
});

test('identitiesMatch: matches by weight hash when both have it', () => {
  const a: ModelIdentity = {
    family: 'qwen', name: 'A',
    weightHash: { algorithm: 'sha256', hash: 'a'.repeat(64), scope: 'full-file' },
  };
  const b: ModelIdentity = {
    family: 'llama', name: 'B',
    weightHash: { algorithm: 'sha256', hash: 'a'.repeat(64), scope: 'full-file' },
  };
  assert.equal(identitiesMatch(a, b), true);
});

test('identitiesMatch: rejects different weight hashes', () => {
  const a: ModelIdentity = {
    family: 'qwen', name: 'A',
    weightHash: { algorithm: 'sha256', hash: 'a'.repeat(64), scope: 'full-file' },
  };
  const b: ModelIdentity = {
    family: 'qwen', name: 'A',
    weightHash: { algorithm: 'sha256', hash: 'b'.repeat(64), scope: 'full-file' },
  };
  assert.equal(identitiesMatch(a, b), false);
});

test('identitiesMatch: matches by GGUF metadata when no weight hash', () => {
  const meta = { generalName: 'Test', generalArchitecture: 'llama', generalFileType: 7 };
  const a: ModelIdentity = { family: 'llama', name: 'A', ggufMetadata: meta };
  const b: ModelIdentity = { family: 'llama', name: 'B', ggufMetadata: meta };
  assert.equal(identitiesMatch(a, b), true);
});

test('identitiesMatch: falls back to name/family match', () => {
  const a: ModelIdentity = { family: 'qwen', name: 'Test', version: '1.0', quantization: 'Q4' };
  const b: ModelIdentity = { family: 'qwen', name: 'Test', version: '1.0', quantization: 'Q4' };
  assert.equal(identitiesMatch(a, b), true);
});

test('identitiesMatch: name-only mismatch', () => {
  const a: ModelIdentity = { family: 'qwen', name: 'Test', version: '1.0' };
  const b: ModelIdentity = { family: 'qwen', name: 'Test', version: '2.0' };
  assert.equal(identitiesMatch(a, b), false);
});

test('hashBuffer: produces consistent SHA-256', () => {
  const hash = hashBuffer(Buffer.from('test'));
  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash, hashBuffer(Buffer.from('test')));
});
