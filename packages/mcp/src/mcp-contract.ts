/**
 * MCP (Model Context Protocol) Contract
 *
 * Defines versioned tool specifications and authentication/rate limiting policies
 * for Lunum MCP server tools.
 */

export const MCP_CONTRACT_VERSION = '1.0.0' as const;

export interface McpToolSpec {
  name: string;
  description: string;
  version: string;
  requiresAuth: boolean;
  rateLimit: McpRateLimit;
  maxInputBytes: number;
  timeoutMs: number;
}

export interface McpRateLimit {
  windowMs: number;
  maxRequests: number;
  scope: 'global' | 'per-tenant';
}

export const MCP_DEFAULT_RATE_LIMIT: McpRateLimit = { windowMs: 60_000, maxRequests: 30, scope: 'per-tenant' } as const;
export const MCP_STRICT_RATE_LIMIT: McpRateLimit = { windowMs: 60_000, maxRequests: 10, scope: 'per-tenant' } as const;
export const MCP_MAX_INPUT_BYTES = 524_288 as const; // 512 KB
export const MCP_DEFAULT_TIMEOUT_MS = 30_000 as const;

export const MCP_TOOLS: readonly McpToolSpec[] = [
  { name: 'lunum_parse', version: '1.0.0', description: 'Parse text into Lunum semantic representation', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_realize', version: '1.0.0', description: 'Realize Lunum Sem into natural language', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_render', version: '1.0.0', description: 'Render Lunum Sem with a profile', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_retrieve', version: '1.0.0', description: 'Retrieve records by semantic similarity', requiresAuth: true, rateLimit: MCP_STRICT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_validate', version: '1.0.0', description: 'Validate a Lunum Sem against the schema', requiresAuth: false, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: 5_000 },
  { name: 'lunum_context', version: '1.0.0', description: 'Manage conversation context', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
] as const;

export function getMcpContractManifest(): { version: string; tools: readonly McpToolSpec[] } {
  return { version: MCP_CONTRACT_VERSION, tools: MCP_TOOLS };
}
