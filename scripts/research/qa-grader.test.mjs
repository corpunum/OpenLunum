import test from 'node:test';
import assert from 'node:assert/strict';
import { grade } from './qa-grader.mjs';

const q = (accept, reject = []) => ({ accept, reject });
const g = (question, answer) => grade(question, JSON.stringify({ answer })).correct;

test('numeric answers must contain exactly the gold number', () => {
  assert.equal(g(q(['7', 'seven']), '7'), true);
  assert.equal(g(q(['7', 'seven']), 'seven times'), true);
  assert.equal(g(q(['7', 'seven']), '14 times (7 retries on U-31, plus 7 further attempts)'), false);
  assert.equal(g(q(['7', 'seven']), '17'), false);
  assert.equal(g(q(['20'], ['15']), '20 percent'), true);
  assert.equal(g(q(['30'], ['45']), '30 EUR from Q-81'), true, 'identifier digits are not quantities');
});

test('tokens match on word boundaries and negations fail', () => {
  assert.equal(g(q(['no'], ['yes']), 'no'), true);
  assert.equal(g(q(['no'], ['yes']), 'unknown'), false);
  assert.equal(g(q(['access']), 'access'), true);
  assert.equal(g(q(['access']), 'Mira cannot access anything'), false);
  assert.equal(g(q(['access']), 'Mira is not allowed to access'), false);
  // A hedge elsewhere in the answer is not a negation of the answer.
  assert.equal(g(q(['access']), 'Mira is allowed to access (the specific resource is not specified)'), true);
  assert.equal(g(q(['u-31']), 'Rhea retries u-31 (the task identity is not defined further)'), true);
  assert.equal(g(q(['f-11']), 'unknown'), false);
  assert.equal(g(q(['f-11']), 'F-11'), true);
  assert.equal(g(q(['f-11']), 'F-110'), false);
  assert.equal(g(q(['a-62'], ['a-61']), 'A-62'), true);
  assert.equal(g(q(['2027-01-14']), '2027-01-14'), true);
});
