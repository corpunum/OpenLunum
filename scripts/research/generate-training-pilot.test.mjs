import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePilot } from './generate-training-pilot.mjs';
import { validateConceptDisjointSplits, validateTrainingExample } from './training-program.mjs';

test('pilot generator creates multilingual, concept-disjoint, provenance-bearing data', () => {
  const rows = generatePilot();
  assert.equal(rows.length, 720);
  assert.equal(new Set(rows.map((r) => r.source.semanticGroup)).size, 120);
  assert.equal(new Set(rows.map((r) => r.source.language)).size, 6);
  assert.equal(rows.filter((r) => r.target.outcome === 'parse').length, 648);
  assert.equal(rows.filter((r) => r.target.outcome === 'abstain').length, 72);
  assert.equal(rows.filter((r) => (r.target.criticalNegativePairIds?.length ?? 0) > 0).length, 72);
  assert.equal(rows.flatMap(validateTrainingExample).length, 0);
  assert.deepEqual(validateConceptDisjointSplits(rows), []);
});

test('pilot includes accepted parse and explicit abstention targets', () => {
  const rows = generatePilot();
  assert.ok(rows.some((r) => r.target.outcome === 'parse' && r.review.status === 'accepted'));
  assert.ok(rows.some((r) => r.target.outcome === 'abstain' && r.target.abstentionReason === 'ambiguous'));
});
