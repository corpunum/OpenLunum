#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadJsonLines } from './training-program.mjs';

export const REVIEW_SCHEMA = 'openlunum-training-review/0.1';
const DECISIONS = new Set(['ACCEPT', 'REJECT', 'CORRECTION_REQUIRED', 'AMBIGUOUS']);
const WITHHELD_KEYS = new Set(['semanticgroup', 'criticalnegativepairids', 'conceptids', 'entityids', 'provenance', 'review', 'split', 'generatorversion', 'expectedanswer', 'expected', 'gold']);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const keyFingerprint = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
export const reviewItemIdForSourceId = (sourceId) => `review-${sha256(`openlunum-review-item\0${sourceId}`).slice(0, 24)}`;

function datasetBytes(datasetFile) {
  return fs.readFileSync(datasetFile);
}

function datasetRows(datasetFile) {
  return datasetFile.endsWith('.jsonl') ? loadJsonLines(datasetFile) : JSON.parse(fs.readFileSync(datasetFile, 'utf8'));
}

/** Remove metadata that could tell a reviewer which answer is expected. */
function reviewCandidate(row) {
  if (row.target?.outcome === 'abstain') {
    return { outcome: 'abstain' };
  }
  const ir = row.target?.ir;
  if (!ir) return null;
  return {
    outcome: 'parse',
    version: ir.version,
    world: ir.world,
    kind: ir.kind,
    predicate: ir.predicate,
    roles: ir.roles,
    ...(ir.negated === undefined ? {} : { negated: ir.negated }),
    ...(ir.modality === undefined ? {} : { modality: ir.modality }),
    ...(ir.time === undefined ? {} : { time: ir.time }),
    ...(ir.conditions === undefined ? {} : { conditions: ir.conditions }),
    ...(ir.consequences === undefined ? {} : { consequences: ir.consequences })
  };
}

export function assertBlindPacket(packet) {
  const leaked = [];
  const visit = (value, pathName) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${pathName}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (WITHHELD_KEYS.has(keyFingerprint(key))) leaked.push(`${pathName}.${key}`);
      visit(child, `${pathName}.${key}`);
    }
  };
  visit(packet, '$');
  if (leaked.length) throw new Error(`review_packet_leakage:${leaked.join(',')}`);
  return packet;
}

export function verifyReviewPacket(packet) {
  if (!packet || typeof packet !== 'object' || typeof packet.packetSha256 !== 'string') throw new TypeError('review_packet_invalid');
  const { packetSha256, ...body } = packet;
  if (sha256(JSON.stringify(body)) !== packetSha256) throw new TypeError('review_packet_hash_mismatch');
  return assertBlindPacket(packet);
}

export function createReviewPackets(datasetFile, outputDir) {
  const rows = datasetRows(datasetFile);
  const datasetHash = sha256(datasetBytes(datasetFile));
  fs.mkdirSync(outputDir, { recursive: true });
  const packetFile = path.join(outputDir, 'packets.jsonl');
  const manifestFile = path.join(outputDir, 'manifest.json');
  const packets = rows.map((row) => {
    const packet = assertBlindPacket({
      reviewSchema: REVIEW_SCHEMA,
    itemId: reviewItemIdForSourceId(row.id),
      datasetSha256: datasetHash,
      sourceLanguage: row.source?.language,
      sourceText: row.source?.text,
      candidate: reviewCandidate(row)
    });
    return { ...packet, packetSha256: sha256(JSON.stringify(packet)) };
  })
  if (packets.some((packet) => !packet.itemId || !packet.sourceLanguage || !packet.sourceText || packet.candidate === null)) {
    throw new Error('review_packet_source_or_candidate_missing');
  }
  fs.writeFileSync(packetFile, `${packets.map((packet) => JSON.stringify(packet)).join('\n')}\n`, { flag: 'wx' });
  const manifest = {
    reviewSchema: REVIEW_SCHEMA,
    datasetSha256: datasetHash,
    packetCount: packets.length,
    status: 'awaiting-independent-review',
    blindFields: ['itemId', 'sourceLanguage', 'sourceText', 'candidate'],
    withheldFields: [...WITHHELD_KEYS, 'generator metadata', 'source row identifiers'],
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { packetFile, manifestFile, manifest };
}

export function validateReviewDecision(decision, expectedDatasetSha256, expectedPacketSha256 = null) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) throw new TypeError('review_decision_object_required');
  for (const field of ['itemId', 'reviewerId', 'reviewerType', 'language', 'decision', 'reason', 'timestamp', 'datasetSha256', 'packetSha256']) {
    if (typeof decision[field] !== 'string' || !decision[field]) throw new TypeError(`review_${field}_required`);
  }
  if (decision.confidence === undefined || decision.confidence === null || decision.confidence === '') throw new TypeError('review_confidence_required');
  if (!DECISIONS.has(decision.decision)) throw new TypeError('review_decision_invalid');
  if (!Number.isFinite(Number(decision.confidence)) || Number(decision.confidence) < 0 || Number(decision.confidence) > 1) throw new TypeError('review_confidence_invalid');
  if (decision.datasetSha256 !== expectedDatasetSha256) throw new TypeError('review_dataset_hash_mismatch');
  if (!/^([a-f0-9]{64})$/.test(decision.packetSha256)) throw new TypeError('review_packet_hash_invalid');
  if (expectedPacketSha256 !== null && decision.packetSha256 !== expectedPacketSha256) throw new TypeError('review_packet_hash_mismatch');
  if ('expectedAnswer' in decision || 'gold' in decision || 'semanticGroup' in decision || 'criticalNegativePairIds' in decision) throw new TypeError('review_answer_leakage');
  return {
    reviewSchema: REVIEW_SCHEMA,
    itemId: decision.itemId,
    reviewerId: decision.reviewerId,
    reviewerType: decision.reviewerType,
    language: decision.language,
    decision: decision.decision,
    reason: decision.reason,
    ...(decision.disputedFields === undefined ? {} : { disputedFields: decision.disputedFields }),
    ...(decision.proposedCorrection === undefined ? {} : { proposedCorrection: decision.proposedCorrection }),
    confidence: Number(decision.confidence),
    timestamp: decision.timestamp,
    datasetSha256: decision.datasetSha256,
    packetSha256: decision.packetSha256
  };
}

export function appendReviewDecision(ledgerFile, decision, expectedDatasetSha256, expectedPacketSha256 = null) {
  const validated = validateReviewDecision(decision, expectedDatasetSha256, expectedPacketSha256);
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  const existing = fs.existsSync(ledgerFile) ? loadJsonLines(ledgerFile) : [];
  if (existing.some((row) => row.itemId === validated.itemId && row.reviewerId === validated.reviewerId)) throw new TypeError('review_duplicate_reviewer_item');
  const previous = existing.at(-1);
  const durable = {
    ...validated,
    ledgerSequence: existing.length + 1,
    previousReviewSha256: previous ? sha256(JSON.stringify(previous)) : null
  };
  fs.appendFileSync(ledgerFile, `${JSON.stringify(durable)}\n`);
  return durable;
}

export function summarizeReviewLedger(ledgerFile, expectedDatasetSha256, itemIds = [], packetHashes = new Map()) {
  const rows = fs.existsSync(ledgerFile) ? loadJsonLines(ledgerFile) : [];
  const validated = rows.map((row) => validateReviewDecision(row, expectedDatasetSha256, packetHashes.get(row.itemId) ?? null));
  const duplicateKeys = new Set();
  for (const row of validated) {
    const key = `${row.itemId}\0${row.reviewerId}`;
    if (duplicateKeys.has(key)) throw new TypeError('review_duplicate_reviewer_item');
    duplicateKeys.add(key);
  }
  const byItem = new Map();
  for (const row of validated) {
    if (!byItem.has(row.itemId)) byItem.set(row.itemId, []);
    byItem.get(row.itemId).push(row);
  }
  const disagreements = [...byItem.entries()].filter(([, reviews]) => new Set(reviews.map((review) => review.decision)).size > 1).map(([itemId]) => itemId);
  const counts = Object.fromEntries([...DECISIONS].map((decision) => [decision, validated.filter((row) => row.decision === decision).length]));
  return {
    reviewSchema: REVIEW_SCHEMA,
    datasetSha256: expectedDatasetSha256,
    submittedReviews: validated.length,
    reviewedItems: byItem.size,
    pendingItems: itemIds.filter((itemId) => !byItem.has(itemId)).length,
    disagreements,
    counts,
    trainingGoldEligible: false,
    note: 'Eligibility requires independent review and deterministic revalidation; this summary never promotes rows by itself.'
  };
}

export function evaluateReviewEligibility({ datasetFile, packetFile, ledgerFile, independentReviewerTypes = new Set(['agent', 'human', 'reviewer']) }) {
  const rows = datasetRows(datasetFile);
  const datasetHash = sha256(datasetBytes(datasetFile));
  const packets = loadJsonLines(packetFile).map(verifyReviewPacket);
  if (packets.length !== rows.length) return { eligible: false, reason: 'packet_count_mismatch' };
  const packetHashes = new Map(packets.map((packet) => [packet.itemId, packet.packetSha256]));
  const expectedItems = rows.map((row) => reviewItemIdForSourceId(row.id));
  const summary = summarizeReviewLedger(ledgerFile, datasetHash, expectedItems, packetHashes);
  const reviews = fs.existsSync(ledgerFile) ? loadJsonLines(ledgerFile) : [];
  const invalidReviewer = reviews.find((review) => !independentReviewerTypes.has(review.reviewerType));
  const unresolved = summary.disagreements.length > 0;
  const reviewedSet = new Set(reviews.map((review) => review.itemId));
  const complete = expectedItems.length === reviewedSet.size && expectedItems.every((itemId) => reviewedSet.has(itemId)) && summary.reviewedItems === expectedItems.length;
  const allAccepted = reviews.every((review) => review.decision === 'ACCEPT');
  return {
    eligible: complete && !invalidReviewer && !unresolved && allAccepted && summary.submittedReviews === expectedItems.length,
    reason: complete ? (invalidReviewer ? 'reviewer_not_independent' : unresolved ? 'review_disagreement' : allAccepted ? 'accepted' : 'non_accept_decision') : 'review_coverage_incomplete',
    datasetSha256: datasetHash,
    expectedItems: expectedItems.length,
    ...summary
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [datasetFile, outputDir] = process.argv.slice(2);
  if (!datasetFile || !outputDir) throw new Error('usage: training-review.mjs <dataset.jsonl> <output-dir>');
  console.log(JSON.stringify(createReviewPackets(path.resolve(datasetFile), path.resolve(outputDir)).manifest, null, 2));
}
