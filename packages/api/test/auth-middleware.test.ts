import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthMiddleware,
  createRateLimiter,
  type AuthRequest,
} from '../src/auth-middleware.js';
import type { ApiAuthConfig, ApiRateLimit } from '../src/api-contract.js';

describe('authentication middleware', () => {
  describe('bearer token auth', () => {
    function getConfig(): ApiAuthConfig {
      return { type: 'bearer', headerName: 'Authorization' };
    }

    it('accepts valid bearer token', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = {
        headers: { 'Authorization': 'Bearer valid-token-123' }
      };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, true);
      assert.strictEqual(result.error, undefined);
    });

    it('rejects missing bearer token', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = { headers: {} };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, false);
      assert.ok(result.error);
    });

    it('rejects malformed bearer token (no "Bearer " prefix)', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = {
        headers: { 'Authorization': 'valid-token-123' }
      };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, false);
      assert.ok(result.error?.includes('Bearer'));
    });

    it('rejects empty bearer token', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = {
        headers: { 'Authorization': 'Bearer ' }
      };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, false);
      assert.ok(result.error?.includes('empty'));
    });

    it('handles case-insensitive header lookup', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = {
        headers: { 'authorization': 'Bearer token-value' }
      };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, true);
    });
  });

  describe('API key auth', () => {
    function getConfig(): ApiAuthConfig {
      return { type: 'api-key', headerName: 'X-API-Key' };
    }

    it('accepts valid API key', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = {
        headers: { 'X-API-Key': 'sk-abcd1234' }
      };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, true);
    });

    it('rejects missing API key', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = { headers: {} };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, false);
      assert.ok(result.error);
    });

    it('rejects empty API key', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = {
        headers: { 'X-API-Key': '' }
      };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, false);
    });
  });

  describe('no auth', () => {
    function getConfig(): ApiAuthConfig {
      return { type: 'none', headerName: '' };
    }

    it('always authenticates when type is none', () => {
      const middleware = createAuthMiddleware(getConfig());
      const req: AuthRequest = { headers: {} };
      const result = middleware(req);
      assert.strictEqual(result.authenticated, true);
    });
  });
});

describe('rate limiting', () => {
  function getConfig(): ApiRateLimit {
    return { windowMs: 1000, maxRequests: 3, scope: 'per-tenant' };
  }

  it('allows requests within limit', () => {
    const limiter = createRateLimiter(getConfig());
    for (let i = 0; i < 3; i++) {
      const result = limiter.check('client-1');
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.retryAfterMs, undefined);
    }
  });

  it('blocks requests exceeding limit', () => {
    const limiter = createRateLimiter(getConfig());
    // Use up the limit
    for (let i = 0; i < 3; i++) {
      limiter.check('client-1');
    }
    // Next request should be blocked
    const result = limiter.check('client-1');
    assert.strictEqual(result.allowed, false);
    assert.ok(typeof result.retryAfterMs === 'number');
    assert.ok(result.retryAfterMs > 0);
  });

  it('tracks separate limits per client', () => {
    const limiter = createRateLimiter(getConfig());
    // Client 1 uses up limit
    for (let i = 0; i < 3; i++) {
      limiter.check('client-1');
    }
    // Client 2 should still have requests available
    const result = limiter.check('client-2');
    assert.strictEqual(result.allowed, true);
  });

  it('resets limit after window expires', async () => {
    const config: ApiRateLimit = { windowMs: 100, maxRequests: 1, scope: 'per-tenant' };
    const limiter = createRateLimiter(config);

    // Use the single request
    let result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);

    // Next request should be blocked
    result = limiter.check('client-1');
    assert.strictEqual(result.allowed, false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 120));

    // Request should be allowed again
    result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);
  });

  it('can reset a client manually', () => {
    const limiter = createRateLimiter(getConfig());
    // Use up the limit
    for (let i = 0; i < 3; i++) {
      limiter.check('client-1');
    }
    // Block the next one
    let result = limiter.check('client-1');
    assert.strictEqual(result.allowed, false);

    // Reset the client
    limiter.reset('client-1');

    // Should be allowed again
    result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);
  });

  it('getState returns null for non-existent or expired client', () => {
    const limiter = createRateLimiter(getConfig());
    assert.strictEqual(limiter.getState('nonexistent'), null);

    // Use a request
    limiter.check('client-1');
    const state = limiter.getState('client-1');
    assert.ok(state);
    assert.strictEqual(state.count, 1);
  });

  it('getState returns current state for active client', () => {
    const limiter = createRateLimiter(getConfig());
    limiter.check('client-1');
    limiter.check('client-1');

    const state = limiter.getState('client-1');
    assert.ok(state);
    assert.strictEqual(state.count, 2);
    assert.strictEqual(state.clientId, 'client-1');
  });

  it('supports global scope in rate limit config', () => {
    const config: ApiRateLimit = { windowMs: 1000, maxRequests: 2, scope: 'global' };
    const limiter = createRateLimiter(config);

    // Global limiter still tracks per clientId
    // but the intention is to use same clientId for all
    limiter.check('global');
    limiter.check('global');
    const result = limiter.check('global');
    assert.strictEqual(result.allowed, false);
  });

  it('retry-after header is reasonable', () => {
    const config: ApiRateLimit = { windowMs: 1000, maxRequests: 1, scope: 'per-tenant' };
    const limiter = createRateLimiter(config);

    limiter.check('client-1');
    const result = limiter.check('client-1');

    assert.strictEqual(result.allowed, false);
    assert.ok(result.retryAfterMs! > 0);
    assert.ok(result.retryAfterMs! <= 1000);
  });
});
