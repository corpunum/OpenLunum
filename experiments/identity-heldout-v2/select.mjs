#!/usr/bin/env node
// Deterministic selection of the ADR 0027 held-out set (no model calls).
// Fresh seeded sample of English Tatoeba sentences that appear NOWHERE else in the tracked
// repository (probes, rounds 1-2, V8, clc-v1, tests, docs), run twice by the owner-approved run.
// Writes requests.jsonl (source-only, runner format) and selection.json (ids, hashes, counts).
//   node experiments/identity-heldout-v2/select.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const dir = `${root}experiments/identity-heldout-v2/`;
const SEED = 'idgate-heldout-v2:2026-10-17';
const N = 160;
const sha = (t) => createHash('sha256').update(t).digest('hex');
const words = (t) => t.trim().split(/\s+/u).length;

// Exclusion corpus: every tracked text file except the Tatoeba export itself and this experiment.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean)
  .filter((f) => !f.startsWith('datasets/third-party/tatoeba') && !f.startsWith('experiments/identity-heldout-v2/') && !/\.(png|jpe?g|gif|pdf|zip|gz|gguf|bin|woff2?)$/iu.test(f));
let corpus = '';
for (const f of tracked) { try { const s = fs.statSync(root + f); if (s.size < 50e6) corpus += '\n' + fs.readFileSync(root + f, 'utf8').toLowerCase(); } catch {} }
const seenElsewhere = (s) => corpus.includes(s.toLowerCase());

const rows = fs.readFileSync(`${root}datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const eligible = [...new Set(rows.map(([en]) => en))].filter((en) => words(en) >= 4 && words(en) <= 20)
  .sort((a, b) => { const x = sha(`${SEED}:${a}`), y = sha(`${SEED}:${b}`); return x < y ? -1 : x > y ? 1 : 0; });
const picked = []; let excluded = 0;
for (const en of eligible) { if (picked.length === N) break; if (seenElsewhere(en)) { excluded += 1; continue; } picked.push(en); }

const contractHash = JSON.parse(fs.readFileSync(`${root}experiments/natural-development-v8/extraction/public-instruction-package-v24.json`, 'utf8')).freeze.coreContractHash;
const request = (text) => ({ handle: `idg2-${sha(`en\n${text}`).slice(0, 16)}`, sourceLanguage: 'en', sourceText: text, sourceSha256: sha(text), contractHash });
const reqs = picked.map(request);
fs.writeFileSync(dir + 'requests.jsonl', reqs.map((x) => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(dir + 'selection.json', JSON.stringify({ seed: SEED, n: N, eligibleEnglish: eligible.length, excludedBecauseSeenElsewhere: excluded,
  exclusionFilesScanned: tracked.length, requestsSha256: sha(fs.readFileSync(dir + 'requests.jsonl', 'utf8')), contractHash,
  handles: reqs.map((r) => ({ handle: r.handle, sourceSha256: r.sourceSha256 })) }, null, 2) + '\n');
console.log({ picked: picked.length, eligible: eligible.length, excluded, filesScanned: tracked.length });
