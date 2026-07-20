import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { OpenAICompatibleModel } from '../src/model.js';

test('OpenAICompatibleModel.complete sends max_tokens default 4096', async () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] };
  let capturedMaxTokens: number | undefined;

  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const parsed = JSON.parse(body);
        capturedMaxTokens = parsed.max_tokens;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sem) } }] }));
      });
      return;
    }
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'mock-local' }] }));
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const model = new OpenAICompatibleModel({
    schema: 'openlunum-model-profile/0.1',
    id: 'mock',
    provider: 'openai-compatible',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'mock-local',
    temperature: 0,
    timeoutMs: 5000
  });

  await model.complete('System prompt', 'User prompt');
  assert.strictEqual(capturedMaxTokens, 4096, 'max_tokens should default to 4096');

  server.close();
});

test('OpenAICompatibleModel.complete sends profile max_tokens when set', async () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] };
  let capturedMaxTokens: number | undefined;

  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const parsed = JSON.parse(body);
        capturedMaxTokens = parsed.max_tokens;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sem) } }] }));
      });
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const model = new OpenAICompatibleModel({
    schema: 'openlunum-model-profile/0.1',
    id: 'mock',
    provider: 'openai-compatible',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'mock-local',
    temperature: 0,
    maxTokens: 8192,
    timeoutMs: 5000
  });

  await model.complete('System prompt', 'User prompt');
  assert.strictEqual(capturedMaxTokens, 8192, 'max_tokens should use profile value when set');

  server.close();
});

test('OpenAICompatibleModel.complete sends system and user messages', async () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] };
  let capturedMessages: Array<{ role: string; content: string }> | undefined;

  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const parsed = JSON.parse(body);
        capturedMessages = parsed.messages;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sem) } }] }));
      });
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const model = new OpenAICompatibleModel({
    schema: 'openlunum-model-profile/0.1',
    id: 'mock',
    provider: 'openai-compatible',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'mock-local',
    temperature: 0,
    timeoutMs: 5000
  });

  await model.complete('The system prompt', 'The user prompt');
  assert.ok(Array.isArray(capturedMessages), 'messages should be an array');
  assert.strictEqual(capturedMessages?.[0]?.role, 'system');
  assert.strictEqual(capturedMessages?.[0]?.content, 'The system prompt');
  assert.strictEqual(capturedMessages?.[1]?.role, 'user');
  assert.strictEqual(capturedMessages?.[1]?.content, 'The user prompt');

  server.close();
});
