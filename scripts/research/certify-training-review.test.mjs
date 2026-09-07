import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { certifyTrainingReview } from './certify-training-review.mjs';
import { createReviewPackets, reviewItemIdForSourceId } from './training-review.mjs';

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
  const packetDir = path.join(dir, 'packets');
  const { packetFile } = createReviewPackets(datasetFile, packetDir);
  const packets = fs.readFileSync(packetFile, 'utf8').trim().split('\n').map(JSON.parse);
  const ledgerFile = path.join(dir, 'ledger.jsonl');
  let previous = null;
  const ledger = rows.map((row, index) => {
    const packet = packets[index];
    const review = { reviewSchema: 'openlunum-training-review/0.1', itemId: reviewItemIdForSourceId(row.id), reviewerId: 'agent', reviewerType: 'agent', language: 'en', decision: 'ACCEPT', reason: 'source supports abstention', confidence: 1, timestamp: '2026-09-07T00:00:00Z', datasetSha256, packetSha256: packet.packetSha256 };
    const durable = { ...review, ledgerSequence: index + 1, previousReviewSha256: previous ? hash(JSON.stringify(previous)) : null };
    previous = durable;
    return durable;
  });
  fs.writeFileSync(ledgerFile, ledger.map(JSON.stringify).join('\n') + '\n');
  const outputFile = path.join(dir, 'out.jsonl');
  const reportFile = path.join(dir, 'report.json');
  const bindingFile = path.join(dir, 'bindings.jsonl');
  const report = certifyTrainingReview({ datasetFile, packetFile, ledgerFile, outputFile, reportFile, bindingFile });
  assert.equal(report.outputRows, 6);
  assert.equal(report.finalAcceptedRows, 6);
  assert.equal(report.rowBindingCount, 6);
  assert.equal(report.deterministicValidation.pass, true);
  assert.equal(report.trainingGoldEligible, false);
  assert.match(report.failureReasons.join(','), /critical_negative/);
});

test('certifier rejects forged packet, unknown pair, stale correction, and empty IR evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-certify-bypass-'));
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: `group-${index}-en`, split: 'train',
    source: { text: `The operator records item ${index}.`, language: 'en', semanticGroup: 'group-one', templateFamily: 'natural-one', difficultyLevel: 1 },
    target: { outcome: 'parse', ir: {} },
    provenance: { sourceKind: 'authored', annotationMethod: 'review', license: 'CC0-1.0', createdAt: '2026-09-07T00:00:00Z', generatorVersion: 'test/1' },
    review: { status: 'pending', reviewers: ['reviewer'] }
  }));
  const datasetFile = path.join(dir, 'dataset.jsonl');
  fs.writeFileSync(datasetFile, rows.map(JSON.stringify).join('\n') + '\n');
  const { packetFile } = createReviewPackets(datasetFile, path.join(dir, 'packets'));
  const datasetSha256 = hash(fs.readFileSync(datasetFile));
  const packets = fs.readFileSync(packetFile, 'utf8').trim().split('\n').map(JSON.parse);
  const review = (packet, index, overrides = {}) => ({
    reviewSchema: 'openlunum-training-review/0.1', itemId: packet.itemId, reviewerId: `reviewer-${index}`, reviewerType: 'agent', language: packet.sourceLanguage,
    decision: 'ACCEPT', reason: 'reviewed', confidence: 1, timestamp: '2026-09-07T00:00:00Z', datasetSha256, packetSha256: packet.packetSha256, ...overrides,
    ledgerSequence: index + 1, previousReviewSha256: null
  });
  const ledgerFile = path.join(dir, 'ledger.jsonl');
  let priorReview = null;
  const goodLedger = packets.map((packet, index) => {
    const durable = review(packet, index);
    durable.previousReviewSha256 = priorReview ? hash(JSON.stringify(priorReview)) : null;
    priorReview = durable;
    return JSON.stringify(durable);
  }).join('\n') + '\n';
  fs.writeFileSync(ledgerFile, goodLedger);
  const invalidReport = certifyTrainingReview({ datasetFile, packetFile, ledgerFile, negativeFile: path.join(dir, 'negative.jsonl'), outputFile: path.join(dir, 'out'), reportFile: path.join(dir, 'report') });
  assert.equal(invalidReport.trainingGoldEligible, false);
  assert.match(invalidReport.failureReasons.join(','), /deterministic_validation/);
  const forged = JSON.parse(fs.readFileSync(ledgerFile, 'utf8').split('\n')[0]);
  forged.packetSha256 = 'f'.repeat(64);
  fs.writeFileSync(ledgerFile, [JSON.stringify(forged), ...fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').slice(1)].join('\n') + '\n');
  assert.throws(() => certifyTrainingReview({ datasetFile, packetFile, ledgerFile, outputFile: path.join(dir, 'out2'), reportFile: path.join(dir, 'report2') }), /review_packet_hash_mismatch/);
  const negativeFile = path.join(dir, 'negative.jsonl');
  fs.writeFileSync(negativeFile, JSON.stringify({ pairId: 'not-in-dataset', decision: 'DISTINCT', datasetSha256 }) + '\n');
  const goodLedgerFile = path.join(dir, 'good-ledger');
  fs.writeFileSync(goodLedgerFile, goodLedger);
  assert.throws(() => certifyTrainingReview({ datasetFile, packetFile, ledgerFile: goodLedgerFile, negativeFile, outputFile: path.join(dir, 'out3'), reportFile: path.join(dir, 'report3') }), /unknown_pair/);
});

test('certifier accepts a fully bound positive safety case only with valid IR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-certify-positive-'));
  const makeRows = (group, predicate) => Array.from(['en', 'el', 'es', 'fr', 'de', 'id'], (language, index) => ({
    id: `${group}-${language}`, split: 'train',
    source: { text: `${language} operator ${predicate} the signed report.`, language, semanticGroup: group, templateFamily: `natural-${group}`, difficultyLevel: 1 },
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate, roles: { agent: { handle: `${group}-agent`, type: 'actor' }, theme: { handle: `${group}-object`, type: 'concept' } } }, criticalNegativePairIds: ['contrast-enable'] },
    provenance: { sourceKind: 'authored', annotationMethod: 'independent-review', license: 'CC0-1.0', createdAt: '2026-09-07T00:00:00Z', generatorVersion: 'natural-test/1' },
    review: { status: 'pending', reviewers: ['reviewer'] }
  }));
  const rows = [...makeRows('enable-group', 'enable'), ...makeRows('disable-group', 'disable')];
  const datasetFile = path.join(dir, 'dataset.jsonl'); fs.writeFileSync(datasetFile, rows.map(JSON.stringify).join('\n') + '\n');
  const { packetFile } = createReviewPackets(datasetFile, path.join(dir, 'packets'));
  const packets = fs.readFileSync(packetFile, 'utf8').trim().split('\n').map(JSON.parse);
  const datasetSha256 = hash(fs.readFileSync(datasetFile)); let previous = null;
  const ledger = packets.map((packet, index) => { const base = { reviewSchema: 'openlunum-training-review/0.1', itemId: packet.itemId, reviewerId: 'independent-reviewer', reviewerType: 'agent', language: packet.sourceLanguage, decision: 'ACCEPT', reason: 'source supports candidate', confidence: 1, timestamp: '2026-09-07T00:00:00Z', datasetSha256, packetSha256: packet.packetSha256 }; const row = { ...base, ledgerSequence: index + 1, previousReviewSha256: previous ? hash(JSON.stringify(previous)) : null }; previous = row; return row; });
  const ledgerFile = path.join(dir, 'ledger.jsonl'); fs.writeFileSync(ledgerFile, ledger.map(JSON.stringify).join('\n') + '\n');
  const negativeFile = path.join(dir, 'negative.jsonl'); fs.writeFileSync(negativeFile, JSON.stringify({ pairId: 'contrast-enable', decision: 'DISTINCT', datasetSha256, leftSourceRowIds: rows.filter((row) => row.source.semanticGroup === 'enable-group').map((row) => row.id), rightSourceRowIds: rows.filter((row) => row.source.semanticGroup === 'disable-group').map((row) => row.id) }) + '\n');
  const report = certifyTrainingReview({ datasetFile, packetFile, ledgerFile, negativeFile, outputFile: path.join(dir, 'out.jsonl'), reportFile: path.join(dir, 'report.json'), bindingFile: path.join(dir, 'bindings.jsonl') });
  assert.equal(report.outputRows, 12);
  assert.equal(report.safeNegativePairs, 1);
  assert.equal(report.trainingGoldEligible, true);
  assert.equal(report.deterministicValidation.pass, true);
  const badEndpointFile = path.join(dir, 'bad-endpoints.jsonl');
  const validNegative = JSON.parse(fs.readFileSync(negativeFile, 'utf8'));
  fs.writeFileSync(badEndpointFile, JSON.stringify({ ...validNegative, rightSourceRowIds: validNegative.leftSourceRowIds }) + '\n');
  assert.throws(() => certifyTrainingReview({ datasetFile, packetFile, ledgerFile, negativeFile: badEndpointFile, outputFile: path.join(dir, 'bad-out'), reportFile: path.join(dir, 'bad-report') }), /endpoints_mismatch/);
  const conflictFile = path.join(dir, 'conflict.jsonl');
  fs.writeFileSync(conflictFile, `${JSON.stringify(validNegative)}\n${JSON.stringify({ ...validNegative, decision: 'NOT_DISTINCT' })}\n`);
  assert.throws(() => certifyTrainingReview({ datasetFile, packetFile, ledgerFile, negativeFile: conflictFile, outputFile: path.join(dir, 'conflict-out'), reportFile: path.join(dir, 'conflict-report') }), /negative_review_conflict/);
});
