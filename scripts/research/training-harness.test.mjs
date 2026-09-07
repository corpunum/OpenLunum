import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingRunManifest, resumeTrainingCheckpoint, writeTrainingCheckpoint } from './training-harness.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const row = (split = 'train') => ({ id: `row-${split}`, split, source: { text: `unique ${split} text`, language: 'en', semanticGroup: `group-${split}`, templateFamily: `template-${split}`, conceptIds: [`concept-${split}`] }, target: { outcome: 'parse', ir: { predicate: 'prefer' } }, provenance: { sourceKind: 'synthetic', annotationMethod: 'rule-derived', license: 'CC0-1.0', createdAt: '2026-09-06T00:00:00Z', generatorVersion: 'test/1' }, review: { status: 'accepted', reviewers: ['rule-review'] } });
test('harness records immutable dataset and split hashes and forbids local inference', () => {
  const manifest = buildTrainingRunManifest({ codeSha: 'a'.repeat(40), examples: [row('train'), row('dev')], splitManifest: { train: ['group-train'], dev: ['group-dev'] }, model: { class: 'multilingual-encoder', baseRevision: 'external:pending', tokenizerRevision: 'external:pending' } });
  assert.match(manifest.datasetSha256, /^[0-9a-f]{64}$/); assert.equal(manifest.localInferenceUsed, false); assert.equal(manifest.embeddingUsed, false);
});
test('harness rejects split leakage before any training job', () => {
  assert.throws(() => buildTrainingRunManifest({ codeSha: 'a'.repeat(40), examples: [row('train'), { ...row('dev'), source: { ...row('train').source, semanticGroup: 'group-dev', conceptIds: ['concept-train'] } }], splitManifest: {}, model: { class: 'x', baseRevision: 'x', tokenizerRevision: 'x' } }), /training dataset rejected/);
});

test('checkpoint resume rejects changed code, data, split or model identity', () => {
  const manifest = buildTrainingRunManifest({ codeSha: 'a'.repeat(40), examples: [row('train'), row('dev')], splitManifest: { train: ['group-train'], dev: ['group-dev'] }, model: { class: 'multilingual-encoder', baseRevision: 'base-1', tokenizerRevision: 'tok-1' } });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-training-')), 'checkpoint.json');
  writeTrainingCheckpoint(file, manifest, { step: 3, metrics: { loss: 1 } });
  assert.equal(resumeTrainingCheckpoint(file, manifest).step, 3);
  assert.throws(() => resumeTrainingCheckpoint(file, { ...manifest, codeSha: 'b'.repeat(40) }), /training_resume_rejected/);
  assert.throws(() => resumeTrainingCheckpoint(file, { ...manifest, model: { ...manifest.model, tokenizerRevision: 'tok-2' } }), /training_resume_rejected/);
});
