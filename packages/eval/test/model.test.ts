import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { findWorkspaceRoot, validateProfile } from '../src/io.js';
import { DEFAULT_MAX_TOKENS, OpenAICompatibleModel } from '../src/model.js';
import type { ModelProfile } from '../src/types.js';

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    schema: 'openlunum-model-profile/0.1',
    id: 'mock',
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1/v1',
    model: 'mock-local',
    temperature: 0,
    timeoutMs: 5000,
    ...overrides
  };
}

async function captureCompletionBody(modelProfile: ModelProfile): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> | undefined;
  const server = createServer((request, response) => {
    if (request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      captured = JSON.parse(body) as Record<string, unknown>;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    const model = new OpenAICompatibleModel({
      ...modelProfile,
      baseUrl: `http://127.0.0.1:${address.port}/v1`
    });
    await model.complete('System prompt', 'User prompt');
    assert.ok(captured);
    return captured;
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('complete sends the default max_tokens budget without inventing optional fields', async () => {
  const body = await captureCompletionBody(profile());
  assert.equal(body.max_tokens, DEFAULT_MAX_TOKENS);
  assert.equal(Object.hasOwn(body, 'seed'), false);
});

test('complete uses a profile-specific max_tokens budget', async () => {
  const body = await captureCompletionBody(profile({ maxTokens: 8192, seed: 7 }));
  assert.equal(body.max_tokens, 8192);
  assert.equal(body.seed, 7);
});

test('validateProfile accepts positive integer maxTokens and rejects invalid values', () => {
  assert.doesNotThrow(() => validateProfile(profile({ maxTokens: 1 })));
  assert.doesNotThrow(() => validateProfile(profile({ maxTokens: 8192 })));

  for (const maxTokens of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => validateProfile(profile({ maxTokens })),
      /maxTokens must be a positive safe integer/u
    );
  }
});

test('model construction rejects invalid maxTokens even without separate profile validation', () => {
  for (const maxTokens of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => new OpenAICompatibleModel(profile({ maxTokens })),
      /maxTokens must be a positive safe integer/u
    );
  }
});

test('model profile schema accepts maxTokens and rejects invalid budgets', async () => {
  const root = await findWorkspaceRoot();
  const schema = JSON.parse(await readFile(path.join(root, 'schemas/model-profile.schema.json'), 'utf8')) as object;
  const validate = new Ajv2020Module.Ajv2020({ strict: true }).compile(schema);

  assert.equal(validate(profile({ maxTokens: 4096 })), true, JSON.stringify(validate.errors));
  assert.equal(validate(profile({ maxTokens: Number.MAX_SAFE_INTEGER })), true, JSON.stringify(validate.errors));
  for (const maxTokens of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validate(profile({ maxTokens })), false, `schema should reject maxTokens=${maxTokens}`);
  }
});
