#!/usr/bin/env node
// Builds the source-only requests for the paid/live measures: passages 1..20 of selection.json,
// one request per sentence (8 EN, then 8 EL, per passage, in passage order).
// The requests hold Europarl text, so they are written OUTSIDE the repository; only handles and
// hashes are committed (handles.json).
//   node build-requests.mjs <corpus-dir> --out <requests.jsonl outside the repo>
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const [dir] = process.argv.slice(2);
const out = process.argv[process.argv.indexOf('--out') + 1];
if (!dir || !out || resolve(out).startsWith(root)) throw new Error('usage: build-requests.mjs <corpus-dir> --out <file outside the repository>');

const sel = JSON.parse(readFileSync(join(here, 'selection.json'), 'utf8'));
const passages = sel.passages.slice(0, 20);
const W = sel.params.window;
const wanted = new Set(passages.flatMap((p) => Array.from({ length: W }, (_, j) => p.line + j)));
async function lines(path) {
  const m = new Map(); let i = 0;
  for await (const t of createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })) { if (wanted.has(i)) m.set(i, t); i += 1; }
  return m;
}
const text = { en: await lines(join(dir, 'Europarl.el-en.en')), el: await lines(join(dir, 'Europarl.el-en.el')) };
const contractHash = JSON.parse(readFileSync(join(root, 'experiments/natural-development-v8/extraction/public-instruction-package-v23.json'), 'utf8')).freeze.coreContractHash;

const requests = []; const handles = [];
passages.forEach((p, k) => {
  const en = Array.from({ length: W }, (_, j) => text.en.get(p.line + j));
  const el = Array.from({ length: W }, (_, j) => text.el.get(p.line + j));
  if (sha(en.join('\n')) !== p.enSha256 || sha(el.join('\n')) !== p.elSha256) throw new Error(`hash mismatch ${p.id}`);
  for (const [lang, rows] of [['en', en], ['el', el]]) rows.forEach((sourceText, j) => {
    const handle = `pd1-${sha(`${p.id}\n${lang}\n${j}`).slice(0, 16)}`;
    requests.push({ handle, sourceLanguage: lang, sourceText, sourceSha256: sha(sourceText), contractHash });
    handles.push({ passage: k + 1, passageId: p.id, lang, sentence: j, handle, sourceSha256: sha(sourceText) });
  });
});
const body = requests.map((r) => JSON.stringify(r)).join('\n') + '\n';
writeFileSync(out, body);
writeFileSync(join(here, 'handles.json'), JSON.stringify({ requestsSha256: sha(body), contractHash, count: requests.length, handles }, null, 2) + '\n');
console.log({ requests: requests.length, requestsSha256: sha(body) });
