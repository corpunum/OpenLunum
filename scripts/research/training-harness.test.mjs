import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingRunManifest } from './training-harness.mjs';
const row = (split = 'train') => ({ id: `row-${split}`, split, source: { text: `unique ${split} text`, language: 'en', semanticGroup: `group-${split}`, templateFamily: `template-${split}`, conceptIds: [`concept-${split}`] }, target: { outcome: 'parse', ir: { predicate: 'prefer' } }, provenance: { sourceKind: 'synthetic', annotationMethod: 'rule-derived', license: 'CC0-1.0', createdAt: '2026-09-06T00:00:00Z', generatorVersion: 'test/1' }, review: { status: 'accepted', reviewers: ['rule-review'] } });
test('harness records immutable dataset and split hashes and forbids local inference', () => {
  const manifest = buildTrainingRunManifest({ codeSha: 'a'.repeat(40), examples: [row('train'), row('dev')], splitManifest: { train: ['group-train'], dev: ['group-dev'] }, model: { class: 'multilingual-encoder', baseRevision: 'external:pending', tokenizerRevision: 'external:pending' } });
  assert.match(manifest.datasetSha256, /^[0-9a-f]{64}$/); assert.equal(manifest.localInferenceUsed, false); assert.equal(manifest.embeddingUsed, false);
});
test('harness rejects split leakage before any training job', () => {
  assert.throws(() => buildTrainingRunManifest({ codeSha: 'a'.repeat(40), examples: [row('train'), { ...row('dev'), source: { ...row('train').source, semanticGroup: 'group-dev', conceptIds: ['concept-train'] } }], splitManifest: {}, model: { class: 'x', baseRevision: 'x', tokenizerRevision: 'x' } }), /training dataset rejected/);
});
