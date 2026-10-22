#!/usr/bin/env node
// Owner judge-calibration worksheet (plan stage P3 prep): deterministic candidate selection. No model call.
// Pool = Tatoeba EN-EL pairs (same file, same filters as ../select.mjs) MINUS: the 160 held-out and 20 dev pairs of
// pivot-el-en-v1 (excluded by sha256 of the English and Greek strings only; their text is never printed or used),
// MINUS anything whose English or Greek text occurs elsewhere in the tracked repository (as ../select.mjs).
// Sampling: sha256-ordered with seed `pivot-el-en-v1:calibration:2026-10-22`, first-come, one pair per English and per Greek
// sentence. Greek 4-14 words (phone-readable). Output: candidates.json = { normal: [...36], control: [...16] }.
//   control candidates: the first in seeded order whose Greek contains negation (max 9) / modality (max 7) / a digit number (max 4)
//   (so a known meaning change can later be injected into the round trip); normal = the next 36 of any kind.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const root = new URL('../../../', import.meta.url).pathname;
const here = new URL('./', import.meta.url).pathname;
const SEED = 'pivot-el-en-v1:calibration:2026-10-22';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const words = (t) => t.trim().split(/\s+/u).length;
const pairs = JSON.parse(fs.readFileSync(root + 'experiments/pivot-el-en-v1/pairs.json', 'utf8'));
const excl = new Set(); // hashes only
for (const part of ['heldout', 'dev']) for (const p of pairs[part]) { excl.add(p.enSha256); excl.add(p.elSha256); }
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean)
  .filter((f) => !f.startsWith('datasets/third-party/tatoeba') && !f.startsWith('experiments/pivot-el-en-v1/') && !/\.(png|jpe?g|gif|pdf|zip|gz|gguf|bin|woff2?)$/iu.test(f));
let corpus = '';
for (const f of tracked) { try { const s = fs.statSync(root + f); if (s.size < 50e6) corpus += '\n' + fs.readFileSync(root + f, 'utf8').toLowerCase(); } catch {} }
const seen = (s) => corpus.includes(s.toLowerCase());
const rows = fs.readFileSync(root + 'datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const eligible = rows.filter(([en, el]) => en && el && words(en) >= 4 && words(en) <= 20 && words(el) >= 4 && words(el) <= 14);
const order = [...eligible].sort((a, b) => { const x = sha(`${SEED}:${a[0]}\t${a[1]}`), y = sha(`${SEED}:${b[0]}\t${b[1]}`); return x < y ? -1 : x > y ? 1 : 0; });
const feat = (el) => /(^|\s)δεν\s/iu.test(el) ? 'neg' : /(πρέπει να|μπορ(ώ|είς|εί|ούμε|είτε|ούν) να)/iu.test(el) ? 'mod' : /\d/.test(el) ? 'num' : null;
const usedEn = new Set(), usedEl = new Set(); const normal = [], control = []; let excludedHeld = 0, excludedSeen = 0;
for (const [en, el, attribution] of order) {
  if (normal.length >= 36 && control.length >= 20) break;
  if (excl.has(sha(en)) || excl.has(sha(el))) { excludedHeld++; continue; }
  if (usedEn.has(en) || usedEl.has(el)) continue;
  if (seen(en) || seen(el)) { excludedSeen++; continue; }
  const f = feat(el); const item = { en, el, attribution, feature: f };
  const cap = { neg: 9, mod: 7, num: 4 }; if (f && control.filter((c) => c.feature === f).length < cap[f]) { control.push(item); usedEn.add(en); usedEl.add(el); }
  else if (normal.length < 36) { normal.push(item); usedEn.add(en); usedEl.add(el); }
}
normal.forEach((x, i) => (x.cand = `N${i + 1}`)); control.forEach((x, i) => (x.cand = `C${i + 1}`));
fs.writeFileSync(here + 'candidates.json', JSON.stringify({ seed: SEED, eligible: eligible.length, excludedHeldoutOrDev: excludedHeld, excludedSeenElsewhere: excludedSeen, normal, control }, null, 1) + '\n');
console.log({ eligible: eligible.length, excludedHeld, excludedSeen, normal: normal.length, control: control.length, features: control.map((c) => c.feature).join(',') });
