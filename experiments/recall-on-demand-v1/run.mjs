#!/usr/bin/env node
// recall-on-demand-v1 runner (see PREREGISTRATION.md). Private data lives in $ROD_PRIVATE.
//   ROD_PRIVATE=<dir> node experiments/recall-on-demand-v1/run.mjs freeze <transcript.jsonl>
//   ROD_PRIVATE=<dir> node experiments/recall-on-demand-v1/run.mjs build|questions|answers|score
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planDiscourseCompaction, segmentDiscourse, literalSpellings } from '../../packages/core/dist/src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRIV = process.env.ROD_PRIVATE;
if (!PRIV) { console.error('set ROD_PRIVATE to a private directory'); process.exit(2); }
fs.mkdirSync(PRIV, { recursive: true, mode: 0o700 });
const P = (f) => path.join(PRIV, f);
const sha = (t) => createHash('sha256').update(t).digest('hex');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, v) => fs.writeFileSync(f, `${JSON.stringify(v, null, 1)}\n`, { mode: 0o600 });
const BUDGET_CHARS = 30000, POINTS = 10, MIN_HISTORY = 300, PER_POINT = 4, CAP_USD = 8, MODEL = 'haiku';

// ---- freeze ----------------------------------------------------------------------------------------------------
function freeze(src) {
  const raw = fs.readFileSync(src);
  fs.writeFileSync(P('transcript.jsonl'), raw, { mode: 0o600 });
  writeJson(P('freeze.json'), { sha256: sha(raw), bytes: raw.length, frozenAt: new Date().toISOString() });
  console.log({ sha256Prefix: sha(raw).slice(0, 16), bytes: raw.length });
}

// ---- messages, as in session-transcript-compaction-v1 ---------------------------------------------------------
function messages() {
  const out = [];
  const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('\n') : '');
  for (const line of fs.readFileSync(P('transcript.jsonl'), 'utf8').split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const m = e.message; if (!m || (e.type !== 'user' && e.type !== 'assistant')) continue;
    if (typeof m.content === 'string') { if (m.content.trim()) out.push({ id: out.length, role: e.type, content: m.content, ownerText: e.type === 'user' }); continue; }
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === 'text' && b.text?.trim()) out.push({ id: out.length, role: e.type, content: b.text, ownerText: e.type === 'user' });
      else if (b.type === 'tool_use') out.push({ id: out.length, role: 'tool_call', content: `${b.name} ${JSON.stringify(b.input)}` });
      else if (b.type === 'tool_result') { const t = textOf(b.content); if (t.trim()) out.push({ id: out.length, role: 'tool', content: t }); }
    }
  }
  return out;
}

// ---- build: points, budget views, store, items -----------------------------------------------------------------
function build() {
  const msgs = messages();
  const frozenPath = readJson(P('freeze.json'));
  const boundaries = msgs.filter((m) => m.ownerText && m.id >= MIN_HISTORY && !/^<|^\[SYSTEM|^Stop hook/u.test(m.content.trim())).map((m) => m.id);
  const chosen = [...new Set(Array.from({ length: POINTS }, (_, k) => boundaries[Math.floor((k + 0.5) * boundaries.length / POINTS)]))];
  const points = [];
  const usedLiterals = new Set(); // a literal is used at one point only, so items are not repeated across points
  for (const end of chosen) {
    const history = msgs.slice(0, end);
    const plan = planDiscourseCompaction(history.map(({ id, role, content }) => ({ id, role, content })));
    const view = []; let chars = 0;
    for (let i = plan.messages.length - 1; i >= 0; i--) {
      const m = plan.messages[i];
      if (chars + m.content.length > BUDGET_CHARS) break;
      view.unshift({ role: m.role, content: m.content, id: m.id }); chars += m.content.length;
    }
    const inView = new Set(view.map((m) => m.id));
    const viewText = view.map((m) => m.content).join('\n');
    const store = [];
    for (const m of history) for (const u of segmentDiscourse(m.content)) store.push({ message: m.id, role: m.role, text: m.content.slice(u.start, u.end) });
    // candidate facts outside the view
    const msgCount = new Map();
    for (const m of history) for (const l of new Set(literalSpellings(m.content))) msgCount.set(l, (msgCount.get(l) ?? 0) + 1);
    const seen = new Set(); const cands = [];
    for (const u of store) {
      if (inView.has(u.message)) continue;
      for (const l of new Set(literalSpellings(u.text))) {
        if (seen.has(l) || usedLiterals.has(l) || l.length < 4 || viewText.includes(l) || (msgCount.get(l) ?? 0) > 3) continue;
        if (/^\d{1,4}$/u.test(l) || l.includes('aeb7c739') || l.includes('/tmp/claude-0')) continue;
        seen.add(l); cands.push({ literal: l, source: u.text.slice(0, 600), message: u.message });
      }
    }
    cands.sort((a, b) => sha(`rod-v1:${a.literal}`).localeCompare(sha(`rod-v1:${b.literal}`)));
    const items = cands.slice(0, PER_POINT);
    for (const it of items) usedLiterals.add(it.literal);
    const key = `p${end}`;
    writeJson(P(`${key}-view.json`), view); writeJson(P(`${key}-store.json`), store);
    points.push({ key, end, viewChars: chars, viewMessages: view.length, historyMessages: history.length, storeUnits: store.length, candidates: cands.length, items });
  }
  writeJson(P('points.json'), { transcriptSha256: frozenPath.sha256, points });
  console.log(points.map((p) => ({ key: p.key, hist: p.historyMessages, view: p.viewMessages, chars: p.viewChars, cands: p.candidates, items: p.items.length })));
}

// ---- model calls -------------------------------------------------------------------------------------------------
let spent = fs.existsSync(P('spent.json')) ? readJson(P('spent.json')).usd : 0;
function claude(prompt, { recallStore } = {}) {
  if (spent >= CAP_USD) throw new Error(`cap reached: $${spent.toFixed(4)}`);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rod-'));
  const mcp = recallStore
    ? { mcpServers: { recall: { command: process.execPath, args: [path.join(HERE, 'recall-mcp.mjs')], env: { RECALL_STORE: recallStore } } } }
    : { mcpServers: {} };
  const args = ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp),
    '--output-format', 'json', '--no-session-persistence', '--permission-mode', 'dontAsk'];
  if (recallStore) args.push('--allowedTools', 'mcp__recall__recall');
  const r = spawnSync('claude', args, { cwd, input: prompt, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
  fs.rmSync(cwd, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${String(r.stderr).slice(0, 300)} ${String(r.stdout).slice(0, 300)}`);
  const out = JSON.parse(r.stdout);
  const u = out.usage || {};
  spent += Number(out.total_cost_usd || 0); writeJson(P('spent.json'), { usd: spent });
  return { text: String(out.result || ''), cost: Number(out.total_cost_usd || 0), turns: Number(out.num_turns || 0), model: Object.keys(out.modelUsage ?? {}),
    inputTokens: Number(u.input_tokens || 0) + Number(u.cache_creation_input_tokens || 0) + Number(u.cache_read_input_tokens || 0) };
}
const parseJsonBlock = (t) => { const m = t.match(/```(?:json)?\s*([\s\S]*?)```/u); return JSON.parse(m ? m[1] : t.slice(t.search(/[[{]/u))); };
const norm = (s) => String(s).toLowerCase().normalize('NFKC');
function correct(answer, literal) { // stage-1 / lunum-graded-qa rule
  const a = norm(answer), l = norm(literal);
  if (/^\d+(?:[.,]\d+)?$/u.test(literal)) return new RegExp(`(^|[^\\d.,])${l.replace(/[.]/gu, '\\.')}(?![\\d])`, 'u').test(a);
  return a.includes(l);
}

function questions() {
  const pts = readJson(P('points.json'));
  if (fs.existsSync(P('questions.json'))) { console.log('questions frozen already'); return; }
  const out = { points: [], cost: 0 };
  for (const p of pts.points) {
    if (!p.items.length) { out.points.push({ key: p.key, items: [] }); continue; }
    const prompt = ['You write quiz questions about an earlier conversation between a developer and an AI coding agent.',
      'For each item, write ONE short question whose exact answer is the given value, using the excerpt for context.',
      'The question must NOT contain the value itself. Refer to it by what it is (e.g. "Which commit…", "What path…", "How many…").',
      'Reply with only a JSON array of strings, one question per item, in order.', '',
      ...p.items.map((it, k) => `Item ${k + 1}. Value: ${it.literal}\nExcerpt: ${it.source}`)].join('\n');
    const r = claude(prompt);
    out.cost += r.cost;
    let qs = []; try { qs = parseJsonBlock(r.text); } catch { qs = []; }
    out.points.push({ key: p.key, items: p.items.map((it, k) => {
      const q = typeof qs[k] === 'string' ? qs[k] : '';
      return { literal: it.literal, source: it.source, question: q, rejected: !q || norm(q).includes(norm(it.literal)) };
    }) });
    console.log(p.key, `$${r.cost.toFixed(4)}`);
  }
  writeJson(P('questions.json'), out);
}

const CONDITIONS = ['A', 'B', 'C'];
function answers() {
  const q = readJson(P('questions.json'));
  const outFile = P('answers.json');
  const done = fs.existsSync(outFile) ? readJson(outFile) : { results: [] };
  const have = new Set(done.results.filter((r) => r.call).map((r) => `${r.point}|${r.condition}`));
  for (const p of q.points) {
    const items = p.items.filter((i) => !i.rejected);
    if (!items.length) continue;
    const view = readJson(P(`${p.key}-view.json`));
    for (const c of CONDITIONS) {
      if (have.has(`${p.key}|${c}`)) continue;
      const context = view.map((m) => `[${m.role}]\n${m.content}`).join('\n\n')
        + (c === 'C' ? `\n\n${items.map((it) => `[earlier excerpt]\n${it.source}`).join('\n\n')}` : '');
      const prompt = [
        'Below is the context an AI agent had at one turn of a conversation (role-labelled messages). Answer each question.',
        c === 'B' ? 'The context is only the recent part of the conversation. You have a tool, recall(query), that searches the full earlier conversation; use it whenever the context does not state the answer.' : 'Use only this context.',
        'Give the exact value (identifier, path, number, version, hash, date) as written. If you cannot find it, answer "unknown".',
        'Reply with only a JSON array of strings, one answer per question, in order.', '', '<context>', context, '</context>', '',
        ...items.map((it, k) => `Q${k + 1}. ${it.question}`)].join('\n');
      const res = claude(prompt, c === 'B' ? { recallStore: P(`${p.key}-store.json`) } : {});
      let ans = []; try { ans = parseJsonBlock(res.text); } catch { ans = []; }
      items.forEach((it, k) => {
        const a = typeof ans[k] === 'string' ? ans[k] : String(ans[k] ?? '');
        done.results.push({ point: p.key, condition: c, literal: it.literal, answer: a, correct: correct(a, it.literal) });
      });
      done.results.push({ point: p.key, condition: c, call: true, cost: res.cost, inputTokens: res.inputTokens, turns: res.turns, model: res.model, parsed: Array.isArray(ans) ? ans.length : 0, expected: items.length });
      writeJson(outFile, done);
      console.log(`${p.key} ${c}: ${res.inputTokens} input tokens, ${res.turns} turns, $${res.cost.toFixed(4)} (total $${spent.toFixed(4)})`);
    }
  }
}

function score() {
  const pts = readJson(P('points.json'));
  const q = readJson(P('questions.json'));
  const a = readJson(P('answers.json')).results;
  const items = a.filter((r) => !r.call), calls = a.filter((r) => r.call);
  const per = Object.fromEntries(CONDITIONS.map((c) => {
    const xs = items.filter((r) => r.condition === c), cs = calls.filter((r) => r.condition === c);
    return [c, { questions: xs.length, correct: xs.filter((r) => r.correct).length, accuracy: xs.length ? +(xs.filter((r) => r.correct).length / xs.length).toFixed(4) : null,
      calls: cs.length, inputTokens: cs.reduce((s, r) => s + r.inputTokens, 0), meanInputTokensPerCall: cs.length ? Math.round(cs.reduce((s, r) => s + r.inputTokens, 0) / cs.length) : null,
      turns: cs.reduce((s, r) => s + r.turns, 0), unparsedCalls: cs.filter((r) => r.parsed !== r.expected).length, models: [...new Set(cs.flatMap((r) => r.model))] }];
  }));
  const bar1 = per.B.accuracy - per.A.accuracy >= 0.30, bar2 = per.B.accuracy >= 0.60;
  const results = { format: 'recall-on-demand-v1/1.0', aggregatesOnly: true, transcriptSha256Prefix: pts.transcriptSha256.slice(0, 16),
    points: pts.points.length, itemsSelected: pts.points.reduce((s, p) => s + p.items.length, 0),
    questions: { generated: q.points.reduce((s, p) => s + p.items.length, 0), rejected: q.points.reduce((s, p) => s + p.items.filter((i) => i.rejected).length, 0) },
    budgetChars: BUDGET_CHARS, conditions: per,
    bars: { bar1: { rule: 'accuracy B >= accuracy A + 0.30', value: +(per.B.accuracy - per.A.accuracy).toFixed(4), pass: bar1 },
            bar2: { rule: 'accuracy B >= 0.60', value: per.B.accuracy, pass: bar2 } },
    pass: bar1 && bar2,
    costUsd: { questions: +q.cost.toFixed(4), answers: +calls.reduce((s, r) => s + r.cost, 0).toFixed(4), total: +spent.toFixed(4) } };
  fs.writeFileSync(path.join(HERE, 'results.json'), `${JSON.stringify(results, null, 1)}\n`);
  console.log(JSON.stringify(results, null, 1));
}

const stage = process.argv[2];
const stages = { freeze: () => freeze(process.argv[3]), build, questions, answers, score };
if (!stages[stage]) { console.error(`usage: run.mjs ${Object.keys(stages).join('|')}`); process.exit(2); }
stages[stage]();
