// Relative time expressions and cardinal number words (decisions/0020).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLiteralRetention, numbersInText, numberWordsInText, relativeTimesInText } from '../src/literal-retention.js';
import { submitCandidate } from '../src/agent-native.js';
import type { LunumSem } from '../src/types.js';

const provenance = { extractorType: 'agent' as const, extractorId: 'relative-time-number-word-test' };

function sem(clauses: LunumSem['clauses']): LunumSem {
  return { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses };
}

const retry = (count: unknown): LunumSem => sem([{ predicate: 'restart', roles: {
  theme: { type: 'service', id: 'payment-service' },
  ...(count === undefined ? {} : { count: count as never }),
}, negated: false }]);

test('spelled-out counts are number literals: "seven times" stored as 3 is refused', () => {
  const source = 'Restart the payment service seven times.';
  assert.deepEqual(numbersInText(source), [7]);
  const dropped = checkLiteralRetention(source, retry({ type: 'quantity', value: 3 }));
  assert.equal(dropped.retained, false);
  assert.deepEqual(dropped.missingNumbers, [7]);
  assert.equal(checkLiteralRetention(source, retry(undefined)).retained, false);
  assert.equal(checkLiteralRetention(source, retry({ type: 'quantity', value: 7 })).retained, true);
  // A number word in the candidate carries the same number.
  assert.equal(checkLiteralRetention(source, retry({ type: 'quantity', value: 'seven' } as never)).retained, true);
  // Through the agent contract, with an otherwise canonical frame.
  const above = (value: number): LunumSem => sem([{ predicate: 'above', roles: {
    subject: { type: 'metric', id: 'disk_usage' }, value: { type: 'quantity', value, unit: 'percent' },
  }, negated: false }]);
  const source2 = 'Disk usage is above seven percent.';
  const refused = submitCandidate({ sourceText: source2, candidateSem: above(3), provenance });
  assert.equal(refused.candidateIdentityAvailable, false);
  assert.equal(refused.failureClass, 'unretained_source_literal');
  assert.equal(submitCandidate({ sourceText: source2, candidateSem: above(7), provenance }).candidateIdentityAvailable, true);
  // The same meaning with digits gets the same identity.
  assert.equal(
    submitCandidate({ sourceText: 'Disk usage is above 7 percent.', candidateSem: above(7), provenance }).semanticFingerprint,
    submitCandidate({ sourceText: source2, candidateSem: above(7), provenance }).semanticFingerprint,
  );
});

test('EN and EL number words, compounds and the excluded article-like words', () => {
  assert.deepEqual(numberWordsInText('twenty-five servers, two hundred and five users, a dozen eggs, twice'), [25, 205, 12, 2]);
  assert.deepEqual(numberWordsInText('Δοκίμασε επτά φορές, είκοσι πέντε αρχεία, τρεις χιλιάδες διακόσια πενήντα'), [7, 25, 3250]);
  assert.deepEqual(numberWordsInText('twenty five seven'), [25, 7]);
  // "one", "once" and Greek ένα/μία are also articles/pronouns: never counted.
  assert.deepEqual(numberWordsInText('The one that failed once; ένα αρχείο, μία φορά.'), []);
  // "τοις εκατό" is "percent" (replay of recorded candidates, decisions/0020).
  assert.deepEqual(numbersInText('Αν η μπαταρία είναι κάτω από 20 τοις εκατό'), [20]);
  assert.deepEqual(numberWordsInText('εκατό αρχεία'), [100]);
  // Words that merely contain a number word are not numbers.
  assert.deepEqual(numberWordsInText('often, tension, nineteenth, someone'), []);
  // Same value in EN and EL: a Greek source is retained by a candidate written in English words or digits.
  assert.equal(checkLiteralRetention('Επανεκκίνησε την υπηρεσία επτά φορές.', retry({ type: 'quantity', value: 7 })).retained, true);
});

const deploy = (time?: unknown): LunumSem => sem([{ predicate: 'deploy', roles: {
  theme: { type: 'artifact', id: 'patch' },
  ...(time === undefined ? {} : { time: time as never }),
}, negated: false }]);

test('relative dates are deictic literals: dropping or resolving "by Friday" is refused', () => {
  const source = 'Deploy the patch by Friday.';
  assert.deepEqual(relativeTimesInText(source), ['weekday:friday']);
  const dropped = checkLiteralRetention(source, deploy());
  assert.equal(dropped.retained, false);
  assert.deepEqual(dropped.missingRelativeTimes, ['weekday:friday']);
  // Resolving the weekday against an unstated "now" is a guess, not retention.
  assert.equal(checkLiteralRetention(source, deploy({ type: 'date', value: '2026-10-09' })).retained, false);
  assert.equal(checkLiteralRetention(source, deploy({ type: 'weekday', value: 'Friday' })).retained, true);
  // Through the agent contract, with an otherwise canonical deadline frame.
  const deadline = sem([{ predicate: 'deadline', roles: {
    subject: { type: 'project', id: 'patch' }, time: { type: 'date', value: '2026-10-09' },
  }, negated: false }]);
  const result = submitCandidate({ sourceText: 'The patch is due by Friday.', candidateSem: deadline, provenance });
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.failureClass, 'unretained_source_literal');
  assert.match(result.diagnostics.join('\n'), /weekday:friday/u);
  // The same candidate for an absolute source date is accepted.
  assert.equal(submitCandidate({ sourceText: 'The patch is due on 2026-10-09.', candidateSem: deadline, provenance }).candidateIdentityAvailable, true);
});

test('EN and EL relative times share canonical tokens', () => {
  assert.deepEqual(relativeTimesInText('Ship it next week, EOD tomorrow.'), ['period:next-week', 'end-of:day', 'day:tomorrow']);
  assert.deepEqual(relativeTimesInText('Κάν το αύριο ή την επόμενη εβδομάδα.'), ['day:tomorrow', 'period:next-week']);
  assert.deepEqual(relativeTimesInText('Παράδοση την Παρασκευή.'), ['weekday:friday']);
  // Greek Τρίτη/Τετάρτη/Πέμπτη are weekdays only when capitalised (lower case: ordinals).
  assert.deepEqual(relativeTimesInText('η τρίτη προσπάθεια'), []);
  assert.deepEqual(relativeTimesInText('την Τρίτη'), ['weekday:tuesday']);
  // A Greek source is retained by an English-valued candidate with the same referent.
  assert.equal(checkLiteralRetention('Ανάπτυξε το patch μέχρι την Παρασκευή.', deploy({ type: 'weekday', value: 'friday' })).retained, true);
  // Candidate tokens written with underscores still count.
  assert.equal(checkLiteralRetention('Review it next week.', deploy({ type: 'relative', value: 'next_week' })).retained, true);
});

test('absolute dates and plain text without relative times are unchanged', () => {
  const result = checkLiteralRetention('Deploy the patch on 2026-10-09.', deploy({ type: 'date', value: '2026-10-09' }));
  assert.equal(result.retained, true);
  assert.deepEqual(result.sourceRelativeTimes, []);
  assert.deepEqual(result.missingRelativeTimes, []);
});

test('e02: a strict threshold on an allowed theme is a below() condition and receives identity', () => {
  const candidate = sem([{ predicate: 'allow', roles: {
    agent: { type: 'actor', id: 'finance_lead' }, recipient: { type: 'actor', id: 'omar' },
    action: 'approve', theme: { type: 'document', id: 'invoices' },
  }, negated: false, conditions: [{ predicate: 'below', roles: {
    subject: { type: 'document', id: 'invoices' }, value: { type: 'quantity', value: 5000, unit: 'EUR' },
  }, negated: false }] }]);
  const result = submitCandidate({ sourceText: 'The finance lead allows Omar to approve invoices under 5,000 euros.', candidateSem: candidate, provenance });
  assert.equal(result.candidateIdentityAvailable, true);
  // Dropping the threshold is still refused.
  const dropped = structuredClone(candidate);
  delete dropped.clauses[0]!.conditions;
  assert.equal(submitCandidate({ sourceText: 'The finance lead allows Omar to approve invoices under 5,000 euros.', candidateSem: dropped, provenance }).candidateIdentityAvailable, false);
});
