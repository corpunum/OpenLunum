#!/usr/bin/env node
// Combines judge labels into the model-consensus gold for WORKSHEET-v2 (level b, owner-delegated).
//   node score.mjs --a labels-gemma.json --b labels-sol.json [--c labels-luna.json] --out gold.json [--disagreements disagreements.json]
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const load = (f) => (f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const A = load(arg('--a')); const B = load(arg('--b')); const C = load(arg('--c'));
const { items } = JSON.parse(fs.readFileSync(join(here, 'items.json'), 'utf8'));
const LABELS = ['S', 'B', 'I', 'D', 'X'];

const rows = items.map((it) => {
  const a = A.labels[it.id] ?? null; const b = B.labels[it.id] ?? null; const c = C ? C.labels[it.id] ?? null : null;
  let gold = null; let basis = 'unresolved';
  if (a && a === b) { gold = a; basis = 'two judges agree'; }
  else if (c && (c === a || c === b)) { gold = c; basis = 'third judge breaks the tie'; }
  return { ...it, a, b, c, gold, basis };
});
const pairs = rows.filter((r) => r.kind !== 'control');
const controls = rows.filter((r) => r.kind === 'control');
const both = rows.filter((r) => r.a && r.b);
// Cohen's kappa between judges A and B on items both labelled.
const po = both.filter((r) => r.a === r.b).length / (both.length || 1);
const pe = LABELS.reduce((s, l) => s + (both.filter((r) => r.a === l).length / (both.length || 1)) * (both.filter((r) => r.b === l).length / (both.length || 1)), 0);
const falseSame = (key) => { const lab = controls.filter((r) => r[key]); return lab.length ? lab.filter((r) => r[key] === 'S').length / lab.length : null; };
const summary = {
  level: 'b (model consensus, owner-delegated 2026-10-17); not owner gold',
  items: rows.length, pairsAndSeeds: pairs.length, controls: controls.length,
  agreementAB: +po.toFixed(3), kappaAB: +((po - pe) / (1 - pe || 1)).toFixed(3),
  controlFalseSame: { a: falseSame('a'), b: falseSame('b'), c: C ? falseSame('c') : null },
  controlsLabelledDifferentByGold: controls.filter((r) => r.gold === 'D').length,
  goldDistribution: Object.fromEntries([...LABELS, null].map((l) => [l ?? 'unresolved', pairs.filter((r) => r.gold === l).length])),
  selfProposedBySuperGemma: (() => { const s = pairs.filter((r) => (r.proposedBy ?? []).includes('gemma') && r.a && r.b); return { items: s.length, agree: s.filter((r) => r.a === r.b).length }; })(),
};
summary.judgesValid = { a: summary.controlFalseSame.a !== null && summary.controlFalseSame.a <= 0.1, b: summary.controlFalseSame.b !== null && summary.controlFalseSame.b <= 0.1 };
fs.writeFileSync(arg('--out'), JSON.stringify({ summary, rows }, null, 1) + '\n');
if (arg('--disagreements')) fs.writeFileSync(arg('--disagreements'), JSON.stringify(rows.filter((r) => !(r.a && r.a === r.b)).map((r) => r.id)) + '\n');
console.log(JSON.stringify(summary, null, 2));
