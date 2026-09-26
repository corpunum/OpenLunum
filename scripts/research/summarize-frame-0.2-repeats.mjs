#!/usr/bin/env node
// Score and summarize repeated frame-0.2 runs: V8 (successor targets) and the
// two missing-argument probe sets (frame-0.2 expectations), reporting every
// repetition plus min/max, so single-run noise is visible.
//   node scripts/research/summarize-frame-0.2-repeats.mjs reports/diagnostic/2026-09-26/frame-0.2
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: summarize-frame-0.2-repeats.mjs <frame-0.2 report dir>'); process.exit(2); }
const successor = 'experiments/natural-development-v8/frame-0.2-successor';
const reps = fs.readdirSync(dir).filter((name) => /^v8-rep\d+$/u.test(name)).map((name) => Number(name.slice(6))).sort();
const node = (...args) => execFileSync('node', args, { encoding: 'utf8' });
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const rows = reps.map((rep) => {
  const v8Dir = path.join(dir, `v8-rep${rep}`);
  const results = path.join(v8Dir, 'results.json');
  if (!fs.existsSync(results)) node('scripts/research/score-natural-source-only-extraction.mjs', successor, results, path.relative(successor, path.join(v8Dir, 'candidate-ledger.jsonl')));
  const v8 = read(results);
  const probes = [1, 2].map((set) => {
    const out = path.join(dir, `probes-v${set}-rep${rep}`, 'outcomes-frame-0.2.json');
    if (!fs.existsSync(out)) fs.writeFileSync(out, node('scripts/research/score-probe-outcomes.mjs', `experiments/probes-missing-argument-v${set}/private-expectations-frame-0.2.jsonl`, path.join(dir, `probes-v${set}-rep${rep}`, 'run-ledger.jsonl')));
    return read(out);
  });
  const cost = ['v8', 'probes-v1', 'probes-v2'].reduce((sum, prefix) => sum + read(path.join(dir, `${prefix}-rep${rep}`, 'run-summary.json')).totalCostUsd, 0);
  return {
    rep,
    v8: { sourceRelativeMatch: v8.parse.sourceRelativeMatch, parseTargets: v8.parse.attempts, exact: v8.parse.exact, comparable: v8.parse.identityComparable, falseAbstentions: v8.parse.falseAbstentions, abstainCorrect: v8.abstention.correct, abstainTargets: v8.abstention.targets, convergingGroups: v8.multilingual.candidateConverging },
    probesV1: { abstain: probes[0].byExpected.abstain, parse: probes[0].byExpected.parse },
    probesV2: { abstain: probes[1].byExpected.abstain, parse: probes[1].byExpected.parse, either: probes[1].either },
    costUsd: Number(cost.toFixed(4)),
  };
});
const range = (values) => ({ min: Math.min(...values), max: Math.max(...values) });
const summary = {
  format: 'openlunum-frame-0.2-repeats/0.1', status: 'diagnostic-development-only, self-reviewed', reps: reps.length,
  perRep: rows,
  range: {
    v8SourceRelativeMatch: range(rows.map((row) => row.v8.sourceRelativeMatch)), v8Exact: range(rows.map((row) => row.v8.exact)), v8AbstainCorrect: range(rows.map((row) => row.v8.abstainCorrect)),
    probesV1AbstainCorrect: range(rows.map((row) => row.probesV1.abstain.correct)), probesV1ParseCorrect: range(rows.map((row) => row.probesV1.parse.correct)),
    probesV2AbstainCorrect: range(rows.map((row) => row.probesV2.abstain.correct)), probesV2ParseCorrect: range(rows.map((row) => row.probesV2.parse.correct)),
  },
  totalCostUsd: Number(rows.reduce((sum, row) => sum + row.costUsd, 0).toFixed(4)),
};
fs.writeFileSync(path.join(dir, 'repeats-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
