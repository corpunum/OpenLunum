#!/usr/bin/env node
// Deterministic item selection for the OMW round-trip measurement (no model, no miner).
// Gold EN->EL lemma pairs come from Open Multilingual Wordnet 2.0 (pinned archive sha256 c369a2ad…8d7d):
// an English lemma and a Greek lemma are translations if they share a synset. Independent of the corpora.
//   node select.mjs <omw-2.0-dir> <europarl-dir> > items.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const SEED = 'pivot-omw-roundtrip-v1:2026-10-17';
const N = 300;
const BAND = [20, 20000]; // English line frequency in Europarl: evaluable, and not a function-like verb
const sha = (s) => createHash('sha256').update(s).digest('hex');
// Same tokenisation as pivot-miner: lower case, Greek accents and final sigma folded, split on non-alphanumerics.
const FOLD = { ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ϊ: 'ι', ΐ: 'ι', ό: 'ο', ύ: 'υ', ϋ: 'υ', ΰ: 'υ', ώ: 'ω', ς: 'σ' };
export const tokenize = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((t) => [...t].map((c) => FOLD[c] ?? c).join(''));

function entries(xml, lang) {
  const out = [];
  for (const m of xml.matchAll(/<LexicalEntry [^>]*>([\s\S]*?)<\/LexicalEntry>/gu)) {
    const lemma = /<Lemma writtenForm="([^"]+)" partOfSpeech="([nv])"/u.exec(m[1]);
    if (!lemma) continue;
    const toks = tokenize(lemma[1].replace(/&apos;/gu, "'"));
    if (toks.length !== 1) continue; // single words only
    for (const s of m[1].matchAll(new RegExp(`synset="omw-${lang}-(\\d{8}-[nv])"`, 'gu'))) out.push({ word: toks[0], synset: s[1] });
  }
  return out;
}

const [omw, europarl] = process.argv.slice(2);
const en = entries(fs.readFileSync(`${omw}/omw-en/omw-en.xml`, 'utf8'), 'en');
const el = entries(fs.readFileSync(`${omw}/omw-el/omw-el.xml`, 'utf8'), 'el');
const elBySynset = new Map();
for (const e of el) { if (!elBySynset.has(e.synset)) elBySynset.set(e.synset, new Set()); elBySynset.get(e.synset).add(e.word); }
const gold = new Map(); // english word -> greek words over all shared synsets
for (const e of en) { const g = elBySynset.get(e.synset); if (!g) continue; if (!gold.has(e.word)) gold.set(e.word, new Set()); g.forEach((w) => gold.get(e.word).add(w)); }

const freq = new Map([...gold.keys()].map((w) => [w, 0]));
for await (const line of createInterface({ input: fs.createReadStream(`${europarl}/Europarl.el-en.en`, 'utf8') })) {
  for (const t of new Set(tokenize(line))) if (freq.has(t)) freq.set(t, freq.get(t) + 1);
}
const eligible = [...gold.keys()].filter((w) => freq.get(w) >= BAND[0] && freq.get(w) <= BAND[1]).sort((a, b) => (sha(`${SEED}|${a}`) < sha(`${SEED}|${b}`) ? -1 : 1));
const items = eligible.slice(0, N).map((w) => ({ en: w, europarlLines: freq.get(w), gold: [...gold.get(w)].sort() }));
process.stdout.write(JSON.stringify({ seed: SEED, n: N, band: BAND, omwArchiveSha256: 'c369a2ad773a31e182ac4cc753132fa7c31ad423586d6783bacce08090cb8d7d',
  englishWithGreek: gold.size, eligible: eligible.length, items }, null, 1) + '\n');
