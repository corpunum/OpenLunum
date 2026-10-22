#!/usr/bin/env node
// Plan stage P, step 1: translate the Greek side of the pairs into English with one translator, under the
// strict pivot prompt (decisions/0030), and apply the deterministic guards. One JSONL row per pair; resumable.
//   node experiments/pivot-el-en-v1/translate.mjs --part dev|heldout --translator qwen|sonnet|luna --out <file.jsonl> [--limit N]
// qwen:   Halogen (OpenAI-compatible, 127.0.0.1:8080), temperature 0, response_format = MEANING_FLAGS_JSON_SCHEMA.
//         Rig protocol: one call at a time, never in minutes :00-:10 or :30-:40 UTC, and wait while Halogen
//         reports more than --max-in-flight requests in flight (live OpenUnum missions share it).
// sonnet: `claude -p` on the CLI subscription login (no API key), claude-sonnet-5-5, no tools, no MCP,
//         a fresh process per item in an empty temp cwd, --json-schema = MEANING_FLAGS_JSON_SCHEMA.
// luna:   `codex exec` on the rig's ChatGPT login, gpt-6-luna, model_reasoning_effort=low, read-only sandbox, empty temp cwd,
//         --ephemeral, --ignore-user-config, --output-schema = MEANING_FLAGS_JSON_SCHEMA. Added by AMENDMENT-1 (owner, 2026-10-22).
//         No retries on a reply: any reply from the model is final. AMENDMENT-2: calls are paced 20 s apart, and a 429
//         (rate limit, no reply) writes no row; the same pair is re-asked after 10 min, at most 6 times, then the run stops.
// Needs packages/core and packages/eval built. Requires a clean tracked tree for --part heldout (the run is bound to a commit).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MEANING_FLAGS_JSON_SCHEMA, PIVOT_PROMPT_VERSION, buildPivotPrompt, checkPivotGuards, parsePivotTranslation } from '../../packages/eval/dist/src/pivot-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TRANSLATORS = {
  qwen: { family: 'alibaba-qwen', model: 'openai/qwen3.8-flash-next-uncensored-lean', url: 'http://127.0.0.1:8080/v1/chat/completions', health: 'http://127.0.0.1:8080/health' },
  sonnet: { family: 'anthropic', model: 'claude-sonnet-5-5' },
  luna: { family: 'openai', model: 'gpt-6-luna', effort: 'low' },
};
const LUNA_GAP_MS = 20000; const LUNA_429_WAIT_MS = 600000; // AMENDMENT-2 pacing
const SYSTEM = 'You are a careful translator inside a meaning-checking system. Follow the rules exactly. Reply with the requested JSON object only.';

const busyWindow = () => { const m = new Date().getUTCMinutes(); return m < 10 || (m >= 30 && m < 40); };
async function waitForHalogen(t, maxInFlight) {
  for (;;) {
    if (!busyWindow()) {
      try { const h = await (await fetch(t.health, { signal: AbortSignal.timeout(5000) })).json(); if ((h.in_flight ?? 0) <= maxInFlight && (h.queued ?? 0) === 0) return; } catch {}
    }
    await sleep(30000);
  }
}

async function askQwen(prompt, maxInFlight) {
  const t = TRANSLATORS.qwen;
  await waitForHalogen(t, maxInFlight);
  const started = Date.now();
  const res = await fetch(t.url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
    body: JSON.stringify({ model: t.model, temperature: 0, max_tokens: 4096, reasoning_effort: 'low',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: { name: 'pivot_translation', strict: true, schema: MEANING_FLAGS_JSON_SCHEMA } } }) });
  const body = await res.json();
  return { text: body.choices?.[0]?.message?.content ?? '', reportedModel: body.model ?? null, ms: Date.now() - started, error: res.ok ? null : JSON.stringify(body).slice(0, 500) };
}

function askSonnet(prompt) {
  const t = TRANSLATORS.sonnet;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-sonnet-'));
  try {
    const r = spawnSync('claude', ['-p', prompt, '--model', t.model, '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--system-prompt', SYSTEM, '--json-schema', JSON.stringify(MEANING_FLAGS_JSON_SCHEMA), '--no-session-persistence', '--permission-mode', 'dontAsk', '--max-budget-usd', '0.20'],
    { cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 24 });
    let out = null; try { out = JSON.parse(r.stdout); } catch {}
    const structured = out?.structured_output ?? null;
    return { text: structured ? JSON.stringify(structured) : (out?.result ?? ''), reportedModel: out?.modelUsage ? Object.keys(out.modelUsage).join(',') : null,
      costUsd: out?.total_cost_usd ?? null, error: r.status === 0 && out && !out.is_error ? null : (r.stderr || r.stdout || '').slice(0, 500) };
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

function askLuna(prompt) {
  const t = TRANSLATORS.luna;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-luna-'));
  try {
    const schemaFile = path.join(cwd, 'schema.json'); const outFile = path.join(cwd, 'last.txt');
    fs.writeFileSync(schemaFile, JSON.stringify(MEANING_FLAGS_JSON_SCHEMA));
    const started = Date.now();
    const r = spawnSync('codex', ['exec', '-m', t.model, '-c', `model_reasoning_effort="${t.effort}"`, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral',
      '--ignore-user-config', '--ignore-rules', '--color', 'never', '--output-schema', schemaFile, '-o', outFile, '-'],
    { cwd, input: `${SYSTEM}\n\n${prompt}`, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 24 });
    const text = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim() : '';
    const rateLimited = !text && /\b429\b|Too Many Requests/u.test(`${r.stdout}\n${r.stderr}`);
    const tokens = /tokens used\s+([\d,]+)/u.exec(`${r.stdout}\n${r.stderr}`)?.[1]?.replace(/,/gu, '') ?? null;
    return { text, rateLimited, reportedModel: /model:\s*(\S+)/u.exec(r.stderr ?? '')?.[1] ?? null, ms: Date.now() - started, tokens: tokens === null ? null : Number(tokens),
      error: r.status === 0 && text ? null : `exit=${r.status} ${(r.stderr || r.stdout || '').slice(-500)}` };
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

async function main() {
  const part = arg('--part'); const name = arg('--translator'); const outFile = arg('--out');
  if (!['dev', 'heldout'].includes(part) || !TRANSLATORS[name] || !outFile) throw new Error('usage: translate.mjs --part dev|heldout --translator qwen|sonnet|luna --out file.jsonl [--limit N]');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (part === 'heldout' && spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '') throw new Error('heldout_requires_clean_tracked_tree');
  const pairs = JSON.parse(fs.readFileSync(path.join(here, 'pairs.json'), 'utf8'))[part];
  const limit = Number(arg('--limit', '0'));
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).pair) : []);
  const maxInFlight = Number(arg('--max-in-flight', '1'));
  let n = 0;
  for (const p of pairs) {
    if (limit && n >= limit) break;
    if (done.has(p.pair)) continue;
    n += 1;
    const prompt = buildPivotPrompt(p.el, 'el');
    const started = Date.now();
    let reply;
    if (name === 'luna') {
      // AMENDMENT-2: a 429 (no reply from the model) is not a translation: no row, wait, re-ask the same pair; give up the run after 6 waits.
      for (let wait = 0; ; wait += 1) {
        await sleep(LUNA_GAP_MS);
        reply = askLuna(prompt);
        if (!reply.rateLimited) break;
        if (wait >= 6) throw new Error(`luna_rate_limited_giving_up_at_${p.pair}`);
        console.log(JSON.stringify({ pair: p.pair, rateLimited: true, waitMs: LUNA_429_WAIT_MS }));
        await sleep(LUNA_429_WAIT_MS);
      }
    } else reply = name === 'qwen' ? await askQwen(prompt, maxInFlight) : askSonnet(prompt);
    const parsed = parsePivotTranslation(reply.text);
    const row = { pair: p.pair, elHandle: p.elHandle, translator: name, family: TRANSLATORS[name].family, model: TRANSLATORS[name].model, reportedModel: reply.reportedModel,
      promptVersion: PIVOT_PROMPT_VERSION, promptSha256: sha(prompt), commit: head, ms: reply.ms ?? Date.now() - started, costUsd: reply.costUsd ?? 0, tokens: reply.tokens ?? null, error: reply.error,
      raw: reply.text, parsed: parsed.ok ? parsed.value : null, parseErrors: parsed.ok ? [] : parsed.errors,
      guards: parsed.ok ? checkPivotGuards(p.el, 'el', parsed.value, 'en', { version: 'pivot-guards/0.1' }) : null };
    fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ pair: p.pair, ok: parsed.ok, pass: row.guards?.pass ?? false, failures: row.guards?.failures ?? row.parseErrors, ms: row.ms }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
