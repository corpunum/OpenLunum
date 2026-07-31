/**
 * HTTP API Reference Server integration tests
 *
 * Tests the full request/response lifecycle of the Lunum API server,
 * including route registration, JSON parsing, response formatting,
 * and OpenAPI spec serving.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { LunumApiServer, buildDefaultRoutes } from '../src/server.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

// ── Helpers ────────────────────────────────────────────────────────

function createMockRequest(method: string, pathname: string, body?: unknown): IncomingMessage {
  const chunks = body !== undefined ? [Buffer.from(JSON.stringify(body))] : [];
  const stream = new Readable({ read() {} });
  for (const chunk of chunks) {
    stream.push(chunk);
  }
  stream.push(null);

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  return Object.assign(stream, {
    method,
    url: `/api/v1${pathname}`,
    headers,
    signal: {} as AbortSignal
  }) as unknown as IncomingMessage;
}

// ── Test: Server construction ──────────────────────────────────────

test('api server: constructs with default options', () => {
  const server = new LunumApiServer();
  const info = server.getInfo();

  assert.strictEqual(info.host, '0.0.0.0');
  assert.strictEqual(info.port, 3000);
  assert.strictEqual(info.prefix, '/api/v1');
  assert.strictEqual(info.uptime >= 0, true);
});

test('api server: accepts custom options', () => {
  const server = new LunumApiServer({ host: '127.0.0.1', port: 8080, prefix: '/lunum' });
  const info = server.getInfo();

  assert.strictEqual(info.host, '127.0.0.1');
  assert.strictEqual(info.port, 8080);
  assert.strictEqual(info.prefix, '/lunum');
});

test('api server: CORS enabled by default', () => {
  const server = new LunumApiServer();
  assert.strictEqual(server['options'].cors, true);
});

test('api server: logging disabled by default', () => {
  const server = new LunumApiServer();
  assert.strictEqual(server['options'].logging, false);
});

// ── Test: Route registration ───────────────────────────────────────

test('api server: registers custom routes', () => {
  const server = new LunumApiServer();
  server.addRoute('GET', '/custom', async () => {});
  assert.strictEqual(server.routesCount, 1);
  assert.deepStrictEqual(server.routeDefs, [{ method: 'GET', path: '/custom' }]);
});

test('api server: buildDefaultRoutes creates standard endpoints', () => {
  const routes = buildDefaultRoutes('/api/v1');
  assert.ok(routes.length >= 8, 'should have at least 8 default routes');

  const paths = routes.map(r => r.path);
  assert.ok(paths.includes('/health'), 'should have /health');
  assert.ok(paths.includes('/ready'), 'should have /ready');
  assert.ok(paths.includes('/parse'), 'should have /parse');
  assert.ok(paths.includes('/realize'), 'should have /realize');
  assert.ok(paths.includes('/render'), 'should have /render');
  assert.ok(paths.includes('/retrieve'), 'should have /retrieve');
  assert.ok(paths.includes('/context'), 'should have /context');
  assert.ok(paths.includes('/routes'), 'should have /routes');
});

// ── Test: Health endpoint ──────────────────────────────────────────

test('api server: /health returns OK status with default dependencies', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('GET', '/health');
  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.status, 'ok');
  assert.strictEqual(parsed.version, '0.2.0');
  assert.strictEqual(parsed.lunumVersion, '0.2.0');
  assert.strictEqual(typeof parsed.uptime, 'number');
  assert.strictEqual(parsed.routes >= 8, true);
  assert.ok(Array.isArray(parsed.dependencies), 'should have dependencies array');
  assert.ok(parsed.dependencies.length >= 3, 'should have at least 3 dependencies');
});

test('api server: /health reports degraded status when dependency is degraded', async () => {
  const server = new LunumApiServer();
  server.setDependencies([
    { name: 'core', status: 'ok', detail: 'OK', latencyMs: 1 },
    { name: 'datastore', status: 'degraded', detail: 'Slow response', latencyMs: 500 },
    { name: 'model', status: 'ok', detail: 'OK', latencyMs: 10 },
  ]);
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('GET', '/health');
  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.status, 'degraded');
});

test('api server: /health reports unhealthy status when dependency is unhealthy', async () => {
  const server = new LunumApiServer();
  server.setDependencies([
    { name: 'core', status: 'ok', detail: 'OK', latencyMs: 1 },
    { name: 'datastore', status: 'unhealthy', detail: 'Connection refused', latencyMs: 0 },
    { name: 'model', status: 'ok', detail: 'OK', latencyMs: 10 },
  ]);
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('GET', '/health');
  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.status, 'unhealthy');
});

// ── Test: Ready endpoint ───────────────────────────────────────────

test('api server: /ready returns ready state with default components', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('GET', '/ready');
  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.state, 'ready');
  assert.strictEqual(parsed.version, '0.2.0');
  assert.ok(typeof parsed.timestamp === 'string', 'timestamp should be an ISO string');
  assert.ok(Array.isArray(parsed.components), 'should have components array');
  assert.ok(parsed.components.length >= 3, 'should have at least 3 components');
  for (const comp of parsed.components) {
    assert.ok(typeof comp.component === 'string', 'component should have string name');
    assert.strictEqual(typeof comp.ready, 'boolean', 'component should have boolean ready');
    assert.ok(typeof comp.detail === 'string', 'component should have string detail');
  }
});

test('api server: /ready reports not-ready when a component is not ready', async () => {
  const server = new LunumApiServer();
  server.setReadyDetails([
    { component: 'model', ready: true, detail: 'Model endpoint reachable' },
    { component: 'schema', ready: true, detail: 'Schema loaded' },
    { component: 'auth', ready: false, detail: 'Auth middleware not configured' },
  ]);
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('GET', '/ready');
  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.state, 'not-ready');
});

// ── Test: Parse endpoint ───────────────────────────────────────────

test('api server: /parse returns Lunum record', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/parse', {
    text: 'The user prefers concise answers.',
    language: 'en',
    role: 'user'
  });

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.ok('record' in parsed, 'response should have record');
  assert.ok('meta' in parsed, 'response should have meta');
  assert.strictEqual(parsed.meta.language, 'en');
  assert.ok(typeof parsed.meta.timestamp === 'string');
});

// ── Test: Realize endpoint ─────────────────────────────────────────

test('api server: /realize returns sidecar with semantic metadata', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/realize', {
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } }, negated: false }],
      annotations: {}
    },
    language: 'en'
  });

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.ok('sidecar' in parsed, 'response should have sidecar');
  assert.ok('lunumMeta' in parsed.sidecar, 'sidecar should have lunumMeta');
});

// ── Test: Render endpoint ──────────────────────────────────────────

test('api server: /render returns profile and output', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/render', {
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } }, negated: false }],
      annotations: {}
    },
    profile: 'safe'
  });

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.profile, 'safe');
  assert.ok('output' in parsed);
});

// ── Test: Retrieve endpoint ────────────────────────────────────────

test('api server: /retrieve returns empty results with correct metadata', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/retrieve', {
    query: 'test query',
    maxResults: 5
  });

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.ok(Array.isArray(parsed.results), 'results should be an array');
  assert.strictEqual(parsed.meta.query, 'test query');
  assert.strictEqual(parsed.meta.mode, 'exact');
});

test('api server: /retrieve with nearSemantic returns near-semantic mode', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/retrieve', {
    query: 'test query',
    nearSemantic: true
  });

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.meta.mode, 'near-semantic');
});

// ── Test: Context endpoint ─────────────────────────────────────────

test('api server: /context compiles shadow context from messages', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/context', {
    messages: [
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I am fine, thank you!' }
    ]
  });

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.ok('naturalMessages' in parsed, 'should have naturalMessages');
  assert.ok('mixedMessages' in parsed, 'should have mixedMessages');
  assert.strictEqual(parsed.naturalMessages.length, 2, 'should preserve all messages');
  assert.strictEqual(parsed.naturalMessages[0]!.content, 'Hello, how are you?');
});

// ── Test: Routes listing ───────────────────────────────────────────

test('api server: /routes lists registered endpoints', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('GET', '/routes');

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.version, '0.2.0');
  assert.ok(Array.isArray(parsed.routes), 'routes should be an array');
  assert.ok(parsed.routes.length > 0, 'should have routes');
});

// ── Test: OpenAPI spec serving ─────────────────────────────────────

test('api server: serves OpenAPI spec at /openapi', async () => {
  const server = new LunumApiServer();

  const req = createMockRequest('GET', '/openapi');

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 200);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.openapi, '3.1.0');
  assert.strictEqual(parsed.info.title, 'Lunum API');
  assert.ok('paths' in parsed);
  assert.ok('components' in parsed);
});

// ── Test: 404 handling ─────────────────────────────────────────────

test('api server: returns 404 for unknown routes', async () => {
  const server = new LunumApiServer();

  const req = createMockRequest('GET', '/nonexistent');

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 404);
  const parsed = JSON.parse(captured.body);
  assert.strictEqual(parsed.code, 'NOT_FOUND');
});

// ── Test: 405 Method Not Allowed ───────────────────────────────────

test('api server: returns 405 for wrong HTTP method', async () => {
  const server = new LunumApiServer();
  const routes = buildDefaultRoutes('/api/v1');

  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  const req = createMockRequest('POST', '/health');

  let captured = { status: 0, body: '' };
  const res = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { captured.status = status; return res as ServerResponse; },
    end: (chunk?: string) => { captured.body = chunk ?? ''; return res as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](req, res);
  assert.strictEqual(captured.status, 405);
});

// ── Test: Full integration cycle ───────────────────────────────────

test('api server: full lifecycle — construct, register, respond', async () => {
  // 1. Construct server
  const server = new LunumApiServer({ logging: true });

  // 2. Register default routes
  const routes = buildDefaultRoutes('/api/v1');
  for (const route of routes) {
    server.addRoute(route.method, route.path, route.handler(server));
  }

  assert.strictEqual(server.routesCount, routes.length, 'all routes should be registered');
  assert.ok(server.routesCount >= 7, 'should have at least 7 routes');

  // 3. Test health endpoint
  const healthReq = createMockRequest('GET', '/health');
  let healthCaptured = { status: 0, body: '' };
  const healthRes = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { healthCaptured.status = status; return healthRes as ServerResponse; },
    end: (chunk?: string) => { healthCaptured.body = chunk ?? ''; return healthRes as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](healthReq, healthRes);
  assert.strictEqual(healthCaptured.status, 200, 'health should return 200');

  // 4. Test parse endpoint
  const parseReq = createMockRequest('POST', '/parse', {
    text: 'Test parse.',
    language: 'en'
  });
  let parseCaptured = { status: 0, body: '' };
  const parseRes = Object.assign({
    setHeader: () => {},
    writeHead: (status: number) => { parseCaptured.status = status; return parseRes as ServerResponse; },
    end: (chunk?: string) => { parseCaptured.body = chunk ?? ''; return parseRes as ServerResponse; }
  }) as unknown as ServerResponse;

  await server['handleRequest'](parseReq, parseRes);
  assert.strictEqual(parseCaptured.status, 200, 'parse should return 200');

  // 5. Verify server info
  const info = server.getInfo();
  assert.ok(info.routes >= 7, 'should have registered routes');
});
