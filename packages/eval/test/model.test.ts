import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { findWorkspaceRoot, validateProfile } from '../src/io.js';
import { DEFAULT_MAX_TOKENS, normalizeModelResponse, OpenAICompatibleModel } from '../src/model.js';
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

async function captureCompletionExchange(
  modelProfile: ModelProfile,
  responseBody: Record<string, unknown>
): Promise<{ body: Record<string, unknown>; completion: Awaited<ReturnType<OpenAICompatibleModel['complete']>> }> {
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
      response.end(JSON.stringify(responseBody));
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
    const completion = await model.complete('System prompt', 'User prompt');
    assert.ok(captured);
    return { body: captured, completion };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('complete sends the default max_tokens budget without inventing optional fields', async () => {
  const { body } = await captureCompletionExchange(profile(), { choices: [{ message: { content: '{}' } }] });
  assert.equal(body.max_tokens, DEFAULT_MAX_TOKENS);
  assert.equal(Object.hasOwn(body, 'seed'), false);
});

test('complete uses a profile-specific max_tokens budget', async () => {
  const { body } = await captureCompletionExchange(profile({ maxTokens: 8192, seed: 7 }), { choices: [{ message: { content: '{}' } }] });
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

test('complete with noThink prepends /no_think to system message', async () => {
  const { body } = await captureCompletionExchange(profile({ noThink: true }), { choices: [{ message: { content: '{}' } }] });
  const messages = body.messages as Array<{ role: string; content: string }>;
  const first = messages[0];
  assert.ok(first, 'messages[0] must exist');
  assert.equal(first.role, 'system');
  assert.ok(first.content.startsWith('/no_think\n'), `Expected /no_think prefix, got: ${first.content.slice(0, 40)}`);
});

test('complete without noThink leaves system message unchanged', async () => {
  const { body } = await captureCompletionExchange(profile({ noThink: false }), { choices: [{ message: { content: '{}' } }] });
  const messages = body.messages as Array<{ role: string; content: string }>;
  const first = messages[0];
  assert.ok(first, 'messages[0] must exist');
  assert.ok(!first.content.startsWith('/no_think'), 'Should not have /no_think prefix');
});

test('complete preserves content, usage, and finish reason when the server exposes them', async () => {
  const { completion } = await captureCompletionExchange(profile(), {
    choices: [{
      finish_reason: 'stop',
      message: { content: 'answer' }
    }],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
      prompt_tokens_details: { cached_tokens: 4 },
      completion_tokens_details: { reasoning_tokens: 3 }
    }
  });

  assert.deepStrictEqual(completion, {
    content: 'answer',
    finishReason: 'stop',
    usage: {
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      cachedTokens: 4,
      reasoningTokens: 3
    },
    rawResponse: {
      choices: [{ finish_reason: 'stop', message: { content: 'answer' } }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, prompt_tokens_details: { cached_tokens: 4 }, completion_tokens_details: { reasoning_tokens: 3 } }
    },
    rawRequest: { model: 'mock-local', temperature: 0, max_tokens: DEFAULT_MAX_TOKENS, messages: [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'User prompt' }] }
  });
});

test('complete returns explicit null finish reason and usage when the server does not expose them', async () => {
  const { completion } = await captureCompletionExchange(profile(), {
    choices: [{ message: { content: 'answer' } }]
  });

  assert.deepStrictEqual(completion, {
    content: 'answer',
    finishReason: null,
    usage: null,
    rawResponse: { choices: [{ message: { content: 'answer' } }] },
    rawRequest: { model: 'mock-local', temperature: 0, max_tokens: DEFAULT_MAX_TOKENS, messages: [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'User prompt' }] }
  });
});

test('complete expands partial usage into the full nullable shape', async () => {
  const { completion } = await captureCompletionExchange(profile(), {
    choices: [{ message: { content: 'answer' } }],
    usage: {
      prompt_tokens: 11,
      completion_tokens_details: { reasoning_tokens: 3 }
    }
  });

  assert.deepStrictEqual(completion, {
    content: 'answer',
    finishReason: null,
    usage: {
      promptTokens: 11,
      completionTokens: null,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: 3
    },
    rawResponse: { choices: [{ message: { content: 'answer' } }], usage: { prompt_tokens: 11, completion_tokens_details: { reasoning_tokens: 3 } } },
    rawRequest: { model: 'mock-local', temperature: 0, max_tokens: DEFAULT_MAX_TOKENS, messages: [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'User prompt' }] }
  });
});

test('complete preserves zero values in usage', async () => {
  const { completion } = await captureCompletionExchange(profile(), {
    choices: [{ message: { content: 'answer' } }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 }
    }
  });

  assert.deepStrictEqual(completion, {
    content: 'answer',
    finishReason: null,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0
    },
    rawResponse: { choices: [{ message: { content: 'answer' } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } },
    rawRequest: { model: 'mock-local', temperature: 0, max_tokens: DEFAULT_MAX_TOKENS, messages: [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'User prompt' }] }
  });
});

test('complete rejects reasoning-only responses without final content', async () => {
  await assert.rejects(
    () => captureCompletionExchange(profile(), {
      choices: [{ message: { reasoning_content: 'chain of thought only' } }]
    }),
    /choices\[0\]\.message\.content/u
  );
});

test('complete keeps reasoning_content out of final content while preserving the raw envelope', async () => {
  const payload = {
    choices: [{ finish_reason: 'stop', message: { reasoning_content: 'private reasoning', content: '{"ok":true}' } }]
  };
  const completion = normalizeModelResponse(payload);
  assert.equal(completion.content, '{"ok":true}');
  assert.deepStrictEqual(completion.rawResponse, { choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] });
});

test('normalizeModelResponse accepts text content parts but rejects arbitrary wrappers', () => {
  const completion = normalizeModelResponse({ choices: [{ message: { content: [{ type: 'text', text: '{}' }] } }] });
  assert.equal(completion.content, '{}');
  assert.throws(
    () => normalizeModelResponse({ choices: [{ message: { content: { final: '{}' } } }] }),
    /final choices\[0\]\.message\.content channel/u
  );
});

test('normalization errors retain the provider envelope for forensic evidence', () => {
  const payload = { choices: [{ message: { reasoning_content: 'thinking only' } }] };
  assert.throws(
    () => normalizeModelResponse(payload),
    (error: unknown) => error instanceof Error && 'rawResponse' in error &&
      JSON.stringify((error as { rawResponse: unknown }).rawResponse) === JSON.stringify({ choices: [{ message: {} }] })
  );
});

test('unsupported structured capability falls back without provider-specific core logic', async () => {
  let seen: unknown;
  const adapter = {
    supports: () => false,
    toRequest: (capability: import('../src/types.js').StructuredOutputCapability) => {
      seen = capability;
      return capability.mode === 'prompt' ? undefined : { response_format: { type: capability.mode } };
    }
  };
  const { body } = await (async () => {
    let captured: Record<string, unknown> | undefined;
    const server = createServer((request, response) => {
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        captured = JSON.parse(raw) as Record<string, unknown>;
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    try {
      await new OpenAICompatibleModel({ ...profile(), baseUrl: `http://127.0.0.1:${address.port}/v1` }, adapter)
        .complete('system', 'user', { structuredOutput: { mode: 'grammar', grammar: 'root ::= "{}"', fallback: 'prompt' } });
      return { body: captured! };
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  })();
  assert.deepStrictEqual(seen, { mode: 'prompt' });
  assert.equal(Object.hasOwn(body, 'response_format'), false);
});

test('complete maps structured-output capabilities through the provider adapter', async () => {
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
  const { body } = await captureCompletionExchange(profile(), { choices: [{ message: { content: '{}' } }] });
  // The capture helper intentionally exercises the default path; use a second
  // assertion through a custom adapter below to prove the core is provider-neutral.
  assert.equal(Object.hasOwn(body, 'response_format'), false);

  let capturedCapability: unknown;
  const adapter = { toRequest(capability: import('../src/types.js').StructuredOutputCapability) {
    capturedCapability = capability;
    return { response_format: { type: 'json_object' } };
  } };
  const { body: constrainedBody } = await (async () => {
    let captured: Record<string, unknown> | undefined;
    const server = createServer((request, response) => {
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        captured = JSON.parse(raw) as Record<string, unknown>;
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    try {
      await new OpenAICompatibleModel({ ...profile(), baseUrl: `http://127.0.0.1:${address.port}/v1` }, adapter)
        .complete('system', 'user', { structuredOutput: { mode: 'json_schema', schema, strict: true, fallback: 'prompt' } });
      return { body: captured! };
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  })();
  assert.deepStrictEqual(capturedCapability, { mode: 'json_schema', schema, strict: true, fallback: 'prompt' });
  assert.deepStrictEqual(constrainedBody.response_format, { type: 'json_object' });
});

test('model profile schema accepts noThink boolean', async () => {
  const root = await findWorkspaceRoot();
  const schema = JSON.parse(await readFile(path.join(root, 'schemas/model-profile.schema.json'), 'utf8')) as object;
  const validate = new Ajv2020Module.Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(profile({ noThink: true })), true, JSON.stringify(validate.errors));
  assert.equal(validate(profile({ noThink: false })), true, JSON.stringify(validate.errors));
  assert.equal(validate(profile({})), true, 'noThink should be optional');
});

test('model profile schema accepts provider-neutral chat-template kwargs', async () => {
  const root = await findWorkspaceRoot();
  const schema = JSON.parse(await readFile(path.join(root, 'schemas/model-profile.schema.json'), 'utf8')) as object;
  const validate = new Ajv2020Module.Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(profile({ chatTemplateKwargs: { enable_thinking: false } })), true, JSON.stringify(validate.errors));
});
