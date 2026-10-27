import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARDED_CODEC_VERSION, expandCompaction, sha256Text, verifyCompaction, type CodecUnit } from '../src/guarded-codec.js';

const kept = (id: string, source: string, view: string): CodecUnit => ({ id, source, view });
const omitted = (id: string, source: string): CodecUnit => ({ id, source, view: null, pointer: { ref: `ref:${id}`, sha256: sha256Text(source) } });

test('a shortened unit that keeps literals and markers passes', () => {
  const r = verifyCompaction([kept('u1', 'The deploy of build 4521 must not run before 02:00 on 2026-10-28.', 'deploy 4521 must not run before 02:00 2026-10-28')], 'en');
  assert.equal(r.version, GUARDED_CODEC_VERSION);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.ok(r.viewChars < r.sourceChars);
});

test('dropping "not" is caught as a negation change', () => {
  const r = verifyCompaction([kept('u1', 'The deploy must not run before 02:00.', 'deploy must run before 02:00')], 'en');
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations.map((v) => v.kind), ['marker_changed']);
});

test('dropping modality ("may", "must") is caught', () => {
  assert.equal(verifyCompaction([kept('u1', 'Lena may restart the cluster.', 'Lena restart cluster')], 'en').ok, false);
  assert.equal(verifyCompaction([kept('u2', 'You must rotate key K-7.', 'rotate key K-7')], 'en').ok, false);
});

test('a dropped or altered literal is caught, counted per occurrence', () => {
  const r = verifyCompaction([kept('u1', 'Tests 93/93 passed at commit 0d16cba.', 'tests passed at commit 0d16cba')], 'en');
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations[0], { unit: 'u1', kind: 'literal_dropped', missing: ['93'] });
  assert.equal(verifyCompaction([kept('u2', 'Retry 3 times, then 3 more.', 'retry 3 times, then more')], 'en').ok, false, 'a repeated literal must keep its count');
  assert.equal(verifyCompaction([kept('u3', 'Retry three times.', 'retry 3x')], 'en').ok, true, 'a number word may become digits');
});

test('Greek negation and necessity markers are checked', () => {
  assert.equal(verifyCompaction([kept('g1', 'Ο Πέτρος δεν πρέπει να εκτελεί σενάρια στην παραγωγή.', 'Πέτρος δεν πρέπει να εκτελεί σενάρια στην παραγωγή')], 'el').ok, true);
  assert.equal(verifyCompaction([kept('g2', 'Ο Πέτρος δεν πρέπει να εκτελεί σενάρια.', 'Πέτρος πρέπει να εκτελεί σενάρια')], 'el').ok, false);
});

test('a language without marker lists fails closed', () => {
  const r = verifyCompaction([kept('x', 'Pedro no debe ejecutar scripts.', 'Pedro ejecutar scripts')], 'es');
  assert.deepEqual(r.violations.map((v) => v.kind), ['language_unsupported']);
});

test('omission needs a pointer to the exact source, and expansion is exact', () => {
  const units = [kept('u1', 'Keep this at 02:00.', 'keep at 02:00'), omitted('u2', 'A long tool trace that is not needed right now.')];
  assert.equal(verifyCompaction(units, 'en').ok, true);
  const store = new Map([['ref:u2', 'A long tool trace that is not needed right now.']]);
  assert.deepEqual(expandCompaction(units, (ref) => store.get(ref)), ['Keep this at 02:00.', 'A long tool trace that is not needed right now.']);
  assert.throws(() => expandCompaction(units, () => 'tampered'), /unexpandable_unit:u2/u);
  assert.equal(verifyCompaction([{ id: 'u3', source: 'x', view: null }], 'en').violations[0]?.kind, 'omitted_without_pointer');
  assert.equal(verifyCompaction([{ id: 'u4', source: 'x', view: null, pointer: { ref: 'r', sha256: sha256Text('y') } }], 'en').violations[0]?.kind, 'pointer_mismatch');
});
