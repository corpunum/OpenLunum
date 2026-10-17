#!/usr/bin/env node
// Held-out EN/EL pairs for ADR 0029 (Greek frames + deixis). Deterministic; no model call.
//   node select.mjs <europarl-dir> <out-requests-outside-repo.jsonl>
// Europarl text is written only to the given path (outside the repository); pairs.json (committed) holds
// handles, hashes and, for Tatoeba (CC-BY, already in the repository), the sentences.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createInterface } from 'node:readline';

const root = new URL('../../', import.meta.url).pathname;
const here = `${root}experiments/greek-frames-heldout-v1/`;
const SEED = 'greek-frames-heldout-v1:2026-10-17';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const rank = (k) => sha(`${SEED}|${k}`);
const words = (t) => t.trim().split(/\s+/u).length;
const [europarl, outReq] = process.argv.slice(2);
if (!europarl || !outReq || outReq.startsWith(root)) throw new Error('usage: select.mjs <europarl-dir> <requests path outside the repo>');
const contractHash = JSON.parse(fs.readFileSync(`${root}experiments/natural-development-v8/extraction/public-instruction-package-v23.json`, 'utf8')).freeze.coreContractHash;

// --- Europarl: 30 single aligned lines, excluding every line of parallel-document-v1's selection (8-line windows).
const used = new Set();
for (const p of JSON.parse(fs.readFileSync(`${root}experiments/parallel-document-v1/selection.json`, 'utf8')).passages) for (let j = 0; j < p.window; j += 1) used.add(p.line + j);
const en = []; const el = [];
for await (const l of createInterface({ input: fs.createReadStream(`${europarl}/Europarl.el-en.en`, 'utf8') })) en.push(l);
for await (const l of createInterface({ input: fs.createReadStream(`${europarl}/Europarl.el-en.el`, 'utf8') })) el.push(l);
const ok = (s) => s.length >= 25 && s.length <= 200 && !s.startsWith('(') && /[.!?;]$/u.test(s.trim());
const epCandidates = [];
for (let i = 0; i < en.length; i += 1) if (!used.has(i) && ok(en[i]) && ok(el[i]) && en[i] !== el[i]) epCandidates.push(i);
const ep = epCandidates.sort((a, b) => (rank(`ep|${a}`) < rank(`ep|${b}`) ? -1 : 1)).slice(0, 30);

// --- Tatoeba: 20 EN/EL pairs never used in the tracked repository; 10 first/second person without a Greek subject pronoun.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter((f) => f && !f.startsWith('datasets/third-party/tatoeba') && !f.startsWith('experiments/greek-frames-heldout-v1/') && !/\.(png|jpe?g|gif|pdf|zip|gz)$/iu.test(f));
let corpus = ''; for (const f of tracked) { try { if (fs.statSync(root + f).size < 50e6) corpus += '\n' + fs.readFileSync(root + f, 'utf8').toLowerCase(); } catch {} }
const rows = fs.readFileSync(`${root}datasets/third-party/tatoeba-eng-ell-2026-10/ell.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const seen = new Set();
const sorted = rows.filter(([e, g]) => { const k = `${e}\t${g}`; if (seen.has(k)) return false; seen.add(k); return words(e) >= 4 && words(e) <= 15; })
  .sort((a, b) => (rank(`t|${a[0]}|${a[1]}`) < rank(`t|${b[0]}|${b[1]}`) ? -1 : 1));
const unused = ([e, g]) => !corpus.includes(e.toLowerCase()) && !corpus.includes(g.toLowerCase());
const PRON = /(^|[^\p{L}])(εγώ|εσύ|εμείς|εσείς)([^\p{L}]|$)/iu;
const isDeictic = ([e, g]) => /^(I|I'm|I'll|I've|I'd|We|We're|We'll|You|You're|You'll)\b/u.test(e) && !PRON.test(g);
// Walk the seeded order once, checking repository use lazily (a full scan per row is too slow).
const deictic = []; const rest = []; let tatoebaChecked = 0;
for (const r of sorted) {
  if (deictic.length >= 10 && rest.length >= 10) break;
  const want = isDeictic(r) ? deictic : rest;
  if (want.length >= 10) continue;
  tatoebaChecked += 1;
  if (unused(r)) want.push(r);
}
const tat = sorted;
const request = (text, lang, tag) => ({ handle: `gfh1-${sha(`${tag}\n${lang}\n${text}`).slice(0, 16)}`, sourceLanguage: lang, sourceText: text, sourceSha256: sha(text), contractHash });
const pairs = [];
const requests = [];
ep.forEach((i, k) => { const a = request(en[i], 'en', `ep${i}`); const b = request(el[i], 'el', `ep${i}`); requests.push(a, b); pairs.push({ pair: `E${k + 1}`, source: 'europarl', line: i, en: a.handle, el: b.handle, enSha256: a.sourceSha256, elSha256: b.sourceSha256 }); });
[...deictic.map((r) => [r, 'deictic']), ...rest.map((r) => [r, 'other'])].forEach(([[e, g], group], k) => { const a = request(e, 'en', `t${e}`); const b = request(g, 'el', `t${g}`); requests.push(a, b); pairs.push({ pair: `T${k + 1}`, source: 'tatoeba', group, en: a.handle, el: b.handle, enText: e, elText: g }); });
fs.writeFileSync(outReq, requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(`${here}pairs.json`, JSON.stringify({ seed: SEED, requestsSha256: sha(fs.readFileSync(outReq, 'utf8')), contractHash, europarlCandidates: epCandidates.length, tatoebaEligible: tat.length, tatoebaChecked, deicticFound: deictic.length, pairs }, null, 1) + '\n');
console.log({ pairs: pairs.length, requests: requests.length, deictic: deictic.length });
