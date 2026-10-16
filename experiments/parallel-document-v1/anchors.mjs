#!/usr/bin/env node
// Free measure: language-neutral anchors (numbers, dates, identifiers, URLs from core's unitLiterals)
// in matched EN/EL passages against mismatched pairs. No model call. See PREREGISTRATION-anchors.md.
// Usage: node anchors.mjs <corpus-dir> [--selection selection.json] [--out anchors-results.json]
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { unitLiterals } = await import(join(here, '../../packages/core/dist/src/discourse.js'));
const sha = (s) => createHash('sha256').update(s).digest('hex');

export const BARS = Object.freeze({ matchedMeanJaccard: 0.5, top1: 0.8, ratio: 5 });

/** Anchor signature of a passage: union of per-line literals, language-neutral kinds only. */
export function signature(lines) {
  const sig = new Set();
  for (const line of lines) {
    const lit = unitLiterals(line);
    for (const n of lit.numbers) sig.add(`n:${n}`);
    for (const d of lit.dates) sig.add(`d:${d}`);
    for (const i of lit.identifiers) sig.add(`i:${i}`);
    for (const u of lit.urls) sig.add(`u:${u}`);
  }
  return sig;
}

export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

async function readLines(path, wanted) {
  const out = new Map();
  let i = 0;
  for await (const text of createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })) {
    if (wanted.has(i)) out.set(i, text);
    i += 1;
  }
  return out;
}

export function score(rows) {
  const info = rows.filter((r) => r.en.size > 0 && r.el.size > 0);
  const n = info.length;
  let matchedSum = 0; let mismatchedSum = 0; let mismatchedN = 0; let top1 = 0; let auc = 0;
  for (let i = 0; i < n; i += 1) {
    const truth = jaccard(info[i].en, info[i].el);
    matchedSum += truth;
    let best = -1; let bestCount = 0; let wins = 0; let others = 0;
    for (let j = 0; j < n; j += 1) {
      const s = j === i ? truth : jaccard(info[i].en, info[j].el);
      if (j !== i) {
        mismatchedSum += s; mismatchedN += 1; others += 1;
        wins += truth > s ? 1 : truth === s ? 0.5 : 0;
      }
      if (s > best) { best = s; bestCount = 1; } else if (s === best) bestCount += 1;
    }
    top1 += truth === best ? 1 / bestCount : 0;
    auc += others ? wins / others : 0;
  }
  const matchedMean = n ? matchedSum / n : 0;
  const mismatchedMean = mismatchedN ? mismatchedSum / mismatchedN : 0;
  return {
    informative: n,
    matchedMeanJaccard: matchedMean,
    mismatchedMeanJaccard: mismatchedMean,
    ratio: mismatchedMean > 0 ? matchedMean / mismatchedMean : null,
    top1: n ? top1 / n : 0,
    auc: n ? auc / n : 0,
  };
}

export async function main(argv) {
  const dir = argv[0];
  const flag = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
  const selPath = flag('--selection', join(here, 'selection.json'));
  const outPath = flag('--out', join(here, 'anchors-results.json'));
  const sel = JSON.parse(readFileSync(selPath, 'utf8'));
  const W = sel.params.window;
  const wanted = new Set();
  for (const p of sel.passages) for (let j = 0; j < W; j += 1) wanted.add(p.line + j);
  const en = await readLines(join(dir, 'Europarl.el-en.en'), wanted);
  const el = await readLines(join(dir, 'Europarl.el-en.el'), wanted);

  const rows = sel.passages.map((p) => {
    const enLines = Array.from({ length: W }, (_, j) => en.get(p.line + j));
    const elLines = Array.from({ length: W }, (_, j) => el.get(p.line + j));
    if (sha(enLines.join('\n')) !== p.enSha256 || sha(elLines.join('\n')) !== p.elSha256) {
      throw new Error(`hash mismatch for ${p.id}: corpus differs from selection`);
    }
    return { id: p.id, en: signature(enLines), el: signature(elLines) };
  });

  const result = score(rows);
  const bothEmpty = rows.filter((r) => r.en.size === 0 && r.el.size === 0).length;
  const onlyOne = rows.filter((r) => (r.en.size === 0) !== (r.el.size === 0)).length;
  const kinds = { enOnly: {}, elOnly: {} };
  for (const r of rows.filter((x) => x.en.size > 0 && x.el.size > 0)) {
    for (const x of r.en) if (!r.el.has(x)) kinds.enOnly[x[0]] = (kinds.enOnly[x[0]] ?? 0) + 1;
    for (const x of r.el) if (!r.en.has(x)) kinds.elOnly[x[0]] = (kinds.elOnly[x[0]] ?? 0) + 1;
  }
  const verdict = {
    matchedMeanJaccard: result.matchedMeanJaccard >= BARS.matchedMeanJaccard,
    top1: result.top1 >= BARS.top1,
    ratio: result.ratio !== null && result.ratio >= BARS.ratio,
  };
  const out = {
    experiment: 'parallel-document-v1 / anchors (free, no model)',
    level: 'below (a): literal anchors only; not meaning',
    selectionSha256: sha(readFileSync(selPath, 'utf8')),
    passages: rows.length,
    bothSidesEmpty: bothEmpty,
    oneSideEmpty: onlyOne,
    ...result,
    bars: BARS,
    verdict,
    pass: Object.values(verdict).every(Boolean),
    unmatchedAnchorKinds: kinds,
    perPassage: rows.map((r) => ({ id: r.id, en: r.en.size, el: r.el.size, jaccard: jaccard(r.en, r.el) })),
  };
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  const { perPassage, ...summary } = out;
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
