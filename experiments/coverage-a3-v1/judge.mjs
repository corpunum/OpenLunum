#!/usr/bin/env node
// A3 bar 2 (level b): R4's judge prompt (../roundtrip-en-v1/judge.mjs) on the Rust generic-en-pivot/0.2 rendering of each
// covered record of the change run, plus 20 seeded controls (a code paired with another covered sentence; "yes" is wrong).
// Judges (named before judging, Amendment 2): SuperGemma on the ROG Ally (Google lineage; reached through an ssh tunnel to
// 127.0.0.1:28084), Nemotron 3 Ultra on NVIDIA NIM's free tier (NVIDIA lineage; key read at run time from
// ~/.openunum/secrets.json, never stored), and Qwen on Halogen as tie-breaker for reporting only (rig protocol).
// Resumable: items already in --out.partial.jsonl are not re-asked. Temperature 0. One call at a time.
//   node judge.mjs --result rt-result.json --requests requests-v27.jsonl --judge gemma|nim|qwen --out judgements-<judge>.json
//   node judge.mjs --agreement judgements-gemma.json,judgements-nim.json   (bar 2 verdict)
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { prompt } from '../roundtrip-en-v1/judge.mjs';

const SEED = 'coverage-a3-v1-judge:2026-10-22';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nimKey = () => JSON.parse(fs.readFileSync(`${os.homedir()}/.openunum/secrets.json`, 'utf8')).secrets.nvidiaApiKey;
const JUDGES = {
  gemma: { url: 'http://127.0.0.1:28084/v1/chat/completions', model: 'supergemma4-Q5_K_M', label: 'supergemma4-Q5_K_M (Ally, temperature 0)', max: 6000 },
  nim: { url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'nemotron-3-ultra-550b-a55b (NVIDIA NIM free tier, temperature 0)', max: 6000, key: nimKey, gapMs: 3000 },
  qwen: { url: 'http://127.0.0.1:8080/v1/chat/completions', model: 'openai/qwen3.8-flash-next-uncensored-lean', label: 'qwen3.8-flash (Halogen, temperature 0)', max: 2000, rig: true },
};
const busy = () => { const m = new Date().getUTCMinutes(); return m < 10 || (m >= 30 && m < 40); };

async function ask(j, text) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const headers = { 'content-type': 'application/json', ...(j.key ? { authorization: `Bearer ${j.key()}` } : {}) };
      const res = await fetch(j.url, { method: 'POST', headers, signal: AbortSignal.timeout(600000),
        body: JSON.stringify({ model: j.model, messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: j.max }) });
      if (res.status === 429 || res.status >= 500) { await sleep(60000); continue; } // no reply: re-ask later
      const c = (await res.json()).choices?.[0]?.message?.content ?? '';
      try { const v = JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); return typeof v.states === 'boolean' ? v.states : null; } catch { return null; }
    } catch { await sleep(60000); } // network failure: no reply, re-ask later
  }
  throw new Error('judge_unreachable');
}

function agreement(files) {
  const [a, b] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const own = (x) => new Map(x.results.filter((r) => r.kind === 'own').map((r) => [r.id, r.states]));
  const ma = own(a); const mb = own(b); const ids = [...ma.keys()].filter((k) => mb.has(k));
  const agree = ids.filter((k) => ma.get(k) === mb.get(k)).length;
  const rate = ids.length ? agree / ids.length : null;
  const each = [a.summary, b.summary].map((s) => ({ judge: s.judge, rate: s.rate, judgeValid: s.judgeValid, covered: s.covered }));
  const verdictPossible = ids.length >= 30 && each.every((s) => s.judgeValid);
  return { each, both: ids.length, agree, agreement: rate, verdictPossible,
    pass: verdictPossible ? each.every((s) => s.rate >= 0.8) && rate >= 0.75 : null };
}

async function main() {
  if (arg('--agreement')) { const out = agreement(arg('--agreement').split(',')); console.log(JSON.stringify(out, null, 2)); return; }
  const name = arg('--judge'); const j = JUDGES[name]; if (!j) throw new Error('--judge gemma|nim|qwen');
  const text = new Map(J(arg('--requests')).map((r) => [r.handle, r.sourceText]));
  const result = JSON.parse(fs.readFileSync(arg('--result'), 'utf8'));
  if (!result.bar1?.pass) throw new Error('rust_ts_render_parity_not_established');
  const cov = result.renders;
  const items = cov.map((r) => ({ kind: 'own', id: r.handle, sentence: text.get(r.handle), code: r.code }));
  const order = [...cov].sort((x, y) => (sha(`${SEED}|${x.handle}`) < sha(`${SEED}|${y.handle}`) ? -1 : 1));
  for (let i = 0; i < Math.min(20, order.length - 1); i += 1) items.push({ kind: 'control', id: `${order[i].handle}~${order[i + 1].handle}`, sentence: text.get(order[i].handle), code: order[i + 1].code });
  const partial = `${arg('--out')}.partial.jsonl`;
  const done = new Map(J(partial).map((r) => [`${r.kind}|${r.id}`, r]));
  for (const it of items) {
    if (done.has(`${it.kind}|${it.id}`)) continue;
    while (j.rig && busy()) await sleep(30000);
    const p = prompt(it.sentence, it.code);
    const states = await ask(j, p);
    const row = { kind: it.kind, id: it.id, promptSha256: sha(p), states };
    fs.appendFileSync(partial, JSON.stringify(row) + '\n'); done.set(`${it.kind}|${it.id}`, row);
    console.log(JSON.stringify(row));
    if (j.gapMs) await sleep(j.gapMs);
  }
  const results = items.map((it) => done.get(`${it.kind}|${it.id}`));
  const own = results.filter((r) => r.kind === 'own'); const ctl = results.filter((r) => r.kind === 'control');
  const summary = { judge: j.label, covered: own.length, states: own.filter((r) => r.states === true).length, unparseable: results.filter((r) => r.states === null).length,
    controls: ctl.length, controlsFalseYes: ctl.filter((r) => r.states === true).length };
  summary.rate = own.length ? summary.states / own.length : null;
  summary.judgeValid = ctl.length >= 20 && summary.controlsFalseYes <= 2;
  fs.writeFileSync(arg('--out'), JSON.stringify({ summary, results }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
