#!/usr/bin/env node
// Level (b): same-meaning judgement by cross-vendor bilingual judges, shown ONLY Lunum records
// (no source text, no labels). For each evaluable English passage: its records, and four Greek
// record sets (the true translation + 3 seeded mismatches, in seeded order). See PREREGISTRATION-paid.md, amendment 1.
//   node judge.mjs --requests r.jsonl --runs dirA --judge luna|gemma --out-dir <dir> [--dry-run]
//   node judge.mjs --requests r.jsonl --runs dirA --owner-sheet <file outside the repo>
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from './score-structure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SEED = 'parallel-document-v1-judge:2026-10-16';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
export const JUDGES = Object.freeze({
  luna: { vendor: 'OpenAI', model: 'gpt-6-luna', effort: 'low', via: 'codex exec (ChatGPT login), read-only sandbox, empty temp cwd, --ephemeral' },
  gemma: { vendor: 'Google lineage (Gemma 4 fine-tune)', model: 'supergemma4-Q5_K_M', via: 'llama.cpp on the ROG Ally, http://127.0.0.1:18084/v1 through an SSH tunnel, temperature 0' },
});

const fillers = (v) => typeof v === 'string' ? v : Array.isArray(v) ? v.map(fillers).join(', ') : v && typeof v === 'object' ? String(v.value ?? v.id ?? v.ref ?? JSON.stringify(v)) : String(v);
function clauseText(c) {
  const roles = Object.entries(c.roles ?? {}).map(([k, v]) => `${k}=${fillers(v)}`).join('; ');
  const flags = [c.negated ? 'NOT' : '', c.modality ? `modality=${c.modality}` : ''].filter(Boolean).join(' ');
  const cond = (c.conditions ?? []).map(clauseText).map((t) => ` IF ${t}`).join('');
  const then = (c.consequences ?? []).map(clauseText).map((t) => ` THEN ${t}`).join('');
  return `${c.predicate}(${roles})${flags ? ` [${flags}]` : ''}${cond}${then}`;
}
export const renderSet = (recs) => recs.map((r) => `- ${r.sem.kind}: ${r.sem.clauses.map(clauseText).join(' AND ')}`).join('\n');

export function prompt(a, options) {
  return [
    'You are a bilingual English/Greek judge of MEANING. A system turned passages of a parliamentary debate into short meaning records.',
    'Each record line is: kind: predicate(role=filler; ...). Fillers keep the words of their language. Words, word order and language do not matter; only the content stated.',
    '',
    'Record set A (from an English passage):',
    renderSet(a),
    '',
    ...options.flatMap((o, i) => [`Record set ${i + 1} (from a Greek passage):`, renderSet(o), '']),
    'Questions:',
    '1. Which ONE of sets 1-4 states the same content as A (the same passage in the other language)? Answer 0 if none does.',
    '2. For each of sets 1-4: does it state the same content as A? true or false.',
    'Reply with exactly one line of JSON and nothing else: {"pick": <0-4>, "same": [<bool>, <bool>, <bool>, <bool>]}',
  ].join('\n');
}

function parseAnswer(text) {
  const line = String(text ?? '').trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).at(-1);
  try { const v = JSON.parse(line); return Number.isInteger(v.pick) && v.pick >= 0 && v.pick <= 4 && Array.isArray(v.same) && v.same.length === 4 && v.same.every((x) => typeof x === 'boolean') ? v : null; } catch { return null; }
}

async function ask(judge, text) {
  if (judge === 'luna') {
    const cwd = fs.mkdtempSync(join(os.tmpdir(), 'pd1-judge-'));
    const outFile = join(cwd, 'last.txt');
    const r = spawnSync('codex', ['exec', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=low', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-o', outFile, '-'], { cwd, input: text, encoding: 'utf8', timeout: 300000 });
    const answer = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
    fs.rmSync(cwd, { recursive: true, force: true });
    return { exit: r.status, answer, tokens: /tokens used\s+([\d,]+)/u.exec(r.stdout + r.stderr)?.[1] ?? null };
  }
  const res = await fetch('http://127.0.0.1:18084/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(300000),
    body: JSON.stringify({ model: 'supergemma4-Q5_K_M', messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: 400 }) });
  const body = await res.json();
  return { exit: res.ok ? 0 : 1, answer: body.choices?.[0]?.message?.content ?? '', model: body.model ?? null, tokens: body.usage?.total_tokens ?? null };
}

/** Evaluable passages and, per English passage, its 4 options (true + 3 seeded mismatches, seeded order). */
export function design(passages) {
  const ok = passages.filter((p) => p.en.length >= 2 && p.el.length >= 2);
  return ok.map((p) => {
    const others = ok.filter((q) => q !== p).sort((x, y) => (sha(`${SEED}|${p.passage}|${x.passage}`) < sha(`${SEED}|${p.passage}|${y.passage}`) ? -1 : 1)).slice(0, 3);
    const options = [p, ...others].sort((x, y) => (sha(`${SEED}|order|${p.passage}|${x.passage}`) < sha(`${SEED}|order|${p.passage}|${y.passage}`) ? -1 : 1));
    return { passage: p.passage, en: p.en, options: options.map((o) => ({ passage: o.passage, el: o.el })), truth: options.indexOf(p) + 1 };
  });
}

async function main() {
  const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
  const requests = new Map(J(arg('--requests')).map((r) => [r.handle, r]));
  const rows = new Map(); for (const d of arg('--runs').split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) if (!rows.has(r.handle) || !['parse', 'abstain'].includes(rows.get(r.handle).status)) rows.set(r.handle, r);
  const { handles } = JSON.parse(fs.readFileSync(join(here, 'handles.json'), 'utf8'));
  const by = new Map();
  for (const h of handles) { const rec = rows.has(h.handle) ? record(requests.get(h.handle), rows.get(h.handle)) : null; const p = by.get(h.passage) ?? { passage: h.passage, en: [], el: [] }; by.set(h.passage, p); if (rec && !rec.copy) p[h.lang].push(rec); }
  const items = design([...by.values()].sort((a, b) => a.passage - b.passage));

  const sheet = arg('--owner-sheet', null);
  if (sheet) {
    if (resolve(sheet).startsWith(resolve(here, '../..'))) throw new Error('the owner sheet holds Europarl text; write it outside the repository');
    const pairs = items.flatMap((it) => it.options.map((o, k) => ({ en: it.passage, el: o.passage, matched: k + 1 === it.truth })));
    const pick = (m) => pairs.filter((x) => x.matched === m).sort((a, b) => (sha(`${SEED}|owner|${a.en}|${a.el}`) < sha(`${SEED}|owner|${b.en}|${b.el}`) ? -1 : 1)).slice(0, 10);
    const chosen = [...pick(true), ...pick(false)].sort((a, b) => (sha(`${SEED}|ownerorder|${a.en}|${a.el}`) < sha(`${SEED}|ownerorder|${b.en}|${b.el}`) ? -1 : 1));
    const textOf = (passage, lang) => handles.filter((h) => h.passage === passage && h.lang === lang).map((h) => requests.get(h.handle).sourceText).join(' ');
    fs.writeFileSync(sheet, chosen.map((x, i) => `## Pair ${i + 1}  (en ${x.en} / el ${x.el})\n\nEN: ${textOf(x.en, 'en')}\n\nEL: ${textOf(x.el, 'el')}\n\nSame content? [ ] yes  [ ] no\n`).join('\n'));
    fs.writeFileSync(`${sheet}.key.json`, JSON.stringify(chosen, null, 2));
    console.log({ ownerPairs: chosen.length, sheet });
    return;
  }

  const judge = arg('--judge');
  if (!JUDGES[judge]) throw new Error('--judge luna|gemma');
  const outDir = arg('--out-dir');
  const dry = process.argv.includes('--dry-run');
  if (!dry) fs.mkdirSync(outDir);
  const results = [];
  for (const it of items) {
    const text = prompt(it.en, it.options.map((o) => o.el));
    if (dry) { console.log(text, '\n---'); continue; }
    const r = await ask(judge, text);
    const answer = parseAnswer(r.answer);
    results.push({ passage: it.passage, truth: it.truth, options: it.options.map((o) => o.passage), promptSha256: sha(text), raw: r.answer, exit: r.exit, tokens: r.tokens, answer });
    fs.writeFileSync(join(outDir, 'judgements.json'), JSON.stringify({ judge: JUDGES[judge], results }, null, 2) + '\n');
    console.log(JSON.stringify({ passage: it.passage, truth: it.truth, pick: answer?.pick ?? null }));
  }
  if (dry) return;
  const valid = results.filter((r) => r.answer);
  const mismatchedSame = valid.flatMap((r) => r.answer.same.filter((_, k) => k + 1 !== r.truth));
  const summary = { judge: JUDGES[judge], items: results.length, unparseable: results.length - valid.length,
    top1: valid.length ? valid.filter((r) => r.answer.pick === r.truth).length / results.length : 0,
    matchedSaidSame: valid.filter((r) => r.answer.same[r.truth - 1]).length,
    mismatchedSaidSameRate: mismatchedSame.length ? mismatchedSame.filter(Boolean).length / mismatchedSame.length : null };
  summary.passBars = summary.top1 >= 0.7 && summary.mismatchedSaidSameRate !== null && summary.mismatchedSaidSameRate <= 0.1;
  fs.writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
