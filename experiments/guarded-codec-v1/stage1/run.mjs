#!/usr/bin/env node
// Guarded codec v1, stage 1 runner (see ../STAGE1-PREREGISTRATION.md and its amendment).
//
//   node run.mjs select      export the 15 held-out sessions (read-only) into the private run dir
//   node run.mjs points      OpenUnum's lunum-discourse-measure --dump-points on that export
//   node run.mjs questions   OpenUnum's lunum-graded-qa --stage questions (Haiku; frozen before answering)
//   node run.mjs build       the five conditions for the questioned points: verbatim, discourse, pruned,
//                            guarded (+verify +fallback +pointers), discourse+guarded; violations and expansion
//   node run.mjs answers     Haiku answers per (point, condition), the harness's prompt and grading, usage tokens
//   node run.mjs score       aggregates and the four bars -> results.json (aggregates only, safe to commit)
//
// Private data (sessions, prompts, questions, answers) stays under ~/lunum-runs/codec-s1/private (mode 700).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { segmentDiscourse } from '../../../packages/core/dist/src/index.js';
import { verifyCompaction, expandCompaction, sha256Text } from '../../../packages/eval/dist/src/guarded-codec.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPENUNUM = process.env.OPENUNUM_REPO || path.join(os.homedir(), 'main');
const PYTHON = process.env.PRUNE_PYTHON || path.join(os.homedir(), 'llm-env/bin/python');
const RUN = path.join(os.homedir(), 'lunum-runs/codec-s1/private/stage1');
const POINTS = path.join(RUN, 'points');
const QA = path.join(RUN, 'qa');
const VIEWS = path.join(RUN, 'views');
const RATE = 0.5;            // pre-registered pruning rate
const KEEP_TAIL = 4;         // the last 4 messages are never compressed
const CONDITIONS = ['verbatim', 'discourse', 'pruned', 'guarded', 'discourse_guarded'];

const mkPrivate = (d) => { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); fs.chmodSync(d, 0o700); };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 1), { mode: 0o600 });
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}: ${String(r.stderr).slice(-1500)}`);
  return r.stdout;
}

function select() {
  mkPrivate(RUN);
  const db = path.join(os.homedir(), '.openunum/openunum.db');
  const sql = `WITH eligible AS (SELECT session_id, count(*) n, min(created_at) first_at FROM messages GROUP BY session_id
    HAVING first_at >= '2026-10-09' AND n >= 200), chosen AS (SELECT session_id FROM eligible ORDER BY n DESC, session_id LIMIT 15)
    SELECT id, session_id, role, content, created_at, assets, origin, lunum_meta_json FROM messages
    WHERE session_id IN (SELECT session_id FROM chosen) ORDER BY session_id, id;`;
  const rows = JSON.parse(sh('sqlite3', ['-readonly', '-json', db, sql]) || '[]');
  writeJson(path.join(RUN, 'sessions.json'), rows);
  console.log(JSON.stringify({ sessions: new Set(rows.map((r) => r.session_id)).size, messages: rows.length }));
}

function points() {
  mkPrivate(POINTS);
  sh('node', [path.join(OPENUNUM, 'scripts/lunum-discourse-measure.mjs'), path.join(RUN, 'sessions.json'), path.join(RUN, 'points-summary.json'), '--dump-points', POINTS]);
  console.log(JSON.stringify({ dumpFiles: fs.readdirSync(POINTS).length }));
}

function questions() {
  mkPrivate(QA);
  sh('node', [path.join(OPENUNUM, 'scripts/lunum-graded-qa.mjs'), path.join(RUN, 'sessions.json'), POINTS, QA, '--stage', 'questions'], { stdio: 'inherit' });
}

// ---- compression -------------------------------------------------------------------------------------------------
const GREEK = /[Ͱ-Ͽἀ-῿]/u;
const langOf = (text) => (GREEK.test(text) ? 'el' : 'en');
const PRUNABLE = new Set(['sentence', 'list_item', 'heading', 'table_row']);

function prune(rows) {
  if (!rows.length) return new Map();
  const input = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const out = sh(PYTHON, ['-I', path.join(HERE, 'prune.py'), '--rate', String(RATE)], { input, timeout: 0 });
  return new Map(out.trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r.view]));
}

/** Compress the messages of one prompt (all but the last KEEP_TAIL); returns messages + codec accounting. */
function compress(messages, { guard, store, tag }) {
  const plan = [];                                   // per message: list of {unit, start, end, lang, prunable}
  const rows = [];
  messages.forEach((m, mi) => {
    const text = typeof m.content === 'string' ? m.content : '';
    const units = mi < messages.length - KEEP_TAIL && text ? segmentDiscourse(text) : [];
    const list = units.map((u, ui) => {
      const id = `${tag}:${mi}:${ui}`;
      const src = text.slice(u.start, u.end);
      const prunable = PRUNABLE.has(u.kind) && /\w/u.test(src);
      if (prunable) rows.push({ id, text: src, lang: langOf(src), guard });
      return { id, start: u.start, end: u.end, src, lang: langOf(src), prunable };
    });
    plan.push(list);
  });
  const views = prune(rows);
  const codecUnits = { en: [], el: [] };
  let fallbacks = 0, violationsBefore = 0;
  const out = messages.map((m, mi) => {
    const text = typeof m.content === 'string' ? m.content : '';
    if (!plan[mi].length) return m;
    let result = '', at = 0;
    for (const u of plan[mi]) {
      let view = u.prunable ? (views.get(u.id) ?? u.src) : u.src;
      let unit = { id: u.id, source: u.src, view: view === '' ? null : view, pointer: null };
      if (unit.view === null) { store.set(u.id, u.src); unit.pointer = { ref: u.id, sha256: sha256Text(u.src) }; }
      if (guard) {
        // verify this unit; a unit that breaks an invariant is shown verbatim (fallback)
        const v = verifyCompaction([unit], u.lang);
        if (!v.ok) { violationsBefore += 1; fallbacks += 1; unit = { id: u.id, source: u.src, view: u.src, pointer: null }; }
      }
      codecUnits[u.lang].push(unit);
      result += text.slice(at, u.start) + (unit.view === null ? `[omitted ${unit.pointer.ref.split(':').slice(-2).join('.')}]` : unit.view);
      at = u.end;
    }
    return { ...m, content: result + text.slice(at) };
  });
  return { messages: out, codecUnits, fallbacks, violationsBefore };
}

function codecReport(codecUnits, store) {
  let violations = 0, units = 0, sourceChars = 0, viewChars = 0;
  const byKind = {};
  for (const lang of ['en', 'el']) {
    if (!codecUnits[lang].length) continue;
    const v = verifyCompaction(codecUnits[lang], lang);
    violations += v.violations.length; units += v.units; sourceChars += v.sourceChars; viewChars += v.viewChars;
    for (const x of v.violations) byKind[x.kind] = (byKind[x.kind] || 0) + 1;
  }
  let expansionExact = true;
  for (const lang of ['en', 'el']) {
    try {
      const back = expandCompaction(codecUnits[lang], (ref) => store.get(ref));
      if (back.some((t, i) => t !== codecUnits[lang][i].source)) expansionExact = false;
    } catch { expansionExact = false; }
  }
  return { units, violations, byKind, sourceChars, viewChars, expansionExact };
}

function build() {
  mkPrivate(VIEWS);
  const q = readJson(path.join(QA, 'questions.json'));
  const report = [];
  for (const p of q.points) {
    const off = readJson(path.join(POINTS, `${p.key}-off.json`));
    const on = readJson(path.join(POINTS, `${p.key}-on.json`));
    const store = new Map();
    const pruned = compress(off.messages, { guard: false, store, tag: `${p.key}:pruned` });
    const guarded = compress(off.messages, { guard: true, store, tag: `${p.key}:guarded` });
    const dGuarded = compress(on.messages, { guard: true, store, tag: `${p.key}:dguarded` });
    const views = { verbatim: off.messages, discourse: on.messages, pruned: pruned.messages, guarded: guarded.messages, discourse_guarded: dGuarded.messages };
    for (const c of CONDITIONS) writeJson(path.join(VIEWS, `${p.key}-${c}.json`), { key: p.key, condition: c, messages: views[c] });
    const chars = Object.fromEntries(CONDITIONS.map((c) => [c, views[c].reduce((s, m) => s + String(m.content || '').length, 0)]));
    report.push({ key: p.key, chars,
      pruned: codecReport(pruned.codecUnits, store),
      guarded: { ...codecReport(guarded.codecUnits, store), fallbacks: guarded.fallbacks },
      discourse_guarded: { ...codecReport(dGuarded.codecUnits, store), fallbacks: dGuarded.fallbacks } });
    console.log(JSON.stringify({ key: p.key, chars, prunedViolations: report.at(-1).pruned.violations, guardedFallbacks: guarded.fallbacks }));
  }
  writeJson(path.join(RUN, 'build.json'), report);
}

// ---- answering (the harness's prompt and grading, five conditions, usage tokens) ---------------------------------
function claude(prompt) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codec-s1-'));
  const r = spawnSync('claude', ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--output-format', 'json', '--no-session-persistence'], { cwd, input: prompt, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
  fs.rmSync(cwd, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${String(r.stderr).slice(0, 300)}`);
  const out = JSON.parse(r.stdout);
  const u = out.usage || {};
  return { text: String(out.result || ''), cost: Number(out.total_cost_usd || 0),
    inputTokens: Number(u.input_tokens || 0) + Number(u.cache_creation_input_tokens || 0) + Number(u.cache_read_input_tokens || 0) };
}
const parseJsonBlock = (t) => { const m = t.match(/```(?:json)?\s*([\s\S]*?)```/u); return JSON.parse(m ? m[1] : t.slice(t.search(/[[{]/u))); };
const norm = (s) => String(s).toLowerCase().normalize('NFKC');
function correct(answer, literal) {          // identical to lunum-graded-qa.mjs
  const a = norm(answer), l = norm(literal);
  if (/^\d+(?:[.,]\d+)?$/u.test(literal)) return new RegExp(`(^|[^\\d.,])${l.replace(/[.]/gu, '\\.')}(?![\\d])`, 'u').test(a);
  return a.includes(l);
}

function answers() {
  const q = readJson(path.join(QA, 'questions.json'));
  const outFile = path.join(QA, 'answers-5cond.json');
  const done = fs.existsSync(outFile) ? readJson(outFile) : { results: [] };
  const have = new Set(done.results.filter((r) => r.call).map((r) => `${r.point}|${r.condition}`));
  for (const p of q.points) {
    const items = p.items.filter((i) => !i.rejected);
    if (!items.length) continue;
    for (const c of CONDITIONS) {
      if (have.has(`${p.key}|${c}`)) continue;                     // resumable
      const view = readJson(path.join(VIEWS, `${p.key}-${c}.json`));
      const prompt = [
        'Below is the context an AI agent had at one turn of a conversation (role-labelled messages). Answer each question using only this context.',
        'Give the exact value (identifier, path, number, version, hash, date) as written in the context. If the context does not state it, answer "unknown".',
        'Reply with only a JSON array of strings, one answer per question, in order.', '', '<context>',
        view.messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n'), '</context>', '',
        ...items.map((it, k) => `Q${k + 1}. ${it.question}`)].join('\n');
      const res = claude(prompt);
      let ans = []; try { ans = parseJsonBlock(res.text); } catch { ans = []; }
      const promptText = view.messages.map((m) => m.content).join('\n');
      items.forEach((it, k) => {
        const a = typeof ans[k] === 'string' ? ans[k] : String(ans[k] ?? '');
        done.results.push({ point: p.key, condition: c, literal: it.literal, inPrompt: promptText.includes(it.literal), answer: a, correct: correct(a, it.literal) });
      });
      done.results.push({ point: p.key, condition: c, call: true, cost: res.cost, inputTokens: res.inputTokens, parsed: Array.isArray(ans) ? ans.length : 0, expected: items.length });
      writeJson(outFile, done);
      console.log(`${p.key} ${c}: ${res.inputTokens} input tokens, $${res.cost.toFixed(4)}`);
    }
  }
}

function score() {
  const b = readJson(path.join(RUN, 'build.json'));
  const a = readJson(path.join(QA, 'answers-5cond.json')).results;
  const q = readJson(path.join(QA, 'questions.json'));
  const items = a.filter((r) => !r.call), calls = a.filter((r) => r.call);
  const acc = (c) => { const xs = items.filter((r) => r.condition === c); return { n: xs.length, correct: xs.filter((r) => r.correct).length, accuracy: xs.length ? +(xs.filter((r) => r.correct).length / xs.length).toFixed(4) : null }; };
  const tokens = (c) => calls.filter((r) => r.condition === c).reduce((s, r) => s + r.inputTokens, 0);
  const sum = (cond, k) => b.reduce((s, p) => s + (p[cond][k] || 0), 0);
  const per = Object.fromEntries(CONDITIONS.map((c) => [c, { tokens: tokens(c), ...acc(c), chars: b.reduce((s, p) => s + p.chars[c], 0) }]));
  const best = per.guarded.tokens <= per.discourse_guarded.tokens ? 'guarded' : 'discourse_guarded';
  const saving = 1 - per[best].tokens / per.discourse.tokens;
  const bars = {
    savings: { rule: `${best} input tokens <= 0.8 x discourse`, value: +saving.toFixed(4), pass: saving >= 0.20 },
    nonInferiority: { rule: `accuracy(${best}) >= accuracy(verbatim) - 0.02`, value: per[best].accuracy, verbatim: per.verbatim.accuracy, pass: per[best].accuracy >= per.verbatim.accuracy - 0.02 },
    invariants: { rule: 'violations(guarded) + violations(discourse_guarded) == 0', value: sum('guarded', 'violations') + sum('discourse_guarded', 'violations'), pass: sum('guarded', 'violations') + sum('discourse_guarded', 'violations') === 0 },
    expansion: { rule: 'expansion exact for guarded and discourse_guarded', pass: b.every((p) => p.guarded.expansionExact && p.discourse_guarded.expansionExact) },
  };
  const results = { format: 'guarded-codec-stage1/1.0', aggregatesOnly: true, points: b.length,
    questions: { generated: q.points.reduce((s, p) => s + p.items.length, 0), rejected: q.points.reduce((s, p) => s + p.items.filter((i) => i.rejected).length, 0) },
    conditions: per, prunedUnguarded: { violations: sum('pruned', 'violations'), byKind: b.reduce((m, p) => { for (const [k, v] of Object.entries(p.pruned.byKind)) m[k] = (m[k] || 0) + v; return m; }, {}) },
    guardedFallbacks: { guarded: sum('guarded', 'fallbacks'), discourse_guarded: sum('discourse_guarded', 'fallbacks') },
    bars, pass: Object.values(bars).every((x) => x.pass),
    costUsd: { questions: q.cost, answers: +calls.reduce((s, r) => s + r.cost, 0).toFixed(4) } };
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1));
}

const stages = { select, points, questions, build, answers, score };
const stage = process.argv[2];
if (!stages[stage]) { console.error(`usage: node run.mjs ${Object.keys(stages).join('|')}`); process.exit(2); }
stages[stage]();
