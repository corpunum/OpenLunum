import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEANING_FLAGS_JSON_SCHEMA, agreePivotIdentity, buildPivotPrompt, buildRenderPrompt, checkPivotGuards,
  parsePivotTranslation, pivotMarkers, type PivotLeg, type PivotTranslation,
} from '../src/pivot-adapter.js';

const flags = { aspect: 'unmarked', formality: 'unmarked', addresseeNumber: 'unmarked', gender: [], evidentiality: 'unmarked', droppedSubject: false } as const;
const tr = (translation: string, extra: Partial<PivotTranslation> = {}): PivotTranslation => ({ translation, flags: { ...flags, gender: [] }, literals: [], ambiguous: false, ambiguityNote: null, ...extra });
const el = (src: string, t: PivotTranslation) => checkPivotGuards(src, 'el', t, 'en');

test('prompts name the rules, the languages and the source', () => {
  const p = buildPivotPrompt('Ο Τομ δεν θα έρθει.', 'el');
  assert.match(p, /Greek into English/u);
  assert.match(p, /Never change negation/u);
  assert.match(p, /droppedSubject/u);
  assert.ok(p.includes(JSON.stringify('Ο Τομ δεν θα έρθει.')));
  const r = buildRenderPrompt('Tom will not come.', { ...flags, gender: [], aspect: 'perfective' }, 'el');
  assert.match(r, /English into Greek/u);
  assert.match(r, /"aspect":"perfective"/u);
});

test('parser accepts a full reply wrapped in prose and refuses missing or invalid fields', () => {
  const good = { translation: 'I will call the police.', flags: { ...flags, droppedSubject: true }, literals: [], ambiguous: false, ambiguityNote: null };
  const ok = parsePivotTranslation(`Here:\n${JSON.stringify(good)}\n`);
  assert.equal(ok.ok, true);
  const bad = parsePivotTranslation(JSON.stringify({ ...good, flags: { ...flags, aspect: 'past' } }));
  assert.deepEqual(bad.ok ? [] : bad.errors, ['flags.aspect']);
  assert.equal(parsePivotTranslation('no json').ok, false);
  const noLit = parsePivotTranslation(JSON.stringify({ ...good, literals: [{ source: 'Τομ', kind: 'name' }] }));
  assert.equal(noLit.ok, false);
});

test('schema stays inside the constrained-decoding subset', () => {
  const s = JSON.stringify(MEANING_FLAGS_JSON_SCHEMA);
  for (const forbidden of ['"pattern"', '"format"', '"allOf"', '"not"', '"if"']) assert.ok(!s.includes(forbidden), forbidden);
});

test('markers: Greek clitic negation, modality and future; English equivalents', () => {
  assert.deepEqual(pivotMarkers('Δεν πρέπει να φύγεις.', 'el'), { negation: true, necessity: true, possibility: false, future: false });
  assert.deepEqual(pivotMarkers('Ίσως θα έρθει.', 'el'), { negation: false, necessity: false, possibility: true, future: true });
  assert.deepEqual(pivotMarkers('Μπορείς να με βοηθήσεις;', 'el'), { negation: false, necessity: false, possibility: true, future: false });
  assert.deepEqual(pivotMarkers("You mustn't leave.", 'en'), { negation: true, necessity: true, possibility: false, future: false });
  assert.deepEqual(pivotMarkers("I'll go.", 'en'), { negation: false, necessity: false, possibility: false, future: true });
  assert.equal(pivotMarkers('No sé.', 'es'), null);
});

test('a faithful translation passes', () => {
  const r = el('Ο Τομ ήρθε στη Βοστώνη το 2013.', tr('Tom came to Boston in 2013.', { literals: [{ source: 'Τομ', target: 'Tom', kind: 'name' }, { source: 'Βοστώνη', target: 'Boston', kind: 'name' }, { source: '2013', target: '2013', kind: 'number' }] }));
  assert.deepEqual(r.failures, []);
  assert.equal(r.pass, true);
});

test('numbers, number words, relative times and identifiers must be carried', () => {
  assert.deepEqual(el('Έχουμε τρία παιδιά.', tr('We have three kids.')).failures, []);
  assert.deepEqual(el('Έχουμε τρία παιδιά.', tr('We have kids.')).failures, ['number_not_carried']);
  assert.deepEqual(el('Έφυγε αύριο.', tr('He left today.')).failures, ['relative_time_not_carried']);
  assert.ok(el('Το σφάλμα E-42 επανήλθε.', tr('The error came back.')).failures.includes('identifier_not_carried'));
  assert.deepEqual(el('Τα ψάρια είναι 12 και 12.', tr('There are 12 fish.')).failures, ['number_not_carried']);
});

test('names: undeclared mid-sentence names and declared literals missing from the translation fail', () => {
  assert.ok(el('Είδα τη Μαίρη.', tr('I saw Mary.')).failures.includes('undeclared_name'));
  assert.deepEqual(el('Είδα τη Μαίρη.', tr('I saw Mary.', { literals: [{ source: 'Μαίρη', target: 'Mary', kind: 'name' }] })).failures, []);
  assert.deepEqual(el('Είδα τη Μαίρη.', tr('I saw Maria.', { literals: [{ source: 'Μαίρη', target: 'Mary', kind: 'name' }] })).failures, ['declared_literal_not_in_translation']);
  assert.deepEqual(el('Χρησιμοποιώ το Linux.', tr('I use Windows.', { literals: [{ source: 'Linux', target: 'Windows', kind: 'name' }] })).failures, ['latin_word_not_carried']);
  // Sentence-initial capitals and the English "I" are not names.
  assert.deepEqual(checkPivotGuards('Yesterday I saw it.', 'en', tr('Χθες το είδα.'), 'el').failures, []);
});

test('negation and modality may not change; future may not be dropped', () => {
  assert.deepEqual(el('Δεν τον ξέρουμε.', tr('We know him.')).failures, ['negation_changed']);
  assert.deepEqual(el('Τον ξέρουμε.', tr("We don't know him.")).failures, ['negation_changed']);
  assert.deepEqual(el('Πρέπει να φύγω.', tr('I may leave.')).failures, ['necessity_changed', 'possibility_changed']);
  assert.deepEqual(el('Θα φύγω.', tr('I leave.')).failures, ['future_dropped']);
  assert.deepEqual(el('Θα φύγω.', tr("I'll leave.")).failures, []);
  assert.deepEqual(el('Κανείς δεν ήρθε.', tr('Nobody came.')).failures, []);
});

test('ambiguity and unsupported languages abstain', () => {
  assert.deepEqual(el('Το είδα.', tr('I saw it.', { ambiguous: true, ambiguityNote: 'it or him' })).failures, ['ambiguous']);
  assert.ok(checkPivotGuards('No lo sé.', 'es', tr("I don't know."), 'en').failures.includes('unsupported_language'));
});

test('dual agreement: two families, both pass, same identity', () => {
  const pass = el('Θα φύγω.', tr("I'll leave."));
  const fail = el('Θα φύγω.', tr('I leave.'));
  const leg = (translator: string, identity: string | null, guards = pass): PivotLeg => ({ translator, translation: tr("I'll leave."), guards, identity });
  const family = (t: string) => t.split('/')[0]!;
  assert.deepEqual(agreePivotIdentity([leg('qwen/a', 'lfp:x'), leg('anthropic/b', 'lfp:x')], family), { accepted: true, identity: 'lfp:x' });
  assert.deepEqual(agreePivotIdentity([leg('qwen/a', 'lfp:x'), leg('anthropic/b', 'lfp:y')], family), { accepted: false, reason: 'identities_differ' });
  assert.deepEqual(agreePivotIdentity([leg('qwen/a', 'lfp:x'), leg('qwen/b', 'lfp:x')], family), { accepted: false, reason: 'same_family' });
  assert.deepEqual(agreePivotIdentity([leg('qwen/a', 'lfp:x'), leg('anthropic/b', 'lfp:x', fail)], family), { accepted: false, reason: 'guard_failed' });
  assert.deepEqual(agreePivotIdentity([leg('qwen/a', null), leg('anthropic/b', 'lfp:x')], family), { accepted: false, reason: 'no_identity' });
  assert.deepEqual(agreePivotIdentity([leg('qwen/a', 'lfp:x')], family), { accepted: false, reason: 'too_few_translators' });
});
