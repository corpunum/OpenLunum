import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEANING_FLAGS_JSON_SCHEMA, PIVOT_GUARDS_VERSION, agreePivotIdentity, agreePivotStructure, isCarriedNationalityOrLanguage, isCarriedWeekdayOrMonth, buildPivotPrompt, buildRenderPrompt, checkPivotGuards,
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

test('pivot-guards/0.2: nationality and language words are not undeclared names when the English carries them', () => {
  const tom = [{ source: 'Τομ', target: 'Tom', kind: 'name' as const }];
  // The four pivot-el-en-v1 shapes (Καναδή, Καναδέζος, Γαλλικά), written fresh.
  assert.deepEqual(el('Η Νίκη μαθαίνει Γαλλικά.', tr('Niki is learning French.', { literals: [{ source: 'Νίκη', target: 'Niki', kind: 'name' }] })).failures, []);
  assert.deepEqual(el('Ο Τομ είναι Καναδέζος.', tr('Tom is Canadian.', { literals: tom })).failures, []);
  assert.deepEqual(el('Ο Τομ παντρεύτηκε μια Καναδή.', tr('Tom married a Canadian woman.', { literals: tom })).failures, []);
  assert.deepEqual(el('Ο Τομ μιλάει Ελληνικά και Ισπανικά.', tr('Tom speaks Greek and Spanish.', { literals: tom })).failures, []);
  // The meaning is still checked: the English must carry the nationality.
  assert.deepEqual(el('Ο Τομ είναι Καναδέζος.', tr('Tom is American.', { literals: tom })).failures, ['undeclared_name']);
  assert.deepEqual(el('Η Νίκη μαθαίνει Γαλλικά.', tr('Niki is learning German.', { literals: [{ source: 'Νίκη', target: 'Niki', kind: 'name' }] })).failures, ['undeclared_name']);
  // A real name is still a name, even if it shares a prefix with a stem («Ινδ-», «Ρωσ-»).
  assert.deepEqual(el('Είδα τη Ρωξάνη.', tr('I saw Roxani.')).failures, ['undeclared_name']);
  assert.equal(isCarriedNationalityOrLanguage('Ρωξάνη', 'I saw Roxani in Russia.'), false);
  assert.equal(isCarriedNationalityOrLanguage('Ρώσος', 'He is Russian.'), true);
  // 0.1 behaviour is reproducible.
  assert.deepEqual(checkPivotGuards('Ο Τομ είναι Καναδέζος.', 'el', tr('Tom is Canadian.', { literals: tom }), 'en', { version: 'pivot-guards/0.1' }).failures, ['undeclared_name']);
});

test('pivot-guards/0.3: Greek weekday and month names are not undeclared names when the English has the matching word', () => {
  assert.equal(PIVOT_GUARDS_VERSION, 'pivot-guards/0.3');
  const nikos = [{ source: 'Νίκος', target: 'Nikos', kind: 'name' as const }];
  // The pivot-el-en-v2 shape (Q64, «Κυριακές»), written fresh, plus the other inflections and the months.
  assert.deepEqual(el('Το μουσείο κλείνει τις Κυριακές.', tr('The museum closes on Sundays.')).failures, []);
  assert.deepEqual(el('Ο Νίκος έφυγε την Παρασκευή.', tr('Nikos left on Friday.', { literals: nikos })).failures, []);
  assert.deepEqual(el('Θα σε δω το Σάββατο.', tr('I will see you on Saturday.')).failures, []);
  assert.deepEqual(el('Πάμε για ψάρεμα κάθε Σαββατοκύριακο.', tr('We go fishing every weekend.')).failures, []);
  assert.deepEqual(el('Τα γενέθλιά μου είναι τον Μάιο, όχι τον Ιούνιο.', tr('My birthday is in May, not in June.')).failures, []);
  assert.deepEqual(el('Το σχολείο ανοίγει στις αρχές Σεπτεμβρίου.', tr('School opens in early September.')).failures, []);
  // The meaning is still checked: a different day or month is still flagged.
  assert.deepEqual(el('Το μουσείο κλείνει τις Κυριακές.', tr('The museum closes on Mondays.')).failures, ['undeclared_name']);
  assert.deepEqual(el('Τα γενέθλιά μου είναι τον Μάιο.', tr('My birthday is in March.')).failures, ['undeclared_name']);
  // Whole words only: names that share letters with a day or month stay names, even when the English has the word.
  assert.equal(isCarriedWeekdayOrMonth('Μαίρη', 'Mary may come.'), false);
  assert.equal(isCarriedWeekdayOrMonth('Σάββας', 'Savvas left on Saturday.'), false);
  assert.equal(isCarriedWeekdayOrMonth('Μάρτιν', 'Martin came in March.'), false);
  assert.equal(isCarriedWeekdayOrMonth('Μαΐου', 'the first of May'), true);
  const mary = el('Είδα τη Μαίρη τον Μάιο.', tr('I saw Mary in May.'));
  assert.deepEqual([mary.failures, mary.details], [['undeclared_name'], ['undeclared_name: Μαίρη']]);
  // The month May is not the modal may; a sentence-initial May still is.
  assert.equal(pivotMarkers('My birthday is in May.', 'en')!.possibility, false);
  assert.equal(pivotMarkers('May I come in?', 'en')!.possibility, true);
  assert.equal(pivotMarkers('Fine. May I come in?', 'en')!.possibility, true);
  assert.equal(pivotMarkers('Tom may come.', 'en')!.possibility, true);
  assert.equal(pivotMarkers('My birthday is in May.', 'en', { version: 'pivot-guards/0.2' })!.possibility, true);
  // 0.2 behaviour is reproducible.
  assert.deepEqual(checkPivotGuards('Το μουσείο κλείνει τις Κυριακές.', 'el', tr('The museum closes on Sundays.'), 'en', { version: 'pivot-guards/0.2' }).failures, ['undeclared_name']);
});

test('pivot-guards/0.2: a declared name inside an English possessive is carried', () => {
  const mary = [{ source: 'Τομ', target: 'Tom', kind: 'name' as const }, { source: 'Μαίρης', target: 'Mary', kind: 'name' as const }];
  assert.deepEqual(el('Ο Τομ αγνόησε τη συμβουλή της Μαίρης.', tr("Tom ignored Mary's advice.", { literals: mary })).failures, []);
  assert.deepEqual(el('Ο Τομ αγνόησε τη συμβουλή της Μαίρης.', tr('Tom ignored Mary’s advice.', { literals: mary })).failures, []);
  assert.deepEqual(el('Ο Τομ αγνόησε τη συμβουλή της Μαίρης.', tr("Tom ignored Maria's advice.", { literals: mary })).failures, ['declared_literal_not_in_translation']);
  assert.deepEqual(checkPivotGuards('Ο Τομ αγνόησε τη συμβουλή της Μαίρης.', 'el', tr("Tom ignored Mary's advice.", { literals: mary }), 'en', { version: 'pivot-guards/0.1' }).failures, ['declared_literal_not_in_translation']);
});

test('structure agreement: same structure accepts the first leg\'s identity and reports exact agreement', () => {
  const pass = el('Θα φύγω.', tr("I'll leave."));
  const fail = el('Θα φύγω.', tr('I leave.'));
  const leg = (translator: string, identity: string | null, structure: string | null, guards = pass): PivotLeg => ({ translator, translation: tr("I'll leave."), guards, identity, structure });
  const family = (t: string) => t.split('/')[0]!;
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', 's1'), leg('openai/b', 'lfp:x', 's1')], family), { accepted: true, identity: 'lfp:x', identitiesEqual: true });
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', 's1'), leg('openai/b', 'lfp:y', 's1')], family), { accepted: true, identity: 'lfp:x', identitiesEqual: false });
  assert.deepEqual(agreePivotStructure([leg('openai/b', 'lfp:y', 's1'), leg('qwen/a', 'lfp:x', 's1')], family), { accepted: true, identity: 'lfp:y', identitiesEqual: false });
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', 's1'), leg('openai/b', 'lfp:y', 's2')], family), { accepted: false, reason: 'structures_differ' });
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', 's1'), leg('qwen/b', 'lfp:x', 's1')], family), { accepted: false, reason: 'same_family' });
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', 's1'), leg('openai/b', 'lfp:x', 's1', fail)], family), { accepted: false, reason: 'guard_failed' });
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', null), leg('openai/b', 'lfp:x', 's1')], family), { accepted: false, reason: 'no_identity' });
  assert.deepEqual(agreePivotStructure([leg('qwen/a', 'lfp:x', 's1')], family), { accepted: false, reason: 'too_few_translators' });
});
