#!/usr/bin/env node
/**
 * lunum-locator-mcp: an optional MCP server (stdio, newline-delimited JSON-RPC
 * 2.0) with one tool, `lunum_ground`. It is separate from `lunum-mcp` on
 * purpose: the main server's bytes are bound by the frozen served-runtime
 * manifest, and an optional diagnostic must not change them.
 *
 * Configuration (environment):
 *   LUNUM_LOCATOR             'unumsearch' (default) -- the only backend for now
 *   LUNUM_LOCATOR_URL         default http://127.0.0.1:7781
 *   LUNUM_LOCATOR_ROOTS       colon-separated roots (default: derived from /status)
 *   LUNUM_LOCATOR_TIMEOUT_MS  per request (default 1500)
 *
 * Diagnostic only: an `unverified` reference is a flag for a reader to check,
 * never a reason to edit or drop a record.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { groundDiscourse, groundText } from './ground.js';
import { UnumsearchLocator } from './unumsearch.js';
import type { SourceLocator } from './types.js';

export const LOCATOR_MCP_VERSION = '0.1.0' as const;
const PROTOCOL_VERSION = '2025-06-18';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const GROUND_TOOL = {
  name: 'lunum_ground',
  description: 'Check the paths, file names, identifiers, config keys and versions a text mentions against an indexed source corpus and attach file:line provenance. A reference not found is labelled "unverified reference" (a flag to check, never deleted); one outside every indexed root is out_of_scope; a locator that cannot answer gives unavailable. Diagnostic only.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to ground (a message, record or report)' },
      perUnit: { type: 'boolean', description: 'Ground per discourse unit and return unit indexes (default false)', default: false },
      includeGrounded: { type: 'boolean', description: 'Also list grounded references (default true)', default: true },
      maxReferences: { type: 'number', description: 'Maximum references checked (default 200)', default: 200 },
    },
    required: ['text'],
  },
} as const;

export function locatorFromEnv(env: NodeJS.ProcessEnv = process.env): SourceLocator | null {
  const kind = String(env.LUNUM_LOCATOR ?? 'unumsearch').trim().toLowerCase();
  if (kind !== 'unumsearch') return null;
  const roots = String(env.LUNUM_LOCATOR_ROOTS ?? '').split(':').map((r) => r.trim()).filter(Boolean);
  const timeout = Number(env.LUNUM_LOCATOR_TIMEOUT_MS);
  return new UnumsearchLocator({
    ...(env.LUNUM_LOCATOR_URL ? { url: env.LUNUM_LOCATOR_URL } : {}),
    ...(roots.length ? { roots } : {}),
    ...(timeout > 0 ? { timeoutMs: timeout } : {}),
    homeDir: homedir(),
    pathExists: (p: string) => existsSync(p),
  });
}

export async function callGround(locator: SourceLocator, input: Record<string, unknown>): Promise<ToolResult> {
  const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }], isError: true });
  try {
    if (typeof input.text !== 'string') return fail('text is required and must be a string');
    const options = typeof input.maxReferences === 'number' && input.maxReferences > 0 ? { maxReferences: input.maxReferences } : {};
    const report = input.perUnit === true ? await groundDiscourse(input.text, locator, options) : await groundText(input.text, locator, options);
    const references = report.references
      .filter((r) => input.includeGrounded !== false || r.status !== 'grounded')
      .map((r) => ({ ...r, ...(r.status === 'unverified' ? { flag: 'unverified reference' } : {}) }));
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, diagnosticOnly: true, ...report, references }, null, 2) }] };
  } catch (error) {
    return fail((error as Error).message);
  }
}

interface RpcMessage { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/** Handle one JSON-RPC message; returns the response, or null for notifications. */
export async function handleMessage(locator: SourceLocator | null, message: RpcMessage): Promise<Record<string, unknown> | null> {
  const id = message.id ?? null;
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const error = (code: number, text: string) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  if (message.id === undefined) return null;
  switch (message.method) {
    case 'initialize':
      return reply({ protocolVersion: String(message.params?.protocolVersion ?? PROTOCOL_VERSION), capabilities: { tools: {} }, serverInfo: { name: 'lunum-locator-mcp', version: LOCATOR_MCP_VERSION } });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: locator ? [GROUND_TOOL] : [] });
    case 'tools/call': {
      const name = String(message.params?.name ?? '');
      if (!locator || name !== GROUND_TOOL.name) return reply({ content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }) }], isError: true });
      return reply(await callGround(locator, (message.params?.arguments as Record<string, unknown>) ?? {}));
    }
    default:
      return error(-32601, `Method not found: ${message.method}`);
  }
}

export async function serveStdio(locator: SourceLocator | null = locatorFromEnv()): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message: RpcMessage;
    try { message = JSON.parse(line) as RpcMessage; } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      continue;
    }
    const response = await handleMessage(locator, message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await serveStdio();
