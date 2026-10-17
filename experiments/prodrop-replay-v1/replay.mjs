#!/usr/bin/env node
// Diagnostic (ADR 0028 §6, offline, no model): in recorded Greek parses, how often does the source carry a
// subject only in the verb ending (pro-drop) while the Lunum record has no agent-like role?
// Verb person/number from UniMorph Greek (lemma<TAB>form<TAB>features), finite forms only.
//   node replay.mjs <unimorph-ell-table> > result.json
import fs from 'node:fs';
import { submitCandidate } from '../../packages/core/dist/src/index.js';

const root = new URL('../../', import.meta.url).pathname;
const J = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const FOLD = { ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ϊ: 'ι', ΐ: 'ι', ό: 'ο', ύ: 'υ', ϋ: 'υ', ΰ: 'υ', ώ: 'ω', ς: 'σ' };
const tok = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((t) => [...t].map((c) => FOLD[c] ?? c).join(''));

// folded form -> set of "person;number" for finite verb analyses (V with 1/2/3)
const person = new Map();
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const [, form, feats] = line.split('\t');
  if (!feats || !feats.startsWith('V;')) continue;
  const f = feats.split(';'); const p = f.find((x) => ['1', '2', '3'].includes(x)); const n = f.find((x) => ['SG', 'PL'].includes(x));
  if (!p) continue;
  // Subjunctive/future forms are stored with their particle («να καλέσω», «θα καλέσω»): keep the verb.
  let t = tok(form); if (t.length === 2 && ['θα', 'να', 'ασ'].includes(t[0])) t = t.slice(1);
  const k = t.join(' '); if (!k || k.includes(' ')) continue;
  if (!person.has(k)) person.set(k, new Set()); person.get(k).add(`${p}${n ? ';' + n : ''}${f.includes('IMP') ? ';IMP' : ''}`);
}
const PRONOUNS = new Set(['εγω', 'εσυ', 'εσεισ', 'εμεισ', 'αυτοσ', 'αυτη', 'αυτο', 'αυτοι', 'αυτεσ', 'αυτα']);
const AGENTISH = ['agent', 'experiencer', 'subject', 'actor'];

// Recorded Greek parses with an identity: clc-v1 (Claude) and parallel-document Stage 0 is excluded (text not committed).
const R = `${root}reports/independent-evaluation/2026-10-16-clc-v1/`;
const req = new Map(['s1', 's2', 's3'].flatMap((s) => J(`${root}experiments/cross-language-convergence-v1/requests-${s}.jsonl`)).map((r) => [r.handle, r]));
const rows = [];
for (const run of ['s1e', 's2e', 's2e-rest', 's3e', 'r2e', 'r2e-rest']) for (const r of J(`${R}${run}/run-ledger.jsonl`)) {
  const q = req.get(r.handle);
  if (!q || q.sourceLanguage !== 'el' || !(r.evidenceValid && r.status === 'parse' && r.candidateSem)) continue;
  const s = submitCandidate({ sourceText: q.sourceText, sourceLanguage: 'el', candidateSem: r.candidateSem, provenance: { extractorType: 'agent' } });
  if (!s.semanticFingerprint) continue;
  const toks = tok(q.sourceText);
  const verbs = toks.filter((t) => person.has(t)).map((t) => ({ form: t, analyses: [...person.get(t)] }));
  const overtSubject = toks.some((t) => PRONOUNS.has(t));
  const top = s.sem.clauses[0] ?? {};
  const agentRole = AGENTISH.find((k) => top.roles && top.roles[k] !== undefined) ?? null;
  rows.push({ run, handle: r.handle, source: q.sourceText, finiteVerbs: verbs, overtPronoun: overtSubject, predicate: top.predicate, agentRole,
    proDropCandidate: verbs.length > 0 && !overtSubject, agentMissing: verbs.length > 0 && !overtSubject && !agentRole });
}
const out = { status: 'diagnostic, offline, self-reviewed; ADR 0028 §6 pro-drop replay; Claude clc-v1 recordings only (Tatoeba/owner sentences already public)',
  greekParsesWithIdentity: rows.length, withFiniteVerbNoOvertPronoun: rows.filter((r) => r.proDropCandidate).length,
  ofThoseAgentMissing: rows.filter((r) => r.agentMissing).length, rows };
console.log(JSON.stringify(out, null, 1));
