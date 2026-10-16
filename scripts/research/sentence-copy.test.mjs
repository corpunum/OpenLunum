import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSentenceCopy } from './sentence-copy.mjs';
const sem = (roles) => ({ clauses: [{ predicate: 'p', roles }] });
test('a filler that is the whole question is a sentence copy', () => {
  assert.equal(isSentenceCopy('What is your blood type?', sem({ subject: { type: 'text', value: 'What is your blood type?' } })), true);
  assert.equal(isSentenceCopy('Πότε έφτασες στη Βοστώνη;', sem({ subject: 'Πότε έφτασες στη Βοστώνη' })), true);
});
test('short legitimate fillers are not', () => {
  assert.equal(isSentenceCopy("I'm a vegetarian.", sem({ subject: 'I', attribute: 'vegetarian' })), false);
  assert.equal(isSentenceCopy('Human dignity is inviolable.', sem({ subject: 'Human dignity', attribute: 'inviolable' })), false);
});
