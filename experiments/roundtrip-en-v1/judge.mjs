#!/usr/bin/env node
// R4 bar 2: level (b). A cross-vendor judge (SuperGemma, Google lineage; the extractor is Anthropic's Sonnet)
// reads the English source and the Rust-rendered generic-en-pivot/0.2 code, and answers whether the code
// states the sentence's content. Every covered sentence is judged with its own code, plus 20 seeded CONTROLS
// (a code paired with another covered sentence), which must be answered "no".
// A second judge (Qwen 3.8 Flash on Halogen, Alibaba lineage) answers the same items for the agreement rate
// (reported, not a bar); it obeys the rig protocol (one call at a time, never in :00-:10 or :30-:40 UTC).
//   node judge.mjs --score result.json --requests requests.jsonl --rust rust-renders.jsonl --judge gemma|qwen --out judgements-<judge>.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const SEED = 'roundtrip-en-v1-judge:2026-10-17';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

export const prompt = (sentence, code) => [
  'A system turned an English sentence into a compact meaning code. Format: a world marker (R real, F fiction, T tool, D dream, B belief, M metaphor),',
  'then one clause per " ; ": an optional "not", an optional modality, the predicate, then role=value pairs in brackets. "speaker" is the person speaking, "addressee" the person spoken to.',
  'Question: does the code state the content of the sentence (who does what to whom, negation, modality), whatever the words? Small wording differences do not matter; a missing or wrong participant, action, negation or modality does.',
  '',
  `Sentence: "${sentence}"`,
  `Code: ${code}`,
  '',
  'Reply with one line of JSON only: {"states": true} or {"states": false}',
].join('\n');

const JUDGES = {
  gemma: { url: 'http://127.0.0.1:28084/v1/chat/completions', model: 'supergemma4-Q5_K_M', label: 'supergemma4-Q5_K_M (Ally, temperature 0)', max: 6000 },
  qwen: { url: 'http://127.0.0.1:8080/v1/chat/completions', model: 'openai/qwen3.8-flash-next-uncensored-lean', label: 'qwen3.8-flash (Halogen, temperature 0)', max: 2000 },
};
const busy = () => { const m = new Date().getUTCMinutes(); return m < 10 || (m >= 30 && m < 40); };

async function ask(j, text) {
  const res = await fetch(j.url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
    body: JSON.stringify({ model: j.model, messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: j.max }) });
  const c = (await res.json()).choices?.[0]?.message?.content ?? '';
  try { const v = JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); return typeof v.states === 'boolean' ? v.states : null; } catch { return null; }
}

async function main() {
  const name = arg('--judge'); const j = JUDGES[name]; if (!j) throw new Error('--judge gemma|qwen');
  const text = new Map(J(arg('--requests')).map((r) => [r.handle, r.sourceText]));
  const rust = new Map(J(arg('--rust')).map((r) => [r.handle, r.code]));
  const cov = JSON.parse(fs.readFileSync(arg('--score'), 'utf8')).renders.filter((r) => typeof rust.get(r.handle) === 'string');
  const items = cov.map((r) => ({ kind: 'own', id: r.handle, sentence: text.get(r.handle), code: rust.get(r.handle) }));
  const order = [...cov].sort((a, b) => (sha(`${SEED}|${a.handle}`) < sha(`${SEED}|${b.handle}`) ? -1 : 1));
  for (let i = 0; i < Math.min(20, order.length - 1); i += 1) items.push({ kind: 'control', id: `${order[i].handle}~${order[i + 1].handle}`, sentence: text.get(order[i].handle), code: rust.get(order[i + 1].handle) });
  const results = [];
  for (const it of items) {
    while (name === 'qwen' && busy()) await new Promise((r) => setTimeout(r, 30000));
    const p = prompt(it.sentence, it.code);
    const states = await ask(j, p);
    results.push({ kind: it.kind, id: it.id, promptSha256: sha(p), states });
    console.log(JSON.stringify({ kind: it.kind, id: it.id, states }));
  }
  const own = results.filter((r) => r.kind === 'own'); const ctl = results.filter((r) => r.kind === 'control');
  const summary = { judge: j.label, covered: own.length, states: own.filter((r) => r.states === true).length, unparseable: results.filter((r) => r.states === null).length,
    controls: ctl.length, controlsFalseYes: ctl.filter((r) => r.states === true).length };
  summary.rate = own.length ? summary.states / own.length : null;
  summary.judgeValid = ctl.length >= 20 && summary.controlsFalseYes / ctl.length <= 0.1;
  summary.bar2Pass = name === 'gemma' && summary.judgeValid && own.length >= 30 && summary.rate >= 0.8;
  fs.writeFileSync(arg('--out'), JSON.stringify({ summary, results }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
