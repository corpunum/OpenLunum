#!/usr/bin/env node
// Deterministic, seeded selection of EN/EL passages from OPUS Europarl v8 (el-en, Moses + alignment XML).
// Usage: node select.mjs <corpus-dir> [--out selection.json]
// Publishes ids, line ranges and hashes only; never the corpus text (see PREREGISTRATION-anchors.md).
import { createHash } from 'node:crypto';
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

export const PARAMS = Object.freeze({
  seed: 'parallel-document-v1:2026-10-16',
  passages: 300,
  window: 8,            // consecutive aligned pairs per passage
  minDocLinks: 40,
  minChars: 25,
  maxChars: 600,
  attempts: 20,
});

const sha = (s) => createHash('sha256').update(s).digest('hex');

async function fileSha256(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}

/** documents = linkGrp elements; the k-th <link> overall is line k of the Moses files (counts verified equal). */
async function readDocuments(xmlPath) {
  const docs = [];
  let line = 0;
  let cur = null;
  for await (const text of createInterface({ input: createReadStream(xmlPath, 'utf8'), crlfDelay: Infinity })) {
    const grp = /<linkGrp [^>]*fromDoc="el\/([^"]+?)\.xml\.gz"/u.exec(text);
    if (grp) { cur = { docId: grp[1], start: line, links: 0 }; docs.push(cur); continue; }
    if (text.startsWith('<link ')) { line += 1; cur.links += 1; }
  }
  return { docs, totalLinks: line };
}

async function readLines(path, wanted) {
  const out = new Map();
  let i = 0;
  for await (const text of createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })) {
    if (wanted.has(i)) out.set(i, text);
    i += 1;
  }
  return { lines: out, count: i };
}

export function windowStart(seed, docId, links, window, k) {
  return parseInt(sha(`${seed}|${docId}|${k}`).slice(0, 8), 16) % (links - window + 1);
}

export function acceptable(en, el, p) {
  return en.length >= p.minChars && en.length <= p.maxChars
    && el.length >= p.minChars && el.length <= p.maxChars
    && !en.startsWith('(') && !el.startsWith('(') && en !== el;
}

export async function main(argv) {
  const dir = argv[0];
  if (!dir) throw new Error('usage: select.mjs <corpus-dir> [--out file]');
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : 'selection.json';
  const p = PARAMS;
  const xml = join(dir, 'Europarl.el-en.xml');
  const enPath = join(dir, 'Europarl.el-en.en');
  const elPath = join(dir, 'Europarl.el-en.el');

  const { docs, totalLinks } = await readDocuments(xml);
  const ranked = docs
    .filter((d) => d.links >= p.minDocLinks)
    .map((d) => ({ ...d, rank: sha(`${p.seed}|${d.docId}`) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : 1));

  // Candidate windows for the first 2 * passages ranked documents; text is read once, then filtered.
  const candidates = [];
  const wanted = new Set();
  for (const d of ranked.slice(0, p.passages * 2)) {
    const starts = [];
    for (let k = 0; k < p.attempts; k += 1) starts.push(d.start + windowStart(p.seed, d.docId, d.links, p.window, k));
    candidates.push({ d, starts });
    for (const s of starts) for (let j = 0; j < p.window; j += 1) wanted.add(s + j);
  }
  const en = await readLines(enPath, wanted);
  const el = await readLines(elPath, wanted);
  if (en.count !== totalLinks || el.count !== totalLinks) {
    throw new Error(`line count mismatch: links ${totalLinks}, en ${en.count}, el ${el.count}`);
  }

  const passages = [];
  let skippedDocs = 0;
  for (const { d, starts } of candidates) {
    if (passages.length >= p.passages) break;
    const pick = starts.find((s) => {
      for (let j = 0; j < p.window; j += 1) if (!acceptable(en.lines.get(s + j), el.lines.get(s + j), p)) return false;
      return true;
    });
    if (pick === undefined) { skippedDocs += 1; continue; }
    const enText = Array.from({ length: p.window }, (_, j) => en.lines.get(pick + j)).join('\n');
    const elText = Array.from({ length: p.window }, (_, j) => el.lines.get(pick + j)).join('\n');
    passages.push({
      id: `${d.docId}#${pick - d.start}`,
      docId: d.docId,
      line: pick,          // 0-based line in the Moses files
      window: p.window,
      enSha256: sha(enText),
      elSha256: sha(elText),
    });
  }

  const selection = {
    experiment: 'parallel-document-v1',
    params: p,
    corpus: {
      name: 'OPUS Europarl v8 el-en (Moses)',
      url: 'https://object.pouta.csc.fi/OPUS-Europarl/v8/moses/el-en.txt.zip',
      xmlSha256: await fileSha256(xml),
      enSha256: await fileSha256(enPath),
      elSha256: await fileSha256(elPath),
      links: totalLinks,
      documents: docs.length,
      eligibleDocuments: ranked.length,
    },
    skippedDocuments: skippedDocs,
    passages,
  };
  writeFileSync(out, `${JSON.stringify(selection, null, 2)}\n`);
  console.log(JSON.stringify({ out, passages: passages.length, skippedDocs, documents: docs.length }));
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
