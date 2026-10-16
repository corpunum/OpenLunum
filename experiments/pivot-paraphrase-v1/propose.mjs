#!/usr/bin/env node
// Model layer, step 1: ask models of different families for EN/EL ways to express each seed meaning.
// Proposals are CANDIDATES ONLY: every pair is then checked against Europarl by `pivot-miner pair`
// (verify.mjs). No model output is a reference. Exploratory; no claim.
//   node propose.mjs --model qwen|gemma --out <proposals.jsonl>
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const MODELS = Object.freeze({
  qwen: { family: 'Qwen (Alibaba)', model: 'openai/qwen3.8-flash-next-uncensored-lean', endpoint: 'http://127.0.0.1:8080/v1', maxTokens: 3000 },
  gemma: { family: 'Gemma (Google lineage)', model: 'supergemma4-Q5_K_M', endpoint: 'http://127.0.0.1:28084/v1', maxTokens: 1500 },
});

export const seeds = () => fs.readFileSync(join(here, 'seeds.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
  .map((l) => { const [id, en, el, note] = l.split('\t'); return { id, en, el, note: note ?? '' }; });

export function prompt(seed) {
  return [
    'You are a professional English-Greek translator. Think about MEANING, not words.',
    `Meaning: English "${seed.en}" / Greek "${seed.el}".`,
    'List other ways people express this same meaning: different verbs, idioms, everyday and formal register, phrasing a translator would accept as the same meaning.',
    'Give up to 8 English phrases, up to 8 Greek phrases, and up to 8 English-Greek pairs that translate each other.',
    'Use base forms where possible. Do not explain.',
    'Reply with one line of JSON only: {"en": ["..."], "el": ["..."], "pairs": [["english", "greek"]]}',
  ].join('\n');
}

export function parse(text) {
  const body = String(text ?? '').replace(/```(?:json)?/gu, '');
  const start = body.indexOf('{'); const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(body.slice(start, end + 1));
    const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 8) : []);
    const pairs = Array.isArray(v.pairs) ? v.pairs.filter((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'string' && x.trim())).map((p) => p.map((x) => x.trim())).slice(0, 8) : [];
    return { en: strings(v.en), el: strings(v.el), pairs };
  } catch { return null; }
}

async function main() {
  const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
  const key = arg('--model'); const m = MODELS[key];
  if (!m) throw new Error('--model qwen|gemma');
  const out = arg('--out');
  fs.writeFileSync(out, '');
  for (const seed of seeds()) {
    const text = prompt(seed);
    const t0 = Date.now();
    const res = await fetch(`${m.endpoint}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
      body: JSON.stringify({ model: m.model, messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: m.maxTokens }) }).catch((e) => ({ ok: false, error: String(e) }));
    const body = res.ok ? await res.json() : null;
    const content = body?.choices?.[0]?.message?.content ?? '';
    const row = { seed: seed.id, model: key, family: m.family, servedModel: body?.model ?? null, promptSha256: createHash('sha256').update(text).digest('hex'),
      seconds: Math.round((Date.now() - t0) / 1000), ok: !!res.ok, proposals: parse(content), raw: content.slice(0, 4000) };
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ seed: seed.id, model: key, ok: row.ok, parsed: !!row.proposals, n: row.proposals ? row.proposals.en.length + row.proposals.el.length + row.proposals.pairs.length : 0, seconds: row.seconds }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
