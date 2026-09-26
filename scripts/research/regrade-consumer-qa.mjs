#!/usr/bin/env node
// Re-grade recorded consumer-QA answers with the current grader, without new
// model calls. Writes summary-regraded.json next to each run's calls.jsonl.
//   node scripts/research/regrade-consumer-qa.mjs <run dir> [<run dir> ...]
import fs from 'node:fs';
import path from 'node:path';
import { grade, GRADER_VERSION } from './qa-grader.mjs';

const questions = new Map(fs.readFileSync('experiments/consumer-memory-qa-v1/questions.jsonl', 'utf8').split('\n').filter(Boolean).map((line) => { const q = JSON.parse(line); return [q.id, q]; }));
const out = {};
for (const dir of process.argv.slice(2)) {
  const calls = fs.readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  const conditions = {};
  for (const call of calls) {
    const verdict = call.text == null ? { correct: false, reason: 'no-answer' } : grade(questions.get(call.questionId), call.text);
    const row = conditions[call.condition] ??= { correct: 0, wrong: [], changedFromV1: [] };
    if (verdict.correct) row.correct++; else row.wrong.push({ question: call.questionId, answer: verdict.answer ?? null, reason: verdict.reason });
    if (verdict.correct !== call.correct) row.changedFromV1.push({ question: call.questionId, v1: call.correct, v2: verdict.correct, answer: verdict.answer ?? null });
  }
  const result = { format: 'openlunum-consumer-qa-regrade/0.1', grader: GRADER_VERSION, source: 'calls.jsonl', model: summary.model, conditions };
  fs.writeFileSync(path.join(dir, 'summary-regraded.json'), `${JSON.stringify(result, null, 2)}\n`);
  out[dir] = Object.fromEntries(Object.entries(conditions).map(([name, row]) => [name, { v2: row.correct, changed: row.changedFromV1.length }]));
}
console.log(JSON.stringify(out, null, 1));
