#!/usr/bin/env node
// Offline scoring of the 2026-10-07 v17 re-run of the round-2 sentences, with
// the same in-memory scorer (scoreRecordedMeaning) and targets
// (meaning-scoring-recorded-v1/targets.jsonl) as the recorded-meaning manifests.
// The file-mode replay cannot be used: the raw provider streams of this run
// were not committed, so raw-stream hash checks are skipped here and stated.
// The original round-2 run is scored the same way, for a like-for-like baseline.
//   node reports/independent-evaluation/2026-10-07-round2-v17-live/scoring/score-v17.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRecordedMeaning } from '../../../../scripts/research/score-recorded-meaning.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const here = 'reports/independent-evaluation/2026-10-07-round2-v17-live';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const jsonl = (file) => read(file).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
const probes = JSON.parse(read('reports/independent-evaluation/2026-09-26-round2/probes-authored.json'));
const targets = jsonl('experiments/meaning-scoring-recorded-v1/targets.jsonl');

// v17: part-a ran items 1-7 then stopped (CONTRACT_UNBOUND gate); part-b ran 8-30.
const ranA = jsonl(`${here}/part-a/run-ledger.jsonl`).filter((row) => row.failure !== 'NOT_RUN_AFTER_FAILED_GATE');
const v17 = {
  probes, targets,
  requests: jsonl(`${here}/requests-v17.jsonl`),
  runs: [...ranA, ...jsonl(`${here}/part-b/run-ledger.jsonl`)],
  candidates: [...jsonl(`${here}/part-a/candidate-ledger.jsonl`), ...jsonl(`${here}/part-b/candidate-ledger.jsonl`)],
};
const original = {
  probes, targets,
  requests: jsonl('reports/independent-evaluation/2026-09-26-round2/live-oos/requests.jsonl'),
  runs: jsonl('reports/independent-evaluation/2026-09-26-round2/live-oos/run-ledger.jsonl'),
  candidates: jsonl('reports/independent-evaluation/2026-09-26-round2/live-oos/candidate-ledger.jsonl'),
};
const partAHandles = new Set(ranA.map((row) => row.handle));
const result = {
  note: 'Offline, self-reviewed diagnostic. Targets are agent-authored and post hoc (14/30 unresolved). Raw streams not committed for v17; raw-stream hash checks skipped for both runs.',
  partAEvidenceValid: JSON.parse(read(`${here}/part-a/run-summary.json`)).evidenceValid,
  partAHandles: [...partAHandles],
  v17: scoreRecordedMeaning(v17),
  original: scoreRecordedMeaning(original),
};
fs.writeFileSync(path.join(root, here, 'scoring/meaning-report.json'), `${JSON.stringify(result, null, 2)}\n`);
const brief = (run) => ({ ...run.overall, byLanguage: Object.fromEntries(Object.entries(run.byLanguage).map(([k, v]) => [k, { outcomeCorrect: v.outcomeCorrect, matches: v.exactRepresentationMatches, abstentions: v.correctDeclaredAbstentions, unresolved: v.unresolved }])) });
console.log(JSON.stringify({ v17: brief(result.v17), original: brief(result.original) }, null, 2));
