// Post-hoc (owner feedback 2026-10-16): agreement of meaning STRUCTURE, ignoring filler words.
// Same predicate per clause, same role names, negation, modality, conditions/consequences, and
// mood (directive vs assertive). Not pre-registered; offline; no model calls.
//   node experiments/cross-language-convergence-v1/structure.mjs
import fs from 'node:fs';
import { submitCandidate } from '../../packages/core/dist/src/index.js';
const J = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const root = new URL('../../', import.meta.url).pathname; const R = root + 'reports/independent-evaluation/2026-10-16-clc-v1/';
const req = new Map(['s1', 's2', 's3'].flatMap((s) => J(`${root}experiments/cross-language-convergence-v1/requests-${s}.jsonl`)).map((r) => [r.handle, r]));
const merge = (...ps) => { const m = new Map(); for (const p of ps) for (const r of J(R + p + '/run-ledger.jsonl')) { const v = m.get(r.handle); if (!v || !['parse', 'abstain'].includes(v.status)) m.set(r.handle, r); } return m; };
const runs = { S1: merge('s1e'), S2: merge('s2e', 's2e-rest'), S3: merge('s3e'), R2: merge('r2e', 'r2e-rest') };
const DIR = new Set(['command', 'instruction', 'plan_instruction', 'conditional_instruction', 'safety_constraint']);
const shape = (c) => ({ p: c.predicate, n: c.negated === true, m: c.modality ?? null, roles: Object.keys(c.roles ?? {}).sort(), cond: (c.conditions ?? []).map(shape), then: (c.consequences ?? []).map(shape) });
const structure = (run, h) => { const r = runs[run].get(h); const q = req.get(h); if (!(r && r.evidenceValid && r.status === 'parse')) return null; const s = submitCandidate({ sourceText: q.sourceText, sourceLanguage: q.sourceLanguage, candidateSem: r.candidateSem, provenance: { extractorType: 'agent' } }); return s.semanticFingerprint ? JSON.stringify({ mood: DIR.has(s.sem.kind) ? 'dir' : 'ass', c: s.sem.clauses.map(shape) }) : null; };
const pairs = J(root + 'experiments/cross-language-convergence-v1/pairs.jsonl');
for (const set of ['S1', 'S2', 'S3']) {
  const rows = pairs.filter((p) => p.set === set).map((p) => [p.pair, structure(set, p.a), structure(set, p.b)]).filter(([, a, b]) => a && b);
  console.log(set, 'both covered', rows.length, 'same structure', rows.filter(([, a, b]) => a === b).length, rows.filter(([, a, b]) => a !== b).map(([p, a, b]) => p + ' ' + a + ' VS ' + b));
}
const s1h = pairs.filter((p) => p.set === 'S1').flatMap((p) => [p.a, p.b]);
const st = s1h.map((h) => [structure('S1', h), structure('R2', h)]).filter(([a, b]) => a && b);
console.log('stability (structure)', st.length, st.filter(([a, b]) => a === b).length);
