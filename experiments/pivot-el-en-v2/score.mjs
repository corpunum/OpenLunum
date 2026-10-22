#!/usr/bin/env node
// pivot-el-en-v2: score P1 (coverage, relaxed agreement), P2 (identity), P4 (literals) and the reported measures. Offline.
// Step A, after both translators ran:
//   node score.mjs --qwen translations-qwen.jsonl --luna translations-luna.jsonl --emit-requests requests-en-pivot.jsonl
//   one runner request per DISTINCT English translation that passes pivot-guards/0.2 and is not a human request
//   (handles pv2-en-<sha256("en\n"+text)[:16]>, so identical strings are extracted once: memoisation, decisions/0030).
// Step B, after extraction:
//   node score.mjs --qwen ... --luna ... --pivot-requests requests-en-pivot.jsonl --runs dir[,dir...] [--out score.json]
// Guards are recomputed from each parsed translation under both pivot-guards/0.2 (the measured guards) and 0.1 (v1's,
// reported only). Agreement: structure (the P1/P2/P4 rule; the accepted identity is Qwen's, the primary translator's) and
// exact identity (v1's rule, reported).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { record } from '../parallel-document-v1/score-structure.mjs';
import { checkLiteralRetention } from '../../packages/core/dist/src/index.js';
import { agreePivotIdentity, agreePivotStructure, checkPivotGuards, foldPivotText } from '../../packages/eval/dist/src/pivot-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const PREFIX = arg('--handle-prefix', 'pv2-en-'); // pv1-en- with --pairs/--human only for the scorer check on v1's files
export const enHandle = (text) => `${PREFIX}${sha(`en\n${text}`).slice(0, 16)}`;
const FAMILY = { qwen: 'alibaba-qwen', luna: 'openai' };
const T = ['qwen', 'luna'];
const G2 = 'pivot-guards/0.2'; const G1 = 'pivot-guards/0.1';

const pairsFile = JSON.parse(fs.readFileSync(arg('--pairs', path.join(here, 'pairs.json')), 'utf8'));
const pairs = pairsFile.heldout;
const human = J(arg('--human', path.join(here, 'requests-en-human.jsonl')));
const legsOf = Object.fromEntries(T.map((t) => [t, new Map(J(arg(`--${t}`)).map((r) => [r.pair, r]))]));
const pairByName = new Map(pairs.map((p) => [p.pair, p]));
const guardsOf = (t, pair, version) => { const r = legsOf[t].get(pair); return r?.parsed ? checkPivotGuards(pairByName.get(pair).el, 'el', r.parsed, 'en', { version }) : null; };

if (arg('--emit-requests')) {
  const have = new Set(human.map((r) => r.handle)); const out = new Map();
  for (const p of pairs) for (const t of T) {
    if (!guardsOf(t, p.pair, G2)?.pass) continue;
    const text = legsOf[t].get(p.pair).parsed.translation; const handle = enHandle(text);
    if (!have.has(handle) && !out.has(handle)) out.set(handle, { handle, sourceLanguage: 'en', sourceText: text, sourceSha256: sha(text), contractHash: pairsFile.contractHash });
  }
  fs.writeFileSync(arg('--emit-requests'), [...out.values()].map((r) => JSON.stringify(r)).join('\n') + (out.size ? '\n' : ''));
  console.log({ pivotRequests: out.size });
  process.exit(0);
}

// A later run directory replaces a row with invalid evidence or no parse/abstain status.
const rows = new Map();
for (const d of (arg('--runs') ?? '').split(',').filter(Boolean)) for (const r of J(`${d}/run-ledger.jsonl`)) {
  const old = rows.get(r.handle); if (!old || !old.evidenceValid || !['parse', 'abstain'].includes(old.status)) rows.set(r.handle, r);
}
const requests = new Map([...human, ...J(arg('--pivot-requests'))].map((r) => [r.handle, r]));
const covered = (handle) => { const req = requests.get(handle); const row = rows.get(handle); if (!req || !row) return { ran: false };
  const rec = record(req, row); return { ran: true, invalid: !row.evidenceValid, rec: rec && !rec.copy ? rec : null, copy: Boolean(rec?.copy) }; };

const items = pairs.map((p) => {
  const h = covered(p.enHandle);
  const legs = T.map((t) => {
    const leg = legsOf[t].get(p.pair);
    const text = leg?.parsed?.translation ?? null;
    const g2 = guardsOf(t, p.pair, G2); const g1 = guardsOf(t, p.pair, G1);
    const c = text && g2?.pass ? covered(enHandle(text)) : { ran: false };
    return { translator: t, present: Boolean(leg), parsed: Boolean(leg?.parsed), text, guards: g2, guardsV01: g1 ? { pass: g1.pass, failures: g1.failures } : null,
      rec: c.rec ?? null, ran: c.ran, copy: Boolean(c.copy), flags: leg?.parsed?.flags ?? null, literals: leg?.parsed?.literals ?? [] };
  });
  const asLegs = (guardKey) => legs.map((l) => ({ translator: l.translator, translation: null, guards: l[guardKey] ?? { pass: false }, identity: l.rec?.lfp ?? null, structure: l.rec?.structure ?? null }));
  const structure = agreePivotStructure(asLegs('guards'), (t) => FAMILY[t]);
  const exact = agreePivotIdentity(asLegs('guards'), (t) => FAMILY[t]);
  const structureV01 = agreePivotStructure(asLegs('guardsV01'), (t) => FAMILY[t]);
  const exactV01 = agreePivotIdentity(asLegs('guardsV01'), (t) => FAMILY[t]);
  const pivotRec = structure.accepted ? legs[0].rec : null;
  let p4 = null;
  if (pivotRec) {
    const lit = checkLiteralRetention(p.el, pivotRec.sem);
    const semText = foldPivotText(JSON.stringify(pivotRec.sem));
    const names = [...new Set(legs.flatMap((l) => l.literals.filter((x) => x.kind === 'name').map((x) => x.target)))];
    const missingNames = names.filter((n) => !semText.includes(foldPivotText(n)));
    const hasLiterals = lit.sourceNumbers.length + lit.sourceDates.length + lit.sourceRelativeTimes.length + lit.sourceIdentifiers.length + names.length > 0;
    p4 = { hasLiterals, retained: lit.retained && missingNames.length === 0, missingNames, missing: [...lit.missingNumbers, ...lit.missingDates, ...lit.missingRelativeTimes, ...lit.missingIdentifiers] };
  }
  return { pair: p.pair, en: p.en, el: p.el, humanCovered: Boolean(h.rec), humanLfp: h.rec?.lfp ?? null, humanStructure: h.rec?.structure ?? null, humanRan: h.ran, humanCopy: h.copy,
    legs: legs.map(({ rec, ...l }) => ({ ...l, lfp: rec?.lfp ?? null, structure: rec?.structure ?? null, sameStringAsHuman: l.text === p.en })),
    agreement: { structure, exact, structureV01, exactV01 }, pivotLfp: pivotRec?.lfp ?? null, exactLfp: exact.accepted ? exact.identity : null, p4 };
});

const n = items.length;
const humanCov = items.filter((x) => x.humanCovered).length;
const ratio = (k) => (humanCov ? k / humanCov : null);
const p1 = (k) => ({ covered: k, rate: k / n, ratio: ratio(k), meetsBar: humanCov >= 30 ? k >= 0.8 * humanCov : null });
const count = (f) => items.filter(f).length;
const memo = (x) => x.legs.some((l) => l.sameStringAsHuman);
const humanIds = new Map(items.filter((x) => x.humanLfp).map((x) => [x.humanLfp, x.pair]));
const p2 = (key) => {
  const both = items.filter((x) => x.humanCovered && x[key]);
  const same = both.filter((x) => x[key] === x.humanLfp);
  const collisions = items.filter((x) => x[key] && humanIds.has(x[key]) && humanIds.get(x[key]) !== x.pair).map((x) => ({ pair: x.pair, collidesWith: humanIds.get(x[key]) }));
  const nonMemo = both.filter((x) => !memo(x));
  return { bothCovered: both.length, sameIdentity: same.length, rate: both.length ? same.length / both.length : null, verdictPossible: both.length >= 20,
    pass: both.length >= 20 ? same.length / both.length >= 0.5 && collisions.length === 0 : null, collisions,
    sameWhenSomeTranslationEqualsHuman: { of: both.length - nonMemo.length, same: same.filter(memo).length },
    sameWhenNoTranslationEqualsHuman: { of: nonMemo.length, same: same.filter((x) => !memo(x)).length },
    eitherLegEqualsHuman: both.filter((x) => x.legs.some((l) => l.lfp && l.lfp === x.humanLfp)).length,
    sameStructureAsHuman: both.filter((x) => x.legs[0].structure === x.humanStructure).length };
};
const p4Items = items.filter((x) => x.p4);
const tally = (f) => { const m = {}; for (const x of items) for (const k of f(x)) m[k] = (m[k] || 0) + 1; return m; };
const single = (i) => count((x) => x.legs[i].lfp);
const flagAgree = (k) => { const xs = items.filter((x) => x.legs.every((l) => l.flags)); return { of: xs.length, agree: xs.filter((x) => JSON.stringify(x.legs[0].flags[k]) === JSON.stringify(x.legs[1].flags[k])).length }; };

const summary = {
  pairs: n, translators: T, guards: G2, humanCovered: humanCov, humanRate: humanCov / n, verdictPossible: humanCov >= 30,
  P1: { rule: 'structure agreement, pivot-guards/0.2', ...p1(count((x) => x.pivotLfp)), pass: humanCov >= 30 ? count((x) => x.pivotLfp) >= 0.8 * humanCov : null },
  P2: { rule: 'structure agreement; accepted identity = Qwen leg', ...p2('pivotLfp') },
  P4: { acceptedRecords: p4Items.length, withLiterals: p4Items.filter((x) => x.p4.hasLiterals).length, retained: p4Items.filter((x) => x.p4.retained).length,
    pass: p4Items.length ? p4Items.every((x) => x.p4.retained) : null, failures: p4Items.filter((x) => !x.p4.retained).map((x) => ({ pair: x.pair, ...x.p4 })) },
  reported: {
    P1exactIdentity: p1(count((x) => x.exactLfp)),
    P2exactIdentity: p2('exactLfp'),
    P1structureGuardsV01: p1(count((x) => x.agreement.structureV01.accepted)),
    P1exactGuardsV01: p1(count((x) => x.agreement.exactV01.accepted)),
    singleTranslatorCoverage: { qwen: p1(single(0)), luna: p1(single(1)) },
    acceptedWithIdenticalIdentities: count((x) => x.agreement.structure.accepted && x.agreement.structure.identitiesEqual),
    agreementOutcome: { structure: tally((x) => [x.agreement.structure.accepted ? 'accepted' : x.agreement.structure.reason]), exact: tally((x) => [x.agreement.exact.accepted ? 'accepted' : x.agreement.exact.reason]) },
    guardFailures: Object.fromEntries(T.map((t, i) => [t, { v02: tally((x) => x.legs[i].guards?.failures ?? ['no_parse']), v01: tally((x) => x.legs[i].guardsV01?.failures ?? ['no_parse']) }])),
    exactStringEqualsHuman: Object.fromEntries(T.map((t, i) => [t, count((x) => x.legs[i].sameStringAsHuman)])),
    translatorsSameString: count((x) => x.legs[0].text && x.legs[0].text === x.legs[1].text),
    flagAgreement: Object.fromEntries(['aspect', 'formality', 'addresseeNumber', 'evidentiality', 'droppedSubject', 'gender'].map((k) => [k, flagAgree(k)])),
    droppedSubject: Object.fromEntries(T.map((t, i) => [t, count((x) => x.legs[i].flags?.droppedSubject)])),
    humanSentenceCopies: count((x) => x.humanCopy),
    pivotSentenceCopies: Object.fromEntries(T.map((t, i) => [t, count((x) => x.legs[i].copy)])),
    pivotOnlyCovered: count((x) => x.pivotLfp && !x.humanCovered),
  },
};
fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify({ summary, items }, null, 1) + '\n');
if (arg('--out')) console.log(JSON.stringify(summary, null, 1));
