#!/usr/bin/env node
// Owner-referenced meaning targets v1 for the 30 round-2 sentences.
// - The 16 previously reviewed targets are copied unchanged.
// - The 14 previously unresolved ones get the owner's reading (owner-greek-review-v1, Part A)
//   as the meaning reference; the encoding into frozen contract 0.19 is the session's
//   technical judgement (labelled per row). Where the owner's reading carries content no
//   frozen role can hold, the expected outcome becomes abstain (contract 0.11 rule:
//   abstain rather than drop a restriction, threshold, deadline, recurrence or exception).
// - Expected outcomes that change are written to probes-v2.json, superseding the
//   round-2 evaluator's expectations for those items only.
//   node experiments/meaning-targets-owner-v1/build.mjs
import fs from 'node:fs';
import { submitCandidate } from '../../packages/core/dist/src/index.js';
const root = new URL('../../', import.meta.url).pathname;
const here = `${root}experiments/meaning-targets-owner-v1/`;
const v1 = fs.readFileSync(`${root}experiments/meaning-scoring-recorded-v1/targets.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const probes = JSON.parse(fs.readFileSync(`${root}reports/independent-evaluation/2026-09-26-round2/probes-authored.json`, 'utf8'));
const sem = (kind, clause) => ({ schema: 'lunum-sem/0.1-draft', world: 'real', kind, clauses: [clause] });
const OWNER = 'Meaning reference: owner review v1 Part A (AI-assisted drafting checked by the native-speaker owner, 2026-10-16). Encoding into frozen contract 0.19: session judgement, self-reviewed.';
const decided = {
  e06: { outcome: 'abstain', note: '"until 30 November 2026" is when the access ends (owner), not when it is granted; grant has no expiry role and clause time would mean the act time.' },
  e09: { outcome: 'abstain', note: 'Prohibition for everyone except the auditor; the exemption is not itself a permission (owner). No exception role exists; allow(auditor, delete) would overstate.' },
  e10: { outcome: 'abstain', note: 'Recurring order (every night at 02:00, owner). No recurrence role exists.' },
  e11: { outcome: 'abstain', note: 'Exactly three reminders, all before a deadline that falls on 15 March, year unstated (owner). No role holds "before the deadline on <date>" scoped to the sending; clause time would date the sending.' },
  e13: { outcome: 'abstain', note: '"should" is a recommendation weaker than must (owner); "polish" has no registered predicate or alias.' },
  e14: { outcome: 'parse', note: 'Prohibition (must not) limited to business hours, granting nothing outside them (owner). Encoded as restart, obligation + negated, with clause time "business hours" (source words).',
    sem: sem('instruction', { predicate: 'restart', negated: true, modality: 'obligation', roles: { theme: { type: 'system', id: 'cluster' } }, time: { type: 'time', value: 'business hours' } }) },
  e15: { outcome: 'abstain', note: 'Conditional must; more than 5 means at least 6 (owner). "lock" has no registered predicate.' },
  e19: { outcome: 'abstain', note: '"can" is ambiguous between permission and ability (owner); the contract says abstain when meaning is ambiguous.' },
  g01: { outcome: 'abstain', note: '«μπορεί» is ambiguous between permission, ability and epistemic possibility (owner).' },
  g02: { outcome: 'parse', note: 'Permission from the director to Nikos; «έως 2.000» is inclusive (≤ 2,000) (owner) → at_most (ADR 0022). Per-expense vs total is unstated (owner); the condition is on the expenses, as in the source.',
    sem: sem('event', { predicate: 'allow', roles: { agent: { type: 'actor', id: 'διευθυντής' }, recipient: { type: 'actor', id: 'νίκος' }, action: 'approve', theme: { type: 'document', value: 'δαπάνες' } }, conditions: [{ predicate: 'at_most', roles: { subject: { type: 'document', value: 'δαπάνες' }, value: { type: 'quantity', value: 2000, unit: 'EUR' } } }] }) },
  g04: { outcome: 'parse', note: 'As a stand-alone technical instruction the owner reads the imperative first; the 3rd-person aorist reading ("someone restarted it") remains possible without context and is recorded, not encoded.',
    sem: sem('command', { predicate: 'restart', roles: { theme: { type: 'system', value: 'διακομιστής αλληλογραφίας' } } }) },
  g05: { outcome: 'parse', note: 'Imperative strongly favoured by the «αν» clause (owner); strict > 40, unit unstated (degrees, no Celsius invented).',
    sem: sem('conditional_instruction', { predicate: 'notify', roles: { recipient: { type: 'group', value: 'ομάδα' } }, conditions: [{ predicate: 'above', roles: { subject: { type: 'metric', value: 'θερμοκρασία' }, value: { type: 'quantity', value: 40, unit: 'degrees' } } }] }) },
  g07: { outcome: 'abstain', note: 'Exactly these 12 projects, deadline 31 December inclusive, year unstated (owner). No deadline role; clause time would date the act; no year may be invented.' },
  g08: { outcome: 'abstain', note: '«δεν πρέπει» is must-not or should-not depending on context (owner), and "in production" has no role in the run frame (scope would be dropped).' },
};
const targets = [], probesV2 = [], problems = [];
for (const t of v1) {
  if (t.reviewStatus === 'reviewed') { targets.push(t); continue; }
  const d = decided[t.probeId];
  if (!d) { problems.push(`undecided:${t.probeId}`); continue; }
  const goldSem = d.outcome === 'parse' ? d.sem : null;
  if (goldSem) {
    const r = submitCandidate({ sourceText: t.sourceText, sourceLanguage: t.language, candidateSem: goldSem, provenance: { extractorType: 'human' } });
    if (!r.semanticFingerprint) problems.push(`no_identity:${t.probeId}:${r.failureClass}:${r.diagnostics.join('|')}`);
  }
  targets.push({ ...t, expectedOutcome: d.outcome, reviewStatus: 'reviewed', reviewNote: `${OWNER} ${d.note}`, goldSem });
}
for (const p of probes) {
  const d = decided[p.handle];
  probesV2.push(d && d.outcome !== p.expectedOutcome ? { ...p, expectedOutcome: d.outcome, reason: `superseded by owner-referenced review: ${d.note}`, previousExpectedOutcome: p.expectedOutcome } : p);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
fs.writeFileSync(`${here}targets.jsonl`, targets.map((t) => JSON.stringify(t)).join('\n') + '\n');
fs.writeFileSync(`${here}probes-v2.json`, `${JSON.stringify(probesV2, null, 2)}\n`);
console.log({ targets: targets.length, reviewed: targets.filter((t) => t.reviewStatus === 'reviewed').length, changedExpectations: probesV2.filter((p) => p.previousExpectedOutcome).map((p) => p.handle) });
