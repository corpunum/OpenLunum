#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadJsonLines } from './training-program.mjs';

export const REVIEW_SCHEMA = 'openlunum-training-review/0.1';
const DECISIONS = new Set(['ACCEPT', 'REJECT', 'CORRECTION_REQUIRED', 'AMBIGUOUS']);
const WITHHELD_KEYS = new Set(['semanticGroup', 'criticalNegativePairIds', 'conceptIds', 'entityIds', 'provenance', 'review', 'split', 'generatorVersion', 'expectedAnswer', 'gold']);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function datasetBytes(datasetFile) {
  return fs.readFileSync(datasetFile);
}

function datasetRows(datasetFile) {
  return datasetFile.endsWith('.jsonl') ? loadJsonLines(datasetFile) : JSON.parse(fs.readFileSync(datasetFile, 'utf8'));
}

/** Remove metadata that could tell a reviewer which answer is expected. */
function reviewCandidate(row) {
  if (row.target?.outcome === 'abstain') {
    return { outcome: 'abstain', abstentionReason: row.target.abstentionReason };
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
      if (WITHHELD_KEYS.has(key)) leaked.push(`${pathName}.${key}`);
      visit(child, `${pathName}.${key}`);
    }
  };
  visit(packet, '$');
  if (leaked.length) throw new Error(`review_packet_leakage:${leaked.join(',')}`);
  return packet;
}

export function createReviewPackets(datasetFile, outputDir) {
  const rows = datasetRows(datasetFile);
  const datasetHash = sha256(datasetBytes(datasetFile));
  fs.mkdirSync(outputDir, { recursive: true });
  const packetFile = path.join(outputDir, 'packets.jsonl');
  const manifestFile = path.join(outputDir, 'manifest.json');
  const packets = rows.map((row) => assertBlindPacket({
    reviewSchema: REVIEW_SCHEMA,
    itemId: row.id,
    datasetSha256: datasetHash,
    sourceLanguage: row.source?.language,
    sourceText: row.source?.text,
    candidate: reviewCandidate(row)
  }))
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
    withheldFields: [...WITHHELD_KEYS, 'generator metadata'],
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { packetFile, manifestFile, manifest };
}

export function validateReviewDecision(decision, expectedDatasetSha256) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) throw new TypeError('review_decision_object_required');
  for (const field of ['itemId', 'reviewerId', 'reviewerType', 'language', 'decision', 'reason', 'confidence', 'timestamp', 'datasetSha256']) {
    if (typeof decision[field] !== 'string' || !decision[field]) throw new TypeError(`review_${field}_required`);
  }
  if (!DECISIONS.has(decision.decision)) throw new TypeError('review_decision_invalid');
  if (!Number.isFinite(Number(decision.confidence)) || Number(decision.confidence) < 0 || Number(decision.confidence) > 1) throw new TypeError('review_confidence_invalid');
  if (decision.datasetSha256 !== expectedDatasetSha256) throw new TypeError('review_dataset_hash_mismatch');
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
    datasetSha256: decision.datasetSha256
  };
}

export function appendReviewDecision(ledgerFile, decision, expectedDatasetSha256) {
  const validated = validateReviewDecision(decision, expectedDatasetSha256);
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  fs.appendFileSync(ledgerFile, `${JSON.stringify(validated)}\n`);
  return validated;
}

export function summarizeReviewLedger(ledgerFile, expectedDatasetSha256, itemIds = []) {
  const rows = fs.existsSync(ledgerFile) ? loadJsonLines(ledgerFile) : [];
  const validated = rows.map((row) => validateReviewDecision(row, expectedDatasetSha256));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const [datasetFile, outputDir] = process.argv.slice(2);
  if (!datasetFile || !outputDir) throw new Error('usage: training-review.mjs <dataset.jsonl> <output-dir>');
  console.log(JSON.stringify(createReviewPackets(path.resolve(datasetFile), path.resolve(outputDir)).manifest, null, 2));
}
