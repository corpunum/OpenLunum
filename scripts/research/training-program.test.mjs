import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailureState, summarizeTrainingDataset, validateConceptDisjointSplits, validateTrainingExample } from './training-program.mjs';

const example = (overrides = {}) => ({
  id: 'x-001', split: 'train',
  source: { text: 'A courier sends the parcel to the depot.', language: 'en', semanticGroup: 'g-x', templateFamily: 'send-v1', conceptIds: ['parcel-x'], entityIds: ['courier-x', 'depot-x'] },
  target: { outcome: 'parse', ir: { predicate: 'send', roles: { agent: 'courier-x', object: 'parcel-x', recipient: 'depot-x' } } },
  provenance: { sourceKind: 'synthetic', annotationMethod: 'deterministic-template', license: 'CC0-1.0', createdAt: '2026-09-06T00:00:00Z', generatorVersion: 'fixture/1' },
  review: { status: 'accepted', reviewers: ['deterministic-contract'] }, ...overrides
});

test('training example requires provenance and a semantic IR for parse targets', () => {
  assert.deepEqual(validateTrainingExample(example()), []);
  assert.ok(validateTrainingExample({ ...example(), provenance: undefined }).includes('provenance missing'));
  assert.ok(validateTrainingExample({ ...example(), target: { outcome: 'parse' } }).includes('parse target.ir missing'));
});

test('concept-disjoint validator rejects semantic, concept, entity, template and text leakage', () => {
  const a = example();
  const b = example({ id: 'x-002', split: 'dev', source: { ...a.source, semanticGroup: 'g-y' } });
  const errors = validateConceptDisjointSplits([a, b]);
  assert.ok(errors.some((e) => e.includes('conceptId:parcel-x')));
  assert.ok(errors.some((e) => e.includes('templateFamily:send-v1')));
  assert.ok(errors.some((e) => e.includes('sourceText:')));
});

test('failure classification uses structured stages, not message strings', () => {
  assert.equal(classifyFailureState({ transportSchemaValid: false, message: 'anything' }).category, 'TRANSPORT_SCHEMA_FAILURE');
  assert.equal(classifyFailureState({ protocolCanonical: true, frameValid: true, grounded: true, candidateIdentityAvailable: true, semanticIdentityExact: false, identityDiff: 'role' }).category, 'SEMANTIC_INTERPRETATION_OR_GROUNDING');
  assert.equal(classifyFailureState({ expectedOutcome: 'abstain', abstained: false }).category, 'UNEXPECTED_PARSE');
  assert.equal(classifyFailureState({}).category, 'TRULY_UNKNOWN');
});

test('summary keeps rows and independent semantic groups separate', () => {
  const result = summarizeTrainingDataset([example(), example({ id: 'x-002', source: { ...example().source, language: 'el' } })]);
  assert.equal(result.rows, 2); assert.equal(result.independentSemanticGroups, 1); assert.equal(result.languages.en, 1); assert.equal(result.languages.el, 1);
});
