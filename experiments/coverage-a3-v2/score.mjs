#!/usr/bin/env node
// coverage-a3-v2 (A3 bar-2 re-run, contract 0.22 candidate): bar 1 on the fresh set, the bar-2 inputs, and reported measures.
// Covered = a valid parse with an lfp:2.1 identity that is not a sentence copy (record() of parallel-document-v1, as R4 and A3).
// Offline, no model call.
//   node score.mjs --requests requests.jsonl --runs dir[,dir-rerun] --emit bar2/covered.jsonl          (the Rust CLI's input)
//   lunum-render --profile generic-en-pivot/0.3 < bar2/covered.jsonl > bar2/rust-renders.jsonl
//   node score.mjs --requests requests.jsonl --runs dir[,dir-rerun] --rust bar2/rust-renders.jsonl --out score.json
import fs from 'node:fs';
import { record } from '../parallel-document-v1/score-structure.mjs';
import { renderSem, MOOD_RENDERER } from '../../packages/core/dist/src/index.js';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const requests = J(arg('--requests'));
const rows = new Map();
for (const d of arg('--runs').split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) {
  const old = rows.get(r.handle); if (!old || !old.evidenceValid || !['parse', 'abstain'].includes(old.status)) rows.set(r.handle, r);
}
const tally = { items: 0, ran: 0, parse: 0, abstain: 0, failed: 0, invalid: 0, copy: 0, covered: 0 };
const cov = [];
for (const req of requests) {
  tally.items += 1; const row = rows.get(req.handle); if (!row) continue;
  tally.ran += 1; if (!row.evidenceValid) tally.invalid += 1;
  if (row.status === 'parse') tally.parse += 1; else if (row.status === 'abstain') tally.abstain += 1; else tally.failed += 1;
  const rec = record(req, row); if (!rec) continue;
  if (rec.copy) { tally.copy += 1; continue; }
  tally.covered += 1; cov.push({ handle: req.handle, sourceText: req.sourceText, sem: rec.sem, lfp: rec.lfp, ts: renderSem(rec.sem, { profile: MOOD_RENDERER }).code });
}
if (arg('--emit')) { fs.writeFileSync(arg('--emit'), cov.map((c) => JSON.stringify({ handle: c.handle, sem: c.sem })).join('\n') + '\n'); console.log(tally); process.exit(0); }

const rust = new Map(J(arg('--rust')).map((r) => [r.handle, r]));
const equal = cov.filter((c) => rust.get(c.handle)?.code === c.ts).length;
const coverage = tally.covered / requests.length;
const copiesOfParses = tally.parse ? tally.copy / tally.parse : null;
const isQ = (t) => t.trim().endsWith('?');
const pron = /\b(I|me|my|you|your|we|us|our)\b/iu;
const reported = {
  questionsInSet: requests.filter((r) => isQ(r.sourceText)).length,
  questionsCovered: cov.filter((c) => isQ(c.sourceText)).length,
  questionsCoveredWithKindQuestion: cov.filter((c) => isQ(c.sourceText) && c.sem.kind === 'question').length,
  instructionRecords: cov.filter((c) => c.sem.kind === 'instruction' || c.sem.kind === 'command').length,
  instructionRecordsWithSubject: cov.filter((c) => (c.sem.kind === 'instruction' || c.sem.kind === 'command') && c.sem.clauses?.some((cl) => cl.roles && ('subject' in cl.roles || 'agent' in cl.roles))).length,
  deicticSentencesInSet: requests.filter((r) => pron.test(r.sourceText)).length,
  deicticSentencesCovered: cov.filter((c) => pron.test(c.sourceText)).length,
};
const out = {
  profile: MOOD_RENDERER, tally,
  bar1: { coverage, copiesOfParses, pass: coverage >= 0.40 && (copiesOfParses ?? 0) <= 0.10, a3BaselineCoverage: 0.27, gainOverA3BaselinePp: (coverage - 0.27) * 100 },
  parity: { covered: cov.length, equal, pass: cov.length > 0 && equal === cov.length, mismatches: cov.filter((c) => rust.get(c.handle)?.code !== c.ts).map((c) => ({ handle: c.handle, ts: c.ts, rust: rust.get(c.handle) ?? null })) },
  verdictPossible: cov.length >= 30, reported,
  renders: cov.map((c) => ({ handle: c.handle, lfp: c.lfp, kind: c.sem.kind, code: c.ts })),
};
fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 1) + '\n');
if (arg('--out')) console.log(JSON.stringify({ tally, bar1: out.bar1, parity: { ...out.parity, mismatches: out.parity.mismatches.length }, reported }, null, 1));
