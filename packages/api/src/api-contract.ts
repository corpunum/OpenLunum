export const API_CONTRACT_VERSION = '0.1.0' as const;
export const API_BASE_PATH = '/api/v1' as const;

export interface ApiEndpointSpec {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  requestBodySchema?: string;
  responseSchema: string;
  requiresAuth: boolean;
  rateLimit: RateLimitSpec;
  maxRequestBytes: number;
  timeoutMs: number;
}

export interface RateLimitSpec {
  windowMs: number;
  maxRequests: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitSpec = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

export const STRICT_RATE_LIMIT: RateLimitSpec = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

export const MAX_REQUEST_BYTES = 1_048_576 as const; // 1 MB
export const DEFAULT_TIMEOUT_MS = 30_000 as const;

export const API_ENDPOINTS: readonly ApiEndpointSpec[] = [
  {
    method: 'GET',
    path: '/health',
    description: 'Health check endpoint returning server status and version',
    responseSchema: 'HealthResponse',
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

export function isWithinRateLimit(requestCount: number, limit: RateLimitSpec): boolean {
  return requestCount <= limit.maxRequests;
}

export function isWithinSizeLimit(bodyBytes: number, maxBytes: number): boolean {
  return bodyBytes <= maxBytes;
}

export function getApiContractManifest(): { version: string; basePath: string; endpoints: readonly ApiEndpointSpec[] } {
  return { version: API_CONTRACT_VERSION, basePath: API_BASE_PATH, endpoints: API_ENDPOINTS };
}
