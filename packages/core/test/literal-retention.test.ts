import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLiteralRetention, numbersInText, identifiersInText } from '../src/literal-retention.js';
import { submitCandidate } from '../src/agent-native.js';

const provenance = { extractorType: 'agent' as const, extractorId: 'test-agent' };

const approve = (conditions: unknown[] = []) => ({
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event',
  clauses: [{ predicate: 'allow', roles: {
    agent: { type: 'actor', id: 'finance_lead' },
    recipient: { type: 'actor', id: 'omar' },
    action: 'approve',
    theme: { type: 'document', id: 'invoices' },
  }, negated: false, conditions }],
});
const below5000 = [{ predicate: 'below', roles: { subject: { type: 'document', id: 'invoices' }, value: { type: 'quantity', value: 5000, unit: 'euro' } }, negated: false }];

test('numbers: grouping, decimals, 12-hour clock, identifiers excluded', () => {
  assert.deepEqual(numbersInText('under 5,000 euros'), [5000]);
  assert.deepEqual(numbersInText('έως 2.000 ευρώ'), [2000]);
  assert.deepEqual(numbersInText('Amount: $15,750.00'), [15750]);
  assert.deepEqual(numbersInText('at 2:00 PM'), [14, 0]);
  assert.deepEqual(numbersInText('user U-31 retries 7 times'), [7]);
  assert.deepEqual(identifiersInText('user U-31 and account Q-81'), ['u-31', 'q-81']);
});

test('a candidate that drops a stated threshold is reported', () => {
  const dropped = checkLiteralRetention('The finance lead allows Omar to approve invoices under 5,000 euros.', approve() as never);
  assert.equal(dropped.retained, false);
  assert.deepEqual(dropped.missingNumbers, [5000]);
  const kept = checkLiteralRetention('The finance lead allows Omar to approve invoices under 5,000 euros.', approve(below5000) as never);
  assert.equal(kept.retained, true);
});

test('identifiers match whole tokens, not prefixes', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [{ predicate: 'read', roles: { agent: { type: 'actor', id: 'u-31' }, theme: { type: 'document', id: 'r-17' } }, negated: false }] };
  assert.equal(checkLiteralRetention('User U-3 reads report R-17.', sem as never).retained, false);
  assert.equal(checkLiteralRetention('User U-31 reads report R-17.', sem as never).retained, true);
});

test('submitCandidate withholds identity when a source literal is dropped', () => {
  const sourceText = 'The finance lead allows Omar to approve invoices under 5,000 euros.';
  const dropped = submitCandidate({ sourceText, candidateSem: approve(), provenance });
  assert.equal(dropped.frameValid, true);
  assert.equal(dropped.candidateIdentityAvailable, false);
  assert.equal(dropped.semanticFingerprint, null);
  assert.equal(dropped.failureClass, 'unretained_source_literal');
  assert.ok(dropped.diagnostics.some((message) => message.includes('5000')));

  const kept = submitCandidate({ sourceText, candidateSem: approve(below5000), provenance });
  assert.equal(kept.failureClass, null);
  assert.ok(kept.semanticFingerprint?.startsWith('lfp:2.'));
  assert.equal(kept.literalRetention?.retained, true);
});

test('empty source text is not checked', () => {
  const result = submitCandidate({ sourceText: '', candidateSem: approve(), provenance });
  assert.equal(result.literalRetention, null);
});
