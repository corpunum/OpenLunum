import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_CONTRACT_VERSION,
  API_BASE_PATH,
  API_ENDPOINTS,
  API_ROUTES,
  DEFAULT_RATE_LIMIT,
  STRICT_RATE_LIMIT,
  MAX_REQUEST_BYTES,
  DEFAULT_TIMEOUT_MS,
  ALL_PERMISSIONS,
  validateTenantContext,
  hasPermission,
  isWithinRateLimit,
  isWithinSizeLimit,
  getApiContractManifest,
  validateApiRequest,
  type TenantContext,
  type ApiRoute,
} from '../src/api-contract.js';

describe('API contract', () => {
  it('contract version is semver', () => {
    assert.match(API_CONTRACT_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('base path is /api/v1', () => {
    assert.strictEqual(API_BASE_PATH, '/api/v1');
  });

  it('endpoints cover health, routes, parse, realize, render, retrieve', () => {
    const paths = API_ENDPOINTS.map(e => e.path);
    for (const expected of ['/health', '/routes', '/parse', '/realize', '/render', '/retrieve']) {
      assert.ok(paths.includes(expected), `missing endpoint: ${expected}`);
    }
  });

  it('endpoint paths are unique', () => {
    const keys = API_ENDPOINTS.map(e => `${e.method}:${e.path}`);
    assert.strictEqual(new Set(keys).size, keys.length);
  });

  it('each endpoint has valid fields', () => {
    for (const ep of API_ENDPOINTS) {
      assert.ok(['GET', 'POST'].includes(ep.method));
      assert.ok(ep.path.startsWith('/'));
      assert.ok(ep.description.length > 0);
      assert.ok(ep.responseSchema.length > 0);
      assert.ok(ep.rateLimit.windowMs > 0);
      assert.ok(ep.rateLimit.maxRequests > 0);
      assert.ok(ep.timeoutMs > 0);
    }
  });

  it('health and routes do not require auth', () => {
    const health = API_ENDPOINTS.find(e => e.path === '/health')!;
    const routes = API_ENDPOINTS.find(e => e.path === '/routes')!;
    assert.strictEqual(health.requiresAuth, false);
    assert.strictEqual(routes.requiresAuth, false);
  });

  it('mutation endpoints require auth', () => {
    for (const path of ['/parse', '/realize', '/render', '/retrieve']) {
      const ep = API_ENDPOINTS.find(e => e.path === path)!;
      assert.strictEqual(ep.requiresAuth, true, `${path} should require auth`);
    }
  });

  it('rate limits are positive', () => {
    assert.ok(DEFAULT_RATE_LIMIT.maxRequests > 0);
    assert.ok(STRICT_RATE_LIMIT.maxRequests > 0);
    assert.ok(STRICT_RATE_LIMIT.maxRequests < DEFAULT_RATE_LIMIT.maxRequests);
  });

  it('MAX_REQUEST_BYTES is 1 MB', () => {
    assert.strictEqual(MAX_REQUEST_BYTES, 1_048_576);
  });
});

describe('tenant context', () => {
  function validCtx(): TenantContext {
    return { tenantId: 'tenant-1', apiKeyHash: 'abc123', permissions: ['parse', 'realize'] };
  }

  it('validates a correct tenant context', () => {
    const result = validateTenantContext(validCtx());
    assert.strictEqual(result.ok, true);
  });

  it('rejects empty tenantId', () => {
    const result = validateTenantContext({ ...validCtx(), tenantId: '' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('tenantId')));
  });

  it('rejects empty apiKeyHash', () => {
    const result = validateTenantContext({ ...validCtx(), apiKeyHash: '' });
    assert.strictEqual(result.ok, false);
  });

  it('rejects no permissions', () => {
    const result = validateTenantContext({ ...validCtx(), permissions: [] });
    assert.strictEqual(result.ok, false);
  });

  it('rejects invalid permission', () => {
    const result = validateTenantContext({ ...validCtx(), permissions: ['invalid' as 'parse'] });
    assert.strictEqual(result.ok, false);
  });

  it('hasPermission checks specific permission', () => {
    const ctx = validCtx();
    assert.strictEqual(hasPermission(ctx, 'parse'), true);
    assert.strictEqual(hasPermission(ctx, 'retrieve'), false);
  });

  it('admin permission grants all', () => {
    const ctx: TenantContext = { tenantId: 't', apiKeyHash: 'h', permissions: ['admin'] };
    for (const p of ALL_PERMISSIONS) {
      assert.strictEqual(hasPermission(ctx, p), true, `admin should have ${p}`);
    }
  });
});

describe('rate and size limits', () => {
  it('isWithinRateLimit accepts within limit', () => {
    assert.strictEqual(isWithinRateLimit(5, DEFAULT_RATE_LIMIT), true);
  });

  it('isWithinRateLimit rejects over limit', () => {
    assert.strictEqual(isWithinRateLimit(61, DEFAULT_RATE_LIMIT), false);
  });

  it('isWithinSizeLimit accepts within limit', () => {
    assert.strictEqual(isWithinSizeLimit(1000, MAX_REQUEST_BYTES), true);
  });

  it('isWithinSizeLimit rejects over limit', () => {
    assert.strictEqual(isWithinSizeLimit(MAX_REQUEST_BYTES + 1, MAX_REQUEST_BYTES), false);
  });
});

describe('getApiContractManifest', () => {
  it('returns version and endpoints', () => {
    const manifest = getApiContractManifest();
    assert.strictEqual(manifest.version, API_CONTRACT_VERSION);
    assert.strictEqual(manifest.basePath, API_BASE_PATH);
    assert.ok(manifest.endpoints.length >= 6);
  });
});

describe('versioned API routes (API_ROUTES)', () => {
  it('contract version is 1.0.0', () => {
    assert.strictEqual(API_CONTRACT_VERSION, '1.0.0');
  });

  it('API_ROUTES includes all required endpoints', () => {
    const paths = API_ROUTES.map(r => r.path);
    for (const expected of ['/health', '/routes', '/parse', '/realize', '/render', '/retrieve']) {
      assert.ok(paths.includes(expected), `missing route: ${expected}`);
    }
  });

  it('each route has valid versioned structure', () => {
    for (const route of API_ROUTES) {
      assert.ok(typeof route.method === 'string');
      assert.ok(route.path.startsWith('/'));
      assert.ok(/^\d+\.\d+\.\d+$/.test(route.version), `invalid version: ${route.version}`);
      assert.ok(typeof route.requestSchema === 'object');
      assert.ok(typeof route.responseSchema === 'object');
      assert.ok(typeof route.requiresAuth === 'boolean');
      assert.ok(route.rateLimit.windowMs > 0);
      assert.ok(route.rateLimit.maxRequests > 0);
      assert.ok(['global', 'per-tenant'].includes(route.rateLimit.scope));
      assert.ok(route.timeoutMs > 0);
    }
  });

  it('health and routes endpoints do not require auth', () => {
    const health = API_ROUTES.find(r => r.path === '/health')!;
    const routes = API_ROUTES.find(r => r.path === '/routes')!;
    assert.strictEqual(health.requiresAuth, false);
    assert.strictEqual(routes.requiresAuth, false);
  });

  it('mutation endpoints require auth', () => {
    for (const path of ['/parse', '/realize', '/render', '/retrieve']) {
      const route = API_ROUTES.find(r => r.path === path)!;
      assert.strictEqual(route.requiresAuth, true, `${path} should require auth`);
    }
  });

  it('retrieve endpoint has stricter rate limit than others', () => {
    const retrieve = API_ROUTES.find(r => r.path === '/retrieve')!;
    const parse = API_ROUTES.find(r => r.path === '/parse')!;
    assert.ok(retrieve.rateLimit.maxRequests < parse.rateLimit.maxRequests);
  });

  it('all routes have version 1.0.0', () => {
    for (const route of API_ROUTES) {
      assert.strictEqual(route.version, '1.0.0');
    }
  });

  it('routes with POST method have request schemas', () => {
    for (const route of API_ROUTES.filter(r => r.method === 'POST')) {
      assert.ok(Object.keys(route.requestSchema).length > 0, `POST ${route.path} should have requestSchema`);
    }
  });
});

describe('API request validation', () => {
  function getTestRoute(): ApiRoute {
    return {
      method: 'POST',
      path: '/parse',
      version: '1.0.0',
      requestSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          language: { type: 'string' }
        },
        required: ['text', 'language']
      },
      responseSchema: { type: 'object' },
      requiresAuth: true,
      rateLimit: DEFAULT_RATE_LIMIT,
      maxRequestBytes: MAX_REQUEST_BYTES,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }

  it('validates a valid request', () => {
    const route = getTestRoute();
    const result = validateApiRequest(route, { text: 'hello', language: 'en' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('rejects a request with missing required field', () => {
    const route = getTestRoute();
    const result = validateApiRequest(route, { text: 'hello' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('language')));
  });

  it('rejects a request with non-object body', () => {
    const route = getTestRoute();
    const result = validateApiRequest(route, 'not an object');
    assert.strictEqual(result.ok, false);
  });

  it('accepts null/non-object body for routes with no required schema', () => {
    const route = getTestRoute();
    route.requestSchema = {};
    const result = validateApiRequest(route, null);
    assert.strictEqual(result.ok, true);
  });

  it('validates a route from API_ROUTES', () => {
    const parseRoute = API_ROUTES.find(r => r.path === '/parse')!;
    const result = validateApiRequest(parseRoute, { text: 'test', language: 'en' });
    assert.strictEqual(result.ok, true);
  });

  it('rejects missing required field for real route', () => {
    const parseRoute = API_ROUTES.find(r => r.path === '/parse')!;
    const result = validateApiRequest(parseRoute, { text: 'test' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('language')));
  });
});
