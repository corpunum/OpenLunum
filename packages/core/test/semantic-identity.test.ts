import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticFingerprint, semanticIdentityProjection } from '../src/fingerprint.js';
import type { LunumSem } from '../src/types.js';

const sem: LunumSem = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{
    predicate: 'request', roles: { agent: { type: 'actor', id: 'user' }, theme: { type: 'document', id: 'report' } }
  }]
};

test('semantic identity excludes provenance and annotations while retaining proposition fields', () => {
  const annotated = { ...sem, provenance: { model: 'one' }, annotations: { confidence: 0.2 }, clauses: [{
    ...sem.clauses[0]!, annotations: { source: 'text' }
  }] };
  assert.equal(semanticFingerprint(sem), semanticFingerprint(annotated));
  const projection = semanticIdentityProjection(annotated);
  assert.equal('provenance' in projection, false);
  assert.equal('annotations' in projection, false);
  assert.equal('annotations' in (projection.clauses as Array<Record<string, unknown>>)[0]!, false);
});

test('reference surface evidence does not change grounded semantic identity', () => {
  const english: LunumSem = {
    ...sem,
    references: [{ type: 'pronoun', token: 'she', ref: 'maria' }]
  };
  const greek: LunumSem = {
    ...sem,
    references: [{ type: 'implicit_subject', token: 'θα', language: 'el', ref: 'maria' }]
  };
  assert.equal(semanticFingerprint(english), semanticFingerprint(greek));
  assert.deepEqual(semanticIdentityProjection(english).references, [{ ref: 'maria' }]);
  assert.deepEqual(semanticIdentityProjection(greek).references, [{ ref: 'maria' }]);
});

test('reference target and proposition direction remain identity-bearing', () => {
  const maria = { ...sem, references: [{ type: 'pronoun', token: 'she', ref: 'maria' }] };
  const daniel = { ...sem, references: [{ type: 'pronoun', token: 'she', ref: 'daniel' }] };
  assert.notEqual(semanticFingerprint(maria), semanticFingerprint(daniel));

  const swapped: LunumSem = {
    ...sem,
    clauses: [{
      ...sem.clauses[0]!,
      roles: { agent: { type: 'actor', id: 'report' }, theme: { type: 'document', id: 'user' } }
    }]
  };
  assert.notEqual(semanticFingerprint(sem), semanticFingerprint(swapped));
});

test('ungrounded references cannot assert exact identity', () => {
  const withEnglish = { ...sem, references: [{ type: 'pronoun', token: 'she' }] };
  const withGreek = { ...sem, references: [{ type: 'pronoun', token: 'αυτή', language: 'el' }] };
  assert.throws(() => semanticFingerprint(withEnglish), /non-canonical protocol candidate/);
  assert.throws(() => semanticFingerprint(withGreek), /non-canonical protocol candidate/);
});

test('explicit surface evidence is recoverable but excluded from exact identity', () => {
  const english = {
    ...sem,
    references: [{ referenceKind: 'surface-evidence' as const, sourceRef: 'source-en', surface: 'she', language: 'en', span: { start: 0, end: 3 } }]
  };
  const greek = {
    ...sem,
    references: [{ referenceKind: 'surface-evidence' as const, sourceRef: 'source-el', surface: 'αυτή', language: 'el', span: { start: 0, end: 4 } }]
  };
  assert.equal(semanticFingerprint(english), semanticFingerprint(greek));
  assert.equal(semanticIdentityProjection(english).references, undefined);
});

test('surface-evidence references never become identity-bearing even when they carry a hint', () => {
  const withoutEvidence = { ...sem };
  const withEvidence = {
    ...sem,
    references: [{
      referenceKind: 'surface-evidence' as const, sourceRef: 'source-1', surface: 'she',
      span: { start: 0, end: 3 }, ref: 'maria'
    }]
  };
  assert.deepEqual(semanticIdentityProjection(withEvidence), semanticIdentityProjection(withoutEvidence));
  assert.equal(semanticFingerprint(withEvidence), semanticFingerprint(withoutEvidence));
});

test('grounded reference evidence is order-independent and duplicate-insensitive', () => {
  const first = { ...sem, references: [{ ref: 'maria' }, { ref: 'daniel' }, { ref: 'maria' }] };
  const second = { ...sem, references: [{ ref: 'maria' }, { ref: 'daniel' }] };
  const reversed = { ...sem, references: [{ ref: 'daniel' }, { ref: 'maria' }] };
  assert.equal(semanticFingerprint(first), semanticFingerprint(second));
  assert.equal(semanticFingerprint(second), semanticFingerprint(reversed));
});

test('evidence-only term metadata is excluded while unknown term fields fail closed', () => {
  const withEvidence = { ...sem, clauses: [{ ...sem.clauses[0]!, roles: {
    agent: { type: 'actor', id: 'user', language: 'en', token: 'user', span: { start: 0, end: 4 } },
    theme: { type: 'document', id: 'report', provider: 'model-a' }
  } }] };
  assert.equal(semanticFingerprint(sem), semanticFingerprint(withEvidence));
  const unknown = { ...sem, clauses: [{ ...sem.clauses[0]!, roles: {
    agent: { type: 'actor', id: 'user', inventedSemanticField: 'x' },
    theme: { type: 'document', id: 'report' }
  } }] };
  assert.throws(() => semanticFingerprint(unknown), /unclassified term field/u);
});

test('quantity and range identity retains all semantic numeric fields', () => {
  const quantity = { ...sem, clauses: [{ ...sem.clauses[0]!, roles: { amount: { type: 'quantity', value: 30, unit: 'EUR' } } }] };
  const changedUnit = { ...quantity, clauses: [{ ...quantity.clauses[0]!, roles: { amount: { type: 'quantity', value: 30, unit: 'USD' } } }] };
  const range = { ...sem, clauses: [{ ...sem.clauses[0]!, roles: { amount: { type: 'range', min: 1, max: 10, unit: 'EUR' } } }] };
  const changedRange = { ...range, clauses: [{ ...range.clauses[0]!, roles: { amount: { type: 'range', min: 1, max: 11, unit: 'EUR' } } }] };
  assert.notEqual(semanticFingerprint(quantity), semanticFingerprint(changedUnit));
  assert.notEqual(semanticFingerprint(range), semanticFingerprint(changedRange));
});
