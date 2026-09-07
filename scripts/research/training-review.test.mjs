import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendReviewDecision, assertBlindPacket, createReviewPackets, evaluateReviewEligibility, reviewItemIdForSourceId, validateReviewDecision, summarizeReviewLedger, verifyReviewPacket } from './training-review.mjs';

test('review packets contain source and candidate but no answer-bearing dataset metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-review-'));
  const dataset = path.join(dir, 'dataset.jsonl');
  fs.writeFileSync(dataset, `${JSON.stringify({ id: 'g-en', source: { language: 'en', text: 'A courier sends a parcel.', semanticGroup: 'g', conceptIds: ['parcel'], entityIds: ['courier'], split: 'dev' }, target: { outcome: 'parse', ir: { version: 'lunum-ir/0.1', world: 'real', kind: 'simple_fact', predicate: 'send', roles: { agent: { handle: 'courier' } } }, criticalNegativePairIds: ['pair'] }, provenance: { generatorVersion: 'secret' }, review: { status: 'accepted' } })}\n`);
  const result = createReviewPackets(dataset, path.join(dir, 'packets'));
  const packet = JSON.parse(fs.readFileSync(result.packetFile, 'utf8'));
  assert.equal(packet.sourceText, 'A courier sends a parcel.');
  assert.equal(packet.candidate.predicate, 'send');
  assert.match(packet.itemId, /^review-[a-f0-9]{24}$/);
  assert.equal(packet.semanticGroup, undefined);
  assert.equal(packet.provenance, undefined);
  assert.equal(packet.criticalNegativePairIds, undefined);
  assert.equal(packet.candidate.abstentionReason, undefined);
  assert.match(packet.packetSha256, /^[a-f0-9]{64}$/);
  assert.equal(verifyReviewPacket(packet).itemId, packet.itemId);
  assert.throws(() => verifyReviewPacket({ ...packet, packetSha256: '0'.repeat(64) }), /packet_hash_mismatch/);
  assert.equal(result.manifest.status, 'awaiting-independent-review');
});

test('review decisions reject gold leakage and dataset drift', () => {
  const base = { itemId: 'g-en', reviewerId: 'fresh-reviewer', reviewerType: 'agent', language: 'en', decision: 'ACCEPT', reason: 'source supports candidate', confidence: '0.9', timestamp: '2026-09-07T00:00:00Z', datasetSha256: 'a'.repeat(64), packetSha256: 'b'.repeat(64) };
  assert.equal(validateReviewDecision(base, 'a'.repeat(64), 'b'.repeat(64)).confidence, 0.9);
  assert.throws(() => validateReviewDecision({ ...base, expectedAnswer: 'gold' }, base.datasetSha256), /answer_leakage/);
  assert.throws(() => validateReviewDecision({ ...base, datasetSha256: 'b'.repeat(64) }, base.datasetSha256), /hash_mismatch/);
  assert.throws(() => validateReviewDecision({ ...base, decision: 'PROMOTE' }, base.datasetSha256), /decision_invalid/);
  assert.throws(() => validateReviewDecision({ ...base, packetSha256: 'c'.repeat(64) }, base.datasetSha256, base.packetSha256), /packet_hash_mismatch/);
});

test('blind packet guard rejects nested answer-bearing keys', () => {
  assert.throws(() => assertBlindPacket({ itemId: 'x', candidate: { roles: { subject: { gold: 'hidden' } } } }), /review_packet_leakage/);
  assert.throws(() => assertBlindPacket({ itemId: 'x', candidate: { expected_answer: 'hidden' } }), /review_packet_leakage/);
});

test('empty review ledger remains uncertified and reports all items pending', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-review-'));
  const summary = summarizeReviewLedger(path.join(dir, 'missing.jsonl'), 'a'.repeat(64), ['a', 'b']);
  assert.equal(summary.reviewedItems, 0);
  assert.equal(summary.pendingItems, 2);
  assert.equal(summary.trainingGoldEligible, false);
});

test('eligibility binds the real dataset and packet hashes and rejects duplicate reviewers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-review-'));
  const dataset = path.join(dir, 'dataset.jsonl');
  fs.writeFileSync(dataset, `${JSON.stringify({ id: 'g-en', source: { language: 'en', text: 'A courier sends a parcel.' }, target: { outcome: 'abstain', abstentionReason: 'hidden' } })}\n`);
  const packetsDir = path.join(dir, 'packets');
  createReviewPackets(dataset, packetsDir);
  const packet = JSON.parse(fs.readFileSync(path.join(packetsDir, 'packets.jsonl'), 'utf8'));
  const ledger = path.join(dir, 'ledger.jsonl');
  const review = { itemId: packet.itemId, reviewerId: 'independent-1', reviewerType: 'agent', language: 'en', decision: 'ACCEPT', reason: 'source is intentionally unsupported', confidence: '0.9', timestamp: '2026-09-07T00:00:00Z', datasetSha256: packet.datasetSha256, packetSha256: packet.packetSha256 };
  appendReviewDecision(ledger, review, packet.datasetSha256, packet.packetSha256);
  assert.throws(() => appendReviewDecision(ledger, review, packet.datasetSha256, packet.packetSha256), /duplicate_reviewer_item/);
  const eligibility = evaluateReviewEligibility({ datasetFile: dataset, packetFile: path.join(packetsDir, 'packets.jsonl'), ledgerFile: ledger });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, 'accepted');
  assert.equal(packet.itemId, reviewItemIdForSourceId('g-en'));
});
