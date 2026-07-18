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
  ErrorResponse,
  RoutesResponse
} from './types.js';
