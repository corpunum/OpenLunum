#!/usr/bin/env node
// Bar 3 of the ADR 0029 held-out test: a cross-vendor judge (SuperGemma, Google lineage; the extractor is
// OpenAI's Sol) reads a Greek source sentence and a Lunum record and answers whether the record states the
// sentence's content. Every covered Greek sentence is judged with its own record, plus 20 seeded CONTROLS
// (a record paired with another covered sentence), which must be answered "no".
//   node judge.mjs --requests <requests.jsonl> --runs dir[,dir-rest] --out judgements.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from '../parallel-document-v1/score-structure.mjs';
import { renderSet } from '../parallel-document-v1/judge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SEED = 'greek-frames-judge:2026-10-17';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

export const prompt = (sentence, recordText) => [
  'You read Greek natively. A system turned a Greek sentence into a short meaning record.',
  'Record lines read: kind: predicate(role=filler; ...). "speaker" means the person speaking, "addressee" the person spoken to.',
  'Question: does the record state the content of the sentence (who does what to whom, negation, modality), whatever the words? Small wording differences do not matter; a missing or wrong participant, action, negation or modality does.',
  '',
  `Sentence: «${sentence}»`,
  'Record:',
  recordText,
  '',
  'Reply with one line of JSON only: {"states": true} or {"states": false}',
].join('\n');

async function ask(text) {
  const res = await fetch('http://127.0.0.1:28084/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
    body: JSON.stringify({ model: 'supergemma4-Q5_K_M', messages: [{ role: 'user', content: text }], temperature: 0, max_tokens: 6000 }) });
  const body = await res.json();
  const c = body.choices?.[0]?.message?.content ?? '';
  try { const v = JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); return typeof v.states === 'boolean' ? v.states : null; } catch { return null; }
}

async function main() {
  const requests = new Map(J(arg('--requests')).map((r) => [r.handle, r]));
  const rows = new Map();
  for (const d of arg('--runs').split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) if (!rows.has(r.handle) || !rows.get(r.handle).evidenceValid || !['parse', 'abstain'].includes(rows.get(r.handle).status)) rows.set(r.handle, r);
  const { pairs } = JSON.parse(fs.readFileSync(join(here, 'pairs.json'), 'utf8'));
  const covered = pairs.map((p) => ({ pair: p.pair, handle: p.el, rec: record(requests.get(p.el), rows.get(p.el)) })).filter((x) => x.rec && !x.rec.copy);
  const items = covered.map((x) => ({ kind: 'own', pair: x.pair, sentence: requests.get(x.handle).sourceText, rec: x.rec }));
  // Controls: each of the first 20 covered sentences (seeded order) with the record of the next one in that order.
  const order = [...covered].sort((a, b) => (sha(`${SEED}|${a.pair}`) < sha(`${SEED}|${b.pair}`) ? -1 : 1));
  for (let i = 0; i < Math.min(20, order.length - 1); i += 1) items.push({ kind: 'control', pair: `${order[i].pair}~${order[i + 1].pair}`, sentence: requests.get(order[i].handle).sourceText, rec: order[i + 1].rec });
  const results = [];
  for (const it of items) {
    const text = prompt(it.sentence, renderSet([it.rec]));
    const states = await ask(text);
    results.push({ kind: it.kind, pair: it.pair, promptSha256: sha(text), states });
    console.log(JSON.stringify({ kind: it.kind, pair: it.pair, states }));
  }
  const own = results.filter((r) => r.kind === 'own'); const ctl = results.filter((r) => r.kind === 'control');
  const summary = { judge: 'supergemma4-Q5_K_M (Ally, temperature 0)', covered: own.length, states: own.filter((r) => r.states === true).length, unparseable: results.filter((r) => r.states === null).length,
    controls: ctl.length, controlsFalseYes: ctl.filter((r) => r.states === true).length };
  summary.rate = own.length ? summary.states / own.length : null;
  summary.judgeValid = ctl.length > 0 && summary.controlsFalseYes / ctl.length <= 0.1;
  summary.bar3Pass = summary.judgeValid && summary.rate !== null && summary.rate >= 0.8;
  fs.writeFileSync(arg('--out'), JSON.stringify({ summary, results }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
