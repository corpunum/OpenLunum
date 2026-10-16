#!/usr/bin/env node
// Re-score the original round-2 run and the v17 re-run against owner-referenced targets
// (30/30 reviewed). Same scorer function as the recorded-meaning manifests; raw-stream
// checks are not run (v17 streams were never committed). No model calls.
//   node experiments/meaning-targets-owner-v1/score.mjs
import fs from 'node:fs';
import { scoreRecordedMeaning } from '../../scripts/research/score-recorded-meaning.mjs';
const root = new URL('../../', import.meta.url).pathname;
const jsonl = (f) => fs.readFileSync(root + f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const probes = JSON.parse(fs.readFileSync(`${root}experiments/meaning-targets-owner-v1/probes-v2.json`, 'utf8'));
const targets = jsonl('experiments/meaning-targets-owner-v1/targets.jsonl');
const r2 = 'reports/independent-evaluation/2026-09-26-round2/live-oos';
const v17 = 'reports/independent-evaluation/2026-10-07-round2-v17-live';
const ranA = jsonl(`${v17}/part-a/run-ledger.jsonl`).filter((r) => r.failure !== 'NOT_RUN_AFTER_FAILED_GATE');
const runs = {
  original: { requests: jsonl(`${r2}/requests.jsonl`), runs: jsonl(`${r2}/run-ledger.jsonl`), candidates: jsonl(`${r2}/candidate-ledger.jsonl`) },
  v17: { requests: jsonl(`${v17}/requests-v17.jsonl`), runs: [...ranA, ...jsonl(`${v17}/part-b/run-ledger.jsonl`)], candidates: [...jsonl(`${v17}/part-a/candidate-ledger.jsonl`), ...jsonl(`${v17}/part-b/candidate-ledger.jsonl`)] },
};
const out = {};
for (const [name, input] of Object.entries(runs)) out[name] = scoreRecordedMeaning({ probes, targets, ...input });
fs.writeFileSync(`${root}experiments/meaning-targets-owner-v1/meaning-report.json`, `${JSON.stringify(out, null, 2)}\n`);
for (const [name, r] of Object.entries(out)) {
  const o = r.overall;
  console.log(name, { outcomeCorrect: `${o.outcomeCorrect}/30`, meaningCorrect: `${o.reviewedMatchesOrDeclaredAbstentions}/30`, exactMatches: o.exactRepresentationMatches, correctAbstentions: o.correctDeclaredAbstentions, statusCounts: o.statusCounts,
    byLanguage: Object.fromEntries(Object.entries(r.byLanguage).map(([k, v]) => [k, `${v.reviewedMatchesOrDeclaredAbstentions}/${v.total}`])) });
}
