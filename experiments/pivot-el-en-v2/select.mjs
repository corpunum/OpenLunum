#!/usr/bin/env node
// Deterministic selection for pivot-el-en-v2 (the pre-registered P1 relaxation, decisions/0030). No model call.
// Tatoeba EN-EL pairs (CC-BY 2.0 FR, already in the repository), English 4 to 20 words, one pair per English and per
// Greek sentence, seed `pivot-el-en-v2:heldout:2026-10-22`, 200 pairs `Q1`-`Q200`. Fresh: excluded are
//   (1) by sha256 of the English or the Greek string: every pair of pivot-el-en-v1 (160 held-out, 20 dev) and every
//       candidate of its owner calibration worksheet (calibration/candidates.json), so those texts are never read here;
//   (2) any pair whose English or Greek text occurs anywhere else in the tracked repository (every file except the
//       Tatoeba dataset itself and this directory): R4, A0, the A3 coverage set, the Greek-frames pairs, the ADR 0027
//       gates, probes, and everything above again.
// Writes pairs.json and requests-en-human.jsonl (human English side, runner format, bound to package v25).
//   node experiments/pivot-el-en-v2/select.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const dir = `${root}experiments/pivot-el-en-v2/`;
const SEED = 'pivot-el-en-v2:heldout:2026-10-22';
const N = 200;
const PACKAGE = 'experiments/natural-development-v8/extraction/public-instruction-package-v25.json';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const words = (t) => t.trim().split(/\s+/u).length;

const excl = new Set();
const v1 = JSON.parse(fs.readFileSync(`${root}experiments/pivot-el-en-v1/pairs.json`, 'utf8'));
for (const part of ['heldout', 'dev']) for (const p of v1[part]) { excl.add(sha(p.en)); excl.add(sha(p.el)); }
const cal = JSON.parse(fs.readFileSync(`${root}experiments/pivot-el-en-v1/calibration/candidates.json`, 'utf8'));
for (const c of [...cal.normal, ...cal.control]) { excl.add(sha(c.en)); excl.add(sha(c.el)); }

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean)
  .filter((f) => !f.startsWith('datasets/third-party/tatoeba') && !f.startsWith('experiments/pivot-el-en-v2/') && !/\.(png|jpe?g|gif|pdf|zip|gz|gguf|bin|woff2?)$/iu.test(f));
let corpus = '';
for (const f of tracked) { try { const s = fs.statSync(root + f); if (s.size < 50e6) corpus += '\n' + fs.readFileSync(root + f, 'utf8').toLowerCase(); } catch {} }
const seenElsewhere = (s) => corpus.includes(s.toLowerCase());

const rows = fs.readFileSync(`${root}datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const eligible = rows.filter(([en, el]) => en && el && words(en) >= 4 && words(en) <= 20);
const contractHash = JSON.parse(fs.readFileSync(root + PACKAGE, 'utf8')).freeze.coreContractHash;
const order = [...eligible].sort((a, b) => { const x = sha(`${SEED}:${a[0]}\t${a[1]}`), y = sha(`${SEED}:${b[0]}\t${b[1]}`); return x < y ? -1 : x > y ? 1 : 0; });
const usedEn = new Set(); const usedEl = new Set(); const picked = [];
let excludedByHash = 0; let excludedSeen = 0;
for (const [en, el, attribution] of order) {
  if (picked.length === N) break;
  if (usedEn.has(en) || usedEl.has(el)) continue;
  if (excl.has(sha(en)) || excl.has(sha(el))) { excludedByHash += 1; continue; }
  if (seenElsewhere(en) || seenElsewhere(el)) { excludedSeen += 1; continue; }
  usedEn.add(en); usedEl.add(el);
  picked.push({ pair: `Q${picked.length + 1}`, en, el, attribution,
    enHandle: `pv2-en-${sha(`en\n${en}`).slice(0, 16)}`, elHandle: `pv2-el-${sha(`el\n${el}`).slice(0, 16)}`, enSha256: sha(en), elSha256: sha(el) });
}
const request = (p) => ({ handle: p.enHandle, sourceLanguage: 'en', sourceText: p.en, sourceSha256: p.enSha256, contractHash });
fs.writeFileSync(dir + 'requests-en-human.jsonl', picked.map((p) => JSON.stringify(request(p))).join('\n') + '\n');
const stats = { seed: SEED, n: picked.length, eligiblePairs: eligible.length, exclusionHashes: excl.size, excludedByHash, excludedSeenElsewhere: excludedSeen, exclusionFilesScanned: tracked.length };
fs.writeFileSync(dir + 'pairs.json', JSON.stringify({ package: PACKAGE, contractHash, stats,
  requestsEnHumanSha256: sha(fs.readFileSync(dir + 'requests-en-human.jsonl', 'utf8')), heldout: picked }, null, 1) + '\n');
console.log(stats);
