export const API_CONTRACT_VERSION = '1.0.0' as const;
export const API_BASE_PATH = '/api/v1' as const;

// ── Versioned API Route Contract ───────────────────────────────────

export interface ApiRoute {
  method: string;
  path: string;
  version: string;
  description?: string;
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  requiresAuth: boolean;
  rateLimit: ApiRateLimit;
  maxRequestBytes: number;
  timeoutMs: number;
}

export interface ApiAuthConfig {
  type: 'bearer' | 'api-key' | 'none';
  headerName: string;
}

export interface ApiRateLimit {
  windowMs: number;
  maxRequests: number;
  scope: 'global' | 'per-tenant';
}

// Legacy interface for backwards compatibility
export interface ApiEndpointSpec {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  requestBodySchema?: string;
  responseSchema: string;
  requiresAuth: boolean;
  rateLimit: RateLimitSpec | ApiRateLimit;
  maxRequestBytes: number;
  timeoutMs: number;
}

export interface RateLimitSpec {
  windowMs: number;
  maxRequests: number;
}

export const DEFAULT_RATE_LIMIT: ApiRateLimit = {
  windowMs: 60_000,
  maxRequests: 60,
  scope: 'per-tenant',
} as const;

export const STRICT_RATE_LIMIT: ApiRateLimit = {
  windowMs: 60_000,
  maxRequests: 10,
  scope: 'per-tenant',
} as const;

export const MAX_REQUEST_BYTES = 1_048_576 as const; // 1 MB
export const DEFAULT_TIMEOUT_MS = 30_000 as const;

// ── Versioned API Routes ───────────────────────────────────────────

export const API_ROUTES: readonly ApiRoute[] = [
  {
    method: 'GET',
    path: '/health',
    version: '1.0.0',
    description: 'Health check endpoint returning server status, uptime, and dependency checks',
    requestSchema: {},
    responseSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'degraded', 'unhealthy'] },
        version: { type: 'string' },
        uptime: { type: 'number' },
        lunumVersion: { type: 'string' },
        routes: { type: 'number' },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              status: { type: 'string', enum: ['ok', 'degraded', 'unhealthy'] },
              detail: { type: 'string' },
              latencyMs: { type: 'number' }
            }
          }
        }
      }
    },
    requiresAuth: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: 0,
    timeoutMs: 5_000,
  },
  {
    method: 'GET',
    path: '/ready',
    version: '1.0.0',
    description: 'Readiness check endpoint returning component readiness state',
    requestSchema: {},
    responseSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['ready', 'not-ready'] },
        version: { type: 'string' },
        timestamp: { type: 'string' },
        components: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              component: { type: 'string' },
              ready: { type: 'boolean' },
              detail: { type: 'string' }
            }
          }
        }
      }
    },
    requiresAuth: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: 0,
    timeoutMs: 5_000,
  },
  {
    method: 'GET',
    path: '/routes',
    version: '1.0.0',
    description: 'List available API routes',
    requestSchema: {},
    responseSchema: {
      type: 'object',
      properties: {
        version: { type: 'string' },
        routes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string' },
              path: { type: 'string' },
              description: { type: 'string' }
            }
          }
        }
      }
    },
    requiresAuth: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: 0,
    timeoutMs: 5_000,
  },
  {
    method: 'POST',
    path: '/parse',
    version: '1.0.0',
    description: 'Parse natural language text into a Lunum record',
    requestSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        language: { type: 'string' },
        role: { type: 'string' },
        category: { type: 'string' },
        risk: { type: 'string' },
        confidence: { type: 'number' }
      },
      required: ['text', 'language']
    },
    responseSchema: {
      type: 'object',
      properties: {
        record: { type: 'object' },
        meta: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            tokens: { type: 'number' },
            timestamp: { type: 'string' }
          }
        }
      }
    },
    requiresAuth: true,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    method: 'POST',
    path: '/realize',
    version: '1.0.0',
    description: 'Realize a Lunum Sem into natural language',
    requestSchema: {
      type: 'object',
      properties: {
        sem: { type: 'object' },
        language: { type: 'string' },
        profile: { type: 'string' }
      },
      required: ['sem', 'language']
    },
    responseSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        sidecar: { type: 'object' },
        meta: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            tokens: { type: 'number' },
            timestamp: { type: 'string' }
          }
        }
      }
    },
    requiresAuth: true,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    method: 'POST',
    path: '/render',
    version: '1.0.0',
    description: 'Render a Lunum Sem using a named profile',
    requestSchema: {
      type: 'object',
      properties: {
        sem: { type: 'object' },
        profile: { type: 'string' }
      },
      required: ['sem', 'profile']
    },
    responseSchema: {
      type: 'object',
      properties: {
        output: { type: 'string' },
        profile: { type: 'string' },
        tokens: { type: ['number', 'null'] }
      }
    },
    requiresAuth: true,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    method: 'POST',
    path: '/retrieve',
    version: '1.0.0',
    description: 'Retrieve records by semantic similarity',
    requestSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' },
        threshold: { type: 'number' },
        language: { type: 'string' },
        nearSemantic: { type: 'boolean' }
      },
      required: ['query']
    },
    responseSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              score: { type: 'number' },
              record: { type: 'object' }
            }
          }
        },
        meta: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            totalMatches: { type: 'number' },
            mode: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    },
    requiresAuth: true,
    rateLimit: STRICT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
] as const;

// Legacy API_ENDPOINTS for backwards compatibility
export const API_ENDPOINTS: readonly ApiEndpointSpec[] = [
  {
    method: 'GET',
    path: '/health',
    description: 'Health check endpoint returning server status, uptime, and dependency checks',
    responseSchema: 'HealthResponse',
    requiresAuth: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: 0,
    timeoutMs: 5_000,
  },
  {
    method: 'GET',
    path: '/ready',
    description: 'Readiness check endpoint returning component readiness state',
    responseSchema: 'ReadyResponse',
    requiresAuth: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: 0,
    timeoutMs: 5_000,
  },
  {
    method: 'GET',
    path: '/routes',
    description: 'List available API routes',
    responseSchema: 'RoutesResponse',
    requiresAuth: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: 0,
    timeoutMs: 5_000,
  },
  {
    method: 'POST',
    path: '/parse',
    description: 'Parse natural language text into a Lunum record',
    requestBodySchema: 'ParseRequest',
    responseSchema: 'ParseResponse',
    requiresAuth: true,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    method: 'POST',
    path: '/realize',
    description: 'Realize a Lunum Sem into natural language',
    requestBodySchema: 'RealizeRequest',
    responseSchema: 'RealizeResponse',
    requiresAuth: true,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    method: 'POST',
    path: '/render',
    description: 'Render a Lunum Sem using a named profile',
    requestBodySchema: 'RenderRequest',
    responseSchema: 'RenderResponse',
    requiresAuth: true,
    rateLimit: DEFAULT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    method: 'POST',
    path: '/retrieve',
    description: 'Retrieve records by semantic similarity',
    requestBodySchema: 'RetrieveRequest',
    responseSchema: 'RetrieveResponse',
    requiresAuth: true,
    rateLimit: STRICT_RATE_LIMIT,
    maxRequestBytes: MAX_REQUEST_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
] as const;

export interface TenantContext {
  tenantId: string;
  apiKeyHash: string;
  permissions: readonly TenantPermission[];
}

export type TenantPermission = 'parse' | 'realize' | 'render' | 'retrieve' | 'admin';

export const ALL_PERMISSIONS: readonly TenantPermission[] = ['parse', 'realize', 'render', 'retrieve', 'admin'] as const;

export function validateTenantContext(ctx: TenantContext): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!ctx.tenantId || ctx.tenantId.trim().length === 0) errors.push('tenantId is required');
  if (!ctx.apiKeyHash || ctx.apiKeyHash.trim().length === 0) errors.push('apiKeyHash is required');
  if (!Array.isArray(ctx.permissions) || ctx.permissions.length === 0) errors.push('at least one permission is required');
  const validPerms = new Set<string>(ALL_PERMISSIONS);
  for (const p of ctx.permissions) {
    if (!validPerms.has(p)) errors.push(`invalid permission: ${p}`);
  }
  return { ok: errors.length === 0, errors };
}

export function hasPermission(ctx: TenantContext, permission: TenantPermission): boolean {
  return ctx.permissions.includes('admin') || ctx.permissions.includes(permission);
}

export function isWithinRateLimit(requestCount: number, limit: ApiRateLimit | RateLimitSpec): boolean {
  return requestCount <= limit.maxRequests;
}

export function isWithinSizeLimit(bodyBytes: number, maxBytes: number): boolean {
  return bodyBytes <= maxBytes;
}

// ── Request Validation ─────────────────────────────────────────────

export function validateApiRequest(route: ApiRoute, body: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate body is object
  if (typeof body !== 'object' || body === null) {
    if (Object.keys(route.requestSchema).length > 0) {
      errors.push('Request body must be an object');
    }
    return { ok: errors.length === 0, errors };
  }

  const bodyObj = body as Record<string, unknown>;

  // Check required fields
  const required = route.requestSchema.required as string[] | undefined;
  if (required && Array.isArray(required)) {
    for (const field of required) {
      if (!(field in bodyObj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function getApiContractManifest(): { version: string; basePath: string; endpoints: readonly ApiEndpointSpec[] } {
  return { version: API_CONTRACT_VERSION, basePath: API_BASE_PATH, endpoints: API_ENDPOINTS };
}
