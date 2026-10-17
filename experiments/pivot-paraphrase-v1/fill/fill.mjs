#!/usr/bin/env node
// Owner-delegated worksheet fill (2026-10-17): two judges of different vendors label every WORKSHEET-v2 pair
// blind (no counts, no proposer, seeded order), plus seeded CONTROL pairs that must be "different".
// Disagreements go to a third judge. See PREREGISTRATION.md (this directory).
//   node fill.mjs items                       -> items.json (deterministic; no model)
//   node fill.mjs judge --judge gemma|sol|luna|qwen [--only disagreements.json] --out labels-<judge>.json
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seeds } from '../propose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SEED = 'worksheet-v2-fill:2026-10-17';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const LABELS = ['S', 'B', 'I', 'D', 'X'];

export function buildItems(candidates) {
  const lines = (r) => Math.max(0, ...Object.values(r.evidence).map((e) => e.exactLines ?? 0));
  const all = seeds();
  const pairs = [];
  for (const s of all) {
    const attested = candidates.rows.filter((r) => r.seed === s.id && r.best === 'attested-exact' && !(r.en === s.en && r.el === s.el))
      .sort((a, b) => lines(b) - lines(a)).slice(0, 12); // exactly the WORKSHEET-v2 rows
    for (const r of attested) pairs.push({ seed: s.id, en: r.en, el: r.el, kind: 'pair', proposedBy: r.proposedBy.filter((m) => m !== 'seed') });
    pairs.push({ seed: s.id, en: s.en, el: s.el, kind: 'seed' });
  }
  // Controls: the seed's English with the seed Greek of two other seeds, chosen by hash. Expected: D.
  for (const s of all) {
    const others = all.filter((o) => o.id !== s.id).sort((a, b) => (sha(`${SEED}|ctl|${s.id}|${a.id}`) < sha(`${SEED}|ctl|${s.id}|${b.id}`) ? -1 : 1)).slice(0, 2);
    for (const o of others) pairs.push({ seed: s.id, en: s.en, el: o.el, kind: 'control' });
  }
  return pairs.map((p) => ({ ...p, id: `w${sha(`${p.seed}|${p.kind}|${p.en}|${p.el}`).slice(0, 10)}` }))
    .sort((a, b) => (sha(`${SEED}|order|${a.id}`) < sha(`${SEED}|order|${b.id}`) ? -1 : 1));
}

export function prompt(batch) {
  return [
    'You are a native-level English-Greek translator judging MEANING, not words.',
    'For each numbered pair, decide how the Greek relates to the English, as a professional translator would:',
    'S = same meaning (an acceptable translation, whatever the words); B = broader or narrower; I = implies or is a local equivalent (e.g. «πάρε το 100» for "call 911"); D = different meaning; X = the Greek is not natural Greek.',
    'Judge each pair on its own. Do not explain.',
    '',
    ...batch.map((p, i) => `${i + 1}. English: "${p.en}" | Greek: «${p.el}»`),
    '',
    `Reply with one line of JSON only: {"labels": ["S|B|I|D|X", ...]} with exactly ${batch.length} labels in order.`,
  ].join('\n');
}

export function parse(text, n) {
  const body = String(text ?? '').replace(/```(?:json)?/gu, '');
  const a = body.indexOf('{'); const b = body.lastIndexOf('}');
  try { const v = JSON.parse(body.slice(a, b + 1)); return Array.isArray(v.labels) && v.labels.length === n && v.labels.every((l) => LABELS.includes(l)) ? v.labels : null; } catch { return null; }
}

export const JUDGES = Object.freeze({
  gemma: { vendor: 'Google lineage', model: 'supergemma4-Q5_K_M', via: 'llama.cpp router on the ROG Ally, 127.0.0.1:18084 through an SSH tunnel to local 28084, temperature 0' },
  sol: { vendor: 'OpenAI', model: 'gpt-6.1-sol', effort: 'medium', via: 'codex exec, read-only, empty temp dir, tools off' },
  luna: { vendor: 'OpenAI', model: 'gpt-6-luna', effort: 'medium', via: 'codex exec, read-only, empty temp dir, tools off (third pass only)' },
  qwen: { vendor: 'Alibaba (Qwen)', model: 'openai/qwen3.8-flash-next-uncensored-lean', via: 'Halogen on the rig, 127.0.0.1:8080, temperature 0, one request at a time, max_tokens 2000 (third pass, amendment 2)' },
});

async function ask(judge, text) {
  if (judge === 'qwen') {
    const res = await fetch('http://127.0.0.1:8080/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
      body: JSON.stringify({ model: JUDGES.qwen.model, messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: 2000 }) });
    const body = await res.json();
    return { answer: body.choices?.[0]?.message?.content ?? '', servedModel: body.model ?? null };
  }
  if (judge === 'gemma') {
    const res = await fetch('http://127.0.0.1:28084/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
      body: JSON.stringify({ model: 'supergemma4-Q5_K_M', messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: 6000 }) }); // amendment 1: the router serves SuperGemma with reasoning on
    const body = await res.json();
    return { answer: body.choices?.[0]?.message?.content ?? '', servedModel: body.model ?? null };
  }
  const j = JUDGES[judge];
  const cwd = fs.mkdtempSync(join(os.tmpdir(), 'wfill-'));
  const out = join(cwd, 'last.txt');
  const args = ['exec', '-m', j.model, '-c', `model_reasoning_effort=${j.effort}`, '--skip-git-repo-check', '--ephemeral', '-s', 'read-only',
    ...['shell_tool', 'browser_use', 'computer_use', 'apps', 'skill_search', 'goals', 'image_generation', 'view_image', 'plugins'].flatMap((f) => ['--disable', f]),
    '-c', 'web_search="disabled"', '-c', 'mcp_servers.unumsearch.enabled=false', '-o', out, text];
  spawnSync('codex', args, { cwd, input: '', encoding: 'utf8', timeout: 600000 });
  const answer = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  fs.rmSync(cwd, { recursive: true, force: true });
  return { answer, servedModel: `${j.model} (requested; codex does not report it)` };
}

async function main() {
  const [cmd] = process.argv.slice(2);
  const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
  if (cmd === 'items') {
    const cand = JSON.parse(fs.readFileSync(join(here, '../results/candidates-lemma2.json'), 'utf8'));
    const items = buildItems(cand);
    fs.writeFileSync(join(here, 'items.json'), JSON.stringify({ seed: SEED, source: 'results/candidates-lemma2.json (WORKSHEET-v2)', count: items.length,
      byKind: Object.fromEntries(['pair', 'seed', 'control'].map((k) => [k, items.filter((i) => i.kind === k).length])), items }, null, 1) + '\n');
    console.log(items.length);
    return;
  }
  const judge = arg('--judge');
  if (!JUDGES[judge]) throw new Error('--judge gemma|sol|luna|qwen');
  let { items } = JSON.parse(fs.readFileSync(join(here, 'items.json'), 'utf8'));
  if (process.argv.includes('--only')) { const keep = new Set(JSON.parse(fs.readFileSync(arg('--only'), 'utf8'))); items = items.filter((i) => keep.has(i.id)); }
  const BATCH = 10;
  const labels = {}; const raw = [];
  for (let k = 0; k < items.length; k += BATCH) {
    const batch = items.slice(k, k + BATCH);
    const text = prompt(batch);
    const r = await ask(judge, text);
    const got = parse(r.answer, batch.length);
    batch.forEach((p, i) => { labels[p.id] = got ? got[i] : null; });
    raw.push({ batch: batch.map((p) => p.id), promptSha256: sha(text), answer: r.answer.slice(0, 2000), servedModel: r.servedModel, parsed: !!got });
    console.log(JSON.stringify({ judge, batch: k / BATCH, parsed: !!got }));
  }
  fs.writeFileSync(arg('--out'), JSON.stringify({ judge: JUDGES[judge], labels, raw }, null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
