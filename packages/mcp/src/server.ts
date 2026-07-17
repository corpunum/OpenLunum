/**
 * MCP Server implementation for Lunum integration
 * 
 * Provides a reference implementation of an MCP server that enables
 * AI agents to interact with Lunum semantic content.
 */

import type { LunumMcpServerOptions, LunumToolDefinition, LunumContextItem } from './types.js';
import { lunumTools } from './tools.js';
import { LunumContextManager } from './context.js';

// ── MCP Server Interfaces ───────────────────────────────────────────

export interface McpServer {
  name: string;
  version: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  resources: Array<Record<string, unknown>>;
  prompts: Array<Record<string, unknown>>;
}

// ── Server Implementation ───────────────────────────────────────────

export class LunumMcpServer {
  private server: McpServer;
  private contextManager: LunumContextManager;
  private tools: LunumToolDefinition[];
  private options: LunumMcpServerOptions;

  constructor(options: LunumMcpServerOptions = {}) {
    this.server = {
      name: options.serverInfo?.name ?? 'lunum-mcp',
      version: options.serverInfo?.version ?? '0.2.0',
      tools: [],
      resources: [],
      prompts: []
    };
    this.contextManager = new LunumContextManager({
      maxItems: options.maxContextItems ?? 1000
    });
    this.tools = options.enableValidation !== false ? lunumTools : lunumTools;
    this.options = options;
  }

  /**
   * Get the MCP server instance
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Get the context manager
   */
  getContextManager(): LunumContextManager {
    return this.contextManager;
  }

  /**
   * Add a custom tool
   */
  addTool(tool: LunumToolDefinition): void {
    this.tools.push(tool);
    this.server.tools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    });
  }

  /**
   * Get all tools
   */
  getTools(): LunumToolDefinition[] {
    return this.tools;
  }

  /**
   * Handle a tool call
   */
  async handleToolCall(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    return tool.handler(input);
  }

  /**
   * Get context statistics
   */
  getContextStats() {
    return this.contextManager.getStats();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    console.log(`Lunum MCP Server starting: ${this.server.name}@${this.server.version}`);
    console.log(`Available tools: ${this.tools.length}`);
    console.log(`Context capacity: ${this.options.maxContextItems ?? 1000} items`);
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    console.log('Lunum MCP Server stopping');
  }
}

/**
 * Create a configured Lunum MCP server
 */
export function createLunumMcpServer(options: LunumMcpServerOptions = {}): LunumMcpServer {
  return new LunumMcpServer(options);
}