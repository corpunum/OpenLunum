#!/usr/bin/env node
// Plan stage P: score P1 (coverage), P2 (identity agreement) and P4 (literal carry-through). Offline, no model call.
//
// Step A, after both translators ran (translate.mjs):
//   node score.mjs --part heldout --qwen translations-qwen.jsonl --sonnet translations-sonnet.jsonl --emit-requests <requests-en-pivot.jsonl>
//   writes one runner request per DISTINCT English translation that passed the guards and is not already a human
//   English request. Handles are pv1-en-<sha256("en\n"+text)[:16]> for human and pivot English alike, so an
//   identical string is one request and one extraction (memoisation, decisions/0030).
// Step B, after the extractor ran on requests-en-human.jsonl and requests-en-pivot.jsonl:
//   node score.mjs --part heldout --qwen ... --sonnet ... --pivot-requests <requests-en-pivot.jsonl> --runs dir[,dir...] [--out score.json]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { record } from '../parallel-document-v1/score-structure.mjs';
import { checkLiteralRetention } from '../../packages/core/dist/src/index.js';
import { agreePivotIdentity, foldPivotText } from '../../packages/eval/dist/src/pivot-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sha = (s) => createHash('sha256').update(s).digest('hex');
export const enHandle = (text) => `pv1-en-${sha(`en\n${text}`).slice(0, 16)}`;
const FAMILY = { qwen: 'alibaba-qwen', sonnet: 'anthropic' };

const pairsFile = JSON.parse(fs.readFileSync(path.join(here, 'pairs.json'), 'utf8'));
const part = arg('--part', 'heldout');
const pairs = pairsFile[part];
const human = J(path.join(here, 'requests-en-human.jsonl'));
const legsOf = { qwen: new Map(J(arg('--qwen')).map((r) => [r.pair, r])), sonnet: new Map(J(arg('--sonnet')).map((r) => [r.pair, r])) };

if (arg('--emit-requests')) {
  const have = new Set(human.map((r) => r.handle)); const out = new Map();
  for (const p of pairs) for (const t of ['qwen', 'sonnet']) {
    const leg = legsOf[t].get(p.pair); if (!leg?.guards?.pass) continue;
    const text = leg.parsed.translation; const handle = enHandle(text);
    if (!have.has(handle) && !out.has(handle)) out.set(handle, { handle, sourceLanguage: 'en', sourceText: text, sourceSha256: sha(text), contractHash: pairsFile.contractHash });
  }
  fs.writeFileSync(arg('--emit-requests'), [...out.values()].map((r) => JSON.stringify(r)).join('\n') + (out.size ? '\n' : ''));
  console.log({ pivotRequests: out.size });
  process.exit(0);
}

// Rows: a later directory replaces a row with invalid evidence (as roundtrip-en-v1/score.mjs).
const rows = new Map();
for (const d of (arg('--runs') ?? '').split(',').filter(Boolean)) for (const r of J(`${d}/run-ledger.jsonl`)) {
  const old = rows.get(r.handle); if (!old || !old.evidenceValid || !['parse', 'abstain'].includes(old.status)) rows.set(r.handle, r);
}
const requests = new Map([...human, ...J(arg('--pivot-requests'))].map((r) => [r.handle, r]));
const covered = (handle) => { const req = requests.get(handle); if (!req) return { ran: false }; const row = rows.get(handle); if (!row) return { ran: false };
  const rec = record(req, row); return { ran: true, invalid: !row.evidenceValid, rec: rec && !rec.copy ? rec : null, copy: Boolean(rec?.copy) }; };

const items = pairs.map((p) => {
  const h = covered(p.enHandle);
  const legs = ['qwen', 'sonnet'].map((t) => {
    const leg = legsOf[t].get(p.pair);
    const text = leg?.parsed?.translation ?? null;
    const c = text && leg.guards?.pass ? covered(enHandle(text)) : { ran: false };
    return { translator: t, present: Boolean(leg), parsed: Boolean(leg?.parsed), text, guards: leg?.guards ?? null, identityRec: c.rec ?? null, ran: c.ran,
      flags: leg?.parsed?.flags ?? null, literals: leg?.parsed?.literals ?? [] };
  });
  const agreement = agreePivotIdentity(legs.map((l) => ({ translator: l.translator, translation: null, guards: l.guards ?? { pass: false }, identity: l.identityRec?.lfp ?? null })), (t) => FAMILY[t]);
  const pivotRec = agreement.accepted ? legs[0].identityRec : null;
  // P4: every Greek-source literal (numbers, dates, relative times, identifiers) is in the accepted record, and every declared name's English form is in it.
  let p4 = null;
  if (pivotRec) {
    const lit = checkLiteralRetention(p.el, pivotRec.sem);
    const semText = foldPivotText(JSON.stringify(pivotRec.sem));
    const names = legs.flatMap((l) => l.literals.filter((x) => x.kind === 'name').map((x) => x.target));
    const missingNames = names.filter((n) => !semText.includes(foldPivotText(n)));
    const hasLiterals = lit.sourceNumbers.length + lit.sourceDates.length + lit.sourceRelativeTimes.length + lit.sourceIdentifiers.length + names.length > 0;
    p4 = { hasLiterals, retained: lit.retained && missingNames.length === 0, missingNames, missing: [...lit.missingNumbers, ...lit.missingDates, ...lit.missingRelativeTimes, ...lit.missingIdentifiers] };
  }
  return { pair: p.pair, en: p.en, el: p.el, humanCovered: Boolean(h.rec), humanLfp: h.rec?.lfp ?? null, humanRan: h.ran, humanCopy: h.copy,
    legs: legs.map(({ identityRec, ...l }) => ({ ...l, lfp: identityRec?.lfp ?? null, sameStringAsHuman: l.text === p.en })),
    agreement, pivotLfp: pivotRec?.lfp ?? null, p4 };
});

const n = items.length;
const humanCov = items.filter((x) => x.humanCovered).length;
const pivotCov = items.filter((x) => x.pivotLfp).length;
const both = items.filter((x) => x.humanCovered && x.pivotLfp);
const same = both.filter((x) => x.pivotLfp === x.humanLfp);
const humanIds = new Map(items.filter((x) => x.humanLfp).map((x) => [x.humanLfp, x.pair]));
const collisions = items.filter((x) => x.pivotLfp && humanIds.has(x.pivotLfp) && humanIds.get(x.pivotLfp) !== x.pair).map((x) => ({ pair: x.pair, collidesWith: humanIds.get(x.pivotLfp) }));
const p4Items = items.filter((x) => x.p4);
const tally = (f) => { const m = {}; for (const x of items) for (const k of f(x)) m[k] = (m[k] || 0) + 1; return m; };
const single = (t) => items.filter((x) => x.legs.find((l) => l.translator === t).lfp).length;
const flagAgree = (k) => { const xs = items.filter((x) => x.legs.every((l) => l.flags)); return { of: xs.length, agree: xs.filter((x) => JSON.stringify(x.legs[0].flags[k]) === JSON.stringify(x.legs[1].flags[k])).length }; };

const summary = {
  part, pairs: n,
  P1: { humanCovered: humanCov, pivotCovered: pivotCov, humanRate: humanCov / n, pivotRate: pivotCov / n, ratio: humanCov ? pivotCov / humanCov : null,
    verdictPossible: humanCov >= 30, pass: humanCov >= 30 ? pivotCov >= 0.8 * humanCov : null },
  P2: { bothCovered: both.length, sameIdentity: same.length, rate: both.length ? same.length / both.length : null, verdictPossible: both.length >= 20,
    pass: both.length >= 20 ? same.length / both.length >= 0.5 && collisions.length === 0 : null, collisions,
    sameIdentityWhenPivotStringEqualsHuman: both.filter((x) => x.legs.some((l) => l.sameStringAsHuman)).length,
    sameIdentityWhenNoPivotStringEqualsHuman: { of: both.filter((x) => !x.legs.some((l) => l.sameStringAsHuman)).length, same: same.filter((x) => !x.legs.some((l) => l.sameStringAsHuman)).length } },
  P4: { acceptedRecords: p4Items.length, withLiterals: p4Items.filter((x) => x.p4.hasLiterals).length, retained: p4Items.filter((x) => x.p4.retained).length,
    pass: p4Items.length ? p4Items.every((x) => x.p4.retained) : null, failures: p4Items.filter((x) => !x.p4.retained).map((x) => ({ pair: x.pair, ...x.p4 })) },
  reported: {
    agreementOutcome: tally((x) => [x.agreement.accepted ? 'accepted' : x.agreement.reason]),
    guardFailures: { qwen: tally((x) => x.legs[0].guards?.failures ?? ['no_parse']), sonnet: tally((x) => x.legs[1].guards?.failures ?? ['no_parse']) },
    singleTranslatorCoverage: { qwen: single('qwen'), sonnet: single('sonnet') },
    exactStringEqualsHuman: { qwen: items.filter((x) => x.legs[0].sameStringAsHuman).length, sonnet: items.filter((x) => x.legs[1].sameStringAsHuman).length },
    translatorsSameString: items.filter((x) => x.legs[0].text && x.legs[0].text === x.legs[1].text).length,
    flagAgreement: Object.fromEntries(['aspect', 'formality', 'addresseeNumber', 'evidentiality', 'droppedSubject', 'gender'].map((k) => [k, flagAgree(k)])),
    droppedSubject: { qwen: items.filter((x) => x.legs[0].flags?.droppedSubject).length, sonnet: items.filter((x) => x.legs[1].flags?.droppedSubject).length },
    humanSentenceCopies: items.filter((x) => x.humanCopy).length,
  },
};
fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify({ summary, items }, null, 1) + '\n');
if (arg('--out')) console.log(JSON.stringify(summary, null, 1));
