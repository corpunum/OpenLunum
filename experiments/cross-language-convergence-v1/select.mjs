#!/usr/bin/env node
// Deterministic selection for cross-language-convergence-v1 (no model calls).
// Writes: requests-s1.jsonl, requests-s2.jsonl, requests-s3.jsonl (source-only, runner format)
// and pairs.jsonl (the grouping; never given to the extractor).
//   node experiments/cross-language-convergence-v1/select.mjs
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const dir = `${root}experiments/cross-language-convergence-v1/`;
const SEED = 'clc-v1-2026-10-16';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const rank = (key) => sha(`${SEED}:${key}`);
const words = (t) => t.trim().split(/\s+/u).length;

// S1: the 40 owner-supplied sourced pairs (Part C of the owner worksheet).
const worksheet = fs.readFileSync(`${root}experiments/owner-greek-review-v1/WORKSHEET.filled.md`, 'utf8');
const s1 = [...worksheet.matchAll(/### (C\d+)\s+EN: (.+?)\s*\n\s*EL: (.+?)\s*\n/gu)].map((m) => ({ pair: m[1], en: m[2].replace(/\s+/gu, ' ').trim(), el: m[3].replace(/\s+/gu, ' ').trim() }));
if (s1.length !== 40) throw new Error(`expected 40 C pairs, found ${s1.length}`);

// Tatoeba rows; S1 sentences are excluded from S2/S3.
const rows = fs.readFileSync(`${root}datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const used = new Set(s1.flatMap((p) => [p.en, p.el]));
const byEn = new Map();
for (const [en, el] of rows) { if (used.has(en) || used.has(el)) continue; if (!byEn.has(en)) byEn.set(en, []); if (!byEn.get(en).includes(el)) byEn.get(en).push(el); }
const eligible = [...byEn.keys()].filter((en) => words(en) >= 4 && words(en) <= 20).sort((a, b) => rank(a).localeCompare(rank(b)));
// S2: 40 EN/EL pairs (first listed Greek translation), from English sentences with exactly one translation.
const s2 = eligible.filter((en) => byEn.get(en).length === 1).slice(0, 40).map((en, i) => ({ pair: `T${i + 1}`, en, el: byEn.get(en)[0] }));
// S3: 15 Greek paraphrase pairs: two different human Greek translations of one English sentence.
const s3 = eligible.filter((en) => byEn.get(en).length >= 2).slice(0, 15).map((en, i) => ({ pair: `P${i + 1}`, en, el: byEn.get(en)[0], el2: byEn.get(en)[1] }));

// Each request binds the frozen contract of package v22 (the runner refuses rows without it).
const contractHash = JSON.parse(fs.readFileSync(`${root}experiments/natural-development-v8/extraction/public-instruction-package-v22.json`, 'utf8')).freeze.coreContractHash;
const request = (text, language) => ({ handle: `clc1-${sha(`${language}\n${text}`).slice(0, 16)}`, sourceLanguage: language, sourceText: text, sourceSha256: sha(text), contractHash });
const write = (name, items) => fs.writeFileSync(dir + name, items.map((x) => JSON.stringify(x)).join('\n') + '\n');
write('requests-s1.jsonl', s1.flatMap((p) => [request(p.en, 'en'), request(p.el, 'el')]));
write('requests-s2.jsonl', s2.flatMap((p) => [request(p.en, 'en'), request(p.el, 'el')]));
write('requests-s3.jsonl', s3.flatMap((p) => [request(p.el, 'el'), request(p.el2, 'el')]));
write('pairs.jsonl', [
  ...s1.map((p) => ({ set: 'S1', pair: p.pair, kind: 'en-el', a: request(p.en, 'en').handle, b: request(p.el, 'el').handle })),
  ...s2.map((p) => ({ set: 'S2', pair: p.pair, kind: 'en-el', a: request(p.en, 'en').handle, b: request(p.el, 'el').handle, enSource: p.en })),
  ...s3.map((p) => ({ set: 'S3', pair: p.pair, kind: 'el-el', a: request(p.el, 'el').handle, b: request(p.el2, 'el').handle, enSource: p.en })),
]);
console.log({ s1: s1.length, s2: s2.length, s3: s3.length, eligibleEnglish: eligible.length });
