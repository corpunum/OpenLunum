#!/usr/bin/env node
// pivot-el-en-v2, step 1: translate the Greek side into English with one translator under the unchanged strict prompt
// (pivot-translate/0.1, decisions/0030) and apply the deterministic guards pivot-guards/0.2. One JSONL row per pair; resumable.
//   node experiments/pivot-el-en-v2/translate.mjs --part dev|heldout --translator qwen|luna --out <file.jsonl> [--limit N]
// --part dev uses pivot-el-en-v1's 20 dev pairs (smoke tests only, never evidence); --part heldout this directory's 200 pairs.
// qwen: Halogen (127.0.0.1:8080), temperature 0, response_format = MEANING_FLAGS_JSON_SCHEMA, reasoning_effort low (as v1).
//       Rig protocol: one call at a time, never in minutes :00-:10 or :30-:40 UTC, wait while Halogen has more than
//       --max-in-flight (default 1) requests in flight or any queued. No client-side header timeout (v1 lost a call to one).
// luna: `codex exec` on the rig's ChatGPT login, gpt-6-luna, model_reasoning_effort=low, read-only sandbox, empty temp cwd,
//       --ephemeral --ignore-user-config --ignore-rules, --output-schema; calls paced >= 20 s apart.
// No reply is not a translation (pre-registered, generalising v1 amendment 2): a call that returns no model text at all
// (HTTP 429 or other transport error, network failure, timeout with no output) writes no row; the same pair is re-asked
// after a wait (10 min after a 429, 2 min otherwise), at most 6 times, then the run stops (re-running resumes).
// Any reply from the model is final, including a malformed one or one that fails the guards.
// Needs packages/core and packages/eval built. --part heldout requires a clean tracked tree (rows record the commit).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MEANING_FLAGS_JSON_SCHEMA, PIVOT_GUARDS_VERSION, PIVOT_PROMPT_VERSION, buildPivotPrompt, checkPivotGuards, parsePivotTranslation } from '../../packages/eval/dist/src/pivot-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

export const TRANSLATORS = {
  qwen: { family: 'alibaba-qwen', model: 'openai/qwen3.8-flash-next-uncensored-lean', host: '127.0.0.1', port: 8080 },
  luna: { family: 'openai', model: 'gpt-6-luna', effort: 'low' },
};
const LUNA_GAP_MS = 20000; const WAIT_429_MS = 600000; const WAIT_OTHER_MS = 120000; const MAX_REASKS = 6;
const SYSTEM = 'You are a careful translator inside a meaning-checking system. Follow the rules exactly. Reply with the requested JSON object only.';

function httpJson(method, pathName, body, timeoutMs) {
  const t = TRANSLATORS.qwen;
  return new Promise((resolve) => {
    const req = http.request({ host: t.host, port: t.port, path: pathName, method, headers: body ? { 'content-type': 'application/json' } : {} }, (res) => {
      let data = ''; res.setEncoding('utf8'); res.on('data', (c) => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch {} resolve({ status: res.statusCode, json, text: data }); });
      res.on('error', (e) => resolve({ status: 0, json: null, text: String(e) }));
    });
    req.on('error', (e) => resolve({ status: 0, json: null, text: String(e) }));
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const busyWindow = () => { const m = new Date().getUTCMinutes(); return m < 10 || (m >= 30 && m < 40); };
async function waitForHalogen(maxInFlight) {
  for (;;) {
    if (!busyWindow()) {
      const h = await httpJson('GET', '/health', null, 5000);
      if (h.json && (h.json.in_flight ?? 0) <= maxInFlight && (h.json.queued ?? 0) === 0) return;
    }
    await sleep(30000);
  }
}

async function askQwen(prompt, maxInFlight) {
  const t = TRANSLATORS.qwen;
  await waitForHalogen(maxInFlight);
  const started = Date.now();
  const r = await httpJson('POST', '/v1/chat/completions', { model: t.model, temperature: 0, max_tokens: 4096, reasoning_effort: 'low',
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    response_format: { type: 'json_schema', json_schema: { name: 'pivot_translation', strict: true, schema: MEANING_FLAGS_JSON_SCHEMA } } }, 1800000);
  const text = r.json?.choices?.[0]?.message?.content ?? '';
  return { text, noReply: !text, status: r.status, reportedModel: r.json?.model ?? null, ms: Date.now() - started,
    error: r.status === 200 && text ? null : `status=${r.status} ${r.text.slice(0, 300)}` };
}

let lastLuna = 0;
async function askLuna(prompt) {
  const t = TRANSLATORS.luna;
  const gap = LUNA_GAP_MS - (Date.now() - lastLuna); if (gap > 0) await sleep(gap);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot2-luna-'));
  try {
    const schemaFile = path.join(cwd, 'schema.json'); const outFile = path.join(cwd, 'last.txt');
    fs.writeFileSync(schemaFile, JSON.stringify(MEANING_FLAGS_JSON_SCHEMA));
    const started = Date.now();
    const r = spawnSync('codex', ['exec', '-m', t.model, '-c', `model_reasoning_effort="${t.effort}"`, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral',
      '--ignore-user-config', '--ignore-rules', '--color', 'never', '--output-schema', schemaFile, '-o', outFile, '-'],
    { cwd, input: `${SYSTEM}\n\n${prompt}`, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 24 });
    lastLuna = Date.now();
    const text = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim() : '';
    const all = `${r.stdout}\n${r.stderr}`;
    const tokens = /tokens used\s+([\d,]+)/u.exec(all)?.[1]?.replace(/,/gu, '') ?? null;
    return { text, noReply: !text, rateLimited: !text && /\b429\b|Too Many Requests/u.test(all), reportedModel: /model:\s*(\S+)/u.exec(r.stderr ?? '')?.[1] ?? null,
      ms: Date.now() - started, tokens: tokens === null ? null : Number(tokens), error: r.status === 0 && text ? null : `exit=${r.status} ${(r.stderr || r.stdout || '').slice(-400)}` };
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

async function main() {
  const part = arg('--part'); const name = arg('--translator'); const outFile = arg('--out');
  if (!['dev', 'heldout'].includes(part) || !TRANSLATORS[name] || !outFile) throw new Error('usage: translate.mjs --part dev|heldout --translator qwen|luna --out file.jsonl [--limit N]');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (part === 'heldout' && spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '') throw new Error('heldout_requires_clean_tracked_tree');
  const pairs = part === 'heldout' ? JSON.parse(fs.readFileSync(path.join(here, 'pairs.json'), 'utf8')).heldout
    : JSON.parse(fs.readFileSync(path.join(root, 'experiments/pivot-el-en-v1/pairs.json'), 'utf8')).dev;
  const limit = Number(arg('--limit', '0'));
  const noReplyFile = outFile.replace(/\.jsonl$/u, '') + '.no-reply.jsonl';
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).pair) : []);
  const maxInFlight = Number(arg('--max-in-flight', '1'));
  let n = 0;
  for (const p of pairs) {
    if (limit && n >= limit) break;
    if (done.has(p.pair)) continue;
    n += 1;
    const prompt = buildPivotPrompt(p.el, 'el');
    let reply;
    for (let attempt = 0; ; attempt += 1) {
      reply = name === 'qwen' ? await askQwen(prompt, maxInFlight) : await askLuna(prompt);
      if (!reply.noReply) break;
      fs.appendFileSync(noReplyFile, JSON.stringify({ pair: p.pair, translator: name, at: new Date().toISOString(), attempt, rateLimited: Boolean(reply.rateLimited), error: reply.error }) + '\n');
      if (attempt >= MAX_REASKS) throw new Error(`${name}_no_reply_giving_up_at_${p.pair}`);
      const wait = reply.rateLimited ? WAIT_429_MS : WAIT_OTHER_MS;
      log({ pair: p.pair, noReply: true, rateLimited: Boolean(reply.rateLimited), waitMs: wait, error: reply.error?.slice(0, 160) });
      await sleep(wait);
    }
    const parsed = parsePivotTranslation(reply.text);
    const row = { pair: p.pair, elHandle: p.elHandle, translator: name, family: TRANSLATORS[name].family, model: TRANSLATORS[name].model, reportedModel: reply.reportedModel,
      promptVersion: PIVOT_PROMPT_VERSION, guardsVersion: PIVOT_GUARDS_VERSION, promptSha256: sha(prompt), commit: head, at: new Date().toISOString(), ms: reply.ms, tokens: reply.tokens ?? null, error: reply.error,
      raw: reply.text, parsed: parsed.ok ? parsed.value : null, parseErrors: parsed.ok ? [] : parsed.errors,
      guards: parsed.ok ? checkPivotGuards(p.el, 'el', parsed.value, 'en') : null };
    fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
    log({ pair: p.pair, ok: parsed.ok, pass: row.guards?.pass ?? false, failures: row.guards?.failures ?? row.parseErrors, ms: row.ms });
  }
  log({ done: true, translator: name, rows: (fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).length : 0) });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
