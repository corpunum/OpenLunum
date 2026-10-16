#!/usr/bin/env node
// POST-HOC (not pre-registered): anchors top-1 broken down by signature size. Reuses anchors.mjs.
// Usage: node anchors-posthoc.mjs <corpus-dir>
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { signature, jaccard } from './anchors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
const sel = JSON.parse(readFileSync(join(here, 'selection.json'), 'utf8'));
const W = sel.params.window;
const wanted = new Set(sel.passages.flatMap((p) => Array.from({ length: W }, (_, j) => p.line + j)));
async function lines(path) {
  const out = new Map(); let i = 0;
  for await (const t of createInterface({ input: createReadStream(path, 'utf8') })) { if (wanted.has(i)) out.set(i, t); i += 1; }
  return out;
}
const en = await lines(join(dir, 'Europarl.el-en.en'));
const el = await lines(join(dir, 'Europarl.el-en.el'));
const rows = sel.passages.map((p) => ({
  en: signature(Array.from({ length: W }, (_, j) => en.get(p.line + j))),
  el: signature(Array.from({ length: W }, (_, j) => el.get(p.line + j))),
})).filter((r) => r.en.size && r.el.size);
const top1 = (i) => {
  const t = jaccard(rows[i].en, rows[i].el); let best = -1; let k = 0;
  rows.forEach((r, j) => { const s = j === i ? t : jaccard(rows[i].en, r.el); if (s > best) { best = s; k = 1; } else if (s === best) k += 1; });
  return t === best ? 1 / k : 0;
};
const bands = { '1': [1, 1], '2-3': [2, 3], '4+': [4, 1e9] };
for (const [name, [lo, hi]] of Object.entries(bands)) {
  const idx = rows.map((r, i) => [r, i]).filter(([r]) => { const s = Math.min(r.en.size, r.el.size); return s >= lo && s <= hi; }).map(([, i]) => i);
  const mean = idx.reduce((a, i) => a + top1(i), 0) / (idx.length || 1);
  const exact = idx.filter((i) => jaccard(rows[i].en, rows[i].el) === 1).length;
  console.log(JSON.stringify({ minAnchorsPerSide: name, passages: idx.length, top1: +mean.toFixed(3), exactSignature: exact }));
}
