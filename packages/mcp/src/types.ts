/**
 * MCP (Model Context Protocol) types for Lunum integration
 */

// Local type definitions for MCP reference implementation
export type LunumRecord = Record<string, unknown>;
export type LunumSem = Record<string, unknown>;
export type Risk = 'low' | 'medium' | 'high' | 'unknown';

// ── MCP Server Options ──────────────────────────────────────────────

export interface LunumMcpServerOptions {
  /** Server name and version */
  serverInfo?: {
    name: string;
    version: string;
  };
  /** Maximum context items to store */
  maxContextItems?: number;
  /** Default risk threshold for filtering */
  defaultRiskThreshold?: Risk;
  /** Enable/disable semantic validation */
  enableValidation?: boolean;
  /** Custom Lunum instance for parsing/realization */
  lunumInstance?: unknown;
}

// ── Tool Definitions ────────────────────────────────────────────────

export interface LunumToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /** MCP behaviour hints; tools without them get PURE_TOOL_ANNOTATIONS. */
  annotations?: LunumToolAnnotations;
  /** Handler function */
  handler: (input: Record<string, unknown>) => Promise<McpToolResponse>;
}

/** MCP tool annotations (hints for clients; they are not a security boundary). */
export interface LunumToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * The public Lunum tools are deterministic functions of their input: no
 * file, network or session writes. Without these hints clients in a
 * prompting posture ask for approval on every call (OpenClaw 2026.11.3
 * `mcp probe`: "tools have no safety annotations").
 */
export const PURE_TOOL_ANNOTATIONS: Readonly<LunumToolAnnotations> = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export interface McpToolResponse {
  /** Response content */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  /** Optional error message */
  isError?: boolean;
}

// ── Context Management ──────────────────────────────────────────────

export interface LunumContextItem {
  /** Unique identifier */
  id: string;
  /** Semantic content */
  record: LunumRecord;
  /** When added */
  timestamp: number;
  /** Source of the content */
  source?: string | undefined;
  /** Metadata */
  metadata?: Record<string, unknown> | undefined;
}

export interface ContextQueryOptions {
  /** Filter by risk level */
  riskFilter?: Risk | 'all';
  /** Maximum number of results */
  maxResults?: number;
  /** Keyword search */
  searchQuery?: string;
}

export interface ContextStats {
  /** Total items in context */
  totalItems: number;
  /** Items by risk level */
  riskDistribution: Record<Risk, number>;
  /** Items by category */
  categoryDistribution: Record<string, number>;
}
