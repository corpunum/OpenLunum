#!/usr/bin/env node
// Model layer, step 2: check every model proposal against Europarl with `pivot-miner pair`.
// Pairs checked: the model's explicit pairs, seed-English x each proposed Greek phrase, and each proposed
// English phrase x seed-Greek. Exploratory; Europarl is parliamentary, so "not attested" does not mean wrong.
//   node verify.mjs <corpus-dir> --proposals a.jsonl,b.jsonl --out verified.json [--prefix TED2020.el-en] [--max-lines N] [--label name]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seeds } from './propose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const miner = resolve(here, '../../tools/pivot-miner/target/release/pivot-miner');
const G2_001 = 10.83; // chi-square, 1 df, p < 0.001

/** exact: the phrase pair co-occurs in at least one aligned line; stem: at least 3 lines with G² above p<0.001. */
export function verdict(r) {
  const exact = r.exact && r.exact.both >= 1;
  const stem = r.stem.both >= 3 && r.stem.g2 >= G2_001;
  return exact && r.exact.both >= 3 && r.exact.g2 >= G2_001 ? 'attested-exact' : stem ? 'attested-stem' : exact ? 'weak' : 'not-attested';
}

async function main() {
  const dir = process.argv[2];
  const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
  const bySeed = new Map(seeds().map((s) => [s.id, s]));
  const rows = arg('--proposals').split(',').flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const wanted = new Map(); // "en\tel" -> [{seed, model, origin}]
  const add = (en, el, seed, model, origin) => {
    const k = `${en.trim()}\t${el.trim()}`;
    if (!wanted.has(k)) wanted.set(k, []);
    wanted.get(k).push({ seed, model, origin });
  };
  for (const s of bySeed.values()) add(s.en, s.el, s.id, 'seed', 'seed');
  for (const r of rows) {
    if (!r.proposals) continue;
    const s = bySeed.get(r.seed);
    for (const [en, el] of r.proposals.pairs) add(en, el, r.seed, r.model, 'pair');
    for (const el of r.proposals.el) add(s.en, el, r.seed, r.model, 'el-variant');
    for (const en of r.proposals.en) add(en, s.el, r.seed, r.model, 'en-variant');
  }
  const queries = [...wanted.keys()].map((k) => `pair\t${k}`).join('\n') + '\n';
  const qfile = join(fs.mkdtempSync('/tmp/pivot-verify-'), 'q.tsv');
  fs.writeFileSync(qfile, queries);
  const extra = ['--prefix', '--max-lines'].flatMap((k) => (process.argv.includes(k) ? [k, arg(k)] : []));
  const run = spawnSync(miner, [dir, '--queries', qfile, ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.status !== 0) throw new Error(run.stderr);
  const results = run.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const checked = results.map((r) => ({ en: r.en, el: r.el, verdict: verdict(r), exact: r.exact, stem: r.stem, from: wanted.get(`${r.en}\t${r.el}`) }));

  const summary = {};
  for (const c of checked) for (const f of c.from) {
    const m = (summary[f.model] ??= { proposals: 0, 'attested-exact': 0, 'attested-stem': 0, weak: 0, 'not-attested': 0 });
    m.proposals += 1; m[c.verdict] += 1;
  }
  const out = { status: 'exploratory, self-reviewed', corpus: process.argv.includes('--label') ? arg('--label') : 'OPUS Europarl v8 el-en', corpusArgs: extra, g2Threshold: G2_001,
    modelsFailedToParse: rows.filter((r) => !r.proposals).map((r) => `${r.model}:${r.seed}`), summary, checked };
  fs.writeFileSync(arg('--out'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ pairsChecked: checked.length, summary }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
