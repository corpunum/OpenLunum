import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateFromSemanticIR, SEMANTIC_IR_VERSION } from '../src/index.js';

const base = { version: SEMANTIC_IR_VERSION, outcome: 'parse' as const, world: 'real', kind: 'event', predicate: 'send', roles: { agent: { type: 'actor', id: 'courier' }, object: { type: 'object', id: 'parcel' }, recipient: { type: 'actor', id: 'depot' } } };

test('semantic IR delegates candidate construction to the canonical frame builder', () => {
  const result = buildCandidateFromSemanticIR({ ...base, sourceAnchors: [{ start: 0, end: 6, field: 'agent' }], groundingHandles: [{ path: 'clauses[0].roles.object', surface: 'parcel' }] });
  assert.equal(result.status, 'candidate');
  assert.deepEqual({ ...result.sem?.clauses[0]?.roles }, base.roles);
  assert.deepEqual(result.sourceAnchors, [{ start: 0, end: 6, field: 'agent' }]);
});

test('semantic IR abstention is explicit and never constructs a Sem', () => {
  const result = buildCandidateFromSemanticIR({ version: SEMANTIC_IR_VERSION, outcome: 'abstain', abstentionReason: 'ambiguous' });
  assert.equal(result.status, 'abstained'); assert.equal(result.sem, null);
});

test('semantic IR fails closed for missing fields, unframed predicates, and unknown fields', () => {
  assert.throws(() => buildCandidateFromSemanticIR({ ...base, roles: undefined }), /roles_required/);
  assert.throws(() => buildCandidateFromSemanticIR({ ...base, predicate: 'share' }), /unframed_predicate/);
  assert.throws(() => buildCandidateFromSemanticIR({ ...base, confidence: 1 }), /unknown_fields/);
});
