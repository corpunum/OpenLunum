export const MCP_CONTRACT_VERSION = '0.1.0' as const;

export interface McpToolSpec {
  name: string;
  description: string;
  requiresAuth: boolean;
  rateLimit: { windowMs: number; maxRequests: number };
  maxInputBytes: number;
  timeoutMs: number;
}

export const MCP_DEFAULT_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30 } as const;
export const MCP_MAX_INPUT_BYTES = 524_288 as const; // 512 KB
export const MCP_DEFAULT_TIMEOUT_MS = 30_000 as const;

export const MCP_TOOLS: readonly McpToolSpec[] = [
  { name: 'lunum_parse', description: 'Parse text into Lunum semantic representation', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_realize', description: 'Realize Lunum Sem into natural language', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_render', description: 'Render Lunum Sem with a profile', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_retrieve', description: 'Retrieve records by semantic similarity', requiresAuth: true, rateLimit: { windowMs: 60_000, maxRequests: 10 }, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
  { name: 'lunum_validate', description: 'Validate a Lunum Sem against the schema', requiresAuth: false, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: 5_000 },
  { name: 'lunum_context', description: 'Manage conversation context', requiresAuth: true, rateLimit: MCP_DEFAULT_RATE_LIMIT, maxInputBytes: MCP_MAX_INPUT_BYTES, timeoutMs: MCP_DEFAULT_TIMEOUT_MS },
] as const;

export function getMcpContractManifest(): { version: string; tools: readonly McpToolSpec[] } {
  return { version: MCP_CONTRACT_VERSION, tools: MCP_TOOLS };
}
