#!/usr/bin/env node
// Combines verify.mjs outputs from several corpora into one candidate table for owner review.
// Per EN/EL pair: which models proposed it, and exact/stem evidence per corpus. Exploratory.
//   node combine.mjs --in a.json,b.json,c.json --out candidates.json
import fs from 'node:fs';
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const runs = arg('--in').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const rank = { 'attested-exact': 3, 'attested-stem': 2, weak: 1, 'not-attested': 0 };
const table = new Map();
for (const run of runs) for (const c of run.checked) {
  const k = `${c.en}\t${c.el}`;
  const row = table.get(k) ?? { seed: c.from[0].seed, en: c.en, el: c.el, proposedBy: new Set(), evidence: {} };
  c.from.forEach((f) => row.proposedBy.add(f.model));
  row.evidence[run.corpus] = { verdict: c.verdict, exactLines: c.exact?.both ?? null, stemLines: c.stem.both };
  table.set(k, row);
}
const rows = [...table.values()].map((r) => {
  const best = Object.values(r.evidence).reduce((b, e) => (rank[e.verdict] > rank[b] ? e.verdict : b), 'not-attested');
  return { ...r, proposedBy: [...r.proposedBy].sort(), best };
}).sort((a, b) => a.seed.localeCompare(b.seed) || rank[b.best] - rank[a.best] || a.en.localeCompare(b.en));
const models = ['qwen', 'gemma'];
const summary = Object.fromEntries(models.map((m) => {
  const mine = rows.filter((r) => r.proposedBy.includes(m));
  return [m, { pairs: mine.length, bestExact: mine.filter((r) => r.best === 'attested-exact').length, bestStem: mine.filter((r) => r.best === 'attested-stem').length, none: mine.filter((r) => r.best === 'not-attested').length }];
}));
const both = rows.filter((r) => models.every((m) => r.proposedBy.includes(m)));
summary.proposedByBothFamilies = { pairs: both.length, bestExact: both.filter((r) => r.best === 'attested-exact').length };
const one = rows.filter((r) => models.filter((m) => r.proposedBy.includes(m)).length === 1);
summary.proposedByOneFamily = { pairs: one.length, bestExact: one.filter((r) => r.best === 'attested-exact').length };
fs.writeFileSync(arg('--out'), JSON.stringify({ status: 'exploratory, self-reviewed; candidates for owner review, not identities', corpora: runs.map((r) => r.corpus), summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
