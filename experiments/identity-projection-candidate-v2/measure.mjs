#!/usr/bin/env node
// IN-SAMPLE, offline: stability of v1 / v2strip / v2fold on every recorded same-sentence pair of runs, and the
// collapses each variant makes across all identity-bearing Sem in the repository (suite check).
//   node measure.mjs [--sol-dir ~/lunum-runs]   (the Sol partial runs are outside the repository)
import fs from 'node:fs';
import path from 'node:path';
import { submitCandidate } from '../../packages/core/dist/src/index.js';
import { isSentenceCopy } from '../../scripts/research/sentence-copy.mjs';
import { PROJECTIONS } from './projection.mjs';

const root = new URL('../../', import.meta.url).pathname;
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const merge = (dirs) => { const m = new Map(); for (const d of dirs) for (const r of [...J(`${d}/run-ledger.jsonl`), ...J(`${d}/candidate-ledger.jsonl`)]) { const v = m.get(r.handle); if (!v || !['parse', 'abstain'].includes(v.status)) m.set(r.handle, r); } return m; };
const sem = (q, r) => {
  if (!(r && (r.evidenceValid ?? true) && r.status === 'parse' && r.candidateSem)) return null;
  const s = submitCandidate({ sourceText: q.sourceText, sourceLanguage: q.sourceLanguage ?? 'en', candidateSem: r.candidateSem, provenance: { extractorType: 'agent' } });
  return s.semanticFingerprint && !isSentenceCopy(q.sourceText, s.sem) ? { lfp: s.semanticFingerprint, sem: s.sem } : null;
};
const solDir = process.argv.includes('--sol-dir') ? process.argv[process.argv.indexOf('--sol-dir') + 1] : null;
const R = `${root}reports/independent-evaluation/`;
const sets = [
  { name: 'clc-v1 S1 vs R2 (Claude)', req: `${root}experiments/cross-language-convergence-v1/requests-s1.jsonl`, a: [`${R}2026-10-16-clc-v1/s1e`], b: [`${R}2026-10-16-clc-v1/r2e`, `${R}2026-10-16-clc-v1/r2e-rest`] },
  { name: 'round2 original vs v17 (Claude)', req: `${R}2026-09-26-round2/live-oos/requests.jsonl`, a: [`${R}2026-09-26-round2/live-oos`], b: [`${R}2026-10-07-round2-v17-live/part-a`, `${R}2026-10-07-round2-v17-live/part-b`] },
  { name: 'identity-heldout-v1 A vs B (Sonnet, spent)', req: `${root}experiments/identity-heldout-v1/requests.jsonl`, a: [`${R}2026-10-17-idg1-sonnet/a`], b: [`${R}2026-10-17-idg1-sonnet/b`] },
  ...(solDir ? [{ name: 'identity-heldout-v1 A vs B (Sol partial, spent)', req: `${root}experiments/identity-heldout-v1/requests.jsonl`, a: [`${solDir}/idg1-sol-a`], b: [`${solDir}/idg1-sol-b`] }] : []),
];
const stability = {};
for (const s of sets) {
  const req = J(s.req); const A = merge(s.a); const B = merge(s.b);
  const both = req.map((q) => [q, sem(q, A.get(q.handle)), sem(q, B.get(q.handle))]).filter(([, a, b]) => a && b);
  stability[s.name] = { pairs: both.length, lfp21: both.filter(([, a, b]) => a.lfp === b.lfp).length,
    ...Object.fromEntries(Object.entries(PROJECTIONS).map(([k, f]) => [k, both.filter(([, a, b]) => f(a.sem) === f(b.sem)).length])),
    stillSplitV2fold: both.filter(([, a, b]) => PROJECTIONS.v2fold(a.sem) !== PROJECTIONS.v2fold(b.sem)).map(([q]) => q.sourceText) };
}
// Repository scan: distinct lfp:2.1 identities that each variant collapses; any collapse touching a suite file fails.
const seen = Object.fromEntries(Object.keys(PROJECTIONS).map((k) => [k, new Map()]));
function visit(v, file) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) return v.forEach((x) => visit(x, file));
  if (typeof v.schema === 'string' && v.schema.startsWith('lunum-sem') && Array.isArray(v.clauses)) {
    const sub = submitCandidate({ sourceText: '', candidateSem: v, provenance: { extractorType: 'other' } });
    if (sub.semanticFingerprint) for (const [k, f] of Object.entries(PROJECTIONS)) { const c = f(sub.sem); const m = seen[k].get(c) ?? new Map(); if (!m.has(sub.semanticFingerprint)) m.set(sub.semanticFingerprint, path.relative(root, file)); seen[k].set(c, m); }
  }
  for (const x of Object.values(v)) visit(x, file);
}
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'dist', '.git', 'raw', 'target'].includes(e.name)) walk(p); } else if (/\.jsonl?$/u.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); for (const l of (e.name.endsWith('.jsonl') ? t.split('\n').filter(Boolean) : [t])) { try { visit(JSON.parse(l), p); } catch {} } } } }
for (const d of ['datasets', 'experiments', 'test-fixtures', 'protected-eval', 'reports']) if (fs.existsSync(root + d)) walk(root + d);
const SUITE = /adversarial|collision|contrast/iu;
const scan = Object.fromEntries(Object.entries(seen).map(([k, m]) => { const col = [...m.values()].filter((x) => x.size > 1); return [k, { collapseGroups: col.length, touchingSuites: col.filter((x) => [...x.values()].some((f) => SUITE.test(f))).map((x) => [...x.values()]) }]; }));
console.log(JSON.stringify({ status: 'IN-SAMPLE, offline, self-reviewed; not a core change', stability, scan }, null, 1));
