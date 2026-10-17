#!/usr/bin/env node
// ADR 0027 gate scorer, candidate v2 (offline, no model calls). Same bars and copy rule as identity-heldout-v1/score.mjs.
//   node score.mjs --requests requests.jsonl --a dirA[,dirA2] --b dirB[,dirB2] [--out score.json]
// Dirs hold run-ledger.jsonl (the source-only runner's ledger). Items with status 'parse' and evidenceValid
// count as covered; everything else is uncovered but stays in the denominator.
// Validated on the spent identity-heldout-v1 Sonnet runs: v1 23/26, v2 25/26 (experiments/identity-projection-candidate-v2/result.json).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { submitCandidate, stableStringify } from '../../packages/core/dist/src/index.js';
import { isSentenceCopy } from '../../scripts/research/sentence-copy.mjs';
const root = new URL('../../', import.meta.url).pathname;
const J = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

// ---- projection: candidate v2 (strip leading articles/prepositions from fillers), experiments/identity-projection-candidate-v2 ----
import { PROJECTIONS } from '../identity-projection-candidate-v2/projection.mjs';
const projectId = PROJECTIONS.v2strip; const projectV1 = PROJECTIONS.v1;
// ----

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d;
const merge = (dirs) => { const m = new Map(); for (const d of dirs.split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) { const v = m.get(r.handle); if (!v || !['parse', 'abstain'].includes(v.status)) m.set(r.handle, r); } return m; };
const requests = J(arg('--requests'));
const identity = (run, q) => { const r = run.get(q.handle); if (!(r && r.evidenceValid && r.status === 'parse' && r.candidateSem)) return null;
  const s = submitCandidate({ sourceText: q.sourceText, sourceLanguage: q.sourceLanguage, candidateSem: r.candidateSem, provenance: { extractorType: 'agent' } });
  return s.semanticFingerprint ? { lfp: s.semanticFingerprint, cand: projectId(s.sem), v1: projectV1(s.sem), copy: isSentenceCopy(q.sourceText, s.sem) } : null; };
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
  // Amendment 1: the bar uses pairs where neither run is a sentence copy; all pairs are reported too.
  stabilityAllPairs: { both: both.length, lfp21Equal: both.filter(([, a, b]) => a.lfp === b.lfp).length, candidateEqual: both.filter(([, a, b]) => a.cand === b.cand).length },
  sentenceCopies: { runA: ia.filter((x) => x?.copy).length, runB: ib.filter((x) => x?.copy).length },
  stability: (() => { const nc = both.filter(([, a, b]) => !a.copy && !b.copy); return { both: nc.length, lfp21Equal: nc.filter(([, a, b]) => a.lfp === b.lfp).length, candidateV1Equal: nc.filter(([, a, b]) => a.v1 === b.v1).length, candidateEqual: nc.filter(([, a, b]) => a.cand === b.cand).length }; })(),
  costUsd: { runA: +cost(A).toFixed(2), runB: +cost(B).toFixed(2) },
  candidateMergesForOwnerReview: candidateMerges,
};
out.stability.candidateRate = out.stability.both ? out.stability.candidateEqual / out.stability.both : null;
out.gate = {
  evaluable: out.stability.both >= 20,
  stabilityAtLeast90: out.stability.both >= 20 && out.stability.candidateRate >= 0.9,
  ownerMergeReview: candidateMerges.length === 0 ? 'no merges to review' : `${candidateMerges.length} merge groups need the owner's same-meaning judgement`,
  suites: 'rerun experiments/identity-projection-candidate-v1/measure.mjs; any collapse in an adversarial, collision or contrast file fails the gate',
};
fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 2) + '\n');
