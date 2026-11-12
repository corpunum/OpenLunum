#!/usr/bin/env node
// gate-blindspots-v1 (PREREGISTRATION.md). Deterministic: no model call. Needs packages/core built at the scored commit.
//   node run.mjs --out results.json
import fs from 'node:fs';
import path from 'node:path';
import { submitCandidate } from '../../packages/core/dist/src/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const provenance = { extractorType: 'agent', extractorId: 'gate-blindspots-v1' };

const isFiller = (v) => typeof v === 'string' ? v.trim() !== '' : !!v && typeof v === 'object' && (typeof v.value === 'string' || typeof v.id === 'string');
const fillerRoles = (clause) => Object.entries(clause.roles || {}).filter(([, v]) => isFiller(v)).map(([k]) => k);
const text = (v) => (typeof v === 'string' ? v : (v.value ?? v.id));
const withText = (v, t) => (typeof v === 'string' ? t : { ...v, ...(typeof v.value === 'string' ? { value: t } : { id: t }) });

export const MUTATIONS = {
  M1(sem) {
    const c = sem.clauses[0]; const r = fillerRoles(c);
    if (r.length < 2 || text(c.roles[r[0]]) === text(c.roles[r[1]])) return null;
    const a = c.roles[r[0]], b = c.roles[r[1]];
    return { ...sem, clauses: [{ ...c, roles: { ...c.roles, [r[0]]: withText(a, text(b)), [r[1]]: withText(b, text(a)) } }, ...sem.clauses.slice(1)] };
  },
  M2(sem) { const c = sem.clauses[0]; return { ...sem, clauses: [{ ...c, negated: !c.negated }, ...sem.clauses.slice(1)] }; },
  M3(sem) { const c = sem.clauses[0]; return { ...sem, clauses: [{ ...c, modality: c.modality === 'possibility' ? 'obligation' : 'possibility' }, ...sem.clauses.slice(1)] }; },
  M4(sem) { return { ...sem, kind: sem.kind === 'question' || sem.kind === 'command' ? 'simple_fact' : 'question' }; },
  C1(sem) {
    const c = sem.clauses[0]; const r = fillerRoles(c);
    if (r.length < 2) return null;
    const roles = { ...c.roles }; delete roles[r[r.length - 1]];
    return { ...sem, clauses: [{ ...c, roles }, ...sem.clauses.slice(1)] };
  },
  C2(sem) {
    const c = sem.clauses[0]; const r = fillerRoles(c);
    if (!r.length) return null;
    return { ...sem, clauses: [{ ...c, roles: { ...c.roles, [r[0]]: withText(c.roles[r[0]], 'zebra') } }, ...sem.clauses.slice(1)] };
  },
};

const submit = (sourceText, candidateSem) => {
  try { return submitCandidate({ sourceText, candidateSem, provenance }); }
  catch (err) { return { semanticFingerprint: null, failureClass: 'threw', diagnostics: [String(err.message).slice(0, 80)] }; }
};
const reason = (res) => {
  const d = (res.diagnostics || [])[0];
  const code = typeof d === 'string' ? d.split(/[:\s]/)[0] : (d?.code ?? '?');
  return `${res.failureClass ?? 'refused'}:${code}`;
};

export function run({ covered, requests }) {
  const src = new Map(requests.map((r) => [r.handle, r.sourceText]));
  const originals = covered.map((c) => ({ handle: c.handle, sourceText: src.get(c.handle), sem: c.sem })).filter((x) => x.sourceText);
  const base = originals.map((o) => ({ ...o, res: submit(o.sourceText, o.sem) }));
  const issuedOriginals = base.filter((o) => o.res.semanticFingerprint);
  const out = { records: covered.length, joined: originals.length, originalsIssued: issuedOriginals.length, originalRefusals: {}, mutations: {} };
  for (const o of base) if (!o.res.semanticFingerprint) out.originalRefusals[reason(o.res)] = (out.originalRefusals[reason(o.res)] || 0) + 1;
  for (const [id, mutate] of Object.entries(MUTATIONS)) {
    const m = { applicable: 0, issued: 0, sameFingerprint: 0, refusals: {} };
    for (const o of issuedOriginals) {
      const sem = mutate(structuredClone(o.sem));
      if (!sem) continue;
      m.applicable += 1;
      const res = submit(o.sourceText, sem);
      if (res.semanticFingerprint) { m.issued += 1; if (res.semanticFingerprint === o.res.semanticFingerprint) m.sameFingerprint += 1; }
      else m.refusals[reason(res)] = (m.refusals[reason(res)] || 0) + 1;
    }
    m.issuedRate = m.applicable ? Number((m.issued / m.applicable).toFixed(4)) : null;
    out.mutations[id] = m;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const covered = J(path.join(here, '../coverage-a3-v2/bar2/covered.jsonl'));
  const requests = J(path.join(here, '../coverage-a3-v2/requests.jsonl'));
  const result = run({ covered, requests });
  const o = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  const text = JSON.stringify(result, null, 1);
  if (o) fs.writeFileSync(o, text + '\n');
  console.log(text);
}
