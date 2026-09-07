import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEMANTIC_PROTOCOL_REGISTRY,
  normalizeSemanticCandidate,
  protocolVocabularyBlock,
} from '../src/semantic-registry.js';
import { semanticFingerprint } from '../src/fingerprint.js';
import type { LunumSem } from '../src/types.js';

const base: LunumSem = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{
    predicate: 'request', roles: { agent: { type: 'actor', id: 'alice' }, theme: { type: 'document', id: 'report' } }, negated: false
  }]
};

test('registry is inspectable and independent of evaluation fixtures', () => {
  assert.equal(SEMANTIC_PROTOCOL_REGISTRY.worlds.join(','), 'real,fiction,tool,dream,belief,metaphor');
  assert.match(protocolVocabularyBlock(), /lunum-protocol\/0\.1/);
  assert.doesNotMatch(protocolVocabularyBlock(), /medical_report|orion_migration/);
});

test('justified protocol aliases converge without aliasing open instance ids', () => {
  const candidate = structuredClone(base);
  candidate.kind = 'fact';
  candidate.clauses[0]!.predicate = 'ask';
  const normalized = normalizeSemanticCandidate(candidate);
  assert.equal(normalized.canonical, true);
  assert.equal(normalized.sem?.kind, 'simple_fact');
  assert.equal(normalized.sem?.clauses[0]?.predicate, 'request');
  assert.ok(normalized.issues.some((issue) => issue.code === 'alias_applied'));

  const changedId = structuredClone(base);
  (changedId.clauses[0]!.roles.theme as { id: string }).id = 'invoice';
  assert.notEqual(semanticFingerprint(base), semanticFingerprint(changedId));
});

test('protocol aliases can express a justified structural shorthand', () => {
  const shorthand = structuredClone(base);
  shorthand.clauses[0]!.predicate = 'keep_private';
  const expanded = structuredClone(base);
  expanded.clauses[0]!.predicate = 'keep';
  expanded.clauses[0]!.roles.visibility = 'private';
  const normalized = normalizeSemanticCandidate(shorthand);
  assert.equal(normalized.canonical, true);
  assert.equal(normalized.sem?.clauses[0]?.predicate, 'keep');
  assert.equal(normalized.sem?.clauses[0]?.roles.visibility, 'private');
  assert.equal(semanticFingerprint(normalized.sem), semanticFingerprint(expanded));

  shorthand.clauses[0]!.roles.visibility = 'public';
  assert.equal(normalizeSemanticCandidate(shorthand).status, 'rejected');
});

test('request lexical variants converge only at the protocol predicate', () => {
  const client = structuredClone(base);
  client.clauses[0]!.predicate = 'client_request';
  const customer = structuredClone(base);
  customer.clauses[0]!.predicate = 'customer_request';
  assert.equal(semanticFingerprint(normalizeSemanticCandidate(client).sem), semanticFingerprint(base));
  assert.equal(semanticFingerprint(normalizeSemanticCandidate(customer).sem), semanticFingerprint(base));
});

test('meaningful protocol distinctions and unresolved symbols remain distinct', () => {
  const prohibited = structuredClone(base);
  prohibited.clauses[0]!.predicate = 'prohibit';
  const production = structuredClone(base);
  (production.clauses[0]!.roles.theme as { id: string }).id = 'production';
  const staging = structuredClone(base);
  (staging.clauses[0]!.roles.theme as { id: string }).id = 'staging';
  assert.notEqual(semanticFingerprint(prohibited), semanticFingerprint(base));
  assert.notEqual(semanticFingerprint(production), semanticFingerprint(staging));

  const unknown = structuredClone(base);
  unknown.world = 'privacy';
  const result = normalizeSemanticCandidate(unknown);
  assert.equal(result.canonical, false);
  assert.equal(result.status, 'noncanonical');
  assert.throws(() => semanticFingerprint(unknown), /non-canonical protocol candidate/);
});

test('negative deontic modality maps once and rejects duplicate negation', () => {
  const candidate = structuredClone(base);
  candidate.clauses[0]!.modality = 'must_not';
  const normalized = normalizeSemanticCandidate(candidate);
  assert.equal(normalized.sem?.clauses[0]?.modality, 'obligation');
  assert.equal(normalized.sem?.clauses[0]?.negated, true);
  assert.equal(normalized.canonical, true);

  candidate.clauses[0]!.negated = true;
  assert.equal(normalizeSemanticCandidate(candidate).status, 'rejected');
});
