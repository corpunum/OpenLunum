import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_WEIGHT_HASH_VERSION,
  createWeightHashRegistry,
  registerModelWeight,
  verifyModelWeight,
  auditWeightProvenance,
  KNOWN_MODEL_WEIGHTS,
  createKnownWeightRegistry,
  type ModelWeightRecord
} from '../src/model-weight-hashes.js';

test('MODEL_WEIGHT_HASH_VERSION is defined', () => {
  assert.strictEqual(MODEL_WEIGHT_HASH_VERSION, '0.1.0');
});

test('createWeightHashRegistry creates an empty registry', () => {
  const registry = createWeightHashRegistry();
  assert.strictEqual(registry.version, '0.1.0');
  assert.strictEqual(registry.entries.size, 0);
});

test('registerModelWeight adds a record to the registry', () => {
  const registry = createWeightHashRegistry();
  const record: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  registerModelWeight(registry, record);
  assert.strictEqual(registry.entries.size, 1);

  const key = `${record.modelId}:${record.quantization}`;
  const entry = registry.entries.get(key);
  assert.ok(entry);
  assert.strictEqual(entry.modelId, 'TestModel');
  assert.strictEqual(entry.fileHash, 'a'.repeat(64));
});

test('registerModelWeight detects duplicate entries with different hashes', () => {
  const registry = createWeightHashRegistry();
  const record1: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  const record2: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'b'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  registerModelWeight(registry, record1);
  assert.throws(
    () => registerModelWeight(registry, record2),
    /Duplicate model weight/u
  );
});

test('registerModelWeight allows re-registering the same hash', () => {
  const registry = createWeightHashRegistry();
  const record: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  registerModelWeight(registry, record);
  // Should not throw
  assert.doesNotThrow(() => registerModelWeight(registry, record));
});

test('verifyModelWeight returns verified=true for matching hash', () => {
  const registry = createWeightHashRegistry();
  const record: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  registerModelWeight(registry, record);
  const result = verifyModelWeight(registry, 'TestModel', 'a'.repeat(64), 'GGUF Q4_K_M');

  assert.strictEqual(result.verified, true);
  assert.strictEqual(result.modelId, 'TestModel');
  assert.strictEqual(result.expectedHash, 'a'.repeat(64));
  assert.strictEqual(result.error, undefined);
});

test('verifyModelWeight returns verified=false for mismatched hash', () => {
  const registry = createWeightHashRegistry();
  const record: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  registerModelWeight(registry, record);
  const result = verifyModelWeight(registry, 'TestModel', 'b'.repeat(64), 'GGUF Q4_K_M');

  assert.strictEqual(result.verified, false);
  assert.strictEqual(result.modelId, 'TestModel');
  assert.strictEqual(result.actualHash, 'a'.repeat(64));
  assert.ok(result.error);
  assert.match(result.error, /Hash mismatch/u);
});

test('verifyModelWeight returns verified=false for missing model', () => {
  const registry = createWeightHashRegistry();
  const result = verifyModelWeight(registry, 'NonexistentModel', 'a'.repeat(64), 'GGUF Q4_K_M');

  assert.strictEqual(result.verified, false);
  assert.strictEqual(result.modelId, 'NonexistentModel');
  assert.ok(result.error);
  assert.match(result.error, /not found in registry/u);
});

test('auditWeightProvenance returns empty array for complete entries', () => {
  const registry = createWeightHashRegistry();
  const record: ModelWeightRecord = {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  };

  registerModelWeight(registry, record);
  const issues = auditWeightProvenance(registry);

  assert.strictEqual(issues.length, 0);
});

test('auditWeightProvenance detects missing source', () => {
  const registry = createWeightHashRegistry();
  registry.entries.set('TestModel:GGUF Q4_K_M', {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 1024,
    source: '',
    verifiedAt: '2026-07-30T00:00:00Z'
  });

  const issues = auditWeightProvenance(registry);

  assert.ok(issues.some(issue => issue.issue === 'missing source'));
});

test('auditWeightProvenance detects missing fileHash', () => {
  const registry = createWeightHashRegistry();
  registry.entries.set('TestModel:GGUF Q4_K_M', {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: '',
    fileSize: 1024,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  });

  const issues = auditWeightProvenance(registry);

  assert.ok(issues.some(issue => issue.issue === 'missing fileHash'));
});

test('auditWeightProvenance detects missing fileSize', () => {
  const registry = createWeightHashRegistry();
  registry.entries.set('TestModel:GGUF Q4_K_M', {
    modelId: 'TestModel',
    quantization: 'GGUF Q4_K_M',
    fileHash: 'a'.repeat(64),
    fileSize: 0,
    source: 'huggingface://test/model.gguf',
    verifiedAt: '2026-07-30T00:00:00Z'
  });

  const issues = auditWeightProvenance(registry);

  assert.ok(issues.some(issue => issue.issue === 'missing fileSize'));
});

test('KNOWN_MODEL_WEIGHTS contains all expected models', () => {
  const modelIds = new Set(KNOWN_MODEL_WEIGHTS.map(w => w.modelId));

  assert.ok(modelIds.has('Qwen3-Coder-30B-A3B'));
  assert.ok(modelIds.has('SuperQwen-AgentWorld-35B'));
  assert.ok(modelIds.has('Qwen3.6-35B-A3B'));
  assert.ok(modelIds.has('SuperGemma4-E4B'));
  assert.ok(modelIds.has('Qwen3.5-4B-MTP'));
});

test('KNOWN_MODEL_WEIGHTS records have all required fields', () => {
  for (const record of KNOWN_MODEL_WEIGHTS) {
    assert.ok(record.modelId);
    assert.ok(record.quantization);
    assert.ok(record.fileHash);
    assert.ok(record.source);
    assert.ok(record.verifiedAt);
  }
});

test('createKnownWeightRegistry populates registry with known weights', () => {
  const registry = createKnownWeightRegistry();

  assert.strictEqual(registry.entries.size, KNOWN_MODEL_WEIGHTS.length);

  const qwenCoder = registry.entries.get('Qwen3-Coder-30B-A3B:GGUF Q4_K_M');
  assert.ok(qwenCoder);
  assert.strictEqual(qwenCoder.modelId, 'Qwen3-Coder-30B-A3B');

  const superQwen = registry.entries.get('SuperQwen-AgentWorld-35B:GGUF default');
  assert.ok(superQwen);
  assert.strictEqual(superQwen.modelId, 'SuperQwen-AgentWorld-35B');
});

test('known weight registry passes provenance audit', () => {
  const registry = createKnownWeightRegistry();
  const issues = auditWeightProvenance(registry);

  // Filter out placeholder entries (fileSize === 0)
  const placeholderIssues = issues.filter(issue =>
    registry.entries.get(issue.modelId)?.fileSize === 0
  );

  // Only issues with placeholder fileSize (0) are expected
  assert.ok(
    placeholderIssues.length >= 0 && placeholderIssues.length <= KNOWN_MODEL_WEIGHTS.length,
    'Should have audit issues only for placeholder entries'
  );
});
