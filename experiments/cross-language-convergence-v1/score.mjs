#!/usr/bin/env node
// Score cross-language-convergence-v1 exactly as pre-registered (no model calls).
// Identity of a sentence = the lfp:2.1 fingerprint core issues for the recorded candidate
// with its source (frozen contract 0.19; the served core is the same build).
// A sentence is covered only if its run row is evidence-valid, status parse, and core
// issues an identity.
//   node experiments/cross-language-convergence-v1/score.mjs <runsRoot> s1v s2v s3v r2v
import fs from 'node:fs';
import { submitCandidate } from '../../packages/core/dist/src/index.js';
const root = new URL('../../', import.meta.url).pathname;
const [runsRoot, ...runNames] = process.argv.slice(2);
const [S1, S2, S3, R2] = runNames;
const jsonl = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const pairs = jsonl(`${root}experiments/cross-language-convergence-v1/pairs.jsonl`);
const requests = new Map(['s1', 's2', 's3'].flatMap((s) => jsonl(`${root}experiments/cross-language-convergence-v1/requests-${s}.jsonl`)).map((r) => [r.handle, r]));

// A run name may join a run with its continuation, "s2e+s2e-rest" (amendment 7): per
// handle, the row with an outcome wins; a continuation row replaces only a row without one.
function load(spec) {
  const parts = spec.split('+');
  const merged = new Map();
  let costUsd = 0;
  for (const part of parts) for (const row of jsonl(`${runsRoot}/${part}/run-ledger.jsonl`)) {
    costUsd += Number.isFinite(row.costUsd) ? row.costUsd : 0;
    const prev = merged.get(row.handle);
    if (!prev || !['parse', 'abstain'].includes(prev.status)) merged.set(row.handle, row);
  }
  const rows = [...merged.values()];
  const summaries = parts.map((part) => fs.existsSync(`${runsRoot}/${part}/run-summary.json`) ? JSON.parse(fs.readFileSync(`${runsRoot}/${part}/run-summary.json`, 'utf8')) : null);
  const summary = { completed: rows.filter((r) => ['parse', 'abstain'].includes(r.status)).length, notRun: rows.filter((r) => !['parse', 'abstain'].includes(r.status)).length,
    evidenceValid: rows.every((r) => r.evidenceValid), invalidItems: rows.filter((r) => !r.evidenceValid).length,
    totalCostUsd: +costUsd.toFixed(4), costNote: 'sum of per-item reported costs over every row of every part, interrupted rows included where reported', parts };
  const byHandle = new Map();
  for (const row of rows) {
    const req = requests.get(row.handle);
    let identity = null, failureClass = null;
    if (row.evidenceValid && row.status === 'parse' && row.candidateSem) {
      const sub = submitCandidate({ sourceText: req.sourceText, sourceLanguage: req.sourceLanguage, candidateSem: row.candidateSem, provenance: { extractorType: 'agent' } });
      identity = sub.semanticFingerprint; failureClass = sub.failureClass;
    }
    byHandle.set(row.handle, { status: row.evidenceValid ? row.status : 'invalid', identity, failureClass, language: req.sourceLanguage, costUsd: row.costUsd ?? 0, predicate: row.candidateSem?.clauses?.[0]?.predicate ?? null });
  }
  return { byHandle, summary };
}
const runs = Object.fromEntries(runNames.filter(Boolean).map((r) => [r, load(r)]));

function coverage(run, handles) {
  const items = handles.map((h) => runs[run].byHandle.get(h)).filter(Boolean);
  const by = (lang) => { const xs = items.filter((x) => x.language === lang); return { covered: xs.filter((x) => x.identity).length, total: xs.length }; };
  return { covered: items.filter((x) => x.identity).length, total: items.length, ran: items.length, en: by('en'), el: by('el'), invalid: items.filter((x) => x.status === 'invalid').length };
}
function convergence(set, runA, runB = runA) {
  const ps = pairs.filter((p) => p.set === set);
  const rows = ps.map((p) => ({ pair: p.pair, a: runs[runA]?.byHandle.get(p.a), b: runs[runB]?.byHandle.get(p.b) }));
  const both = rows.filter((r) => r.a?.identity && r.b?.identity);
  const equal = both.filter((r) => r.a.identity === r.b.identity);
  const n = both.length;
  const rate = n ? equal.length / n : null;
  return { pairs: ps.length, bothCovered: n, equal: equal.length, rate, evaluable: n >= 10,
    abstentionAgreement: rows.filter((r) => r.a?.status === 'abstain' && r.b?.status === 'abstain').length,
    oneSideOnly: rows.filter((r) => Boolean(r.a?.identity) !== Boolean(r.b?.identity)).length,
    detail: both.map((r) => ({ pair: r.pair, equal: r.a.identity === r.b.identity, predicates: [r.a.predicate, r.b.predicate] })) };
}
const verdict = (c) => !c.evaluable ? 'not evaluable (coverage)' : c.rate >= 0.7 ? 'supports (>=70%)' : c.rate < 0.4 ? 'KILL (<40%)' : 'inconclusive';

const s1h = pairs.filter((p) => p.set === 'S1').flatMap((p) => [p.a, p.b]);
const s2h = pairs.filter((p) => p.set === 'S2').flatMap((p) => [p.a, p.b]);
const s3h = pairs.filter((p) => p.set === 'S3').flatMap((p) => [p.a, p.b]);
const out = { format: 'openlunum-clc-v1-score/0.1', runs: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.summary])) };
if (S1) out.coverage = { S1: coverage(S1, s1h), ...(S2 && { S2: coverage(S2, s2h) }), ...(S3 && { S3: coverage(S3, s3h) }), ...(R2 && { R2: coverage(R2, s1h) }) };
if (S1) {
  const c1 = convergence('S1', S1), c2 = S2 ? convergence('S2', S2) : null;
  const pooled = { bothCovered: c1.bothCovered + (c2?.bothCovered ?? 0), equal: c1.equal + (c2?.equal ?? 0) };
  pooled.rate = pooled.bothCovered ? pooled.equal / pooled.bothCovered : null; pooled.evaluable = pooled.bothCovered >= 10;
  out.crossLanguage = { S1: c1, ...(c2 && { S2: c2 }), pooled: { ...pooled, verdict: verdict(pooled) } };
}
if (S3) { const c3 = convergence('S3', S3); out.greekParaphrase = { ...c3, verdict: verdict(c3) }; }
if (S1 && R2) {
  const both = s1h.map((h) => [runs[S1].byHandle.get(h), runs[R2].byHandle.get(h)]).filter(([a, b]) => a?.identity && b?.identity);
  const same = both.filter(([a, b]) => a.identity === b.identity).length;
  const rate = both.length ? same / both.length : null;
  out.stability = { coveredInBothRuns: both.length, sameIdentity: same, rate, verdict: rate === null ? 'not evaluable' : rate >= 0.9 ? 'stable (>=90%)' : rate < 0.75 ? 'CONFIRMS INSTABILITY (<75%)' : 'between bars' };
}
// False merges: equal identities across different pair items, within each run.
const groupOf = new Map(pairs.flatMap((p) => [[p.a, `${p.set}:${p.pair}`], [p.b, `${p.set}:${p.pair}`]]));
out.falseMerges = Object.entries(runs).flatMap(([run, r]) => {
  const byId = new Map();
  for (const [h, x] of r.byHandle) if (x.identity) { if (!byId.has(x.identity)) byId.set(x.identity, new Set()); byId.get(x.identity).add(groupOf.get(h)); }
  return [...byId.values()].filter((g) => g.size > 1).map((g) => ({ run, groups: [...g] }));
});
// Bilingual memory (S1 + S2, both languages of every pair, in pair order): what
// compileContext identity_dedup would drop (a later sentence whose core-issued identity
// equals an earlier one). Characters, not tokens.
if (S1) {
  const memory = [...pairs.filter((p) => p.set === 'S1').map((p) => [p.a, p.b, S1]), ...(S2 ? pairs.filter((p) => p.set === 'S2').map((p) => [p.a, p.b, S2]) : [])]
    .flatMap(([a, b, run]) => [[a, run], [b, run]]);
  const seen = new Set(); let total = 0, dropped = 0, droppedCount = 0;
  for (const [h, run] of memory) {
    const text = requests.get(h).sourceText; total += text.length;
    const id = runs[run].byHandle.get(h)?.identity;
    if (id && seen.has(id)) { dropped += text.length; droppedCount += 1; } else if (id) seen.add(id);
  }
  out.bilingualDedup = { sentences: memory.length, sentencesDropped: droppedCount, chars: total, charsDropped: dropped, saving: total ? +(dropped / total).toFixed(4) : null };
}
out.totalCostUsd = +Object.values(runs).reduce((s, r) => s + (r.summary?.totalCostUsd ?? 0), 0).toFixed(4);
console.log(JSON.stringify(out, null, 2));
