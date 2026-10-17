#!/usr/bin/env node
// Deterministic selection of the R4 round-trip set (EN -> Lunum -> EN). No model call.
// Fresh seeded English Tatoeba sentences (CC-BY, already in the repository) that appear nowhere else in
// the tracked repository, so no earlier gate, probe or held-out set overlaps.
// Writes requests.jsonl (source-only, runner format) and selection.json.
//   node experiments/roundtrip-en-v1/select.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const dir = `${root}experiments/roundtrip-en-v1/`;
const SEED = 'roundtrip-en-v1:2026-10-17';
const N = 200;
const PACKAGE = 'experiments/natural-development-v8/extraction/public-instruction-package-v25.json';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const words = (t) => t.trim().split(/\s+/u).length;

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean)
  .filter((f) => !f.startsWith('datasets/third-party/tatoeba') && !f.startsWith('experiments/roundtrip-en-v1/') && !/\.(png|jpe?g|gif|pdf|zip|gz|gguf|bin|woff2?)$/iu.test(f));
let corpus = '';
for (const f of tracked) { try { const s = fs.statSync(root + f); if (s.size < 50e6) corpus += '\n' + fs.readFileSync(root + f, 'utf8').toLowerCase(); } catch {} }
const seenElsewhere = (s) => corpus.includes(s.toLowerCase());

const rows = fs.readFileSync(`${root}datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const eligible = [...new Set(rows.map(([en]) => en))].filter((en) => words(en) >= 4 && words(en) <= 20)
  .sort((a, b) => { const x = sha(`${SEED}:${a}`), y = sha(`${SEED}:${b}`); return x < y ? -1 : x > y ? 1 : 0; });
const picked = []; let excluded = 0;
for (const en of eligible) { if (picked.length === N) break; if (seenElsewhere(en)) { excluded += 1; continue; } picked.push(en); }

const contractHash = JSON.parse(fs.readFileSync(root + PACKAGE, 'utf8')).freeze.coreContractHash;
const request = (text) => ({ handle: `rt1-${sha(`en\n${text}`).slice(0, 16)}`, sourceLanguage: 'en', sourceText: text, sourceSha256: sha(text), contractHash });
const reqs = picked.map(request);
fs.writeFileSync(dir + 'requests.jsonl', reqs.map((x) => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(dir + 'selection.json', JSON.stringify({ seed: SEED, n: N, package: PACKAGE, eligibleEnglish: eligible.length, excludedBecauseSeenElsewhere: excluded,
  exclusionFilesScanned: tracked.length, requestsSha256: sha(fs.readFileSync(dir + 'requests.jsonl', 'utf8')), contractHash,
  handles: reqs.map((r) => ({ handle: r.handle, sourceSha256: r.sourceSha256 })) }, null, 2) + '\n');
console.log({ picked: picked.length, eligible: eligible.length, excluded, filesScanned: tracked.length });
