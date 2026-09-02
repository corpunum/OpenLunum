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
