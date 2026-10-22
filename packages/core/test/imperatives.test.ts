import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateSem } from '../src/agent-builder.js';
import { getExtractionContract, submitCandidate } from '../src/agent-native.js';
import { MOOD_RENDERER, renderSem } from '../src/render.js';
import type { CandidateBuilderInput } from '../src/agent-builder.js';

// lunum-agent/0.22 (decisions/0031): an imperative is a general frame with kind instruction; the addressee is the kind,
// action is the imperative verb alone (with its particle), and what it governs stays whole in object.
const text = (value: string) => ({ type: 'text', value });
const build = (input: Partial<CandidateBuilderInput> & Pick<CandidateBuilderInput, 'roles'>) =>
  buildCandidateSem({ world: 'real', kind: 'instruction', predicate: 'assert', negated: false, modality: null, ...input }).sem;
const submit = (sourceText: string, candidateSem: unknown) => submitCandidate({ sourceText, sourceLanguage: 'en', candidateSem, provenance: { extractorType: 'agent' } });

test('contract 0.22 states the imperative rule with its examples', () => {
  const contract = getExtractionContract();
  assert.equal(contract.contractVersion, 'lunum-agent/0.22');
  const text = JSON.stringify(contract);
  assert.match(text, /An imperative \(an order, request or prohibition addressed to the reader\) uses the general frame its words have with kind \\"instruction\\"/u);
  assert.match(text, /\\"Stop looking at me.\\" is assert\(action: Stop, object: looking at me\)/u);
  assert.doesNotMatch(text, /imperatives omit subject/u);
});

test('the contract examples build, bind to their source and render as imperatives', () => {
  const cases: Array<[string, Partial<CandidateBuilderInput> & Pick<CandidateBuilderInput, 'roles'>, string]> = [
    ['Stop looking at me.', { roles: { action: text('Stop'), object: text('looking at me') } }, 'R imperative to you: assert(object=looking at me, action=Stop)'],
    ['Get off the lawn.', { roles: { action: text('Get off'), object: text('the lawn') } }, 'R imperative to you: assert(object=the lawn, action=Get off)'],
    ['Please tell me your opinion.', { roles: { action: text('tell'), recipient: text('me'), object: text('your opinion'), manner: text('Please') } },
      'R imperative to you: assert(recipient=me, object=your opinion, manner=Please, action=tell)'],
    ["Don't leave me alone.", { negated: true, roles: { action: text('leave'), object: text('me'), manner: text('alone') } }, 'R imperative to you: not assert(object=me, manner=alone, action=leave)'],
  ];
  for (const [source, input, rendered] of cases) {
    const r = submit(source, build(input));
    assert.equal(r.candidateIdentityAvailable, true, `${source}: ${r.diagnostics.join(' | ')}`);
    assert.equal(renderSem(r.sem!, { profile: MOOD_RENDERER }).code, rendered);
  }
});

test('mood is identity: the imperative and the statement with the same words differ', () => {
  const imperative = submit('Stop looking at me.', build({ roles: { action: text('Stop'), object: text('looking at me') } }));
  const event = submit('Stop looking at me.', build({ kind: 'event', roles: { action: text('Stop'), object: text('looking at me') } }));
  assert.ok(imperative.semanticFingerprint && event.semanticFingerprint);
  assert.notEqual(imperative.semanticFingerprint, event.semanticFingerprint);
});

test('an invented addressee is refused, and the refusal names the fix', () => {
  const r = submit('Stop looking at me.', build({ roles: { subject: text('you'), action: text('Stop'), object: text('looking at me') } }));
  assert.equal(r.candidateIdentityAvailable, false);
  assert.equal(r.failureClass, 'unbound_source_content');
  assert.match(r.diagnostics.join(' '), /an imperative's addressee is carried by kind "instruction", so leave the subject out/u);
  // Outside an imperative kind the message is unchanged.
  const q = submit('Stop looking at me.', build({ kind: 'event', roles: { subject: text('you'), action: text('Stop'), object: text('looking at me') } }));
  assert.doesNotMatch(q.diagnostics.join(' '), /addressee/u);
  // A written "you" stays a valid filler (contract 0.21 step 3).
  assert.equal(submit('You stop looking at me.', build({ roles: { subject: text('You'), action: text('stop'), object: text('looking at me') } })).candidateIdentityAvailable, true);
});
