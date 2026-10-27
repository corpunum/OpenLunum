#!/usr/bin/env node
// guarded-codec-v1 stage 0: offline, no model calls. Classic stopword pruning, unguarded
// vs guarded, on English sentence units of a private Claude Code transcript. Aggregates only.
//   node experiments/guarded-codec-v1/stage0.mjs <transcript.jsonl>
import fs from 'node:fs';
import { segmentDiscourse } from '../../packages/core/dist/src/index.js';
import { verifyCompaction } from '../../packages/eval/dist/src/guarded-codec.js';

// A standard English stopword list of the kind shipped by common NLP toolkits
// (it includes not, no, nor, can, will, should and the n't forms, as those lists do).
const STOP = new Set(`i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself it its itself they them their theirs themselves what which who whom this that these those am is are was were be been being have has had having do does did doing a an the and but if or because as until while of at by for with about against between into through during before after above below to from up down in out on off over under again further then once here there when where why how all any both each few more most other some such no nor not only own same so than too very s t can will just don don't should should've now d ll m o re ve y ain aren aren't couldn couldn't didn didn't doesn doesn't hadn hadn't hasn hasn't haven haven't isn isn't ma mightn mightn't mustn mustn't needn needn't shan shan't shouldn shouldn't wasn wasn't weren weren't won won't wouldn wouldn't`.split(/\s+/u));
// Words the guarded pruner never removes: negators and modals (the verifier's EN marker classes).
const PROTECT = /^(not|no|nor|never|none|nobody|nothing|neither|cannot|can't|can|could|may|might|must|shall|should|will|would|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|shouldn't|wouldn't|couldn't|mustn't|mightn't|needn't|shan't|need|ought)$/iu;
// Only whole alphabetic words are candidates (surrounding punctuation aside); a token with
// digits or inner symbols ("S1", "8am", "7-of-12") is never pruned. A first version stripped
// digits before the lookup and deleted "S1" as "s"; the verifier caught it (36 units).
const prune = (text, guarded) => text.split(/(\s+)/u).filter((tok) => {
  const core = tok.replace(/^[("'“*]+|[)"'”*.,;:!?]+$/gu, '');
  if (!/^[\p{L}]+(?:['’][\p{L}]+)?$/u.test(core)) return true;
  const w = core.toLowerCase().replace(/’/gu, "'");
  if (!STOP.has(w)) return true;
  return guarded && PROTECT.test(w);
}).join('').replace(/\s+/gu, ' ').trim();

const file = process.argv[2];
const units = [];
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  let e; try { e = JSON.parse(line); } catch { continue; }
  const m = e.message; if (!m || (e.type !== 'user' && e.type !== 'assistant')) continue;
  const texts = typeof m.content === 'string' ? [m.content] : (Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text) : []);
  for (const t of texts) for (const u of segmentDiscourse(t)) {
    const s = t.slice(u.start ?? 0, u.end ?? t.length);
    const text = (u.text ?? s).trim();
    if (u.kind === 'sentence' && text.length >= 20 && !/[Ͱ-Ͽ]/u.test(text)) units.push(text);
  }
}
const run = (guarded) => {
  const cu = units.map((source, i) => ({ id: String(i), source, view: prune(source, guarded) }));
  const v = verifyCompaction(cu, 'en');
  const byKind = {}; const unitsWith = new Set();
  for (const x of v.violations) { byKind[x.kind === 'marker_changed' ? `marker_changed:${x.marker}` : x.kind] = (byKind[x.kind === 'marker_changed' ? `marker_changed:${x.marker}` : x.kind] ?? 0) + 1; unitsWith.add(x.unit); }
  return { units: v.units, charsSaved: +(1 - v.viewChars / v.sourceChars).toFixed(4), unitsViolating: unitsWith.size, shareViolating: +(unitsWith.size / v.units).toFixed(4), violationsByKind: byKind };
};
// The codec as designed: compress, verify each unit, fall back to the verbatim unit where the check fails.
const withFallback = () => {
  const first = units.map((source, i) => ({ id: String(i), source, view: prune(source, true) }));
  const bad = new Set(verifyCompaction(first, 'en').violations.map((x) => x.unit));
  const cu = first.map((u) => (bad.has(u.id) ? { ...u, view: u.source } : u));
  const v = verifyCompaction(cu, 'en');
  return { units: v.units, charsSaved: +(1 - v.viewChars / v.sourceChars).toFixed(4), unitsFallenBack: bad.size, unitsViolating: new Set(v.violations.map((x) => x.unit)).size };
};
console.log(JSON.stringify({ format: 'guarded-codec-stage0/0.1', note: 'offline, no model calls; characters not tokens; private transcript, aggregates only', unguarded: run(false), guarded: run(true), guardedWithFallback: withFallback() }, null, 2));
