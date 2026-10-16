#!/usr/bin/env node
// Discourse compaction (decisions/0021) over a real Claude Code session transcript,
// offline, no model calls. Publishes aggregates only; the transcript stays private.
//   node experiments/session-transcript-compaction-v1/measure.mjs <transcript.jsonl> [points=24]
// Messages: user text, assistant text, tool calls (name + JSON input) and tool results,
// in order. Thinking blocks are excluded (not context a later turn would see).
// At each point (an evenly spaced user-turn boundary) the whole history so far is
// compacted with default options. Measured per point:
//   - characters before/after (characters, not tokens: no tokenizer call is made);
//   - literal recall: distinct literal spellings (paths, hashes, URLs, identifiers,
//     multi-digit numbers; core literalSpellings) of the history that still appear
//     verbatim somewhere in the compacted context.
import fs from 'node:fs';
import { planDiscourseCompaction, literalSpellings } from '../../packages/core/dist/src/index.js';

const [file, pointsArg] = process.argv.slice(2);
if (!file) { console.error('usage: measure.mjs <transcript.jsonl> [points]'); process.exit(2); }
const messages = [];
const textOf = (content) => typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('\n') : '';
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  let e; try { e = JSON.parse(line); } catch { continue; }
  const m = e.message;
  if (!m || (e.type !== 'user' && e.type !== 'assistant')) continue;
  if (typeof m.content === 'string') { if (m.content.trim()) messages.push({ id: messages.length, role: e.type, content: m.content }); continue; }
  for (const b of Array.isArray(m.content) ? m.content : []) {
    if (b.type === 'text' && b.text?.trim()) messages.push({ id: messages.length, role: e.type, content: b.text });
    else if (b.type === 'tool_use') messages.push({ id: messages.length, role: 'tool_call', content: `${b.name} ${JSON.stringify(b.input)}` });
    else if (b.type === 'tool_result') { const t = textOf(b.content); if (t.trim()) messages.push({ id: messages.length, role: 'tool', content: t }); }
  }
}
const boundaries = messages.map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i > 20);
const points = Math.min(Number(pointsArg ?? 24), boundaries.length);
const chosen = [...new Set(Array.from({ length: points }, (_, k) => boundaries[Math.floor((k + 1) * boundaries.length / (points + 1))]))];
const rows = [];
for (const end of chosen) {
  const history = messages.slice(0, end);
  const plan = planDiscourseCompaction(history);
  const output = plan.messages.map((m) => m.content).join('\n');
  const literals = new Set(history.flatMap((m) => literalSpellings(m.content)));
  const compactedLiterals = new Set(plan.messages.filter((m) => m.compacted).flatMap((m) => literalSpellings(history.find((h) => h.id === m.id).content)));
  const kept = [...literals].filter((l) => output.includes(l)).length;
  const keptCompacted = [...compactedLiterals].filter((l) => output.includes(l)).length;
  rows.push({ messages: history.length, sourceChars: plan.stats.sourceChars, outputChars: plan.stats.outputChars, ratio: +(plan.stats.outputChars / plan.stats.sourceChars).toFixed(3),
    compactedMessages: plan.stats.compactedMessages, literals: literals.size, literalRecall: +(kept / literals.size).toFixed(4),
    literalsInCompactedMessages: compactedLiterals.size, literalRecallCompacted: compactedLiterals.size ? +(keptCompacted / compactedLiterals.size).toFixed(4) : null,
    dispositions: plan.stats.dispositions, semanticIdentities: plan.stats.semanticIdentities });
}
const mean = (k) => +(rows.reduce((s, r) => s + (r[k] ?? 0), 0) / rows.length).toFixed(4);
const summary = { format: 'openlunum-session-compaction/0.1', transcriptMessages: messages.length, roles: Object.fromEntries([...new Set(messages.map((m) => m.role))].map((r) => [r, messages.filter((m) => m.role === r).length])),
  points: rows.length, meanRatio: mean('ratio'), meanLiteralRecall: mean('literalRecall'), meanLiteralRecallCompacted: mean('literalRecallCompacted'), last: rows.at(-1), rows };
console.log(JSON.stringify(summary, null, 2));
