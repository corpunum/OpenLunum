import test from 'node:test';
import assert from 'node:assert/strict';
import { propbankToLunumIr, umrLikeToLunumIr } from './semantic-crosswalk.mjs';

test('PropBank requires explicit roleset-specific translation', () => {
  const ir = propbankToLunumIr({ roleset: 'send.01', predicate: 'send', arguments: [{ label: 'A0', handle: 'courier' }, { label: 'A1', handle: 'parcel' }], roleMap: { A0: 'agent', A1: 'object' } });
  assert.equal(ir.roles.agent.handle, 'courier');
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', arguments: [{ label: 'A0', handle: 'courier' }] }), /roleset_role_map_required/);
  assert.throws(() => propbankToLunumIr({ roleset: 'send.01', predicate: 'send', arguments: [{ label: 'A0', handle: 'courier' }], roleMap: {} }), /unmapped_role/);
});

test('UMR-like mapping preserves supported fields and rejects unknown graph fields', () => {
  const ir = umrLikeToLunumIr({ predicate: 'send', roles: { ARG0: { handle: 'courier' } }, modality: 'must' }, { roleMap: { ARG0: 'agent' } });
  assert.equal(ir.roles.agent.handle, 'courier');
  assert.equal(ir.modality, 'must');
  assert.throws(() => umrLikeToLunumIr({ predicate: 'send', roles: {}, discourseRelation: 'cause' }), /unsupported_fields/);
});

test('abstention remains abstention across the crosswalk', () => {
  assert.deepEqual(umrLikeToLunumIr({ outcome: 'abstain', abstentionReason: 'ambiguous' }), { version: 'lunum-ir/0.1', outcome: 'abstain', abstentionReason: 'ambiguous' });
});
