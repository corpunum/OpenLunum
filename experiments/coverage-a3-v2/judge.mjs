#!/usr/bin/env node
// coverage-a3-v2 bar 2 (level b): the calibrated judges (experiments/judge-calibration-v1) on the Rust generic-en-pivot/0.3
// rendering of each covered record, with the English prompt they were calibrated with (judges.mjs, byte-identical),
// plus 20 seeded controls (a record paired with another covered sentence; "yes" is wrong).
// Resumable (<out>.partial.jsonl). One call at a time, temperature 0. A judge must have passed calibration (checked).
//   node judge.mjs --result score.json --requests requests.jsonl --judge <name> --out bar2/judgements-<name>.json
//   node judge.mjs --agreement bar2/judgements-a.json,bar2/judgements-b.json   (bar 2 verdict)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JUDGES, ask, englishPrompt, sleep } from '../judge-calibration-v1/judges.mjs';

const SEED = 'coverage-a3-v2-judge:2026-10-23';
const here = path.dirname(new URL(import.meta.url).pathname);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function agreement(files) {
  const [a, b] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const own = (x) => new Map(x.results.filter((r) => r.kind === 'own').map((r) => [r.id, r.states === true]));
  const ma = own(a); const mb = own(b); const ids = [...ma.keys()].filter((k) => mb.has(k));
  const agree = ids.filter((k) => ma.get(k) === mb.get(k)).length;
  const rate = ids.length ? agree / ids.length : null;
  const each = [a.summary, b.summary].map((s) => ({ judge: s.judge, rate: s.rate, controlsFalseYes: s.controlsFalseYes, judgeValid: s.judgeValid, covered: s.covered }));
  const verdictPossible = ids.length >= 30 && each.every((s) => s.judgeValid);
  return { each, both: ids.length, agree, agreement: rate, bothReject: ids.filter((k) => !ma.get(k) && !mb.get(k)),
    verdictPossible, pass: verdictPossible ? each.every((s) => s.rate >= 0.8) && rate >= 0.75 : null };
}

async function main() {
  if (arg('--agreement')) { console.log(JSON.stringify(agreement(arg('--agreement').split(',')), null, 2)); return; }
  const name = arg('--judge'); const j = JUDGES[name]; if (!j) throw new Error('unknown judge');
  const cal = JSON.parse(fs.readFileSync(path.join(here, '../judge-calibration-v1/calibration.json'), 'utf8')).judges.find((x) => x.judge === name);
  // --deviation "<reason>": owner-approved use of a judge that did not pass calibration; recorded in the output and must be reported as a deviation.
  const deviation = arg('--deviation');
  if (!cal?.pass && !deviation) throw new Error(`judge_not_calibrated:${name}`);
  const text = new Map(J(arg('--requests')).map((r) => [r.handle, r.sourceText]));
  const result = JSON.parse(fs.readFileSync(arg('--result'), 'utf8'));
  if (!result.parity?.pass) throw new Error('rust_ts_render_parity_not_established');
  const cov = result.renders;
  const items = cov.map((r) => ({ kind: 'own', id: r.handle, sentence: text.get(r.handle), code: r.code }));
  const order = [...cov].sort((x, y) => (sha(`${SEED}|${x.handle}`) < sha(`${SEED}|${y.handle}`) ? -1 : 1));
  for (let i = 0; i < Math.min(20, order.length - 1); i += 1) items.push({ kind: 'control', id: `${order[i].handle}~${order[i + 1].handle}`, sentence: text.get(order[i].handle), code: order[i + 1].code });
  const partial = `${arg('--out')}.partial.jsonl`;
  const done = new Map(J(partial).map((r) => [`${r.kind}|${r.id}`, r]));
  for (const it of items) {
    if (done.has(`${it.kind}|${it.id}`)) continue;
    const p = englishPrompt(it.sentence, it.code);
    const { verdict, reply } = await ask(j, p, 'states');
    const row = { kind: it.kind, id: it.id, promptSha256: sha(p), states: verdict, reply };
    fs.appendFileSync(partial, JSON.stringify(row) + '\n'); done.set(`${it.kind}|${it.id}`, row);
    console.log(JSON.stringify({ kind: row.kind, id: row.id, states: verdict }));
    if (j.gapMs) await sleep(j.gapMs);
  }
  const results = items.map((it) => done.get(`${it.kind}|${it.id}`));
  const own = results.filter((r) => r.kind === 'own'); const ctl = results.filter((r) => r.kind === 'control');
  const summary = { judge: j.label, covered: own.length, states: own.filter((r) => r.states === true).length, unparseable: results.filter((r) => r.states === null).length,
    controls: ctl.length, controlsFalseYes: ctl.filter((r) => r.states === true).length };
  summary.rate = own.length ? summary.states / own.length : null;
  summary.judgeValid = ctl.length >= 20 && summary.controlsFalseYes <= 2;
  summary.calibrated = !!cal?.pass;
  if (deviation) summary.deviation = { reason: deviation, calibrationKappa: cal?.kappa ?? null };
  fs.writeFileSync(arg('--out'), JSON.stringify({ summary, results }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
