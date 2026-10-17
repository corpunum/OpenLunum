#!/usr/bin/env node
// OMW round-trip v2: does Greek variant-lemma merging beat surface and plain lemma mode on a FRESH
// 300-item set (v1's 300 excluded)? Three configs, same scorer path as v1: surface (baseline),
// lemma (UniMorph classes), lemma+variant (variant classes merged). Bar fixed in PREREG.md:
// lemma+variant top-5 >= surface top-5 + 0.03. No model calls. CPU only.
//   node score.mjs --corpora <dir> --out results.json [--miner <binary>]
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const miner = process.argv.includes('--miner') ? resolve(arg('--miner')) : resolve(here, '../../../tools/pivot-miner/target/release/pivot-miner');
const C = arg('--corpora');
const { items } = JSON.parse(fs.readFileSync(join(here, 'items.json'), 'utf8'));
const tmp = fs.mkdtempSync(join(os.tmpdir(), 'omw-rt2-'));
const run = (args) => { const r = spawnSync(miner, args, { encoding: 'utf8', maxBuffer: 1 << 30 }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout; };

const ELL = `${C}/unimorph-ell/src/ell`; const ENG = `${C}/unimorph-eng/src/eng`;
const CONFIGS = [
  { name: 'europarl-surface', corpus: [`${C}/europarl-opus-v8`], lemma: false, variant: false, primary: true },
  { name: 'europarl-lemma', corpus: [`${C}/europarl-opus-v8`], lemma: true, variant: false, primary: true },
  { name: 'europarl-lemma-variant', corpus: [`${C}/europarl-opus-v8`], lemma: true, variant: true, primary: true },
];
const TOP = 5;

const qfile = join(tmp, 'q.tsv');
fs.writeFileSync(qfile, items.map((i) => `translate\ten\t${i.en}`).join('\n') + '\n');
const outputs = {};
for (const c of CONFIGS) {
  const args = [...c.corpus, '--queries', qfile, '--no-roundtrip', ...(c.lemma ? ['--lemmas-en', ENG, '--lemmas-el', ELL, ...(c.variant ? ['--variant-lemmas'] : [])] : [])];
  outputs[c.name] = run(args).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.error(`${c.name}: ${outputs[c.name].length} answers`);
}

// Classification by the miner's own lemma rules, per config space: plain lemma classes for
// surface+lemma, merged variant classes for lemma+variant (membership is exact (stem, class) equality).
const words = new Set(items.flatMap((i) => i.gold));
for (const o of Object.values(outputs)) for (const a of o) for (const c of a.candidates ?? []) if (!c.text.includes(' ')) words.add(c.text);
const wfile = join(tmp, 'w.txt'); fs.writeFileSync(wfile, [...words].join('\n') + '\n');
const clsPlain = new Map(run(['--classify', ELL, wfile]).split('\n').filter(Boolean).map((l) => l.split('\t')));
const clsVariant = new Map(run(['--classify', ELL, wfile, '--variant-lemmas']).split('\n').filter(Boolean).map((l) => l.split('\t')));

const perConfig = {};
for (const c of CONFIGS) {
  const cls = c.variant ? clsVariant : clsPlain;
  const rows = items.map((it, k) => {
    const a = outputs[c.name][k];
    if (a.query !== it.en) throw new Error(`order mismatch at ${k}`);
    const gold = new Set(it.gold.map((g) => cls.get(g)));
    const uni = (a.candidates ?? []).filter((x) => !x.text.includes(' ')).slice(0, TOP).map((x) => cls.get(x.text));
    const rank = uni.findIndex((u) => gold.has(u));
    return { en: it.en, found: a.found ?? 0, candidates: uni, rank: rank < 0 ? null : rank + 1 };
  });
  const n = rows.length;
  perConfig[c.name] = { n, top1: rows.filter((r) => r.rank === 1).length / n, top5: rows.filter((r) => r.rank !== null).length / n,
    noCandidates: rows.filter((r) => r.candidates.length === 0).length, rows };
}
const paired = (a, b) => { // McNemar discordant counts for top-5
  const A = perConfig[a].rows, B = perConfig[b].rows;
  return { onlyA: A.filter((r, i) => r.rank !== null && B[i].rank === null).length, onlyB: A.filter((r, i) => r.rank === null && B[i].rank !== null).length };
};
const sv = perConfig['europarl-surface'].top5, lv = perConfig['europarl-lemma-variant'].top5;
const out = {
  level: 'tool measurement (not a Lunum level): word translation against an independent wordnet gold',
  bars: { H1: 'lemma+variant top-5 >= surface top-5 + 0.03 (fresh 300, seed pivot-omw-roundtrip-v2:2026-10-17)', H2: 'lemma+variant top-5 >= 0.60 (reported, not a bar)' },
  verdict: { H1: lv >= sv + 0.03, H2: lv >= 0.6 },
  summary: Object.fromEntries(Object.entries(perConfig).map(([k, v]) => [k, { n: v.n, top1: +v.top1.toFixed(3), top5: +v.top5.toFixed(3), noCandidates: v.noCandidates }])),
  pairedTop5: { lemma_vs_variant: paired('europarl-lemma', 'europarl-lemma-variant'), surface_vs_variant: paired('europarl-surface', 'europarl-lemma-variant') },
  perConfig,
};
fs.writeFileSync(arg('--out'), JSON.stringify(out, null, 1) + '\n');
const { perConfig: _, ...summary } = out;
console.log(JSON.stringify(summary, null, 2));
