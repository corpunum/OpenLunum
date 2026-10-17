#!/usr/bin/env node
// OMW round-trip measurement: does pivot-miner (translate EN -> EL) rank a wordnet translation of the
// English word among its top-5 single-word Greek candidates? Surface vs lemma mode, Europarl (primary)
// and OpenSubtitles first 10M pairs (secondary). See PREREGISTRATION.md. No model calls.
//   node score.mjs --corpora <dir> --out results.json
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const miner = resolve(here, '../../../tools/pivot-miner/target/release/pivot-miner');
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const C = arg('--corpora');
const { items } = JSON.parse(fs.readFileSync(join(here, 'items.json'), 'utf8'));
const tmp = fs.mkdtempSync(join(os.tmpdir(), 'omw-rt-'));
const run = (args) => { const r = spawnSync(miner, args, { encoding: 'utf8', maxBuffer: 1 << 30 }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout; };

const ELL = `${C}/unimorph-ell/src/ell`; const ENG = `${C}/unimorph-eng/src/eng`;
const CONFIGS = [
  { name: 'europarl-surface', corpus: [`${C}/europarl-opus-v8`], lemma: false, primary: true },
  { name: 'europarl-lemma', corpus: [`${C}/europarl-opus-v8`], lemma: true, primary: true },
  { name: 'opensubtitles10m-surface', corpus: [`${C}/opensubtitles-v2018`, '--prefix', 'OpenSubtitles.el-en', '--max-lines', '10000000'], lemma: false },
  { name: 'opensubtitles10m-lemma', corpus: [`${C}/opensubtitles-v2018`, '--prefix', 'OpenSubtitles.el-en', '--max-lines', '10000000'], lemma: true },
];
const TOP = 5;

const qfile = join(tmp, 'q.tsv');
fs.writeFileSync(qfile, items.map((i) => `translate\ten\t${i.en}`).join('\n') + '\n');
const outputs = {};
for (const c of CONFIGS) {
  const args = [...c.corpus, '--queries', qfile, '--no-roundtrip', ...(c.lemma ? ['--lemmas-en', ENG, '--lemmas-el', ELL] : [])];
  outputs[c.name] = run(args).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.error(`${c.name}: ${outputs[c.name].length} answers`);
}

// One classification, by the miner's own lemma rules, for gold words and every candidate in every config.
const words = new Set(items.flatMap((i) => i.gold));
for (const o of Object.values(outputs)) for (const a of o) for (const c of a.candidates ?? []) if (!c.text.includes(' ')) words.add(c.text);
const wfile = join(tmp, 'w.txt'); fs.writeFileSync(wfile, [...words].join('\n') + '\n');
const cls = new Map(run(['--classify', ELL, wfile]).split('\n').filter(Boolean).map((l) => l.split('\t')));

const perConfig = {};
for (const c of CONFIGS) {
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
  return { onlySurface: A.filter((r, i) => r.rank !== null && B[i].rank === null).length, onlyLemma: A.filter((r, i) => r.rank === null && B[i].rank !== null).length };
};
const ep = { surface: perConfig['europarl-surface'].top5, lemma: perConfig['europarl-lemma'].top5 };
const out = {
  level: 'tool measurement (not a Lunum level): word translation against an independent wordnet gold',
  bars: { H1: 'Europarl lemma top-5 >= surface top-5 + 0.05', H2: 'Europarl lemma top-5 >= 0.60' },
  verdict: { H1: ep.lemma >= ep.surface + 0.05, H2: ep.lemma >= 0.6 },
  summary: Object.fromEntries(Object.entries(perConfig).map(([k, v]) => [k, { n: v.n, top1: +v.top1.toFixed(3), top5: +v.top5.toFixed(3), noCandidates: v.noCandidates }])),
  pairedTop5: { europarl: paired('europarl-surface', 'europarl-lemma'), opensubtitles10m: paired('opensubtitles10m-surface', 'opensubtitles10m-lemma') },
  perConfig,
};
fs.writeFileSync(arg('--out'), JSON.stringify(out, null, 1) + '\n');
const { perConfig: _, ...summary } = out;
console.log(JSON.stringify(summary, null, 2));
