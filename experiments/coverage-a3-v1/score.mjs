#!/usr/bin/env node
// A3 (contract 0.21, ADR 0025) bar 1: coverage of the 200 held-out English sentences, baseline and change run.
// Covered = a valid parse with an lfp:2.1 identity that is not a sentence copy (record() of parallel-document-v1, as R4).
// Also reports, per run, how many items ended on a refused attempt whose assert.action was a bare string (A0's cause).
// Offline, no model call. Bar 2 (level b) and bar 3 (safety) are scored separately (see PREREGISTRATION.md).
//   node score.mjs --requests requests.jsonl --baseline dir[,dir-rerun] --change dir[,dir-rerun] [--out score.json]
import fs from 'node:fs';
import { covered } from '../roundtrip-en-v1/score.mjs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const rowsOf = (dirs) => { const rows = new Map(); for (const d of (dirs ?? '').split(',').filter(Boolean)) for (const r of J(`${d}/run-ledger.jsonl`)) {
  const old = rows.get(r.handle); if (!old || !old.evidenceValid || !['parse', 'abstain'].includes(old.status)) rows.set(r.handle, r); } return rows; };
const stringAction = (row) => (row?.submissionAttempts ?? []).some((a) => JSON.stringify(a).match(/"action":"[^"]*"/u));

const requests = J(arg('--requests'));
const run = (dirs) => {
  if (!dirs) return null;
  const rows = rowsOf(dirs); const { tally, covered: cov } = covered(requests, rows);
  return { tally, coverage: tally.covered / requests.length, copiesOfParses: tally.parse ? tally.copy / tally.parse : null,
    abstainsWithBareStringActionAttempt: [...rows.values()].filter((r) => r.status === 'abstain' && stringAction(r)).length,
    covered: cov.map((c) => ({ handle: c.handle, lfp: c.lfp })) };
};
const baseline = run(arg('--baseline')); const change = run(arg('--change'));
const bar1 = change ? { coverage: change.coverage, copiesOfParses: change.copiesOfParses, absolute: change.coverage >= 0.40 && (change.copiesOfParses ?? 0) <= 0.10,
  gainPp: baseline ? (change.coverage - baseline.coverage) * 100 : null, gain: baseline ? change.coverage - baseline.coverage >= 0.10 : null } : null;
if (bar1) bar1.pass = bar1.absolute && bar1.gain === true;
const out = { items: requests.length, baseline, change, bar1 };
fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 1) + '\n');
if (arg('--out')) console.log(JSON.stringify({ baseline: baseline && { ...baseline, covered: undefined }, change: change && { ...change, covered: undefined }, bar1 }, null, 1));
