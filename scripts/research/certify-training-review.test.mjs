import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { certifyTrainingReview } from './certify-training-review.mjs';
import { reviewItemIdForSourceId } from './training-review.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

test('certifier derives a reviewed safe subset and fails closed without safety pairs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-certify-'));
  const datasetFile = path.join(dir, 'dataset.jsonl');
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: `group-${index}-en`, split: 'train',
    source: { text: `A source sentence ${index}.`, language: 'en', semanticGroup: 'group-one', templateFamily: 'template-one', difficultyLevel: 1 },
    target: { outcome: 'abstain', abstentionReason: 'unsupported' },
    provenance: { sourceKind: 'synthetic', annotationMethod: 'test', license: 'CC0-1.0', createdAt: '2026-09-07T00:00:00Z', generatorVersion: 'test/1' },
    review: { status: 'accepted', reviewers: ['test'] }
  }));
  fs.writeFileSync(datasetFile, rows.map(JSON.stringify).join('\n') + '\n');
  const datasetSha256 = hash(fs.readFileSync(datasetFile));
  const ledgerFile = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledgerFile, rows.map((row) => JSON.stringify({ itemId: reviewItemIdForSourceId(row.id), datasetSha256, decision: 'ACCEPT', reviewerId: 'agent', reviewerType: 'agent' })).join('\n') + '\n');
  const outputFile = path.join(dir, 'out.jsonl');
  const reportFile = path.join(dir, 'report.json');
  const report = certifyTrainingReview({ datasetFile, ledgerFile, outputFile, reportFile });
  assert.equal(report.outputRows, 6);
  assert.equal(report.deterministicValidation.pass, true);
  assert.equal(report.trainingGoldEligible, false);
  assert.match(report.failureReasons.join(','), /critical_negative/);
});
