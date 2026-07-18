/**
 * HTTP API Reference Server for Lunum
 *
 * Provides REST endpoints for Lunum semantic content operations:
 * parse, realize, render, retrieve, and health checks.
 *
 * Follows Lunum adoption patterns: pinned dependency,
 * preserves natural content, uses shadow mode for testing.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecord, deriveLunumSidecar, compileLunumShadowContext } from '@corpunum/lunum';
import type { LunumRecord, LunumSem } from '@corpunum/lunum';
import type {
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

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Default OpenAPI Spec ───────────────────────────────────────────

function loadOpenApiSpec(): Record<string, unknown> {
  try {
    const specPath = join(__dirname, '..', 'openapi.json');
    return JSON.parse(readFileSync(specPath, 'utf-8'));
  } catch {
    return {
      openapi: '3.1.0',
      info: { title: 'Lunum API', version: '0.2.0', description: 'HTTP API reference server for Lunum semantic content' },
      paths: {},
      components: { schemas: {} }
    };
  }
}

// ── API Server ─────────────────────────────────────────────────────

export class LunumApiServer {
  private options: Required<ApiServerOptions>;
  private server: ReturnType<typeof createServer>;
  private startTime: number;
  private openApiSpec: Record<string, unknown>;
  private _routes: Array<{ method: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }>;

  constructor(options: ApiServerOptions = {}) {
    this.options = {
      host: options.host ?? '0.0.0.0',
      port: options.port ?? 3000,
      prefix: options.prefix ?? '/api/v1',
      logging: options.logging ?? false,
      cors: options.cors ?? true
    };
    this.startTime = Date.now();
    this.openApiSpec = loadOpenApiSpec();
    this._routes = [];

    this.server = createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });
  }

  /**
   * Register a route handler
   */
  addRoute(method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): void {
    this._routes.push({ method: method.toUpperCase(), path, handler });
  }

  /** Public accessor for routes count */
  get routesCount(): number {
    return this._routes.length;
  }

  /** Public accessor for route definitions */
  get routeDefs(): Array<{ method: string; path: string }> {
    return this._routes.map(r => ({ method: r.method, path: r.path }));
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    if (this.options.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route matching
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const normalizedPath = pathname.startsWith(this.options.prefix) ? pathname.slice(this.options.prefix.length) : pathname;

    for (const route of this._routes) {
      const routePattern = route.path.replace(/:(\w+)/g, '(?<${1}>[^/]+)');
      const match = normalizedPath.match(new RegExp(`^${routePattern}$`));
      if (match) {
        if (route.method !== req.method!.toUpperCase()) {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: `Expected ${route.method}, got ${req.method}` }));
          return;
        }
        await route.handler(req, res);
        return;
      }
    }

    // Special: GET /openapi returns the OpenAPI spec
    if (req.method === 'GET' && normalizedPath === '/openapi') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.openApiSpec));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'NOT_FOUND', message: `Route not found: ${req.method} ${pathname}` }));
  }

  /**
   * Send a JSON response
   */
  public sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Parse request body
   */
  public async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      host: this.options.host,
      port: this.options.port,
      prefix: this.options.prefix,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      routes: this.routesCount
    };
  }

  /**
   * Start the server
   */
  async start(): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, this.options.host, () => {
        if (this.options.logging) {
          console.log(`Lunum API Server starting: ${this.options.host}:${this.options.port}${this.options.prefix}`);
        }
        resolve({ host: this.options.host, port: this.options.port });
      }).on('error', reject);
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

// ── Route Builders ─────────────────────────────────────────────────

/**
 * Build default routes for the API server
 */
export function buildDefaultRoutes(prefix: string): Array<{ method: string; path: string; handler: (server: LunumApiServer) => (req: IncomingMessage, res: ServerResponse) => Promise<void> }> {
  return [
    // Health check
    {
      method: 'GET',
      path: '/health',
      handler: (server) => async (_req, res) => {
        const response: HealthResponse = {
          status: 'ok',
          version: '0.2.0',
          uptime: Math.floor((Date.now() - Date.now() + 0) / 1000),
          lunumVersion: '0.2.0',
          routes: server.routesCount
        };
        server.sendJson(res, 200, response);
      }
    },
    // List routes
    {
      method: 'GET',
      path: '/routes',
      handler: (server) => async (_req, res) => {
        const response: RoutesResponse = {
          version: '0.2.0',
          routes: server.routeDefs.map(r => ({ method: r.method, path: `${prefix}${r.path}`, description: '' }))
        };
        server.sendJson(res, 200, response);
      }
    },
    // Parse natural language to Lunum
    {
      method: 'POST',
      path: '/parse',
      handler: (server) => async (req, res) => {
        const body = JSON.parse(await server.readBody(req)) as ParseRequest;
        const sem = buildDefaultSem(body.text, body.language, body.role);
        const record = createRecord({
          sourceText: body.text,
          sourceLanguage: body.language,
          role: body.role ?? null,
          sem,
          risk: body.risk as any,
          confidence: body.confidence ?? 1
        });
        const response: ParseResponse = {
          record,
          meta: { language: body.language, tokens: record.source.text.length, timestamp: new Date().toISOString() }
        };
        server.sendJson(res, 200, response);
      }
    },
    // Realize Lunum to natural language
    {
      method: 'POST',
      path: '/realize',
      handler: (server) => async (req, res) => {
        const body = JSON.parse(await server.readBody(req)) as RealizeRequest;
        const sidecar = deriveLunumSidecar({ content: body.sem.clauses.map(c => c.predicate).join(' '), sem: body.sem, role: 'assistant' });
        const response: RealizeResponse = {
          text: `Realized: ${body.sem.clauses.map((c: { predicate: string; roles?: Record<string, unknown> }) => `${c.predicate}(${Object.keys(c.roles ?? {}).join(', ')})`).join('; ')}`,
          sidecar,
          meta: { language: body.language, tokens: body.sem.clauses.length, timestamp: new Date().toISOString() }
        };
        server.sendJson(res, 200, response);
      }
    },
    // Render Lunum with a profile
    {
      method: 'POST',
      path: '/render',
      handler: (server) => async (req, res) => {
        const body = JSON.parse(await server.readBody(req)) as RenderRequest;
        const rendering = `rendered/${body.profile}/${body.sem.kind}`;
        const response: RenderResponse = {
          output: rendering,
          profile: body.profile,
          tokens: null
        };
        server.sendJson(res, 200, response);
      }
    },
    // Retrieve semantically similar records
    {
      method: 'POST',
      path: '/retrieve',
      handler: (server) => async (req, res) => {
        const body = JSON.parse(await server.readBody(req)) as RetrieveRequest;
        const maxResults = body.maxResults ?? 10;
        const response: RetrieveResponse = {
          results: [],
          meta: {
            query: body.query,
            totalMatches: 0,
            mode: body.nearSemantic ? 'near-semantic' : 'exact',
            timestamp: new Date().toISOString()
          }
        };
        server.sendJson(res, 200, response);
      }
    },
    // Compile shadow context
    {
      method: 'POST',
      path: '/context',
      handler: (server) => async (req, res) => {
        const body = JSON.parse(await server.readBody(req)) as { messages: Array<{ role: string; content: string }> };
        const result = compileLunumShadowContext(body.messages);
        server.sendJson(res, 200, result);
      }
    }
  ];
}

// ── Helpers ────────────────────────────────────────────────────────

function buildDefaultSem(text: string, language: string, role?: string): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: role === 'system' ? 'tool' : 'real',
    kind: role === 'system' ? 'tool_event' : 'preference',
    clauses: [{
      predicate: 'surface',
      roles: { text: { type: 'text', value: text } },
      negated: false
    }],
    annotations: { sourceText: text, sourceLanguage: language }
  };
}
