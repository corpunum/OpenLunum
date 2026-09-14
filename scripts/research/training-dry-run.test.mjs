import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDryRunBatches, buildDryRunEvidence } from './training-dry-run.mjs';

const example = (id, outcome = 'parse') => ({ id, split: 'train', source: { text: 'A unique sentence.', language: 'en', semanticGroup: id, templateFamily: id, difficultyLevel: 1 }, target: outcome === 'parse' ? { outcome, ir: { predicate: 'prefer' } } : { outcome, abstentionReason: 'unsupported' } });

test('dry-run batches preserve source, target and abstention labels', () => {
  const batches = buildDryRunBatches([example('a'), example('b', 'abstain')], 1);
  assert.equal(batches.length, 2);
  assert.equal(batches[1][0].targetOutcome, 'abstain');
  assert.equal(batches[1][0].targetIr, null);
  assert.equal(batches[1][0].abstentionReason, 'unsupported');
});

test('dry-run evidence is explicitly non-capability evidence', () => {
  const examples = [example('a')];
  const evidence = buildDryRunEvidence({ examples, batches: buildDryRunBatches(examples), manifest: { format: 'test' } });
  assert.equal(evidence.status, 'preprocessing-only');
  assert.equal(evidence.capabilityClaim, false);
  assert.equal(evidence.recordCount, 1);
});
