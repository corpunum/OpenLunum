import test from 'node:test';
import assert from 'node:assert/strict';
import {
  McpErrorCode,
  InputValidator,
  createMcpError,
  mcpErrorToResponse,
  type ValidationIssue,
  type McpToolErrorResponse,
} from '../src/errors.js';
import { lunumTools } from '../src/index.js';
import { LunumContextManager } from '../src/context.js';
import type { McpToolResponse } from '../src/types.js';

// ── Error Contract Tests ───────────────────────────────────────────

test('error contract: createMcpError produces structured error', () => {
  const error = createMcpError(McpErrorCode.INVALID_INPUT, 'Test error', {
    field: 'text',
    details: { hint: 'Provide non-empty text' },
  });

  assert.strictEqual(error.code, McpErrorCode.INVALID_INPUT);
  assert.strictEqual(error.message, 'Test error');
  assert.strictEqual(error.field, 'text');
  assert.deepStrictEqual(error.details, { hint: 'Provide non-empty text' });
  assert.ok(Array.isArray(error.validationErrors ?? []));
});

test('error contract: mcpErrorToResponse formats error correctly', () => {
  const error = createMcpError(McpErrorCode.MISSING_REQUIRED_FIELD, 'Field required');
  const response = mcpErrorToResponse(error) as McpToolErrorResponse;

  assert.strictEqual(response.isError, true);
  assert.strictEqual(response.content.length, 1);
  assert.strictEqual(response.content[0]!.type, 'text');

  const parsed = JSON.parse(response.content[0]!.text);
  assert.strictEqual(parsed.success, false);
  assert.strictEqual(parsed.error.code, McpErrorCode.MISSING_REQUIRED_FIELD);
  assert.strictEqual(parsed.error.message, 'Field required');
});

test('error contract: all error codes are defined', () => {
  const expectedCodes = [
    'INVALID_INPUT',
    'MISSING_REQUIRED_FIELD',
    'TYPE_MISMATCH',
    'VALUE_OUT_OF_RANGE',
    'INVALID_FORMAT',
    'INTERNAL_ERROR',
    'VALIDATION_FAILED',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
  ];

  for (const code of expectedCodes) {
    assert.ok(code in McpErrorCode, `Error code ${code} must be defined`);
  }
});

// ── Input Validator Tests ──────────────────────────────────────────

test('input validator: required field missing fails validation', () => {
  const result = new InputValidator().required('name', undefined).getResult();

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0]?.field, 'name');
});

test('input validator: required field present passes validation', () => {
  const result = new InputValidator().required('name', 'test value').getResult();

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
});

test('input validator: required field empty string fails', () => {
  const result = new InputValidator().required('name', '  ').getResult();

  assert.strictEqual(result.ok, false);
});

test('input validator: type mismatch detected', () => {
  const result = new InputValidator().type('count', 'not a number', 'number').getResult();

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors[0]?.message.includes('number'));
});

test('input validator: type match passes', () => {
  const result = new InputValidator().type('count', 42, 'number').getResult();

  assert.strictEqual(result.ok, true);
});

test('input validator: string length constraints enforced', () => {
  const result = new InputValidator().stringLength('name', 'ab', { min: 3, max: 10 }).getResult();

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('below minimum')));
});

test('input validator: string within bounds passes', () => {
  const result = new InputValidator().stringLength('name', 'valid-name', { min: 3, max: 20 }).getResult();

  assert.strictEqual(result.ok, true);
});

test('input validator: number range enforced', () => {
  const result = new InputValidator().numberRange('count', 150, { min: 0, max: 100 }).getResult();

  assert.strictEqual(result.ok, false);
});

test('input validator: enum validation', () => {
  const result = new InputValidator().enum('status', 'invalid', ['active', 'inactive', 'pending']).getResult();

  assert.strictEqual(result.ok, false);
});

test('input validator: enum valid value passes', () => {
  const result = new InputValidator().enum('status', 'active', ['active', 'inactive', 'pending']).getResult();

  assert.strictEqual(result.ok, true);
});

test('input validator: reset clears state', () => {
  const validator = new InputValidator().required('name', undefined);

  assert.strictEqual(validator.getResult().ok, false);

  validator.reset();
  assert.strictEqual(validator.getResult().ok, true);
});

test('input validator: static validate method works', () => {
  const result = InputValidator.validate({ name: 'test', count: 42 }, { name: { required: true, type: 'string' }, count: { type: 'number' } });

  assert.strictEqual(result.ok, true);
});

test('input validator: static validate catches missing required', () => {
  const result = InputValidator.validate({}, { name: { required: true } });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors[0]?.field, 'name');
});

test('input validator: static validate catches type mismatch', () => {
  const result = InputValidator.validate({ count: 'not a number' }, { count: { type: 'number' } });

  assert.strictEqual(result.ok, false);
});

// ── Tool Handler Conformance Tests ─────────────────────────────────

function findTool(name: string) {
  const tool = lunumTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

function getText(result: McpToolResponse): string {
  return result.content[0]?.text ?? '';
}

test('derive tool: validates required text field', async () => {
  const result = await findTool('lunum_derive').handler({});
  assert.strictEqual(result.isError, true);
});

test('derive tool: accepts valid input', async () => {
  const result = await findTool('lunum_derive').handler({ text: 'Hello world' });
  const response = JSON.parse(getText(result));
  assert.strictEqual(response.success, true);
  assert.ok(response.sidecar);
});

test('fingerprint tool: accepts valid sem', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'state', roles: { theme: 'x' }, negated: false }],
  };
  const result = await findTool('lunum_fingerprint').handler({ sem });
  const response = JSON.parse(getText(result));
  assert.strictEqual(response.success, true);
  assert.ok(response.fingerprint.startsWith('lfp:'));
});

test('validate tool: validates required sem field', async () => {
  const result = await findTool('lunum_validate').handler({});
  assert.strictEqual(result.isError, true);
});

test('validate tool: accepts valid input', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'state', roles: { theme: 'x' }, negated: false }],
  };
  const result = await findTool('lunum_validate').handler({ sem });
  const response = JSON.parse(getText(result));
  assert.strictEqual(response.success, true);
  assert.strictEqual(response.valid, true);
});

// ── Context Manager Tests ──────────────────────────────────────────

test('context manager: respects maxItems limit', () => {
  const ctx = new LunumContextManager({ maxItems: 2 });

  ctx.add({ fingerprint: 'a' });
  ctx.add({ fingerprint: 'b' });
  ctx.add({ fingerprint: 'c' });

  assert.strictEqual(ctx.getAll().length, 2, 'should evict oldest when over limit');
});

// ── Validation Error Structure Tests ───────────────────────────────

test('validation error: includes all required fields', () => {
  const issue: ValidationIssue = {
    field: 'test',
    message: 'Test error',
    received: 'string',
    expected: 'number',
  };

  assert.ok(issue.field);
  assert.ok(issue.message);
  assert.ok(issue.received !== undefined);
  assert.ok(issue.expected);
});

test('validation error: multiple issues tracked', () => {
  const result = InputValidator.validate({ name: 123 }, { name: { required: true, type: 'string' } });

  assert.ok(result.errors.some((e) => e.field === 'name'));
});
