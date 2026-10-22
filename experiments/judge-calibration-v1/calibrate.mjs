#!/usr/bin/env node
// judge-calibration-v1: ask one candidate judge every calibration item (40 Greek + 20 A3 controls), then score.
// Resumable (judgements-<judge>.partial.jsonl). One call at a time, temperature 0.
//   node calibrate.mjs --judge gemma|nemotron|deepseek|kimi|glm|mistral|qwen
//   node calibrate.mjs --report            -> calibration.json (every judge with a complete file), the pass/fail table
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JUDGES, ask, englishPrompt, greekPrompt, sleep } from './judges.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const items = J(path.join(here, 'items.jsonl'));
const promptOf = (it) => (it.set === 'greek' ? greekPrompt(it.original, it.after) : englishPrompt(it.sentence, it.code));
const fieldOf = (it) => (it.set === 'greek' ? 'same' : 'states');

/** Cohen's kappa for two label arrays over the same items. */
export function kappa(a, b) {
  const n = a.length; if (!n) return null;
  const cats = [...new Set([...a, ...b])];
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = cats.reduce((s, c) => s + (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n), 0);
  return pe === 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);
}

/** The pre-registered metrics and verdict for one judge's complete judgements. */
export function scoreJudge(rows) {
  const by = new Map(rows.map((r) => [r.id, r]));
  const yes = (it) => by.get(it.id)?.verdict === true; // null (unparseable) counts as "no"
  const g = items.filter((x) => x.set === 'greek' && !x.isControl && (x.owner === 'same' || x.owner === 'mostly_same' || x.owner === 'different'));
  const ownerBin = g.map((x) => (x.owner === 'different' ? 'not' : 'eq'));
  const ownerStrict = g.map((x) => (x.owner === 'same' ? 'eq' : 'not'));
  const judgeBin = g.map((x) => (yes(x) ? 'eq' : 'not'));
  const confusion = { eqEq: 0, eqNot: 0, notEq: 0, notNot: 0 }; // owner, judge
  ownerBin.forEach((o, i) => { confusion[`${o}${judgeBin[i] === 'eq' ? 'Eq' : 'Not'}`] += 1; });
  const gc = items.filter((x) => x.set === 'greek' && x.isControl);
  const ac = items.filter((x) => x.set === 'a3-control');
  const out = {
    greekLabelled: g.length, cantTellDropped: items.filter((x) => x.set === 'greek' && !x.isControl && x.owner === 'cant_tell').length,
    agreement: ownerBin.filter((o, i) => o === judgeBin[i]).length / g.length,
    kappa: kappa(ownerBin, judgeBin), kappaStrict: kappa(ownerStrict, judgeBin), confusion,
    greekControlsMissed: gc.filter(yes).length, greekControls: gc.length,
    a3ControlsMissed: ac.filter(yes).length, a3Controls: ac.length,
    unparseable: rows.filter((r) => r.verdict === null).length,
    judgeSaysNotOn: g.filter((x) => !yes(x)).map((x) => `${x.id}:${x.owner}`),
  };
  out.pass = out.kappa !== null && out.kappa >= 0.4 && out.greekControlsMissed <= 1 && out.a3ControlsMissed <= 1;
  return out;
}

async function run(name) {
  const j = JUDGES[name]; if (!j) throw new Error(`unknown judge ${name}`);
  const partial = path.join(here, `judgements-${name}.partial.jsonl`);
  const done = new Map(J(partial).map((r) => [r.id, r]));
  for (const it of items) {
    if (done.has(it.id)) continue;
    const p = promptOf(it);
    const t0 = Date.now();
    const { verdict, reply } = await ask(j, p, fieldOf(it));
    const row = { set: it.set, id: it.id, promptSha256: sha(p), verdict, reply, ms: Date.now() - t0, at: new Date().toISOString() };
    fs.appendFileSync(partial, JSON.stringify(row) + '\n'); done.set(it.id, row);
    console.log(JSON.stringify({ id: row.id, verdict, ms: row.ms }));
    if (j.gapMs) await sleep(j.gapMs);
  }
  const rows = items.map((it) => done.get(it.id));
  const summary = { judge: name, label: j.label, vendor: j.vendor, ...scoreJudge(rows) };
  fs.writeFileSync(path.join(here, `judgements-${name}.json`), JSON.stringify({ summary, results: rows }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

function report() {
  const table = Object.keys(JUDGES).filter((n) => fs.existsSync(path.join(here, `judgements-${n}.json`)))
    .map((n) => { const f = JSON.parse(fs.readFileSync(path.join(here, `judgements-${n}.json`), 'utf8')); return { judge: n, label: JUDGES[n].label, vendor: JUDGES[n].vendor, ...scoreJudge(f.results) }; });
  fs.writeFileSync(path.join(here, 'calibration.json'), JSON.stringify({ itemsSha256: sha(fs.readFileSync(path.join(here, 'items.jsonl'), 'utf8')), judges: table }, null, 2) + '\n');
  for (const r of table) console.log(`${r.judge.padEnd(9)} kappa ${r.kappa?.toFixed(3)} agree ${(100 * r.agreement).toFixed(1)}% greekCtlMissed ${r.greekControlsMissed}/8 a3CtlMissed ${r.a3ControlsMissed}/20 unparseable ${r.unparseable} -> ${r.pass ? 'PASS' : 'FAIL'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--report')) report(); else await run(arg('--judge'));
}
