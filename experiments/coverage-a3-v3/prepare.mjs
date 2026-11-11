#!/usr/bin/env node
// coverage-a3-v3 step 3 (PREREGISTRATION.md "Order of work"): calibration items,
// the owner worksheet and the 20 bar controls. Deterministic and offline: no model call.
// Usage: node prepare.mjs [--out <dir>]   (default: this directory)
// Prints counts only, never sentences.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { renderSem, MOOD_RENDERER } from '../../packages/core/dist/src/index.js';
import { verbFirst } from './render-verb-first.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const exp = path.join(here, '..');
const CAL_SEED = 'coverage-a3-v3-calibration:2026-11-11';
const BAR_SEED = 'coverage-a3-v3-judge:2026-11-11';
const NATURAL = 32;
const CAL_CONTROLS = 8;
const BAR_CONTROLS = 20;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
// Same ordering and pairing rule as coverage-a3-v2/judge.mjs: sort by sha256(seed|handle),
// control i = sentence of order[i] with the record of order[i + 1].
const seeded = (rows, seed) => [...rows].sort((x, y) => (sha(`${seed}|${x.handle}`) < sha(`${seed}|${y.handle}`) ? -1 : 1));
const pair = (a, b, text, code) => ({ id: `${a.handle}~${b.handle}`, control: true, expected: 'no', sentence: text.get(a.handle), r0: code(b), r1: verbFirst(code(b)) });

export function prepare(outDir = here) {
  // Calibration: A3's records (coverage-a3-v1), never a sentence of coverage-a3-v2.
  const v1Text = new Map(J(path.join(exp, 'coverage-a3-v1/requests.jsonl')).map((r) => [r.handle, r.sourceText]));
  const v2Sentences = new Set(J(path.join(exp, 'coverage-a3-v2/requests.jsonl')).map((r) => r.sourceText.trim()));
  const v1 = J(path.join(exp, 'coverage-a3-v1/bar2/covered.jsonl'));
  const eligible = v1.filter((r) => v1Text.has(r.handle) && !v2Sentences.has(v1Text.get(r.handle).trim()));
  const rejectedOverlap = v1.length - eligible.length;
  const r0Of = new Map(eligible.map((r) => [r.handle, renderSem(r.sem, { profile: MOOD_RENDERER }).code]));
  const order = seeded(eligible, CAL_SEED);
  if (order.length < NATURAL + CAL_CONTROLS + 1) throw new Error(`only ${order.length} eligible calibration records`);
  const natural = order.slice(0, NATURAL).map((r, i) => ({
    id: r.handle, n: i + 1, control: false, sentence: v1Text.get(r.handle), r0: r0Of.get(r.handle), r1: verbFirst(r0Of.get(r.handle)),
  }));
  // Controls use records outside the 32 natural items, so no worksheet record reappears.
  const ctl = order.slice(NATURAL, NATURAL + CAL_CONTROLS + 1);
  const calControls = [];
  for (let i = 0; i < CAL_CONTROLS; i += 1) calControls.push(pair(ctl[i], ctl[i + 1], v1Text, (r) => r0Of.get(r.handle)));

  // Bar controls: the 139 records exactly as judged in coverage-a3-v2 (its Rust 0.3 renders).
  const v2Text = new Map(J(path.join(exp, 'coverage-a3-v2/requests.jsonl')).map((r) => [r.handle, r.sourceText]));
  const v2Renders = J(path.join(exp, 'coverage-a3-v2/bar2/rust-renders.jsonl'));
  const v2Code = new Map(v2Renders.map((r) => [r.handle, r.code]));
  const barOrder = seeded(v2Renders, BAR_SEED);
  const barControls = [];
  for (let i = 0; i < BAR_CONTROLS; i += 1) barControls.push(pair(barOrder[i], barOrder[i + 1], v2Text, (r) => v2Code.get(r.handle)));

  const worksheet = [
    '# coverage-a3-v3 calibration worksheet',
    '',
    "For each item: **does the record state the sentence's content: who did what to whom, negation, modality, mood?**",
    '',
    'Tick one box per item. "mostly" means the content is there with a small loss. Use "can\'t tell" only if you cannot decide.',
    '',
    ...natural.flatMap((it) => [
      `## ${it.n}`,
      '',
      `Sentence: ${it.sentence}`,
      '',
      `Record: \`${it.r0}\``,
      '',
      "Label: [ ] yes  [ ] mostly  [ ] no  [ ] can't tell",
      '',
    ]),
  ].join('\n');

  const counts = {
    calibrationNatural: natural.length,
    calibrationControls: calControls.length,
    barControls: barControls.length,
    calibrationEligible: eligible.length,
    rejectedOverlapWithCoverageA3v2: rejectedOverlap,
    renderer: MOOD_RENDERER,
    seeds: { calibration: CAL_SEED, bar: BAR_SEED },
  };
  fs.mkdirSync(path.join(outDir, 'calibration'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'bar'), { recursive: true });
  const jl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'calibration/items.jsonl'), jl([...natural, ...calControls]));
  fs.writeFileSync(path.join(outDir, 'calibration/WORKSHEET.md'), worksheet);
  fs.writeFileSync(path.join(outDir, 'bar/controls.jsonl'), jl(barControls));
  fs.writeFileSync(path.join(outDir, 'prepare.json'), JSON.stringify(counts, null, 2) + '\n');
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(prepare(i > -1 ? path.resolve(process.argv[i + 1]) : here)));
}
