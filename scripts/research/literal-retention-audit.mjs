#!/usr/bin/env node
// Measure the source-literal retention check (decisions/0016) on recorded data,
// without model calls:
//  - gold (source, Sem) pairs in datasets: a block is a check false positive or a lossy gold Sem;
//  - V8 parses the frozen scorer judged matches: blocks require source inspection;
//    the historical scorer label is not proof of complete meaning fidelity;
//  - all other recorded live parses: blocks are listed for inspection.
//   node scripts/research/literal-retention-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { checkLiteralRetention } from '../../packages/core/dist/src/index.js';

const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const isSem = (value) => value && typeof value === 'object' && typeof value.schema === 'string' && value.schema.startsWith('lunum-sem') && Array.isArray(value.clauses);

// 1. Gold pairs: any dataset record with a source text field next to a Sem field.
const gold = { pairs: 0, blocked: [] };
const PAIRS = [['sourceTextA', 'semA'], ['sourceTextB', 'semB'], ['textA', 'semA'], ['textB', 'semB'], ['sourceText', 'sem'], ['text', 'sem'], ['source', 'sem']];
function walkGold(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkGold(file); continue; }
    if (!/\.jsonl?$/u.test(entry.name)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of entry.name.endsWith('.jsonl') ? text.split('\n').filter(Boolean) : [text]) {
      let record; try { record = JSON.parse(line); } catch { continue; }
      for (const row of Array.isArray(record) ? record : [record]) {
        if (!row || typeof row !== 'object') continue;
        for (const [textKey, semKey] of PAIRS) {
          const source = typeof row[textKey] === 'string' ? row[textKey] : row[textKey]?.text;
          if (typeof source !== 'string' || !isSem(row[semKey])) continue;
          gold.pairs++;
          const result = checkLiteralRetention(source, row[semKey]);
          if (!result.retained) gold.blocked.push({ file, id: row.id, source, missing: [...result.missingNumbers, ...result.missingIdentifiers, ...result.missingDates] });
        }
      }
    }
  }
}
walkGold('datasets');

// 2. Recorded live runs: candidate ledgers joined to their request texts.
const requestFiles = ['experiments/natural-development-v8/extraction/source-only-request.jsonl', 'experiments/probes-missing-argument-v1/requests.jsonl', 'experiments/probes-missing-argument-v2/requests.jsonl', 'experiments/probes-v3/requests.jsonl', 'experiments/probes-v4/requests.jsonl'];
const texts = new Map();
for (const file of requestFiles) for (const row of readLines(file)) texts.set(row.handle, row.sourceText);
for (const dir of ['reports/independent-evaluation/2026-09-26/live', 'reports/independent-evaluation/2026-09-26-round2/live-oos', 'reports/independent-evaluation/2026-09-26-round2/live-insample']) {
  const file = path.join(dir, 'requests.jsonl');
  if (fs.existsSync(file)) for (const row of readLines(file)) texts.set(row.handle, row.sourceText);
}
const live = { parses: 0, v8MatchedParses: 0, v8MatchedBlocked: [], otherBlocked: [] };
function walkLedgers(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkLedgers(file); continue; }
    if (entry.name !== 'candidate-ledger.jsonl') continue;
    const results = fs.existsSync(path.join(dir, 'results.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')) : null;
    const matched = new Set((results?.items ?? []).filter((item) => item.sourceRelative?.status === 'match').map((item) => item.handle));
    for (const row of readLines(file)) {
      if (row.status !== 'parse' || !isSem(row.candidateSem) || !texts.has(row.handle)) continue;
      live.parses++;
      const result = checkLiteralRetention(texts.get(row.handle), row.candidateSem);
      if (matched.has(row.handle)) { live.v8MatchedParses++; if (!result.retained) live.v8MatchedBlocked.push({ file, source: texts.get(row.handle), missing: [...result.missingNumbers, ...result.missingIdentifiers, ...result.missingDates] }); }
      else if (!result.retained) live.otherBlocked.push({ file, source: texts.get(row.handle), missing: [...result.missingNumbers, ...result.missingIdentifiers, ...result.missingDates] });
    }
  }
}
walkLedgers('reports');

const summary = {
  goldPairs: gold.pairs, goldBlocked: gold.blocked.length,
  liveParses: live.parses, v8ScorerMatchedParses: live.v8MatchedParses, v8ScorerMatchedBlocked: live.v8MatchedBlocked.length,
  otherLiveParsesBlocked: live.otherBlocked.length,
};
console.log(JSON.stringify({ summary, goldBlocked: gold.blocked, v8MatchedBlocked: live.v8MatchedBlocked, otherBlockedDistinct: [...new Map(live.otherBlocked.map((row) => [row.source, row])).values()] }, null, 2));
