import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateSem } from '../src/agent-builder.js';
import { getExtractionContract, submitCandidate } from '../src/agent-native.js';
import { semanticFingerprint } from '../src/fingerprint.js';
import { SEMANTIC_FRAME_REGISTRY_VERSION } from '../src/frame-registry.js';
import { SEMANTIC_PROTOCOL_REGISTRY, SEMANTIC_PROTOCOL_VERSION } from '../src/semantic-registry.js';
import type { CandidateBuilderInput } from '../src/agent-builder.js';

// lunum-agent/0.21, A3 steps 2 (questions) and 3 (I / you / we fillers); experiments/coverage-a3-v1.
const text = (value: string) => ({ type: 'text', value });
const build = (input: Partial<CandidateBuilderInput> & Pick<CandidateBuilderInput, 'predicate' | 'roles'>) =>
  buildCandidateSem({ world: 'real', kind: 'simple_fact', negated: false, modality: null, ...input }).sem;
const submit = (sourceText: string, candidateSem: unknown) => submitCandidate({ sourceText, sourceLanguage: 'en', candidateSem, provenance: { extractorType: 'agent' } });
const ok = (sourceText: string, sem: unknown) => {
  const r = submit(sourceText, sem);
  assert.equal(r.candidateIdentityAvailable, true, `${sourceText} -> ${r.failureClass}: ${r.diagnostics.join(' | ')}`);
  return r.semanticFingerprint!;
};

test('versions: protocol 0.7 adds kind question; frames 0.9; contract 0.21', () => {
  assert.equal(SEMANTIC_PROTOCOL_VERSION, 'lunum-protocol/0.7');
  assert.equal(SEMANTIC_FRAME_REGISTRY_VERSION, 'lunum-frame/0.9');
  assert.ok(SEMANTIC_PROTOCOL_REGISTRY.kinds.includes('question'));
  const contract = JSON.stringify(getExtractionContract());
  assert.match(contract, /A question uses the general frame its words have, with kind \\"question\\"/u);
  assert.match(contract, /never a whole question/u);
  assert.doesNotMatch(contract, /or question that makes no statement/u);
  assert.match(contract, /a pronoun of the speaker or the addressee \(I, me, my, you, your, we, us, our\)/u);
});

test('a wh-question takes a general frame with kind question; the question word fills the role it asks about', () => {
  const sem = build({ kind: 'question', predicate: 'assert', roles: { subject: text('Tom'), action: text('live'), location: text('Where') } });
  const fp = ok('Where does Tom live?', sem);
  const statement = build({ predicate: 'assert', roles: { subject: text('Tom'), action: text('live'), location: text('Where') } });
  assert.notEqual(fp, semanticFingerprint(statement), 'mood is part of identity');
});

test('a yes/no question keeps its words; do/does/did may be left out', () => {
  ok('Is Tom ready?', build({ kind: 'question', predicate: 'describe', roles: { subject: text('Tom'), attribute: text('ready') } }));
  ok('Did Tom call Mary?', build({ kind: 'question', predicate: 'assert', roles: { subject: text('Tom'), action: text('call'), object: text('Mary') } }));
});

test('a question that leaves a word out is still refused', () => {
  const r = submit('Why did Tom leave early?', build({ kind: 'question', predicate: 'assert', roles: { subject: text('Tom'), action: text('leave') } }));
  assert.equal(r.candidateIdentityAvailable, false);
  assert.equal(r.failureClass, 'unbound_source_content');
});

test('I, you and we are valid fillers of a general frame; third-person pronouns are not', () => {
  ok('I have a cat.', build({ predicate: 'describe', roles: { subject: text('I'), attribute: text('have a cat') } }));
  ok('You must leave.', build({ predicate: 'assert', modality: 'necessity', roles: { subject: text('You'), action: text('leave') } }));
  ok('We bought a house.', build({ predicate: 'assert', roles: { subject: text('We'), action: text('bought'), object: text('a house') } }));
  ok('Do you like it here?', build({ kind: 'question', predicate: 'assert', roles: { subject: text('you'), action: text('like'), object: text('it here') } }));
  const r = submit('He bought a house.', build({ predicate: 'assert', roles: { subject: text('He'), action: text('bought'), object: text('a house') } }));
  assert.equal(r.candidateIdentityAvailable, false);
});
