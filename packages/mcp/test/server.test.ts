import { test } from 'node:test';
import assert from 'node:assert';
import { createLunumMcpServer, lunumTools } from '../src/index.js';

test('createLunumMcpServer creates server with default options', () => {
  const server = createLunumMcpServer();
  
  assert.ok(server);
  assert.strictEqual(server.getServer().name, 'lunum-mcp');
  assert.strictEqual(server.getServer().version, '0.2.0');
});

test('createLunumMcpServer accepts custom options', () => {
  const server = createLunumMcpServer({
    serverInfo: { name: 'test-server', version: '1.0.0' },
    maxContextItems: 500
  });
  
  assert.strictEqual(server.getServer().name, 'test-server');
  assert.strictEqual(server.getServer().version, '1.0.0');
});

test('lunumTools contains expected tools', () => {
  assert.strictEqual(lunumTools.length, 5);
  
  const toolNames = lunumTools.map(t => t.name);
  assert.ok(toolNames.includes('lunum_parse'));
  assert.ok(toolNames.includes('lunum_realize'));
  assert.ok(toolNames.includes('lunum_fingerprint'));
  assert.ok(toolNames.includes('lunum_retrieve'));
  assert.ok(toolNames.includes('lunum_validate'));
});

test('parseTool has correct schema', () => {
  const tool = lunumTools.find(t => t.name === 'lunum_parse');
  assert.ok(tool);
  assert.strictEqual(tool.inputSchema.type, 'object');
  assert.ok(tool.inputSchema.properties.text);
  assert.deepStrictEqual(tool.inputSchema.required, ['text']);
});

test('addTool adds custom tool to server', () => {
  const server = createLunumMcpServer();
  
  server.addTool({
    name: 'test_tool',
    description: 'Test tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      },
      required: ['input']
    },
    handler: async (input) => ({
      content: [{ type: 'text', text: JSON.stringify(input) }]
    })
  });
  
  assert.strictEqual(server.getTools().length, 6);
});