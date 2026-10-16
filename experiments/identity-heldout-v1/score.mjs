#!/usr/bin/env node
// ADR 0027 gate scorer (offline, no model calls).
//   node score.mjs --requests requests.jsonl --a dirA[,dirA2] --b dirB[,dirB2] [--out score.json]
// Dirs hold run-ledger.jsonl (the source-only runner's ledger). Items with status 'parse' and evidenceValid
// count as covered; everything else is uncovered but stays in the denominator.
// The projection (projectId) is COPIED from experiments/identity-projection-candidate-v1/measure.mjs
// at commit db2bf28 without change; `--validate` reproduces that experiment's clc-v1 numbers (4/12 -> 8/12).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { submitCandidate, stableStringify } from '../../packages/core/dist/src/index.js';
const root = new URL('../../', import.meta.url).pathname;
const J = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

// ---- projection: verbatim from measure.mjs ----
const LITERAL_TYPES = new Set(['quantity', 'date', 'time', 'duration', 'percent', 'money']);
const fold = (s) => String(s).normalize('NFKC').toLocaleLowerCase('und').replace(/_/gu, ' ').replace(/\s+/gu, ' ').trim();
function term(t) {
  if (t === null || t === undefined) return t;
  if (typeof t === 'string') return { v: fold(t) };
  if (typeof t !== 'object') return t;
  if (Array.isArray(t)) return t.map(term);
  const out = {};
  const key = t.id ?? t.value ?? t.ref;
  if (LITERAL_TYPES.has(t.type)) { out.t = t.type; if (t.value !== undefined) out.v = typeof t.value === 'string' ? fold(t.value) : t.value; if (t.unit) out.u = fold(t.unit); if (t.format) out.f = t.format; return out; }
  if (key !== undefined) out.v = typeof key === 'string' ? fold(key) : key;
  for (const [k, v] of Object.entries(t)) if (!['id', 'value', 'ref', 'type', 'language', 'surface', 'span', 'sourceSpan', 'provenance', 'annotations'].includes(k)) out[k] = term(v);
  return out;
}
function clause(c) {
  return { p: c.predicate, n: c.negated === true, m: c.modality ?? null, time: term(c.time),
    r: Object.fromEntries(Object.keys(c.roles ?? {}).sort().map((k) => [k, term(c.roles[k])])),
    if: (c.conditions ?? []).map(clause), then: (c.consequences ?? []).map(clause) };
}
const DIRECTIVE = new Set(['command', 'instruction', 'plan_instruction', 'conditional_instruction', 'safety_constraint']);
const ASSERTIVE = new Set(['simple_fact', 'event', 'observation', 'project_state']);
const mood = (kind) => DIRECTIVE.has(kind) ? 'directive' : ASSERTIVE.has(kind) ? 'assertive' : kind;
const projectId = (sem) => 'cand:' + createHash('sha256').update(stableStringify({ w: sem.world, k: mood(sem.kind), c: sem.clauses.map(clause) })).digest('hex').slice(0, 32);
// ---- end verbatim ----

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d;
const merge = (dirs) => { const m = new Map(); for (const d of dirs.split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) { const v = m.get(r.handle); if (!v || !['parse', 'abstain'].includes(v.status)) m.set(r.handle, r); } return m; };
const requests = J(arg('--requests'));
const identity = (run, q) => { const r = run.get(q.handle); if (!(r && r.evidenceValid && r.status === 'parse' && r.candidateSem)) return null;
  const s = submitCandidate({ sourceText: q.sourceText, sourceLanguage: q.sourceLanguage, candidateSem: r.candidateSem, provenance: { extractorType: 'agent' } });
  return s.semanticFingerprint ? { lfp: s.semanticFingerprint, cand: projectId(s.sem) } : null; };
const A = merge(arg('--a')); const B = merge(arg('--b'));
const ia = requests.map((q) => identity(A, q)); const ib = requests.map((q) => identity(B, q));
const both = requests.map((q, i) => [q, ia[i], ib[i]]).filter(([, a, b]) => a && b);
const covered = (x) => x.filter(Boolean).length;
const cost = (run) => requests.reduce((s, q) => s + (run.get(q.handle)?.costUsd ?? 0), 0);

// Merges the candidate makes among covered sentences (distinct lfp:2.1, same candidate), for owner review.
const groups = new Map();
for (const [run, ids] of [['a', ia], ['b', ib]]) requests.forEach((q, i) => { const x = ids[i]; if (!x) return; const g = groups.get(x.cand) ?? new Map(); if (!g.has(x.lfp)) g.set(x.lfp, { run, sentence: q.sourceText }); groups.set(x.cand, g); });
// Only groups with two or more DISTINCT sentences are merges for review; one sentence under two lfp:2.1 identities is the stability fix itself.
const candidateMerges = [...groups.values()].filter((g) => new Set([...g.values()].map((x) => x.sentence)).size > 1).map((g) => [...g.values()]);

const out = {
  requests: requests.length,
  coverage: { runA: covered(ia), runB: covered(ib), both: both.length },
  stability: { both: both.length, lfp21Equal: both.filter(([, a, b]) => a.lfp === b.lfp).length, candidateEqual: both.filter(([, a, b]) => a.cand === b.cand).length },
  costUsd: { runA: +cost(A).toFixed(2), runB: +cost(B).toFixed(2) },
  candidateMergesForOwnerReview: candidateMerges,
};
out.stability.candidateRate = out.stability.both ? out.stability.candidateEqual / out.stability.both : null;
out.gate = {
  evaluable: both.length >= 20,
  stabilityAtLeast90: both.length >= 20 && out.stability.candidateRate >= 0.9,
  ownerMergeReview: candidateMerges.length === 0 ? 'no merges to review' : `${candidateMerges.length} merge groups need the owner's same-meaning judgement`,
  suites: 'rerun experiments/identity-projection-candidate-v1/measure.mjs; any collapse in an adversarial, collision or contrast file fails the gate',
};
fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 2) + '\n');
