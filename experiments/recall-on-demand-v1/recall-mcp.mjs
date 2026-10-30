#!/usr/bin/env node
// Minimal stdio MCP server with one tool, `recall(query)`: a deterministic term search over a
// frozen store of history units (JSON file in RECALL_STORE: [{message, role, text}]).
// Scoring: +1 per distinct query term (2+ letters/digits, case-insensitive) found in the unit,
// +3 if the whole query occurs; ties go to the later message. Top 5 units, 800 chars each.
// No dependencies, no network. Experiment code (recall-on-demand-v1), not a product surface.
import fs from 'node:fs';
import readline from 'node:readline';

const units = JSON.parse(fs.readFileSync(process.env.RECALL_STORE, 'utf8'));
const lower = units.map((u) => u.text.toLowerCase());
const TOOL = {
  name: 'recall',
  description: 'Search the full earlier conversation (verbatim, including tool outputs) for text matching the query. Returns up to 5 matching excerpts with their message number and role. Use it when the context you were given does not state what you need.',
  inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words, names, paths or numbers to look for' } }, required: ['query'] },
};

export function search(query, k = 5) {
  const q = String(query ?? '').toLowerCase().trim();
  const terms = [...new Set(q.match(/[\p{L}\p{N}][\p{L}\p{N}._\/-]*[\p{L}\p{N}]/gu) ?? [])];
  if (!terms.length) return [];
  const scored = [];
  lower.forEach((t, i) => {
    let s = 0;
    for (const term of terms) if (t.includes(term)) s += 1;
    if (q.length > 3 && t.includes(q)) s += 3;
    if (s > 0) scored.push({ i, s });
  });
  scored.sort((a, b) => b.s - a.s || units[b.i].message - units[a.i].message);
  return scored.slice(0, k).map(({ i }) => units[i]);
}

function reply(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }
function fail(id, code, message) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`); }

if (process.env.RECALL_STORE && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    const { id, method, params } = msg;
    if (method === 'initialize') return reply(id, { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'recall', version: '0.1.0' } });
    if (method === 'ping') return reply(id, {});
    if (method === 'tools/list') return reply(id, { tools: [TOOL] });
    if (method === 'tools/call') {
      if (params?.name !== 'recall') return fail(id, -32602, 'unknown tool');
      const hits = search(params?.arguments?.query);
      const text = hits.length ? hits.map((u) => `[message ${u.message}, ${u.role}]\n${u.text.slice(0, 800)}`).join('\n\n---\n\n') : 'No matches.';
      return reply(id, { content: [{ type: 'text', text }] });
    }
    if (id !== undefined) fail(id, -32601, 'method not found');
  });
}
