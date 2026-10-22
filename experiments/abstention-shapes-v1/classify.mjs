#!/usr/bin/env node
// A0: why R4's English sentences get no record. Offline, no model call.
//   node experiments/abstention-shapes-v1/classify.mjs [--out experiments/abstention-shapes-v1/classification.json]
// Needs packages/core built (pnpm --filter @corpunum/lunum build).
//
// For every R4 item that is not covered (an abstain or a sentence copy) it records:
//   1. the extractor's declared reason (unsupported / unresolved / ambiguous);
//   2. what the extractor tried before abstaining: each submission attempt, its failure class and diagnostics;
//   3. a counterfactual replay: the same attempt with a bare-string `action` written as a text term
//      (underscores to spaces), re-submitted through the current core's submitCandidate. This measures how
//      many abstains are one mechanical mistake away from an identity. It is a diagnostic, not a parse:
//      the extractor did not produce the repaired candidate;
//   4. the sentence shape, by deterministic surface rules (shape() below), first matching rule wins.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from '../parallel-document-v1/score-structure.mjs';
import { submitCandidate } from '../../packages/core/dist/src/agent-native.js';
import { isSentenceCopy } from '../../scripts/research/sentence-copy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const RUN = 'reports/independent-evaluation/2026-10-17-rt1-sonnet';
const requests = J(path.join(root, 'experiments/roundtrip-en-v1/requests.jsonl'));
// Same merge rule as roundtrip-en-v1/score.mjs: a later directory replaces a row with invalid evidence.
const rows = new Map();
for (const d of ['run', 'rerun']) for (const r of J(path.join(root, RUN, d, 'run-ledger.jsonl'))) {
  const old = rows.get(r.handle);
  if (!old || !old.evidenceValid || !['parse', 'abstain'].includes(old.status)) rows.set(r.handle, r);
}

const W = (s) => s.toLowerCase().replace(/[^a-z0-9' -]/g, ' ').split(/\s+/).filter(Boolean);
const MODALS = /\b(can|can't|cannot|could|couldn't|must|mustn't|should|should've|shouldn't|will|won't|would|wouldn't|might|may|shall)\b|'ll\b|'d\b|\b(have|has|had) to\b|\bgoing to\b/i;
const NEG = /\b(not|no|never|nothing|nobody|no one|none)\b|n't\b/i;
const IMPERATIVE_START = /^(please\b|don't\b|do not\b|let's\b|be\b|take\b|tell\b|make\b|see you\b|ask\b|give\b|come\b|go\b|look\b|wait\b|stop\b|try\b|keep\b|bring\b|get\b|help\b|call\b|sit\b|stay\b|write\b|read\b|put\b|show\b|listen\b)/i;
const SUBORD = /\b(if|because|when|while|although|though|until|unless|as far as)\b|,\s*(but|and|so|or)\b|\b(that|what|who|whom|which|where|how|why)\b(?!\?)/i;
const COMPLEMENT_VERB = /\b(want|wants|wanted|asked|asks|ask|refused|agreed|tried|helped|help|let|made|saw|heard|expect|told|tell|need|needs|decided|hope|like|likes|love|loves)\b\s+(\w+\s+){0,2}(to\s+\w+|\w+ing\b)/i;
const BARE_COMPLEMENT = /\b(saw|heard|helped|help|let|made|make)\s+(him|her|them|me|us|you|mary|tom|[a-z]+)\s+(go|escape|wash|happen|sing|singing|go out|do)\b/i;
const POSSESSION = /\b(i|you|we|they|he|she|tom|mary|it)\s+(have|has|had|don't have|doesn't have|didn't have|have no)\b(?!\s+to\b)/i;
const EXISTENTIAL = /^there\s+(is|are|was|were|'s)\b|^there's\b/i;
// A third-person pronoun that stands as a whole argument cannot be a filler (source-bound rule 2, decisions/0024)
// and cannot be left out (rule 3), so such a sentence has no source-bound general parse at all.
const PRONOUN_ARG = /\b(he|she|they|them|him|it)\b/i;
// A first- or second-person subject: the contract says never to fill an agent with "you" and has no speaker/addressee
// term (the deixis rule of decisions/0028 and 0029 is proposed, not implemented).
const DEICTIC_SUBJECT = /^(i|you|we|i'm|you're|we're|i've|we've|you've|i'll|we'll|you'll|i'd|we'd|you'd)\b/i;
const COPULA = /\b(am|is|are|was|were|be|been|being|'m|'re|'s)\b/i;

/** The surface shape of a sentence: first matching rule wins (the order is the priority). */
export function shape(text) {
  const t = text.trim();
  if (/\?\s*$/.test(t)) return 'question';
  if (EXISTENTIAL.test(t)) return 'existential (there is)';
  if (IMPERATIVE_START.test(t) && !/^(be|help|read|go)\b.*\b(I|we)\b/i.test(t)) return 'imperative';
  if (SUBORD.test(t)) return 'multi-clause (subordinate, relative or coordinated clause)';
  if (COMPLEMENT_VERB.test(t) || BARE_COMPLEMENT.test(t)) return 'verb + verb complement (want to X, asked Y to X, saw Y go)';
  if (POSSESSION.test(t)) return 'possession (have / has)';
  if (MODALS.test(t)) return 'simple clause + modal or future';
  if (COPULA.test(t) && !/\b(am|is|are|was|were|'m|'re|'s)\s+(\w+ing)\b/i.test(t)) return 'copula clause (be + adjective or prepositional phrase)';
  return 'simple action clause (subject + verb + object/adjuncts)';
}

/** Feature flags, reported alongside the single shape (one sentence can have several). */
function features(text) {
  return { deicticSubject: DEICTIC_SUBJECT.test(text.trim()), pronounArgument: PRONOUN_ARG.test(text), negated: NEG.test(text), modal: MODALS.test(text), question: /\?\s*$/.test(text), multiClause: SUBORD.test(text) };
}

function textAction(sem) {
  const copy = structuredClone(sem); let changed = 0;
  const fix = (clauses) => { for (const c of clauses || []) {
    for (const [k, v] of Object.entries(c.roles || {})) if (k === 'action' && typeof v === 'string' && c.predicate === 'assert') { c.roles[k] = { type: 'text', value: v.replace(/_/g, ' ') }; changed += 1; }
    fix(c.conditions); fix(c.consequences);
  } };
  fix(copy.clauses);
  return { sem: copy, changed };
}

const notCovered = [];
const tally = { items: 0, ran: 0, parse: 0, abstain: 0, invalid: 0, copy: 0, covered: 0 };
for (const req of requests) {
  tally.items += 1; const row = rows.get(req.handle); if (!row) continue;
  tally.ran += 1; if (!row.evidenceValid) tally.invalid += 1;
  if (row.status === 'parse') tally.parse += 1; else tally.abstain += 1;
  const rec = record(req, row);
  if (rec && !rec.copy) { tally.covered += 1; continue; }
  if (rec?.copy) tally.copy += 1;
  const attempts = (row.submissionAttempts || []).map((a) => {
    const s = a.response?.submission || {};
    const proposed = a.proposedCandidateSem || null;
    const out = { predicates: (proposed?.clauses || []).map((c) => c.predicate + (typeof c.roles?.action === 'string' ? `/action="${c.roles.action}"` : '')), failureClass: s.failureClass ?? null, diagnostics: s.diagnostics || [] };
    if (proposed && s.failureClass) {
      const { sem, changed } = textAction(proposed);
      if (changed) {
        const r = submitCandidate({ sourceText: req.sourceText, sourceLanguage: 'en', candidateSem: sem, provenance: { extractorType: 'agent', timestamp: '2026-10-22T00:00:00.000Z' } });
        out.replayTextAction = { identity: r.semanticFingerprint, failureClass: r.failureClass, diagnostics: r.diagnostics, copy: r.sem ? isSentenceCopy(req.sourceText, r.sem) : null };
      }
    }
    return out;
  });
  const replays = attempts.map((a) => a.replayTextAction).filter(Boolean);
  notCovered.push({
    handle: req.handle, sourceText: req.sourceText, outcome: rec?.copy ? 'sentence_copy' : (row.evidenceValid ? 'abstain' : 'invalid'),
    declaredReason: row.declared?.reason ?? null, copyPredicates: rec?.copy ? rec.sem.clauses.map((c) => c.predicate) : null,
    attempts, recoverableByTextAction: replays.some((x) => x.identity && !x.copy),
    shape: shape(req.sourceText), features: features(req.sourceText),
  });
}

const count = (xs, f) => { const m = {}; for (const x of xs) { const k = f(x); m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const abst = notCovered.filter((x) => x.outcome !== 'sentence_copy');
const copies = notCovered.filter((x) => x.outcome === 'sentence_copy');
const tried = abst.filter((x) => x.attempts.length);
const lastFail = (x) => { const a = x.attempts.at(-1); if (!a) return 'no attempt (abstained after reading the contract)'; const d = a.diagnostics.join(' ');
  if (/is not registered/.test(d) && a.predicates.some((p) => p.includes('/action='))) return 'assert.action written as a bare string (read as an unregistered predicate symbol)';
  if (/is not registered/.test(d)) return 'unregistered predicate';
  return a.failureClass || 'other'; };
/** One primary cause per item, first matching rule wins (the order is the priority). */
function primaryCause(x) {
  if (x.features.question) return x.outcome === 'sentence_copy' ? 'question parsed as a topic label (a sentence copy)' : 'question (abstained)';
  if (x.recoverableByTextAction) return 'assert.action written as a bare string; identity once written as a text term';
  if (x.features.pronounArgument) return 'third-person pronoun as a whole argument (he, she, they, him, them, it): refused filler, cannot be left out';
  if (x.features.deicticSubject) return 'first- or second-person subject (I, you, we): no speaker/addressee term in the contract';
  return `other: ${x.shape}`;
}
for (const x of notCovered) x.primaryCause = primaryCause(x);
const summary = {
  run: RUN, tally, notCovered: notCovered.length, abstainOrInvalid: abst.length, sentenceCopies: copies.length,
  primaryCause: count(notCovered, (x) => x.primaryCause),
  declaredReason: count(abst, (x) => x.declaredReason),
  attemptsBeforeAbstaining: count(abst, (x) => String(x.attempts.length)),
  lastAttemptFailure: count(abst, lastFail),
  recoverableByTextAction: { items: abst.filter((x) => x.recoverableByTextAction).length, ofTriedWithStringAction: tried.filter((x) => x.attempts.some((a) => a.replayTextAction)).length },
  replayFailuresAfterTextAction: count(tried.filter((x) => x.attempts.some((a) => a.replayTextAction) && !x.recoverableByTextAction), (x) => x.attempts.map((a) => a.replayTextAction).filter(Boolean).at(-1)?.failureClass ?? 'copy'),
  shapeOfAbstains: count(abst, (x) => x.shape),
  shapeOfAbstainsNoAttempt: count(abst.filter((x) => !x.attempts.length), (x) => x.shape),
  shapeOfCopies: count(copies, (x) => x.shape),
  copyPredicates: count(copies, (x) => x.copyPredicates.join('+')),
  featuresOfAbstains: { deicticSubject: abst.filter((x) => x.features.deicticSubject).length, deicticSubjectNoAttempt: abst.filter((x) => x.features.deicticSubject && !x.attempts.length).length, pronounArgument: abst.filter((x) => x.features.pronounArgument).length, pronounArgumentNoAttempt: abst.filter((x) => x.features.pronounArgument && !x.attempts.length).length, negated: abst.filter((x) => x.features.negated).length, modal: abst.filter((x) => x.features.modal).length, question: abst.filter((x) => x.features.question).length, multiClause: abst.filter((x) => x.features.multiClause).length },
};
// Cross-check: the same last-attempt tally on the two ADR 0027 gate runs (Sonnet, same contract), every recorded row.
summary.crossCheckOtherSonnetRuns = {};
for (const d of ['reports/independent-evaluation/2026-10-17-idg1-sonnet', 'reports/independent-evaluation/2026-10-17-idg2-sonnet']) {
  const t = { rows: 0, abstain: 0, noAttempt: 0, stringAction: 0, other: 0 };
  for (const sub of fs.readdirSync(path.join(root, d))) {
    const f = path.join(root, d, sub, 'run-ledger.jsonl'); if (!fs.existsSync(f)) continue;
    for (const r of J(f)) {
      t.rows += 1; if (r.status !== 'abstain') continue; t.abstain += 1;
      const a = (r.submissionAttempts || []).at(-1);
      if (!a) { t.noAttempt += 1; continue; }
      const strA = (a.proposedCandidateSem?.clauses || []).some((c) => typeof c.roles?.action === 'string');
      if (strA && (a.response?.submission?.diagnostics || []).some((m) => m.includes('is not registered'))) t.stringAction += 1; else t.other += 1;
    }
  }
  summary.crossCheckOtherSonnetRuns[d] = t;
}
const out = { summary, items: notCovered };
fs.writeFileSync(arg('--out', path.join(here, 'classification.json')), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
