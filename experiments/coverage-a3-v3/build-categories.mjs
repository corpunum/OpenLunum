#!/usr/bin/env node
// Builds bar/categories-v2.json ({ handle: "A"|"B"|"C"|"D" }) for score.mjs --categories, mechanically from
// coverage-a3-v2's published prose list (RESULTS.md, "### The 48 records") and its two strict judges' joint
// rejections (bar2/judgements-luna.json, bar2/judgements-nemotron.json, via requests.jsonl). Every sentence must
// match exactly one of the 48 jointly rejected handles, or it fails. No judgement is added.
//   node build-categories.mjs
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const v2 = path.join(here, '../coverage-a3-v2');
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9': ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function parseCategoryProse(md) {
  const start = md.indexOf('### The 48 records');
  if (start < 0) throw new Error('section_missing');
  const end = md.indexOf('\n## ', start);
  const out = [];
  for (const line of md.slice(start, end < 0 ? undefined : end).split('\n')) {
    const m = line.match(/^([ABCD]): (.*)$/);
    if (!m) continue;
    for (const part of m[2].split(' · ')) out.push({ category: m[1], sentence: part.replace(/^\d+ /, '').replace(/[.]$/, '').trim() });
  }
  return out;
}

export function buildCategories({ md, judgements, requests }) {
  const own = (x) => new Map(x.results.filter((r) => r.kind === 'own').map((r) => [r.id, r.states === true]));
  const [a, b] = judgements.map(own);
  const both = [...a.keys()].filter((k) => b.has(k) && !a.get(k) && !b.get(k));
  const text = new Map(requests.map((r) => [r.handle, r.sourceText]));
  const byNorm = new Map();
  for (const h of both) {
    const n = norm(text.get(h) ?? '');
    if (byNorm.has(n)) throw new Error(`duplicate_sentence:${n}`);
    byNorm.set(n, h);
  }
  const out = {};
  for (const { category, sentence } of parseCategoryProse(md)) {
    const h = byNorm.get(norm(sentence));
    if (!h) throw new Error(`no_match:${sentence}`);
    if (out[h]) throw new Error(`matched_twice:${sentence}`);
    out[h] = category;
  }
  if (Object.keys(out).length !== both.length) throw new Error(`unmatched:${both.length - Object.keys(out).length}`);
  return Object.fromEntries(Object.entries(out).sort(([x], [y]) => (x < y ? -1 : 1)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const J = (f) => JSON.parse(fs.readFileSync(path.join(v2, f), 'utf8'));
  const requests = fs.readFileSync(path.join(v2, 'requests.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const cats = buildCategories({ md: fs.readFileSync(path.join(v2, 'RESULTS.md'), 'utf8'), judgements: [J('bar2/judgements-luna.json'), J('bar2/judgements-nemotron.json')], requests });
  fs.writeFileSync(path.join(here, 'bar/categories-v2.json'), JSON.stringify(cats, null, 1) + '\n');
  const counts = {}; for (const c of Object.values(cats)) counts[c] = (counts[c] || 0) + 1;
  console.log({ records: Object.keys(cats).length, counts });
}
