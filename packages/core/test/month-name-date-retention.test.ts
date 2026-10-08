// Month-name date literals (decisions/0019, issue #714).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecord } from '../src/derive.js';
import { checkLiteralRetention, datesInText } from '../src/literal-retention.js';
import { submitCandidate } from '../src/agent-native.js';
import type { LunumSem } from '../src/types.js';

const provenance = { extractorType: 'agent' as const, extractorId: 'month-name-date-retention-test' };

function sem(clauses: LunumSem['clauses']): LunumSem {
  return { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses };
}

function deadline(dateValue: string): LunumSem {
  return sem([
    { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: { type: 'date', value: dateValue } }, negated: false },
  ]);
}

const EL_GENITIVE = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const EL_NOMINATIVE = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const EL_COLLOQUIAL = ['Γενάρη', 'Φλεβάρη', 'Μάρτη', 'Απρίλη', 'Μάη', 'Ιούνη', 'Ιούλη', 'Αυγούστου', 'Σεπτέμβρη', 'Οκτώβρη', 'Νοέμβρη', 'Δεκέμβρη'];
const EL_ABBREVIATED = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπτ', 'Οκτ', 'Νοε', 'Δεκ'];
const EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_ABBREVIATED = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const stripAccents = (word: string): string => word.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const iso = (year: number, month: number, day: number): string => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

test('issue #714: EN and EL month-name sources get the same identity as ISO and dotted sources', () => {
  const candidate = deadline('2027-01-14');
  const sources = [
    'Project Orion is due on 2027-01-14.',
    'Το έργο Orion λήγει στις 2027-01-14.',
    'Το έργο Orion λήγει στις 14.01.2027.',
    'Project Orion is due on 14 January 2027.',
    'Το έργο Orion λήγει στις 14 Ιανουαρίου 2027.',
  ];
  const results = sources.map(sourceText => submitCandidate({ sourceText, candidateSem: candidate, provenance }));
  for (const [index, result] of results.entries()) {
    assert.equal(result.candidateIdentityAvailable, true, String(sources[index]));
    assert.equal(result.failureClass, null, String(sources[index]));
    assert.deepEqual(result.literalRetention?.sourceDates, ['2027-01-14'], String(sources[index]));
    assert.deepEqual(result.literalRetention?.sourceNumbers, [], String(sources[index]));
    assert.equal(result.trust.promoted, false);
  }
  assert.equal(new Set(results.map(result => result.semanticFingerprint)).size, 1);
  assert.match(results[0]!.semanticFingerprint!, /^lfp:2\.1:/u);
});

test('every Greek month form, with and without accents and in capitals, normalizes', () => {
  for (const forms of [EL_GENITIVE, EL_NOMINATIVE, EL_COLLOQUIAL, EL_ABBREVIATED]) {
    for (const [index, word] of forms.entries()) {
      const expected = [iso(2027, index + 1, 14)];
      for (const spelling of [word, stripAccents(word), stripAccents(word).toLocaleUpperCase('el'), word.toLocaleLowerCase('el')]) {
        assert.deepEqual(datesInText(`Λήξη στις 14 ${spelling} 2027.`), expected, spelling);
      }
      if (forms === EL_ABBREVIATED) assert.deepEqual(datesInText(`14 ${word}. 2027`), expected, `${word}.`);
    }
  }
  // Decomposed (NFD) input and the unaccented diaeresis variants of May.
  assert.deepEqual(datesInText('14 Ιανουαρίου 2027'.normalize('NFD')), ['2027-01-14']);
  assert.deepEqual(datesInText('3 Μαίου 2027, 3 Μαιου 2027, 3 ΜΑΪΟΥ 2027'), ['2027-05-03', '2027-05-03', '2027-05-03']);
  assert.deepEqual(datesInText('1η Ιουλίου 2027 και 2ης Ιουλίου 2027'), ['2027-07-01', '2027-07-02']);
});

test('English month names, abbreviations, ordinals and month-first order normalize', () => {
  for (const [index, word] of EN_FULL.entries()) {
    const expected = [iso(2026, index + 1, 5)];
    assert.deepEqual(datesInText(`due 5 ${word} 2026`), expected);
    assert.deepEqual(datesInText(`due ${word} 5, 2026`), expected);
    assert.deepEqual(datesInText(`due ${word.toUpperCase()} 5 2026`), expected);
    assert.deepEqual(datesInText(`due the 5th of ${word} 2026`), expected);
  }
  for (const [index, word] of EN_ABBREVIATED.entries()) {
    const expected = [iso(2026, index + 1, 21)];
    assert.deepEqual(datesInText(`21 ${word} 2026`), expected);
    // May is a full name, so it takes no abbreviation period.
    assert.deepEqual(datesInText(`${word}${word === 'May' ? '' : '.'} 21st, 2026`), expected);
  }
  assert.deepEqual(datesInText('Sept. 3, 2026 and 3 Sept 2026'), ['2026-09-03', '2026-09-03']);
  assert.deepEqual(datesInText('2026-01-01, then 14 January 2027, then 02.02.2026 and 13.02.2026'), ['2026-01-01', '2027-01-14', '2026-02-13']);
});

test('partial, invalid, ambiguous and non-month spellings stay unnormalized', () => {
  // No year: never guessed (delegated review e11 and g07).
  assert.deepEqual(datesInText('Send three reminders before the deadline on 15 March.'), []);
  assert.deepEqual(datesInText('Αρχειοθέτησε τα 12 παλιά έργα μέχρι τις 31 Δεκεμβρίου.'), []);
  // No day.
  assert.deepEqual(datesInText('Launch in January 2027.'), []);
  // Calendar-invalid.
  assert.deepEqual(datesInText('31 February 2027, 29 Φεβρουαρίου 2026, 31 April 2027, 0 May 2027'), []);
  assert.deepEqual(datesInText('29 February 2028'), ['2028-02-29']);
  // English modal "may" is not a month; Greek month-first order is not a date convention.
  assert.deepEqual(datesInText('Up to 3 may 2026 units fail.'), []);
  assert.deepEqual(datesInText('Ιανουαρίου 14, 2027'), []);
  // Full names do not take an abbreviation period; unknown words are not months.
  assert.deepEqual(datesInText('14 January. 2027'), []);
  assert.deepEqual(datesInText('14 Janua 2027, 14 Ιανουαρ 2027, 5 units 2026, Room 5 of May 2026'), []);
  // Embedded in identifiers, longer numbers or words.
  assert.deepEqual(datesInText('x14 January 2027, 114 January 2027, 14 January 20271, 14 January 2027a, 14 January 2027.5'), []);
});

test('delegated review fixtures: e06 date retained, e11 and g07 partial dates keep numeric retention', () => {
  const e06 = 'Grant Priya access to the staging database until 30 November 2026.';
  const grant = (time: string): LunumSem => sem([{ predicate: 'allow', roles: {
    agent: { type: 'person', id: 'priya' }, action: 'access', theme: { type: 'system', id: 'staging-database' },
    time: { type: 'date', value: time },
  }, negated: false }]);
  const e06Retained = checkLiteralRetention(e06, grant('2026-11-30'));
  assert.equal(e06Retained.retained, true);
  assert.deepEqual(e06Retained.sourceDates, ['2026-11-30']);
  assert.deepEqual(e06Retained.sourceNumbers, []);
  assert.deepEqual(checkLiteralRetention(e06, grant('2026-11-29')).missingDates, ['2026-11-30']);
  // A year-less date or the bare day cannot stand in for the stated full date.
  assert.deepEqual(checkLiteralRetention(e06, grant('30 November')).missingDates, ['2026-11-30']);
  assert.deepEqual(checkLiteralRetention(e06, sem([{ predicate: 'allow', roles: { agent: 'priya', action: 'access', theme: 'staging database', time: 30, year: 2026 } }])).missingDates, ['2026-11-30']);

  const e11 = 'Send three reminders before the deadline on 15 March.';
  const e11Dropped = checkLiteralRetention(e11, sem([{ predicate: 'deadline', roles: { subject: 'reminders', time: 'March' } }]));
  assert.equal(e11Dropped.retained, false);
  // Since decisions/0020 the number word "three" is a number literal too.
  assert.deepEqual(e11Dropped.missingNumbers, [3, 15]);
  assert.equal(checkLiteralRetention(e11, sem([{ predicate: 'deadline', roles: { subject: 'reminders', time: { type: 'date', value: '--03-15' } } }])).retained, true);

  const g07 = 'Αρχειοθέτησε τα 12 παλιά έργα μέχρι τις 31 Δεκεμβρίου.';
  const g07Retained = checkLiteralRetention(g07, sem([{ predicate: 'deadline', roles: { subject: { type: 'quantity', value: 12, unit: 'projects' }, time: { type: 'date', value: '--12-31' } } }]));
  assert.equal(g07Retained.retained, true);
  assert.deepEqual(g07Retained.sourceDates, []);
  assert.deepEqual(g07Retained.sourceNumbers, [12, 31]);
  assert.deepEqual(checkLiteralRetention(g07, sem([{ predicate: 'deadline', roles: { subject: 'projects', time: '31 Δεκεμβρίου' } }])).missingNumbers, [12]);
});

test('dropped, swapped and shifted month-name dates are refused', () => {
  const english = 'Project Orion is due on 14 January 2027.';
  const greek = 'Το έργο Orion λήγει στις 14 Ιανουαρίου 2027.';
  for (const sourceText of [english, greek]) {
    for (const wrong of ['2027-01-15', '2027-14-01', '2026-01-14', '14.02.2027']) {
      const response = submitCandidate({ sourceText, candidateSem: deadline(wrong), provenance });
      assert.equal(response.candidateIdentityAvailable, false, `${sourceText} vs ${wrong}`);
      assert.equal(response.failureClass, 'unretained_source_literal');
      assert.deepEqual(response.literalRetention?.missingDates, ['2027-01-14']);
    }
    const dropped = submitCandidate({ sourceText, candidateSem: sem([
      { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: 'soon' }, negated: false },
    ]), provenance });
    assert.equal(dropped.candidateIdentityAvailable, false);
    assert.equal(dropped.semanticFingerprint, null);
    assert.match(dropped.diagnostics.join('\n'), /unretained_source_literal: .*2027-01-14/u);
    const record = createRecord({ sem: deadline('2027-01-15'), sourceText });
    assert.equal(record.semanticFingerprint, undefined);
    assert.deepEqual((record.meta.sourceLiteralRetention as { missingDates: string[] }).missingDates, ['2027-01-14']);
  }

  // Both dates are valid and use the same numbers: a valid day/month swap is refused.
  const swap = checkLiteralRetention('Orion is due on 5 December 2026.', deadline('2026-05-12'));
  assert.deepEqual(swap.missingDates, ['2026-12-05']);
  assert.equal(checkLiteralRetention('Orion is due on 5 December 2026.', deadline('2026-12-05')).retained, true);
  // A month-name date cannot satisfy a separate quantity in the source.
  assert.deepEqual(checkLiteralRetention('Orion is due on 14 January 2027 after 14 retries.', deadline('2027-01-14')).missingNumbers, [14]);
});

test('candidate month-name values count only within one semantic field', () => {
  const sourceText = 'Project Orion is due on 14 January 2027.';
  // A month-name value inside one field is an exact date, like ISO and dotted values.
  assert.equal(checkLiteralRetention(sourceText, deadline('14 Ιανουαρίου 2027')).retained, true);
  assert.equal(checkLiteralRetention(sourceText, deadline('January 14, 2027')).retained, true);
  // Separate fields cannot be concatenated into a date that none of them carries.
  const split = checkLiteralRetention(sourceText, sem([
    { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, count: 14, time: { type: 'text', value: 'January 2027' } }, negated: false },
  ]));
  assert.equal(split.retained, false);
  assert.deepEqual(split.missingDates, ['2027-01-14']);
});
