#!/usr/bin/env node
// Level (a) structure agreement and level (c) exact identity, per passage, matched vs mismatched.
// Offline, no model calls. See PREREGISTRATION-paid.md and its amendment 1.
//   node score-structure.mjs --requests <requests.jsonl> --runs dirA[,dirB] [--out structure-results.json]
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitCandidate } from '../../packages/core/dist/src/index.js';
import { isSentenceCopy } from '../../scripts/research/sentence-copy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const J = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const DIR = new Set(['command', 'instruction', 'plan_instruction', 'conditional_instruction', 'safety_constraint']);
const shape = (c) => ({ p: c.predicate, n: c.negated === true, m: c.modality ?? null, roles: Object.keys(c.roles ?? {}).sort(), cond: (c.conditions ?? []).map(shape), then: (c.consequences ?? []).map(shape) });

/** Covered = valid parse with an lfp identity and not a sentence copy. Returns null otherwise. */
export function record(request, row) {
  if (!(row && row.evidenceValid && row.status === 'parse' && row.candidateSem)) return null;
  const s = submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: row.candidateSem, provenance: { extractorType: 'agent' } });
  if (!s.semanticFingerprint) return null;
  return { lfp: s.semanticFingerprint, copy: isSentenceCopy(request.sourceText, s.sem), sem: s.sem,
    structure: JSON.stringify({ mood: DIR.has(s.sem.kind) ? 'dir' : 'ass', c: s.sem.clauses.map(shape) }) };
}

export function dice(a, b) {
  if (!a.length && !b.length) return 0;
  const count = new Map(); for (const x of a) count.set(x, (count.get(x) ?? 0) + 1);
  let inter = 0; for (const x of b) { const k = count.get(x) ?? 0; if (k > 0) { inter += 1; count.set(x, k - 1); } }
  return 2 * inter / (a.length + b.length);
}

export function matchedVsMismatched(passages, key) {
  const ok = passages.filter((p) => p.en.length >= 2 && p.el.length >= 2);
  let m = 0; let mm = 0; let mmN = 0; let top1 = 0;
  for (const [i, p] of ok.entries()) {
    const truth = dice(p.en.map(key), p.el.map(key)); m += truth;
    let best = -1; let ties = 0;
    for (const [j, q] of ok.entries()) {
      const s = i === j ? truth : dice(p.en.map(key), q.el.map(key));
      if (i !== j) { mm += s; mmN += 1; }
      if (s > best) { best = s; ties = 1; } else if (s === best) ties += 1;
    }
    top1 += truth === best ? 1 / ties : 0;
  }
  const n = ok.length;
  return { passages: n, matchedMean: n ? m / n : 0, mismatchedMean: mmN ? mm / mmN : 0, top1: n ? top1 / n : 0 };
}

async function main() {
  const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
  const requests = new Map(J(arg('--requests')).map((r) => [r.handle, r]));
  const rows = new Map();
  for (const d of arg('--runs').split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) if (!rows.has(r.handle) || !['parse', 'abstain'].includes(rows.get(r.handle).status)) rows.set(r.handle, r);
  const { handles } = JSON.parse(fs.readFileSync(join(here, 'handles.json'), 'utf8'));
  const ran = handles.filter((h) => rows.has(h.handle));
  const byPassage = new Map();
  const tally = { en: { items: 0, parse: 0, copy: 0, covered: 0, invalid: 0 }, el: { items: 0, parse: 0, copy: 0, covered: 0, invalid: 0 } };
  for (const h of ran) {
    const row = rows.get(h.handle); const t = tally[h.lang]; t.items += 1;
    if (!row.evidenceValid) t.invalid += 1;
    const rec = record(requests.get(h.handle), row);
    if (row.evidenceValid && row.status === 'parse') t.parse += 1;
    if (rec?.copy) t.copy += 1;
    const p = byPassage.get(h.passage) ?? { passage: h.passage, en: [], el: [] }; byPassage.set(h.passage, p);
    if (rec && !rec.copy) { t.covered += 1; p[h.lang].push(rec); }
  }
  const passages = [...byPassage.values()].sort((a, b) => a.passage - b.passage);
  const evaluable = tally.en.covered >= 40 && tally.el.covered >= 40 && passages.filter((p) => p.en.length >= 2 && p.el.length >= 2).length >= 10;
  const structure = matchedVsMismatched(passages, (r) => r.structure);
  const identity = matchedVsMismatched(passages, (r) => r.lfp);
  const out = {
    level: { a: 'structure (predicate, role names, negation, modality, mood, conditions/consequences)', c: 'exact lfp:2.1 identity' },
    itemsRun: ran.length, coverage: tally, evaluable,
    levelA: { ...structure, pass: evaluable && structure.matchedMean >= 2 * structure.mismatchedMean && structure.top1 >= 0.5 },
    levelC: identity,
    perPassage: passages.map((p) => ({ passage: p.passage, enCovered: p.en.length, elCovered: p.el.length })),
  };
  fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
