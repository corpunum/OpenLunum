/**
 * Authentication and rate limiting middleware for the Lunum API
 *
 * Supports bearer token and API key authentication methods
 * Implements per-tenant and global rate limiting
 */

import type { ApiAuthConfig, ApiRateLimit } from './api-contract.js';

// ── Authentication Middleware ──────────────────────────────────────

export interface AuthRequest {
  headers: Record<string, string>;
}

export interface AuthResult {
  authenticated: boolean;
  error?: string;
}

/**
 * Create an authentication middleware function
 * Validates bearer tokens or API keys based on the provided config
 */
export function createAuthMiddleware(config: ApiAuthConfig): (req: AuthRequest) => AuthResult {
  return (req: AuthRequest): AuthResult => {
    // No auth required
    if (config.type === 'none') {
      return { authenticated: true };
    }

    // Get the header value (case-insensitive)
    const headerValue = getHeaderValue(req.headers, config.headerName);

    if (!headerValue) {
      return {
        authenticated: false,
        error: `Missing required header: ${config.headerName}`
      };
    }

    // Validate bearer token
    if (config.type === 'bearer') {
      if (!headerValue.startsWith('Bearer ')) {
        return {
          authenticated: false,
          error: `Invalid bearer token format. Expected "Bearer <token>"`
        };
      }

      const token = headerValue.slice(7).trim();
      if (!token) {
        return {
          authenticated: false,
          error: 'Bearer token is empty'
        };
      }

      // Token validation: basic check for non-empty string
      // In production, verify against issued tokens
      return { authenticated: true };
    }

    // Validate API key
    if (config.type === 'api-key') {
      if (!headerValue) {
        return {
          authenticated: false,
          error: 'API key is empty'
        };
      }

      // API key validation: basic check for non-empty string
      // In production, verify against registered keys
      return { authenticated: true };
    }

    return {
      authenticated: false,
      error: `Unknown auth type: ${config.type}`
    };
  };
}

// ── Rate Limiting ──────────────────────────────────────────────────

export interface RateLimiterState {
  clientId: string;
  count: number;
  resetTime: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Create a rate limiter function
 * Tracks requests per client and enforces rate limits
 */
export function createRateLimiter(config: ApiRateLimit): {
  check(clientId: string): RateLimitCheckResult;
  reset(clientId: string): void;
  getState(clientId: string): RateLimiterState | null;
} {
  const state = new Map<string, RateLimiterState>();

  function check(clientId: string): RateLimitCheckResult {
    const now = Date.now();
    const existing = state.get(clientId);

    // Check if we need to reset the window
    if (existing && now >= existing.resetTime) {
      // Window has expired, reset
      existing.count = 0;
      existing.resetTime = now + config.windowMs;
    }

    // Create new state if needed
    if (!existing) {
      state.set(clientId, {
        clientId,
        count: 0,
        resetTime: now + config.windowMs
      });
    }

    const clientState = state.get(clientId)!;

    // Check if rate limit exceeded
    if (clientState.count >= config.maxRequests) {
      const retryAfterMs = Math.max(0, clientState.resetTime - now);
      return {
        allowed: false,
        retryAfterMs
      };
    }

    // Increment and allow
    clientState.count++;
    return { allowed: true };
  }

  function reset(clientId: string): void {
    state.delete(clientId);
  }

  function getState(clientId: string): RateLimiterState | null {
    const existing = state.get(clientId);
    if (!existing) return null;

    // Check if window has expired
    if (Date.now() >= existing.resetTime) {
      return null;
    }

    return existing;
  }

  return { check, reset, getState };
}

// ── Helper Functions ───────────────────────────────────────────────

/**
 * Get a header value by name, case-insensitive
 */
function getHeaderValue(headers: Record<string, string>, headerName: string): string | undefined {
  // Try exact match first
  if (headerName in headers) {
    return headers[headerName];
  }

  // Try case-insensitive match
  const lowerName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  return undefined;
}
