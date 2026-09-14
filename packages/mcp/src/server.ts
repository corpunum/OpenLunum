import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { LunumToolDefinition } from './types.js';
import { lunumTools } from './tools.js';

export function createLunumMcpServer(tools?: LunumToolDefinition[]): Server {
  const allTools = tools ?? lunumTools;
  const handlerMap = new Map(allTools.map((t) => [t.name, t]));

  const server = new Server(
    { name: 'lunum-mcp', version: '0.2.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = handlerMap.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Unknown tool: ${request.params.name}` }) }],
        isError: true,
      } as Record<string, unknown>;
    }
    return tool.handler(request.params.arguments ?? {}) as unknown as Record<string, unknown>;
  });

  return server;
}
