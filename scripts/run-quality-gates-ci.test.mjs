import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLunumRecord,
  normalizeProcessExit,
  recordsFromJson,
} from './run-quality-gates-ci.mjs';

const record = {
  recordVersion: 'lunum-record/0.1-draft',
  source: { text: 'test', language: 'en', role: 'user', ref: null },
  sem: {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'test', roles: {}, negated: false }],
  },
  fingerprint: 'lfp:0.1:sha256:0000000000000000',
  renderings: {},
  policy: {
    eligible: true,
    category: 'test',
    risk: 'low',
    confidence: 1,
    reasons: [],
  },
  meta: {},
};

test('quality-gate runner recognizes current record shape', () => {
  assert.equal(isLunumRecord(record), true);
  assert.equal(isLunumRecord({ ...record, sem: null }), false);
});

test('quality-gate runner extracts records from supported containers', () => {
  assert.deepEqual(recordsFromJson(record), [record]);
  assert.deepEqual(recordsFromJson([record, { nope: true }]), [record]);
  assert.deepEqual(recordsFromJson({ records: [record] }), [record]);
  assert.deepEqual(recordsFromJson({ items: [record] }), [record]);
  assert.deepEqual(recordsFromJson({ data: [record] }), [record]);
  assert.deepEqual(recordsFromJson({ unrelated: [] }), []);
});

test('quality-gate process exit preserves warning contract unless strict', () => {
  assert.equal(normalizeProcessExit(0, false), 0);
  assert.equal(normalizeProcessExit(1, false), 0);
  assert.equal(normalizeProcessExit(1, true), 1);
  assert.equal(normalizeProcessExit(2, false), 2);
  assert.equal(normalizeProcessExit(2, true), 2);
});
