import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainstSchema } from '../src/integration-runner.js';

test('validateAgainstSchema: required fields must be present', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      message: { type: 'string' }
    },
    required: ['status', 'message']
  };

  assert.strictEqual(validateAgainstSchema({ status: 'ok', message: 'hello' }, schema), true);
  assert.strictEqual(validateAgainstSchema({ status: 'ok' }, schema), false);
  assert.strictEqual(validateAgainstSchema({ message: 'hello' }, schema), false);
  assert.strictEqual(validateAgainstSchema({}, schema), false);
});

test('validateAgainstSchema: rejects wrong types', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      count: { type: 'number' },
      enabled: { type: 'boolean' }
    },
    required: ['status']
  };

  assert.strictEqual(validateAgainstSchema({ status: 'ok' }, schema), true);
  assert.strictEqual(validateAgainstSchema({ status: 123 }, schema), false);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', count: 'not-a-number' }, schema), false);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', enabled: 'yes' }, schema), false);
});

test('validateAgainstSchema: validates enum values', () => {
  const schema = {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['exact', 'near-semantic'] },
      status: { type: 'string' }
    },
    required: ['mode']
  };

  assert.strictEqual(validateAgainstSchema({ mode: 'exact' }, schema), true);
  assert.strictEqual(validateAgainstSchema({ mode: 'near-semantic' }, schema), true);
  assert.strictEqual(validateAgainstSchema({ mode: 'wrong' }, schema), false);
  assert.strictEqual(validateAgainstSchema({ mode: 'EXACT' }, schema), false);
});

test('validateAgainstSchema: rejects extra fields when additionalProperties is false', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string' }
    },
    required: ['status'],
    additionalProperties: false
  };

  assert.strictEqual(validateAgainstSchema({ status: 'ok' }, schema), true);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', extra: 'field' }, schema), false);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', extra: 'field', another: 123 }, schema), false);
});

test('validateAgainstSchema: allows extra fields when additionalProperties is not false', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string' }
    },
    required: ['status']
  };

  assert.strictEqual(validateAgainstSchema({ status: 'ok' }, schema), true);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', extra: 'field' }, schema), true);
});

test('validateAgainstSchema: validates nested object structures', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      data: {
        type: 'object',
        properties: {
          processed: { type: 'boolean' },
          input: { type: ['string', 'null'] }
        },
        required: ['processed']
      }
    },
    required: ['status']
  };

  assert.strictEqual(validateAgainstSchema({ status: 'ok', data: { processed: true } }, schema), true);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', data: {} }, schema), false);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', data: { processed: 'yes' } }, schema), false);
  assert.strictEqual(validateAgainstSchema({ status: 'ok', data: { processed: true, extra: 'allowed' } }, schema), true);
});

test('validateAgainstSchema: rejects nested data shape mismatch', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      metadata: {
        type: 'object',
        properties: {
          version: { type: 'string' },
          tags: { type: 'array' }
        },
        required: ['version', 'tags']
      }
    },
    required: ['status', 'metadata']
  };

  assert.strictEqual(
    validateAgainstSchema({ status: 'ok', metadata: { version: '1.0', tags: ['test'] } }, schema),
    true
  );
  // metadata.tags is missing
  assert.strictEqual(
    validateAgainstSchema({ status: 'ok', metadata: { version: '1.0' } }, schema),
    false
  );
  // metadata.version has wrong type
  assert.strictEqual(
    validateAgainstSchema({ status: 'ok', metadata: { version: 1, tags: [] } }, schema),
    false
  );
  // metadata is not an object
  assert.strictEqual(
    validateAgainstSchema({ status: 'ok', metadata: 'not-an-object' }, schema),
    false
  );
});

test('validateAgainstSchema: handles empty schema', () => {
  assert.strictEqual(validateAgainstSchema({ any: 'thing' }, {}), true);
  assert.strictEqual(validateAgainstSchema({}, { type: 'object' }), true);
});

test('validateAgainstSchema: validates array items', () => {
  const schema = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' } }
    },
    required: ['tags']
  };

  assert.strictEqual(validateAgainstSchema({ tags: ['a', 'b', 'c'] }, schema), true);
  assert.strictEqual(validateAgainstSchema({ tags: [1, 2, 3] }, schema), false);
  assert.strictEqual(validateAgainstSchema({ tags: ['a', 2, 'c'] }, schema), false);
});

test('validateAgainstSchema: registry schema passes for valid adapter output', () => {
  const registrySchema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      message: { type: 'string' },
      data: { type: 'object' }
    },
    required: ['status', 'message']
  };

  // Normal adapter output
  assert.strictEqual(
    validateAgainstSchema(
      { status: 'success', message: 'Integration completed', data: { processed: true, input: null } },
      registrySchema
    ),
    true
  );

  // Missing required field
  assert.strictEqual(
    validateAgainstSchema({ status: 'success' }, registrySchema),
    false
  );

  // Wrong type for status
  assert.strictEqual(
    validateAgainstSchema({ status: 1, message: 'hello' }, registrySchema),
    false
  );
});
