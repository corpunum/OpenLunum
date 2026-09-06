import test from 'node:test';
import assert from 'node:assert/strict';
import { getExtractionContract, submitCandidate, submitCandidateWithGrounding } from '../src/agent-native.js';
import { buildCandidateSem } from '../src/agent-builder.js';

const validPreference = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
  clauses: [{ predicate: 'prefer', roles: {
    experiencer: { type: 'actor', id: 'maria' },
    theme: { type: 'concept', id: 'quiet_mode' }
  }, negated: false }]
};

const provenance = { extractorType: 'codex_agent' as const, extractorId: 'test-agent' };

test('frame-first builder creates only a canonical transport envelope', () => {
  const built = buildCandidateSem({
    world: 'real', kind: 'preference', predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'maria' }, theme: { type: 'concept', id: 'quiet_mode' } },
  });
  assert.equal(built.sem.schema, 'lunum-sem/0.1-draft');
  assert.deepEqual(Object.keys(built.sem.clauses[0]!.roles).sort(), ['experiencer', 'theme']);
  assert.deepEqual(built.requiredRoles, ['experiencer', 'theme']);
  assert.throws(() => buildCandidateSem({ world: 'real', kind: 'simple_fact', predicate: 'share', roles: {} }), /unframed_predicate/);
  assert.throws(() => buildCandidateSem({ world: 'real', kind: 'preference', predicate: 'prefer', roles: { experiencer: 'x', theme: 'y', manner: 'z' } }), /unexpected_frame_roles/);
});

test('extraction contract is generated from the protocol and frame registries', () => {
  const first = getExtractionContract();
  const second = getExtractionContract();
  assert.deepEqual(first, second);
  assert.equal(first.transport.schema, 'lunum-sem/0.1-draft');
  assert.equal(first.identity.version, '2.1');
  assert.ok(first.frames.framedPredicates.includes('prefer'));
  assert.equal(first.transport.schemaHash, '8aef5fdfa6feccd1b8bc22ec41df64d0c363b537df3df7b03e61a8e7663ed593');
  assert.match(first.transport.descriptorHash, /^[0-9a-f]{64}$/u);
  assert.match(first.frames.registryHash, /^[0-9a-f]{64}$/u);
  assert.match(first.protocol.registryHash, /^[0-9a-f]{64}$/u);
  assert.match(first.instructions.hash, /^[0-9a-f]{64}$/u);
  assert.match(first.instructions.semTemplate, /"clauses":\[\{.*"roles":\{\}/u);
  assert.match(first.frames.unframedBehavior, /no lfp:2\.1/u);
  assert.equal(first.grounding.version, 'lunum-grounding/0.1');
  assert.equal(first.grounding.identityBehavior.includes('cannot grant lfp:2.1'), true);
});

test('candidate submission returns identity but never self-promotes an agent proposal', () => {
  const result = submitCandidate({ sourceText: 'Maria prefers quiet mode.', candidateSem: validPreference, provenance });
  assert.equal(result.transportValid, true);
  assert.equal(result.structuralValid, true);
  assert.equal(result.protocolCanonical, true);
  assert.equal(result.frameValid, true);
  assert.equal(result.grounded, true);
  assert.equal(result.candidateIdentityAvailable, true);
  assert.match(result.semanticFingerprint ?? '', /^lfp:2\.1:sha256:/u);
  assert.equal(result.promotable, false);
  assert.equal(result.trust.promoted, false);
  assert.equal(result.provenance.extractorType, 'codex_agent');
  assert.equal(result.provenance.sourceHash, result.source.sha256);
});

test('frame-invalid candidates cannot receive semantic identity', () => {
  const result = submitCandidate({
    sourceText: 'Maria sends a report.',
    candidateSem: { ...validPreference, clauses: [{ predicate: 'send', roles: validPreference.clauses[0]!.roles, negated: false }] },
    provenance,
  });
  assert.equal(result.protocolCanonical, true);
  assert.equal(result.frameValid, false);
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.semanticFingerprint, null);
  assert.equal(result.failureClass, 'frame_noncanonical');
});

test('unknown identity fields fail closed rather than becoming identity-bearing', () => {
  const result = submitCandidate({
    sourceText: 'Maria prefers quiet mode.',
    candidateSem: { ...validPreference, clauses: [{ ...validPreference.clauses[0], roles: {
      ...validPreference.clauses[0]!.roles,
      theme: { type: 'concept', id: 'quiet_mode', agentHint: 'ignored' }
    } }] },
    provenance,
  });
  assert.equal(result.frameValid, true);
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.failureClass, 'semantic_identity_unavailable');
  assert.equal(result.promotable, false);
});

test('ungrounded references fail closed while source evidence remains in the result', () => {
  const result = submitCandidate({
    sourceText: 'She prefers quiet mode.',
    candidateSem: { ...validPreference, references: [{ referenceKind: 'semantic', surface: 'She' }] },
    provenance,
  });
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.failureClass, 'protocol_noncanonical');
  assert.equal(result.source.text, 'She prefers quiet mode.');
});

test('runtime provenance cannot omit or invent extractor identity', () => {
  assert.throws(() => submitCandidate({
    sourceText: 'the agent proposes a meaning',
    candidateSem: validPreference,
    provenance: {} as never,
  }), /invalid_provenance/u);
  assert.throws(() => submitCandidate({
    sourceText: 'the agent proposes a meaning',
    candidateSem: validPreference,
    provenance: { extractorType: 'model_that_was_not_reported' } as never,
  }), /invalid_provenance/u);
});

test('agent grounding proposals are deterministic evidence but cannot grant exact identity', () => {
  const result = submitCandidateWithGrounding({
    sourceText: 'Maria prefers a blue folder.',
    candidateSem: validPreference,
    grounding: [{
      path: 'clauses[0].roles.theme', termType: 'concept',
      head: { kind: 'symbol', namespace: 'open-concept', key: 'folder' },
      modifiers: [{
        relation: { kind: 'symbol', namespace: 'open-concept-relation', key: 'color' },
        value: { kind: 'symbol', namespace: 'controlled-value', key: 'blue' },
      }],
      surface: 'blue folder', language: 'en',
    }],
    provenance,
  });
  assert.equal(result.grounding.status, 'pending');
  assert.equal(result.grounding.exactIdentityAvailable, false);
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.semanticFingerprint, null);
  assert.equal(result.failureClass, 'grounding_pending');
  assert.match(result.grounding.proposals[0]?.groundingFingerprint ?? '', /^gnd:/u);
});
