#!/usr/bin/env node
// A3 "reported, not bars": questions covered, covered items with an I/you/we filler, third-person-pronoun abstains,
// sentence copies, per run. Offline; uses the current core (record() of parallel-document-v1, as score.mjs).
//   node reported.mjs --requests requests.jsonl --baseline dir --change dir[,dir-rest]
import fs from 'node:fs';
import { record } from '../parallel-document-v1/score-structure.mjs';

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const rowsOf = (dirs) => { const rows = new Map(); for (const d of dirs.split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) {
  const old = rows.get(r.handle); if (!old || !old.evidenceValid || !['parse', 'abstain'].includes(old.status)) rows.set(r.handle, r); } return rows; };
const words = (s) => s.toLowerCase().match(/[a-z']+/gu) ?? [];
const DEICTIC = new Set(['i', 'me', 'my', 'you', 'your', 'we', 'us', 'our']);
const THIRD = new Set(['he', 'she', 'it', 'they', 'him', 'her', 'them', 'his', 'its', 'their']);
const fillers = (sem) => JSON.stringify(sem.clauses).match(/"value":"([^"]*)"/gu)?.map((m) => m.slice(9, -1).toLowerCase()) ?? [];
const requests = J(arg('--requests'));
const run = (dirs) => {
  const rows = rowsOf(dirs); const out = { questions: 0, questionsCovered: 0, questionKindCovered: 0, coveredWithDeicticFiller: 0, deicticSentences: 0, deicticCovered: 0,
    thirdPersonSentences: 0, thirdPersonAbstains: 0, copies: 0 };
  for (const req of requests) {
    const row = rows.get(req.handle); const rec = row ? record(req, row) : null; const cov = Boolean(rec && !rec.copy);
    const q = req.sourceText.trim().endsWith('?'); const w = words(req.sourceText);
    if (rec?.copy) out.copies += 1;
    if (q) { out.questions += 1; if (cov) out.questionsCovered += 1; if (cov && rec.sem.kind === 'question') out.questionKindCovered += 1; }
    if (w.some((x) => DEICTIC.has(x))) { out.deicticSentences += 1; if (cov) out.deicticCovered += 1; }
    if (cov && fillers(rec.sem).some((f) => DEICTIC.has(f))) out.coveredWithDeicticFiller += 1;
    if (w.some((x) => THIRD.has(x))) { out.thirdPersonSentences += 1; if (row?.status === 'abstain') out.thirdPersonAbstains += 1; }
  }
  return out;
};
console.log(JSON.stringify({ baseline: run(arg('--baseline')), change: run(arg('--change')) }, null, 1));
