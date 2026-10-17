#!/usr/bin/env node
// R4 round-trip scorer, bars 1 and 3 (bar 2 is judge.mjs). Offline, no model call.
// Covered = a valid parse with an lfp:2.1 identity that is not a sentence copy (record() in parallel-document-v1).
// Bar 1: the Rust renderer's code equals the TS renderSem(sem, { profile: 'generic-en-pivot/0.2' }).code on every covered record.
//   node score.mjs --requests requests.jsonl --runs dir[,dir-rest] --rust rust-renders.jsonl [--out result.json]
// rust-renders.jsonl: one {"handle","code"} or {"handle","error"} per line, from the lunum-render CLI on covered.jsonl.
//   node score.mjs ... --emit covered.jsonl   writes {"handle","sem"} for the covered records (the CLI's input), then exits.
import fs from 'node:fs';
import { record } from '../parallel-document-v1/score-structure.mjs';
import { renderSem } from '../../packages/core/dist/src/index.js';

const PROFILE = 'generic-en-pivot/0.2';
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

export function covered(requests, rows) {
  const out = []; const tally = { items: 0, ran: 0, parse: 0, abstain: 0, failed: 0, invalid: 0, copy: 0, covered: 0 };
  for (const req of requests) {
    tally.items += 1; const row = rows.get(req.handle); if (!row) continue;
    tally.ran += 1; if (!row.evidenceValid) tally.invalid += 1;
    if (row.status === 'parse') tally.parse += 1; else if (row.status === 'abstain') tally.abstain += 1; else tally.failed += 1;
    const rec = record(req, row); if (!rec) continue;
    if (rec.copy) { tally.copy += 1; continue; }
    tally.covered += 1; out.push({ handle: req.handle, sourceText: req.sourceText, sem: rec.sem, lfp: rec.lfp, ts: renderSem(rec.sem, { profile: PROFILE }).code });
  }
  return { tally, covered: out };
}

async function main() {
  const requests = J(arg('--requests'));
  const rows = new Map();
  for (const d of arg('--runs').split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) if (!rows.has(r.handle) || !rows.get(r.handle).evidenceValid || !['parse', 'abstain'].includes(rows.get(r.handle).status)) rows.set(r.handle, r);
  const { tally, covered: cov } = covered(requests, rows);
  if (arg('--emit')) { fs.writeFileSync(arg('--emit'), cov.map((c) => JSON.stringify({ handle: c.handle, sem: c.sem })).join('\n') + '\n'); console.log(tally); return; }
  const rust = new Map(J(arg('--rust')).map((r) => [r.handle, r]));
  const parity = cov.map((c) => ({ handle: c.handle, ts: c.ts, rust: rust.get(c.handle)?.code ?? null, error: rust.get(c.handle)?.error ?? null }));
  const equal = parity.filter((p) => p.rust === p.ts).length;
  const out = { profile: PROFILE, tally, bar1: { covered: cov.length, equal, pass: cov.length > 0 && equal === cov.length, mismatches: parity.filter((p) => p.rust !== p.ts) },
    verdictPossible: cov.length >= 30, renders: cov.map((c) => ({ handle: c.handle, lfp: c.lfp, code: c.ts })) };
  fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
