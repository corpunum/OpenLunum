/**
 * MCP server conformance test suite
 *
 * Tests error contracts, input validation, and handler behavior
 * for all five Lunum MCP tools.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  McpErrorCode,
  InputValidator,
  createMcpError,
  mcpErrorToResponse,
  type ValidationIssue,
  type McpToolErrorResponse
} from '../src/errors.js';
import { createLunumMcpServer, lunumTools } from '../src/index.js';
import type { McpToolResponse } from '../src/types.js';

// ── Error Contract Tests ───────────────────────────────────────────

test('error contract: createMcpError produces structured error', () => {
  const error = createMcpError(McpErrorCode.INVALID_INPUT, 'Test error', {
    field: 'text',
    details: { hint: 'Provide non-empty text' }
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
    'RATE_LIMITED'
  ];

  for (const code of expectedCodes) {
    assert.ok(code in McpErrorCode, `Error code ${code} must be defined`);
  }
});

// ── Input Validator Tests ──────────────────────────────────────────

test('input validator: required field missing fails validation', () => {
  const result = new InputValidator()
    .required('name', undefined)
    .getResult();

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0]?.field, 'name');
});

test('input validator: required field present passes validation', () => {
  const result = new InputValidator()
    .required('name', 'test value')
    .getResult();

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
});

test('input validator: required field empty string fails', () => {
  const result = new InputValidator()
    .required('name', '  ')
    .getResult();

  assert.strictEqual(result.ok, false);
});

test('input validator: type mismatch detected', () => {
  const result = new InputValidator()
    .type('count', 'not a number', 'number')
    .getResult();

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors[0]?.message.includes('number'));
});

test('input validator: type match passes', () => {
  const result = new InputValidator()
    .type('count', 42, 'number')
    .getResult();

  assert.strictEqual(result.ok, true);
});

test('input validator: string length constraints enforced', () => {
  const result = new InputValidator()
    .stringLength('name', 'ab', { min: 3, max: 10 })
    .getResult();

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.message.includes('below minimum')));
});

test('input validator: string within bounds passes', () => {
  const result = new InputValidator()
    .stringLength('name', 'valid-name', { min: 3, max: 20 })
    .getResult();

  assert.strictEqual(result.ok, true);
});

test('input validator: number range enforced', () => {
  const result = new InputValidator()
    .numberRange('count', 150, { min: 0, max: 100 })
    .getResult();

  assert.strictEqual(result.ok, false);
});

test('input validator: enum validation', () => {
  const result = new InputValidator()
    .enum('status', 'invalid', ['active', 'inactive', 'pending'])
    .getResult();

  assert.strictEqual(result.ok, false);
});

test('input validator: enum valid value passes', () => {
  const result = new InputValidator()
    .enum('status', 'active', ['active', 'inactive', 'pending'])
    .getResult();

  assert.strictEqual(result.ok, true);
});

test('input validator: reset clears state', () => {
  const validator = new InputValidator()
    .required('name', undefined);

  assert.strictEqual(validator.getResult().ok, false);

  validator.reset();
  assert.strictEqual(validator.getResult().ok, true);
});

test('input validator: static validate method works', () => {
  const result = InputValidator.validate(
    { name: 'test', count: 42 },
    {
      name: { required: true, type: 'string' },
      count: { type: 'number' }
    }
  );

  assert.strictEqual(result.ok, true);
});

test('input validator: static validate catches missing required', () => {
  const result = InputValidator.validate(
    {},
    { name: { required: true } }
  );

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors[0]?.field, 'name');
});

test('input validator: static validate catches type mismatch', () => {
  const result = InputValidator.validate(
    { count: 'not a number' },
    { count: { type: 'number' } }
  );

  assert.strictEqual(result.ok, false);
});

// ── Tool Handler Conformance Tests ─────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<McpToolResponse> {
  const server = createLunumMcpServer();
  const result = await server.handleToolCall(name, input);
  return result as McpToolResponse;
}

test('parse tool: validates required text field', async () => {
  const result = await executeTool('lunum_parse', {});
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'parse tool should return error for missing text');
  assert.strictEqual(response.error.code, McpErrorCode.INVALID_INPUT);
});

test('parse tool: validates text type', async () => {
  const result = await executeTool('lunum_parse', { text: 123 });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'parse tool should error for non-string text');
  assert.ok(response.error.validationErrors?.some((v: ValidationIssue) => v.message.includes('type')));
});

test('parse tool: validates language enum', async () => {
  const result = await executeTool('lunum_parse', { text: 'Hello', language: 'xyz' });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'parse tool should error for invalid language');
  assert.ok(response.error.validationErrors?.some((v: ValidationIssue) => v.message.includes('allowed values')));
});

test('parse tool: validates world enum', async () => {
  const result = await executeTool('lunum_parse', { text: 'Hello', world: 'invalid' });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'parse tool should error for invalid world');
});

test('parse tool: accepts valid input', async () => {
  const result = await executeTool('lunum_parse', { text: 'Hello world' });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok(!response.error, 'parse tool should succeed for valid input');
  assert.ok(response.success, 'parse tool should return success');
});

test('realize tool: validates required sem field', async () => {
  const result = await executeTool('lunum_realize', { targetLanguage: 'en' });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'realize tool should error for missing sem');
  assert.strictEqual(response.error.code, McpErrorCode.INVALID_INPUT);
});

test('realize tool: accepts valid input', async () => {
  const result = await executeTool('lunum_realize', {
    sem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'test', clauses: [] },
    targetLanguage: 'en'
  });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok(!response.error, 'realize tool should succeed for valid input');
  assert.ok(response.success, 'realize tool should return success');
});

test('fingerprint tool: validates length range', async () => {
  const result = await executeTool('lunum_fingerprint', { length: 100 });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'fingerprint tool should error for length > 64');
});

test('fingerprint tool: accepts valid input', async () => {
  const result = await executeTool('lunum_fingerprint', { length: 32 });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok(!response.error, 'fingerprint tool should succeed for valid length');
});

test('retrieve tool: validates maxResults range', async () => {
  const result = await executeTool('lunum_retrieve', { maxResults: 200 });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'retrieve tool should error for maxResults > 100');
});

test('retrieve tool: accepts valid input', async () => {
  const result = await executeTool('lunum_retrieve', { query: 'test', maxResults: 10 });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok(!response.error, 'retrieve tool should succeed for valid input');
});

test('validate tool: validates required sem field', async () => {
  const result = await executeTool('lunum_validate', { schema: 'lunum-sem/0.1-draft' });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok((result as McpToolErrorResponse).isError, 'validate tool should error for missing sem');
});

test('validate tool: accepts valid input', async () => {
  const result = await executeTool('lunum_validate', {
    sem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'test', clauses: [] }
  });
  const response = JSON.parse((result as any).content?.[0]?.text ?? '{}');

  assert.ok(!response.error, 'validate tool should succeed for valid input');
});

// ── Server Conformance Tests ───────────────────────────────────────

test('server: handleToolCall throws error for unknown tool', async () => {
  const server = createLunumMcpServer();
  await assert.rejects(
    server.handleToolCall('unknown_tool', {}),
    /Tool not found/u,
    'unknown tool should throw Error'
  );
});

test('server: addTool increases tool count', async () => {
  const server = createLunumMcpServer();
  const before = server.getTools().length;

  server.addTool({
    name: 'test_tool',
    description: 'Test',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => ({ content: [{ type: 'text', text: '{}' }] })
  });

  assert.strictEqual(server.getTools().length, before + 1);
});

test('server: context manager respects maxItems limit', () => {
  const server = createLunumMcpServer({ maxContextItems: 2 });
  const ctx = server.getContextManager();

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
    expected: 'number'
  };

  assert.ok(issue.field);
  assert.ok(issue.message);
  assert.ok(issue.received !== undefined);
  assert.ok(issue.expected);
});

test('validation error: multiple issues tracked', () => {
  const result = InputValidator.validate(
    { name: 123 },
    { name: { required: true, type: 'string' } }
  );

  assert.ok(result.errors.some(e => e.field === 'name'));
});
