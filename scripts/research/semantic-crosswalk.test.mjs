import test from 'node:test';
import assert from 'node:assert/strict';
import { propbankToLunumIr, umrLikeToLunumIr } from './semantic-crosswalk.mjs';

test('PropBank requires explicit roleset-specific translation', () => {
  const ir = propbankToLunumIr({ roleset: 'send.01', predicate: 'send', predicateMap: { send: 'send' }, arguments: [{ label: 'A0', handle: 'courier' }, { label: 'A1', handle: 'parcel' }], roleMap: { A0: 'agent', A1: 'object' } });
  assert.equal(ir.roles.agent.handle, 'courier');
  assert.equal(ir.kind, undefined);
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', arguments: [{ label: 'A0', handle: 'courier' }] }), /roleset_role_map_required/);
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', predicateMap: { send: 'send' }, arguments: [{ label: 'A0', handle: 'courier' }], roleMap: {} }), /unmapped_role/);
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', arguments: [], roleMap: {} }), /unmapped_predicate/);
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', predicateMap: { send: 'not-a-predicate' }, arguments: [], roleMap: {} }), /invalid_predicate/);
  assert.equal(propbankToLunumIr({ roleset: 'send.01', predicate: 'send', predicateMap: { send: 'send' }, kind: 'statement', kindMap: { statement: 'simple_fact' }, arguments: [], roleMap: {} }).kind, 'simple_fact');
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', predicateMap: { send: 'send' }, kind: 'statement', kindMap: { statement: 'not-a-kind' }, arguments: [], roleMap: {} }), /invalid_kind/);
});

test('UMR-like mapping preserves supported fields and rejects unknown graph fields', () => {
  const ir = umrLikeToLunumIr({ predicate: 'send', roles: { ARG0: { handle: 'courier' } }, modality: 'must' }, { predicateMap: { send: 'send' }, roleMap: { ARG0: 'agent' }, modalityMap: { must: 'obligation' } });
  assert.equal(ir.roles.agent.handle, 'courier');
  assert.equal(ir.modality, 'obligation');
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', roles: {}, discourseRelation: 'cause' }, { predicateMap: { send: 'send' } }), /unsupported_fields/);
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', roles: {} }), /unmapped_predicate/);
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', roles: { ARG0: {} } }, { predicateMap: { send: 'send' } }), /unmapped_role/);
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', kind: 'fact', roles: {} }, { predicateMap: { send: 'send' }, kindMap: { fact: 'not-a-kind' } }), /invalid_kind/);
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', kind: 'fact', roles: {} }, { predicateMap: { send: 'send' } }), /unmapped_kind/);
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', roles: { ARG0: {}, A0: {} } }, { predicateMap: { send: 'send' }, roleMap: { ARG0: 'agent', A0: 'agent' } }), /duplicate_lunum_role/);
});

test('abstention remains abstention across the crosswalk', () => {
  assert.deepEqual(umrLikeToLunumIr({ outcome: 'abstain', abstentionReason: 'ambiguous' }), { version: 'lunum-ir/0.1', outcome: 'abstain', abstentionReason: 'ambiguous' });
});
