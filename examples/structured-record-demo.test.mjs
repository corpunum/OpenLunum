import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { semanticFingerprint, submitCandidate } from '../packages/core/dist/src/index.js';
import { preferenceSem, runDemo } from './structured-record-demo.mjs';

test('demo labels supplied semantics and makes no model/compression claim', () => {
  const result = runDemo();
  assert.equal(result.automaticExtraction, false);
  assert.equal(result.tokenSavings, null);
  assert.equal(result.taskQuality, null);
  assert.equal(result.sameSuppliedSemSameIdentity, true);
});

test('source and fallback are retained; validation does not promote', () => {
  const result = runDemo();
  assert.deepEqual(result.sourceTexts.map(s => s.language), ['en', 'el']);
  assert.ok(result.sourceTexts.every(s => s.text.length && /^[a-f0-9]{64}$/.test(s.sha256)));
  assert.equal(result.naturalContextRetained, true);
  assert.equal(result.promoted, false);
});

test('negation and explicit referent changes change this representation identity', () => {
  const sem = preferenceSem();
  assert.notEqual(semanticFingerprint(sem), semanticFingerprint(preferenceSem(true)));
  const other = structuredClone(sem);
  other.clauses[0].roles.experiencer.id = 'different-demo-user';
  assert.notEqual(semanticFingerprint(sem), semanticFingerprint(other));
});

test('incomplete frame is rejected rather than advertised as semantic success', () => {
  const sem = preferenceSem();
  delete sem.clauses[0].roles.theme;
  const result = submitCandidate({sourceText:'I prefer.', candidateSem:sem,
    provenance:{extractorType:'other',extractorId:'supplied-sem-demo-test'}});
  assert.equal(result.frameValid, false);
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.promotable, false);
});

test('demo has no model service, product adapter, or external runtime dependency', () => {
  const source = readFileSync(new URL('./structured-record-demo.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"][^'"]*(?:adapter-openunum|openunum-runtime)['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//);
});
