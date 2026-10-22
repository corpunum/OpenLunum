#!/usr/bin/env node
// Round trip for the calibration candidates: Greek original -> English (pivot-translate/0.1 prompt, Qwen on Halogen)
// -> Greek (buildRenderPrompt with the flags from hop 1, same adapter, same Qwen). Rig protocol as ../translate.mjs.
// Resumable; appends to roundtrip-raw.jsonl (cand, hop1, hop2). Needs packages/eval built.
//   node experiments/pivot-el-en-v1/calibration/roundtrip.mjs
import fs from 'node:fs';
import { TRANSLATORS } from '../translate.mjs';
import { MEANING_FLAGS_JSON_SCHEMA, PIVOT_PROMPT_VERSION, buildPivotPrompt, buildRenderPrompt, checkPivotGuards, parsePivotTranslation } from '../../../packages/eval/dist/src/pivot-adapter.js';
const here = new URL('./', import.meta.url).pathname;
const out = here + 'roundtrip-raw.jsonl';
const SYSTEM = 'You are a careful translator inside a meaning-checking system. Follow the rules exactly. Reply with the requested JSON object only.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const busy = () => { const m = new Date().getUTCMinutes(); return m < 10 || (m >= 30 && m < 40); };
const t = TRANSLATORS.qwen;
async function wait() { for (;;) { if (!busy()) { try { const h = await (await fetch(t.health, { signal: AbortSignal.timeout(5000) })).json(); if ((h.in_flight ?? 0) <= 1 && (h.queued ?? 0) === 0) return; } catch {} } await sleep(30000); } }
let calls = 0;
async function ask(prompt) {
  await wait(); calls++;
  const res = await fetch(t.url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
    body: JSON.stringify({ model: t.model, temperature: 0, max_tokens: 4096, reasoning_effort: 'low', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: { name: 'pivot_translation', strict: true, schema: MEANING_FLAGS_JSON_SCHEMA } } }) });
  const body = await res.json(); return body.choices?.[0]?.message?.content ?? '';
}
const c = JSON.parse(fs.readFileSync(here + 'candidates.json', 'utf8'));
const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).cand) : []);
for (const it of [...c.normal.slice(0, 32), ...c.control.slice(0, 12)]) {
  if (done.has(it.cand)) continue;
  const r1 = parsePivotTranslation(await ask(buildPivotPrompt(it.el, 'el')));
  let row = { cand: it.cand, el: it.el, promptVersion: PIVOT_PROMPT_VERSION, model: t.model, hop1: r1.ok ? r1.value : null, hop1Errors: r1.ok ? [] : r1.errors, hop1Guards: r1.ok ? checkPivotGuards(it.el, 'el', r1.value, 'en') : null, hop2: null, hop2Errors: [], hop2Guards: null };
  if (r1.ok) {
    const r2 = parsePivotTranslation(await ask(buildRenderPrompt(r1.value.translation, r1.value.flags, 'el')));
    row.hop2 = r2.ok ? r2.value : null; row.hop2Errors = r2.ok ? [] : r2.errors;
    row.hop2Guards = r2.ok ? checkPivotGuards(r1.value.translation, 'en', r2.value, 'el') : null;
  }
  fs.appendFileSync(out, JSON.stringify(row) + '\n'); console.log(it.cand, row.hop1?.translation, '|', row.hop2?.translation);
}
console.log('model calls this run:', calls);
