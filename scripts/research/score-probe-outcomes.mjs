#!/usr/bin/env node
// Outcome-level scoring for probe sets without target Sem: did the extractor
// parse (with core-issued identity) or abstain, versus the frozen expectation?
//   node scripts/research/score-probe-outcomes.mjs <private-expectations.jsonl> <run-ledger.jsonl>
import fs from 'node:fs';

const [expectationsPath, runLedgerPath] = process.argv.slice(2);
if (!expectationsPath || !runLedgerPath) { console.error('usage: score-probe-outcomes.mjs <private-expectations.jsonl> <run-ledger.jsonl>'); process.exit(2); }
const read = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const runs = new Map(read(runLedgerPath).map((row) => [row.handle, row]));

export function observedOutcome(row) {
  if (!row) return 'missing';
  if (row.status === 'abstain') return 'abstain';
  if (row.status === 'parse') return row.lastSubmission?.candidateIdentityAvailable ? 'parse' : 'parse_without_identity';
  return 'failed';
}

const items = read(expectationsPath).map((expected) => {
  const observed = observedOutcome(runs.get(expected.handle));
  // 'either': the contract leaves the outcome open; reported, never counted as correct or wrong.
  const correct = expected.expectedOutcome === 'either' ? null : observed === expected.expectedOutcome;
  return { ...expected, observed, correct, failureClass: runs.get(expected.handle)?.lastSubmission?.failureClass ?? null };
});
const tally = (rows) => ({ n: rows.filter((row) => row.correct !== null).length, correct: rows.filter((row) => row.correct === true).length, observed: Object.fromEntries([...new Set(rows.map((row) => row.observed))].map((key) => [key, rows.filter((row) => row.observed === key).length])) });
const report = {
  format: 'openlunum-probe-outcomes/0.1',
  overall: tally(items),
  byExpected: { abstain: tally(items.filter((row) => row.expectedOutcome === 'abstain')), parse: tally(items.filter((row) => row.expectedOutcome === 'parse')) },
  either: items.filter((row) => row.expectedOutcome === 'either').map((row) => ({ pair: row.pair, language: row.language, observed: row.observed })),
  byLanguage: Object.fromEntries([...new Set(items.map((row) => row.language))].map((language) => [language, tally(items.filter((row) => row.language === language))])),
  pairsBothCorrect: [...new Set(items.map((row) => `${row.pair}/${row.language}`))].filter((key) => items.filter((row) => `${row.pair}/${row.language}` === key).every((row) => row.correct !== false)).length,
  pairs: new Set(items.map((row) => `${row.pair}/${row.language}`)).size,
  items,
};
console.log(JSON.stringify(report, null, 2));
