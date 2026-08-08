import { test } from 'node:test';
import assert from 'node:assert';
import { createLunumMcpServer, lunumTools } from '../src/index.js';

test('createLunumMcpServer creates MCP SDK Server', () => {
  const server = createLunumMcpServer();
  assert.ok(server);
});

test('createLunumMcpServer accepts custom tools subset', () => {
  const subset = lunumTools.slice(0, 3);
  const server = createLunumMcpServer(subset);
  assert.ok(server);
});

test('lunumTools contains 7 real tools', () => {
  assert.strictEqual(lunumTools.length, 7);
  const names = lunumTools.map((t) => t.name);
  assert.ok(names.includes('lunum_derive'));
  assert.ok(names.includes('lunum_compile_context'));
  assert.ok(names.includes('lunum_fingerprint'));
  assert.ok(names.includes('lunum_validate'));
  assert.ok(names.includes('lunum_render'));
  assert.ok(names.includes('lunum_compare'));
  assert.ok(names.includes('lunum_classify'));
});

test('deriveTool has correct schema', () => {
  const tool = lunumTools.find((t) => t.name === 'lunum_derive');
  assert.ok(tool);
  assert.strictEqual(tool.inputSchema.type, 'object');
  assert.ok(tool.inputSchema.properties.text);
  assert.deepStrictEqual(tool.inputSchema.required, ['text']);
});
