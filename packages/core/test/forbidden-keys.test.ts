import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSem } from '../src/canonicalize.js';
import { semanticFingerprint } from '../src/fingerprint.js';

const head = '{"schema":"lunum-sem/0.1-draft","world":"real","kind":"preference","clauses":[{"predicate":"prefer","roles":{"experiencer":{"type":"actor","id":"user"},"theme":';
const sem = (theme: string, tail = '') => JSON.parse(`${head}${theme}}}]${tail}}`);

test('validateSem rejects __proto__, constructor and prototype at every depth', () => {
  for (const k of ['__proto__', 'constructor', 'prototype']) {
    for (const input of [
      sem(`{"type":"concept","id":"a","${k}":{"id":"x"}}`),
      sem(`{"type":"concept","value":[{"id":"b","${k}":1}]}`),
      sem('"t"', `,"annotations":{"a":[{"${k}":null}]}`),
      sem('"t"', `,"provenance":{"${k}":1}`),
      sem('"t"', `,"${k}":1`)
    ]) {
      assert.equal(validateSem(input).ok, false, k);
      assert.throws(() => semanticFingerprint(input));
    }
  }
});

test('ordinary Sems are unaffected', () => {
  assert.equal(validateSem(sem('"t"')).ok, true);
  assert.match(semanticFingerprint(sem('"t"')), /^lfp:2\.1:sha256:[0-9a-f]{32}$/);
});
