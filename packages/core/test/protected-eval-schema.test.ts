import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProtectedEvalSchema } from '../src/types-schema.js';

test('ProtectedEvalSchema has required schema constant', () => {
  const schema: ProtectedEvalSchema = {
    schema: 'openlunum-protected-eval/0.1',
    id: 'test-protected-eval',
    version: '1.0.0',
    datasetId: 'protected-dataset-v1',
    dataset: {
      path: '/path/to/dataset.jsonl',
      sha256: 'a'.repeat(64),
      license: 'CC-BY-SA-4.0',
      envVar: 'PROTECTED_DATASET_PATH'
    },
    instructions: 'Evaluate parse quality on protected examples.',
    coverage: {
      tasks: ['parse', 'realize'],
      languages: ['en', 'el'],
      categories: ['domain-specific']
    }
  };

  assert.strictEqual(schema.schema, 'openlunum-protected-eval/0.1');
  assert.ok(typeof schema.id === 'string' && schema.id.length > 0);
  assert.ok(typeof schema.version === 'string' && schema.version.length > 0);
  assert.ok(typeof schema.datasetId === 'string' && schema.datasetId.length > 0);
});

test('ProtectedEvalSchema dataset supports envVar resolution', () => {
  const schema: ProtectedEvalSchema = {
    schema: 'openlunum-protected-eval/0.1',
    id: 'test-env-var-resolve',
    version: '1.0.0',
    datasetId: 'env-var-dataset',
    dataset: {
      path: '$PROTECTED_DATASET',
      sha256: 'b'.repeat(64),
      license: 'MIT',
      envVar: 'PROTECTED_DATASET'
    },
    instructions: 'Test env var resolution.',
    coverage: {
      tasks: ['parse'],
      languages: ['en'],
      categories: ['general']
    }
  };

  assert.strictEqual(schema.dataset.envVar, 'PROTECTED_DATASET');
  assert.strictEqual(schema.dataset.path, '$PROTECTED_DATASET');
});

test('ProtectedEvalSchema coverage includes multiple tasks', () => {
  const schema: ProtectedEvalSchema = {
    schema: 'openlunum-protected-eval/0.1',
    id: 'test-multi-task',
    version: '1.0.0',
    datasetId: 'multi-task-dataset',
    dataset: {
      path: '/path/to/dataset.jsonl',
      sha256: 'c'.repeat(64),
      license: 'Apache-2.0'
    },
    instructions: 'Test multi-task coverage.',
    coverage: {
      tasks: ['parse', 'realize', 'render', 'context', 'retrieval', 'integration', 'conformance', 'infrastructure'],
      languages: ['en', 'el', 'es', 'id'],
      categories: ['general', 'domain-specific', 'legal', 'medical']
    }
  };

  assert.strictEqual(schema.coverage.tasks.length, 8);
  assert.ok(schema.coverage.tasks.includes('parse'));
  assert.ok((schema.coverage.tasks as string[]).includes('realize'));
  assert.strictEqual(schema.coverage.languages.length, 4);
  assert.strictEqual(schema.coverage.categories.length, 4);
});

test('ProtectedEvalSchema is assignable from literal object', () => {
  const literal: ProtectedEvalSchema = {
    schema: 'openlunum-protected-eval/0.1',
    id: 'literal-test',
    version: '0.1.0',
    datasetId: 'literal-dataset',
    dataset: {
      path: '/literal/path.jsonl',
      sha256: 'd'.repeat(64),
      license: 'BSD-3-Clause'
    },
    instructions: 'Literal assignment test.',
    coverage: {
      tasks: ['conformance'],
      languages: ['en'],
      categories: ['testing']
    }
  };

  assert.strictEqual(literal.schema, 'openlunum-protected-eval/0.1');
  assert.strictEqual(literal.id, 'literal-test');
  assert.deepStrictEqual(literal.coverage.tasks, ['conformance']);
});

test('ProtectedEvalSchema SHA-256 must be 64 hex characters', () => {
  const validSchema: ProtectedEvalSchema = {
    schema: 'openlunum-protected-eval/0.1',
    id: 'valid-sha',
    version: '1.0.0',
    datasetId: 'valid-sha-dataset',
    dataset: {
      path: '/path.jsonl',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      license: 'MIT'
    },
    instructions: 'Valid SHA-256 test.',
    coverage: {
      tasks: ['parse'],
      languages: ['en'],
      categories: []
    }
  };

  assert.strictEqual(validSchema.dataset.sha256.length, 64);

  // All valid hex chars
  const hexSchema: ProtectedEvalSchema = {
    schema: 'openlunum-protected-eval/0.1',
    id: 'hex-test',
    version: '1.0.0',
    datasetId: 'hex-dataset',
    dataset: {
      path: '/hex.jsonl',
      sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      license: 'MIT'
    },
    instructions: 'Hex test.',
    coverage: {
      tasks: ['parse'],
      languages: ['en'],
      categories: []
    }
  };

  assert.strictEqual(hexSchema.dataset.sha256, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
});
