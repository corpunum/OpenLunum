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
