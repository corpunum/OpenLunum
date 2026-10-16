#!/usr/bin/env node
// Offline, in-sample measurement of a CANDIDATE identity projection (not a core change,
// not a new identity version). Candidate rules, applied to a core-normalised Sem that
// already receives lfp:2.1:
//   - kind is reduced to a mood class: directive (command, instruction, plan_instruction,
//     conditional_instruction, safety_constraint) or assertive (simple_fact, event,
//     observation, project_state); every other kind is kept as is. Mood is meaning
//     ("Restart X" vs "X restarted", the Greek imperative/aorist case), the finer
//     label within a mood is not determined by the source;
//   - a bare string filler equals {value: string};
//   - id and value fold into one key, compared case-insensitively with "_" = " ";
//   - term types are left out, except quantity/date/time typed terms keep their numeric
//     value, unit and format (those are source-determined literals).
// Measures stability (s1e vs r2e), cross-language pairs, Greek paraphrase pairs, and
// merges the candidate would create across every identity-bearing Sem in the repository.
//   node experiments/identity-projection-candidate-v1/measure.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { submitCandidate, stableStringify } from '../../packages/core/dist/src/index.js';
const root = new URL('../../', import.meta.url).pathname;
const J = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

const LITERAL_TYPES = new Set(['quantity', 'date', 'time', 'duration', 'percent', 'money']);
const fold = (s) => String(s).normalize('NFKC').toLocaleLowerCase('und').replace(/_/gu, ' ').replace(/\s+/gu, ' ').trim();
function term(t) {
  if (t === null || t === undefined) return t;
  if (typeof t === 'string') return { v: fold(t) };
  if (typeof t !== 'object') return t;
  if (Array.isArray(t)) return t.map(term);
  const out = {};
  const key = t.id ?? t.value ?? t.ref;
  if (LITERAL_TYPES.has(t.type)) { out.t = t.type; if (t.value !== undefined) out.v = typeof t.value === 'string' ? fold(t.value) : t.value; if (t.unit) out.u = fold(t.unit); if (t.format) out.f = t.format; return out; }
  if (key !== undefined) out.v = typeof key === 'string' ? fold(key) : key;
  for (const [k, v] of Object.entries(t)) if (!['id', 'value', 'ref', 'type', 'language', 'surface', 'span', 'sourceSpan', 'provenance', 'annotations'].includes(k)) out[k] = term(v);
  return out;
}
function clause(c) {
  return { p: c.predicate, n: c.negated === true, m: c.modality ?? null, time: term(c.time),
    r: Object.fromEntries(Object.keys(c.roles ?? {}).sort().map((k) => [k, term(c.roles[k])])),
    if: (c.conditions ?? []).map(clause), then: (c.consequences ?? []).map(clause) };
}
const DIRECTIVE = new Set(['command', 'instruction', 'plan_instruction', 'conditional_instruction', 'safety_constraint']);
const ASSERTIVE = new Set(['simple_fact', 'event', 'observation', 'project_state']);
const mood = (kind) => DIRECTIVE.has(kind) ? 'directive' : ASSERTIVE.has(kind) ? 'assertive' : kind;
const projectId = (sem) => 'cand:' + createHash('sha256').update(stableStringify({ w: sem.world, k: mood(sem.kind), c: sem.clauses.map(clause) })).digest('hex').slice(0, 32);
function identities(sourceText, sourceLanguage, candidateSem) {
  const sub = submitCandidate({ sourceText, sourceLanguage, candidateSem, provenance: { extractorType: 'agent' } });
  return sub.semanticFingerprint ? { lfp: sub.semanticFingerprint, cand: projectId(sub.sem) } : null;
}

// --- clc-v1 runs (in-sample) ---
const R = `${root}reports/independent-evaluation/2026-10-16-clc-v1/`;
const req = new Map(['s1', 's2', 's3'].flatMap((s) => J(`${root}experiments/cross-language-convergence-v1/requests-${s}.jsonl`)).map((r) => [r.handle, r]));
const merge = (...ps) => { const m = new Map(); for (const p of ps) for (const r of J(R + p + '/run-ledger.jsonl')) { const v = m.get(r.handle); if (!v || !['parse', 'abstain'].includes(v.status)) m.set(r.handle, r); } return m; };
const runs = { s1: merge('s1e'), s2: merge('s2e', 's2e-rest'), s3: merge('s3e'), r2: merge('r2e', 'r2e-rest') };
const idOf = (run, h) => { const r = runs[run].get(h); const q = req.get(h); return r && r.evidenceValid && r.status === 'parse' && r.candidateSem ? identities(q.sourceText, q.sourceLanguage, r.candidateSem) : null; };
const pairs = J(`${root}experiments/cross-language-convergence-v1/pairs.jsonl`);
const cmp = (rows) => ({ both: rows.length, lfpEqual: rows.filter(([a, b]) => a.lfp === b.lfp).length, candEqual: rows.filter(([a, b]) => a.cand === b.cand).length });
const stab = cmp([...req.keys()].filter((h) => pairs.some((p) => p.set === 'S1' && (p.a === h || p.b === h))).map((h) => [idOf('s1', h), idOf('r2', h)]).filter(([a, b]) => a && b));
const xl = cmp(pairs.filter((p) => p.set !== 'S3').map((p) => { const run = p.set === 'S1' ? 's1' : 's2'; return [idOf(run, p.a), idOf(run, p.b)]; }).filter(([a, b]) => a && b));
const para = cmp(pairs.filter((p) => p.set === 'S3').map((p) => [idOf('s3', p.a), idOf('s3', p.b)]).filter(([a, b]) => a && b));
// v17 vs original round-2 (in-sample for the 7/12 finding)
const r2 = 'reports/independent-evaluation/2026-09-26-round2/live-oos', v17 = 'reports/independent-evaluation/2026-10-07-round2-v17-live';
const reqR2 = new Map(J(root + r2 + '/requests.jsonl').map((r) => [r.handle, r]));
const ledger = (rows) => new Map(rows.filter((r) => r.status === 'parse' && r.candidateSem).map((r) => [r.handle, r.candidateSem]));
const A = ledger(J(root + r2 + '/candidate-ledger.jsonl')), B = ledger([...J(root + v17 + '/part-a/candidate-ledger.jsonl'), ...J(root + v17 + '/part-b/candidate-ledger.jsonl')]);
const v17stab = cmp([...reqR2.values()].map((q) => [A.has(q.handle) ? identities(q.sourceText, q.sourceLanguage, A.get(q.handle)) : null, B.has(q.handle) ? identities(q.sourceText, q.sourceLanguage, B.get(q.handle)) : null]).filter(([a, b]) => a && b));

// --- merges across the repository: distinct lfp:2.1 identities that the candidate collapses ---
const seen = new Map(); // cand -> Map(lfp -> example)
let scanned = 0;
function visit(v, file) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) return v.forEach((x) => visit(x, file));
  if (typeof v.schema === 'string' && v.schema.startsWith('lunum-sem') && Array.isArray(v.clauses)) {
    const sub = submitCandidate({ sourceText: '', candidateSem: v, provenance: { extractorType: 'other' } });
    if (sub.semanticFingerprint) {
      scanned++;
      const c = projectId(sub.sem);
      if (!seen.has(c)) seen.set(c, new Map());
      if (!seen.get(c).has(sub.semanticFingerprint)) seen.get(c).set(sub.semanticFingerprint, { file: path.relative(root, file), sem: JSON.stringify(sub.sem).slice(0, 300) });
    }
  }
  for (const x of Object.values(v)) visit(x, file);
}
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'dist', '.git', 'raw'].includes(e.name)) walk(p); } else if (/\.jsonl?$/u.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); for (const l of (e.name.endsWith('.jsonl') ? t.split('\n').filter(Boolean) : [t])) { try { visit(JSON.parse(l), p); } catch {} } } } }
for (const d of ['datasets', 'experiments', 'test-fixtures', 'protected-eval', 'reports']) if (fs.existsSync(root + d)) walk(root + d);
const collapses = [...seen.values()].filter((m) => m.size > 1).map((m) => [...m.values()]);
console.log(JSON.stringify({ status: 'offline, in-sample, self-reviewed; candidate projection is not a core change',
  stability_clc_s1_vs_r2: stab, stability_round2_original_vs_v17: v17stab, crossLanguage_S1S2: xl, greekParaphrase_S3: para,
  repositoryScan: { identityBearingSem: scanned, distinctLfp: [...seen.values()].reduce((s, m) => s + m.size, 0), candidateCollapses: collapses.length, collapsedIdentities: collapses.reduce((s, c) => s + c.length, 0) },
  collapses }, null, 2));
