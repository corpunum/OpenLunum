#!/usr/bin/env node
// Deterministic selection for the English-pivot test (plan stage P, decisions/0030). No model call.
// Tatoeba EN-EL pairs (CC-BY, already in the repository) whose English AND Greek appear nowhere else in the
// tracked repository: no earlier gate, probe or held-out set overlaps (R4, the Greek-frames pairs, ADR 0027 gates).
//   - held-out: 160 pairs (seed pivot-el-en-v1:heldout:2026-10-22), for the pre-registered P1/P2/P4 run;
//   - dev: 20 further pairs (seed pivot-el-en-v1:dev:2026-10-22), for prompt and runner smoke tests only.
// One pair per English sentence and per Greek sentence (the first in seeded order), English 4 to 20 words.
// Writes pairs.json and requests-en-human.jsonl (the human English side, runner format, held-out only).
//   node experiments/pivot-el-en-v1/select.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const dir = `${root}experiments/pivot-el-en-v1/`;
const SEEDS = { heldout: 'pivot-el-en-v1:heldout:2026-10-22', dev: 'pivot-el-en-v1:dev:2026-10-22' };
const N = { heldout: 160, dev: 20 };
const PACKAGE = 'experiments/natural-development-v8/extraction/public-instruction-package-v25.json';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const words = (t) => t.trim().split(/\s+/u).length;

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean)
  .filter((f) => !f.startsWith('datasets/third-party/tatoeba') && !f.startsWith('experiments/pivot-el-en-v1/') && !/\.(png|jpe?g|gif|pdf|zip|gz|gguf|bin|woff2?)$/iu.test(f));
let corpus = '';
for (const f of tracked) { try { const s = fs.statSync(root + f); if (s.size < 50e6) corpus += '\n' + fs.readFileSync(root + f, 'utf8').toLowerCase(); } catch {} }
const seenElsewhere = (s) => corpus.includes(s.toLowerCase());

const rows = fs.readFileSync(`${root}datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const eligible = rows.filter(([en, el]) => en && el && words(en) >= 4 && words(en) <= 20);
const contractHash = JSON.parse(fs.readFileSync(root + PACKAGE, 'utf8')).freeze.coreContractHash;
const usedEn = new Set(); const usedEl = new Set();
const out = {}; const stats = {};
for (const part of ['heldout', 'dev']) {
  const order = [...eligible].sort((a, b) => { const x = sha(`${SEEDS[part]}:${a[0]}\t${a[1]}`), y = sha(`${SEEDS[part]}:${b[0]}\t${b[1]}`); return x < y ? -1 : x > y ? 1 : 0; });
  const picked = []; let excluded = 0;
  for (const [en, el, attribution] of order) {
    if (picked.length === N[part]) break;
    if (usedEn.has(en) || usedEl.has(el)) continue;
    if (seenElsewhere(en) || seenElsewhere(el)) { excluded += 1; continue; }
    usedEn.add(en); usedEl.add(el);
    picked.push({ pair: `${part === 'heldout' ? 'P' : 'D'}${picked.length + 1}`, en, el, attribution,
      enHandle: `pv1-en-${sha(`en\n${en}`).slice(0, 16)}`, elHandle: `pv1-el-${sha(`el\n${el}`).slice(0, 16)}`, enSha256: sha(en), elSha256: sha(el) });
  }
  out[part] = picked; stats[part] = { seed: SEEDS[part], n: picked.length, excludedBecauseSeenElsewhere: excluded };
}
const request = (p) => ({ handle: p.enHandle, sourceLanguage: 'en', sourceText: p.en, sourceSha256: p.enSha256, contractHash });
fs.writeFileSync(dir + 'requests-en-human.jsonl', out.heldout.map((p) => JSON.stringify(request(p))).join('\n') + '\n');
fs.writeFileSync(dir + 'pairs.json', JSON.stringify({ package: PACKAGE, contractHash, eligiblePairs: eligible.length, exclusionFilesScanned: tracked.length, stats,
  requestsEnHumanSha256: sha(fs.readFileSync(dir + 'requests-en-human.jsonl', 'utf8')), heldout: out.heldout, dev: out.dev }, null, 1) + '\n');
console.log({ heldout: out.heldout.length, dev: out.dev.length, eligible: eligible.length, stats });
