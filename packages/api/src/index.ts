/**
 * HTTP API Reference Server for Lunum
 *
 * Provides a REST API for Lunum semantic content operations:
 * parse, realize, render, retrieve, and context compilation.
 *
 * This is the third adoption path for OpenLunum:
 * 1. MCP server (packages/mcp)
 * 2. CLI pipeline (packages/cli)
 * 3. HTTP API reference server (packages/api)
 */

export { LunumApiServer, buildDefaultRoutes } from './server.js';
export type {
  ApiServerOptions,
  ParseRequest,
  ParseResponse,
  RealizeRequest,
  RealizeResponse,
  RenderRequest,
  RenderResponse,
  RetrieveRequest,
  RetrieveResponse,
  HealthResponse,
  HealthStatus,
  DependencyCheck,
  ReadyResponse,
  ReadinessState,
  ReadyDetail,
  ErrorResponse,
  RoutesResponse
} from './types.js';

// API contract and versioning
export {
  API_CONTRACT_VERSION,
  API_BASE_PATH,
  API_ROUTES,
  API_ENDPOINTS,
  DEFAULT_RATE_LIMIT,
  STRICT_RATE_LIMIT,
  MAX_REQUEST_BYTES,
  DEFAULT_TIMEOUT_MS,
  validateApiRequest,
  validateTenantContext,
  hasPermission,
  isWithinRateLimit,
  isWithinSizeLimit,
  getApiContractManifest,
  type ApiRoute,
  type ApiAuthConfig,
  type ApiRateLimit,
  type TenantContext,
  type TenantPermission,
} from './api-contract.js';

// Auth middleware
export {
  createAuthMiddleware,
  createRateLimiter,
  type AuthRequest,
  type AuthResult,
} from './auth-middleware.js';
