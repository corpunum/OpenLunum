import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { OpenAICompatibleModel } from '../src/model.js';
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

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Starts a local HTTP server that streams a simulated token-by-token SSE completion,
 * pacing each chunk with a real delay so TTFT/TPOT are non-trivial to compute. No live
 * model is involved anywhere in this test.
 */
async function withMockSseServer(
  handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
}

test('completeStreaming computes TTFT and TPOT from a simulated token-by-token SSE stream', async () => {
  const tokens = ['Hello', ',', ' world', '!', ' Done'];
  const firstTokenDelayMs = 60;
  const perTokenDelayMs = 20;

  await withMockSseServer(
    (request, response) => {
      if (request.url !== '/v1/chat/completions') {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });

      void (async () => {
        for (let i = 0; i < tokens.length; i += 1) {
          await sleep(i === 0 ? firstTokenDelayMs : perTokenDelayMs);
          response.write(sseChunk({ choices: [{ delta: { content: tokens[i] } }] }));
        }
        response.write(sseChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
        response.write(sseChunk({
          choices: [],
          usage: { prompt_tokens: 3, completion_tokens: tokens.length, total_tokens: 3 + tokens.length }
        }));
        response.write('data: [DONE]\n\n');
        response.end();
      })();
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl }));
      const started = performance.now();
      const completion = await model.completeStreaming('System prompt', 'User prompt');
      const measuredTotal = performance.now() - started;

      assert.equal(completion.content, tokens.join(''));
      assert.equal(completion.finishReason, 'stop');
      assert.ok(completion.usage);
      assert.equal(completion.usage?.completionTokens, tokens.length);
      assert.equal(completion.tokenCount, tokens.length);

      // TTFT should reflect the delay before the first chunk, not before the last.
      assert.ok(completion.ttftMs !== null, 'ttftMs must be captured');
      assert.ok(
        (completion.ttftMs as number) >= firstTokenDelayMs - 10,
        `ttftMs (${completion.ttftMs}) should be at least ~${firstTokenDelayMs}ms`
      );
      assert.ok(
        (completion.ttftMs as number) < measuredTotal,
        'ttftMs must be strictly less than the total wall time for a multi-token stream'
      );

      // totalMs should account for the entire stream duration (first delay + remaining tokens).
      const expectedMinTotal = firstTokenDelayMs + perTokenDelayMs * (tokens.length - 1);
      assert.ok(
        completion.totalMs >= expectedMinTotal - 15,
        `totalMs (${completion.totalMs}) should be at least ~${expectedMinTotal}ms`
      );

      // TPOT = (total - ttft) / (tokenCount - 1); verify the exact relationship holds.
      assert.ok(completion.tpotMs !== null, 'tpotMs must be computed when more than one token streamed');
      const expectedTpot = (completion.totalMs - (completion.ttftMs as number)) / (tokens.length - 1);
      assert.ok(
        Math.abs((completion.tpotMs as number) - expectedTpot) < 1e-6,
        `tpotMs (${completion.tpotMs}) should equal (totalMs - ttftMs) / (tokenCount - 1) = ${expectedTpot}`
      );
      assert.ok(
        (completion.tpotMs as number) >= perTokenDelayMs - 10,
        `tpotMs (${completion.tpotMs}) should reflect the ~${perTokenDelayMs}ms per-token pacing`
      );
    }
  );
});

test('completeStreaming reports null tpotMs for a single-token stream', async () => {
  await withMockSseServer(
    (request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      void (async () => {
        await sleep(15);
        response.write(sseChunk({ choices: [{ delta: { content: 'only' }, finish_reason: 'stop' }] }));
        response.write('data: [DONE]\n\n');
        response.end();
      })();
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl }));
      const completion = await model.completeStreaming('System', 'User');
      assert.equal(completion.content, 'only');
      assert.equal(completion.tokenCount, 1);
      assert.ok(completion.ttftMs !== null);
      assert.equal(completion.tpotMs, null, 'tpotMs is undefined/null when fewer than two tokens streamed');
    }
  );
});

// ---- R14.4: recovery-path tests (mock HTTP server only, never the live router) --------
// These exercise how OpenAICompatibleModel behaves when the *transport* misbehaves rather
// than when the model returns a well-formed but unhelpful payload: a worker process crashing
// mid-stream, a connection reset before any bytes arrive, and a hang that must be cut off by
// the profile's own timeoutMs. In every case the requirement is the same: the call rejects
// promptly with a clear error, exactly one request reaches the server (no silent retry), and
// no partial/garbled content is ever returned as if it were a successful completion.

test('completeStreaming rejects cleanly on a mid-stream connection reset (simulated process crash) and never fabricates a successful completion', async () => {
  let requestCount = 0;

  await withMockSseServer(
    (request, response) => {
      requestCount += 1;
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });
      void (async () => {
        // Send one legitimate chunk so the client has already accumulated partial
        // content, then simulate the worker process dying mid-request: the socket is
        // destroyed with no [DONE] and no finish_reason.
        response.write(sseChunk({ choices: [{ delta: { content: 'partial' } }] }));
        await sleep(20);
        response.destroy();
      })();
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl, timeoutMs: 2000 }));
      await assert.rejects(
        () => model.completeStreaming('System', 'User'),
        (error: unknown) => {
          assert.ok(error instanceof Error, 'a mid-stream reset must surface as a rejected promise, not a fabricated result');
          return true;
        }
      );
      assert.equal(requestCount, 1, 'a transport-level crash must not trigger a silent retry');
    }
  );
});

test('complete rejects cleanly on a connection reset before any response bytes arrive, without retrying', async () => {
  let requestCount = 0;

  await withMockSseServer(
    (request, response) => {
      requestCount += 1;
      // Simulate a crashed/restarting process: the connection is accepted then torn
      // down before a single header byte is written.
      request.socket.destroy();
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl, timeoutMs: 2000 }));
      await assert.rejects(
        () => model.complete('System', 'User'),
        (error: unknown) => {
          assert.ok(error instanceof Error, 'a reset-before-response must reject with a clear error, not hang or resolve');
          return true;
        }
      );
      assert.equal(requestCount, 1, 'a connection reset must not trigger a silent retry');
    }
  );
});

test('complete honours timeoutMs and reports a clean failure (no silent retry) when the server hangs indefinitely', async () => {
  let requestCount = 0;

  await withMockSseServer(
    (request, response) => {
      requestCount += 1;
      // Never respond and never close: the only thing that can end this request is
      // the client's own AbortSignal.timeout.
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl, timeoutMs: 150 }));
      const startedAt = performance.now();
      await assert.rejects(() => model.complete('System', 'User'));
      const elapsedMs = performance.now() - startedAt;
      assert.ok(elapsedMs < 2000, `timeout must be enforced promptly by timeoutMs, took ${elapsedMs}ms`);
      assert.equal(requestCount, 1, 'a timeout must not trigger a silent retry');
    }
  );
});

test('completeStreaming honours timeoutMs and reports a clean failure (no silent retry) when the server hangs indefinitely', async () => {
  let requestCount = 0;

  await withMockSseServer(
    (request, response) => {
      requestCount += 1;
      // Accept the connection but never write headers or a body.
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl, timeoutMs: 150 }));
      const startedAt = performance.now();
      await assert.rejects(() => model.completeStreaming('System', 'User'));
      const elapsedMs = performance.now() - startedAt;
      assert.ok(elapsedMs < 2000, `timeout must be enforced promptly by timeoutMs, took ${elapsedMs}ms`);
      assert.equal(requestCount, 1, 'a timeout must not trigger a silent retry');
    }
  );
});

test('completeStreaming does not alter the request body shape sent by complete()', async () => {
  let captured: Record<string, unknown> | undefined;
  await withMockSseServer(
    (request, response) => {
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        captured = JSON.parse(raw) as Record<string, unknown>;
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write(sseChunk({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }));
        response.write('data: [DONE]\n\n');
        response.end();
      });
    },
    async (baseUrl) => {
      const model = new OpenAICompatibleModel(profile({ baseUrl, maxTokens: 123, seed: 9 }));
      await model.completeStreaming('sys', 'usr');
      assert.ok(captured);
      assert.equal(captured?.stream, true);
      assert.equal(captured?.max_tokens, 123);
      assert.equal(captured?.seed, 9);
      assert.equal(captured?.model, 'mock-local');
    }
  );
});
