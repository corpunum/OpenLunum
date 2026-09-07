#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadJsonLines, validateTrainingExample, validateConceptDisjointSplits } from './training-program.mjs';
import { buildCandidateFromSemanticIR } from '../../packages/core/dist/src/index.js';
import { assertBlindPacket, reviewItemIdForSourceId, validateReviewDecision, verifyReviewPacket } from './training-review.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJsonl = (file) => loadJsonLines(file);
const contentHash = (value) => sha256(JSON.stringify(value));
const writeAtomic = (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value, { flag: 'wx' });
  fs.renameSync(temporary, file);
};

function correctedRow(row, proposal) {
  if (proposal?.action !== 'CORRECTED' || !proposal.correctedCandidate) return row;
  const candidate = proposal.correctedCandidate;
  if (candidate.outcome !== 'parse') return null;
  return { ...row, target: { ...row.target, outcome: 'parse', ir: candidate } };
}

function candidateIrForValidation(ir) {
  if (!ir || typeof ir !== 'object' || Array.isArray(ir)) throw new TypeError('target_ir_object_required');
  return {
    version: 'lunum-ir/0.1', outcome: 'parse',
    world: ir.world, kind: ir.kind, predicate: ir.predicate, roles: ir.roles,
    ...(ir.negated === undefined ? {} : { negated: ir.negated }),
    ...(ir.modality === undefined ? {} : { modality: ir.modality }),
    ...(ir.time === undefined ? {} : { time: ir.time }),
    ...(ir.conditions === undefined ? {} : { conditions: ir.conditions }),
    ...(ir.consequences === undefined ? {} : { consequences: ir.consequences })
  };
}

function validateTarget(row) {
  if (row.target?.outcome === 'abstain') return [];
  try {
    buildCandidateFromSemanticIR(candidateIrForValidation(row.target?.ir));
    return [];
  } catch (error) {
    return [`target.ir: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function readJsonLinesBound(file, packetById, datasetSha256) {
  const rows = readJsonl(file);
  const seen = new Set();
  return rows.map((proposal) => {
    if (!proposal || typeof proposal !== 'object' || typeof proposal.itemId !== 'string') throw new TypeError('correction_proposal_invalid');
    if (seen.has(proposal.itemId)) throw new TypeError('correction_proposal_duplicate');
    seen.add(proposal.itemId);
    const packet = packetById.get(proposal.itemId);
    if (!packet) throw new TypeError('correction_proposal_unknown_item');
    if (proposal.datasetSha256 !== datasetSha256 || proposal.packetSha256 !== packet.packetSha256) throw new TypeError('correction_proposal_binding_mismatch');
    if (proposal.language !== packet.sourceLanguage) throw new TypeError('correction_proposal_language_mismatch');
    if (proposal.action === 'CORRECTED') {
      if (!proposal.correctedCandidate || typeof proposal.correctedCandidate !== 'object') throw new TypeError('correction_candidate_required');
      assertBlindPacket({ candidate: proposal.correctedCandidate });
      if (proposal.correctedCandidate.outcome !== 'parse') throw new TypeError('correction_candidate_outcome_invalid');
    }
    return proposal;
  });
}

function validateLedger(reviews, packets, datasetSha256) {
  const packetById = new Map(packets.map((packet) => [packet.itemId, packet]));
  const seenReviewerItems = new Set();
  let previous = null;
  for (const [index, review] of reviews.entries()) {
    const packet = packetById.get(review.itemId);
    if (!packet) throw new TypeError('review_unknown_item');
    if (review.language !== packet.sourceLanguage) throw new TypeError('review_language_mismatch');
    const validated = validateReviewDecision(review, datasetSha256, packet.packetSha256);
    if (!['agent', 'reviewer', 'human'].includes(validated.reviewerType)) throw new TypeError('reviewer_type_not_allowed');
    const key = `${validated.itemId}\0${validated.reviewerId}`;
    if (seenReviewerItems.has(key)) throw new TypeError('review_duplicate_reviewer_item');
    seenReviewerItems.add(key);
    if (review.ledgerSequence !== index + 1) throw new TypeError('ledger_sequence_mismatch');
    if (review.proposedCorrectionSha256 !== undefined && !/^([a-f0-9]{64})$/.test(review.proposedCorrectionSha256)) throw new TypeError('correction_binding_hash_invalid');
    const expectedPrevious = previous ? sha256(JSON.stringify(previous)) : null;
    if ((review.previousReviewSha256 ?? null) !== expectedPrevious) throw new TypeError('ledger_chain_mismatch');
    previous = review;
  }
  return packetById;
}

/**
 * Build a review-derived subset. A group is included only when every one of
 * its six realizations has exclusively ACCEPT reviews after accepted review-
 * backed corrections. Invalid safety links are excluded rather than edited.
 */
export function certifyTrainingReview({ datasetFile, packetFile, ledgerFile, correctionFile, negativeFile, outputFile, reportFile, bindingFile }) {
  const rows = readJsonl(datasetFile);
  const datasetSha256 = sha256(fs.readFileSync(datasetFile));
  const reviews = readJsonl(ledgerFile);
  if (!packetFile || !fs.existsSync(packetFile)) throw new TypeError('review_packet_file_required');
  const packets = loadJsonLines(packetFile).map(verifyReviewPacket);
  if (new Set(packets.map((packet) => packet.itemId)).size !== packets.length) throw new TypeError('review_packet_duplicate_item');
  const packetById = validateLedger(reviews, packets, datasetSha256);
  const expectedItemIds = new Set(rows.map((row) => reviewItemIdForSourceId(row.id)));
  if (packets.length !== rows.length || packets.some((packet) => !expectedItemIds.has(packet.itemId))) throw new TypeError('review_packet_dataset_mismatch');
  const proposals = correctionFile && fs.existsSync(correctionFile) ? new Map(readJsonLinesBound(correctionFile, packetById, datasetSha256).map((row) => [row.itemId, row])) : new Map();
  const decisions = new Map();
  for (const review of reviews) {
    if (!decisions.has(review.itemId)) decisions.set(review.itemId, []);
    decisions.get(review.itemId).push(review);
  }
  const prepared = rows.map((row) => {
    const itemId = reviewItemIdForSourceId(row.id);
    const itemReviews = decisions.get(itemId) ?? [];
    const proposal = proposals.get(itemId);
    const expectedCorrectionHash = proposal?.action === 'CORRECTED' ? contentHash(proposal.correctedCandidate) : null;
    const correctionApprovals = itemReviews.filter((review) => review.decision === 'ACCEPT');
    const corrected = proposal?.action === 'CORRECTED' && correctionApprovals.length > 0 && correctionApprovals.every((review) => review.proposedCorrectionSha256 === expectedCorrectionHash);
    const hasCorrectionConflict = itemReviews.some((review) => ['REJECT', 'AMBIGUOUS'].includes(review.decision));
    const accepted = itemReviews.length > 0 && (itemReviews.every((review) => review.decision === 'ACCEPT') || (corrected && !hasCorrectionConflict));
    const candidateRow = correctedRow(row, corrected ? proposal : null);
    return { row: candidateRow, itemId, accepted, reviews: itemReviews.length, corrected, targetErrors: candidateRow ? validateTarget(candidateRow) : ['corrected_candidate_missing'] };
  });
  const byGroup = new Map();
  for (const entry of prepared) {
    const group = entry.row?.source?.semanticGroup;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(entry);
  }
  const eligibleGroups = new Set([...byGroup].filter(([, members]) => members.length === 6 && members.every((entry) => entry.accepted && entry.row && entry.targetErrors.length === 0)).map(([group]) => group));
  const negativeReviews = negativeFile && fs.existsSync(negativeFile) ? readJsonl(negativeFile) : [];
  const pairIds = new Map();
  for (const row of rows) for (const pairId of row.target?.criticalNegativePairIds ?? []) {
    if (!pairIds.has(pairId)) pairIds.set(pairId, new Set());
    pairIds.get(pairId).add(row.source.semanticGroup);
  }
  const rowsByGroup = new Map();
  for (const row of rows) {
    if (!rowsByGroup.has(row.source.semanticGroup)) rowsByGroup.set(row.source.semanticGroup, []);
    rowsByGroup.get(row.source.semanticGroup).push(row.id);
  }
  const knownNegativeReviews = new Map();
  for (const review of negativeReviews) {
    if (!review || typeof review !== 'object' || typeof review.pairId !== 'string' || !['DISTINCT', 'NOT_DISTINCT', 'AMBIGUOUS'].includes(review.decision)) throw new TypeError('negative_review_invalid');
    if (review.datasetSha256 !== datasetSha256) throw new TypeError('negative_review_dataset_hash_mismatch');
    if (!pairIds.has(review.pairId)) throw new TypeError('negative_review_unknown_pair');
    if (knownNegativeReviews.has(review.pairId)) throw new TypeError('negative_review_conflict');
    const groups = [...pairIds.get(review.pairId)];
    if (!Array.isArray(review.leftSourceRowIds) || !Array.isArray(review.rightSourceRowIds) || groups.length !== 2) throw new TypeError('negative_review_endpoints_required');
    const expected = groups.map((group) => rowsByGroup.get(group) ?? []).map((ids) => [...ids].sort());
    const actual = [review.leftSourceRowIds, review.rightSourceRowIds].map((ids) => [...ids].sort());
    const matches = expected.some((ids) => JSON.stringify(ids) === JSON.stringify(actual[0])) && expected.some((ids) => JSON.stringify(ids) === JSON.stringify(actual[1])) && JSON.stringify(actual[0]) !== JSON.stringify(actual[1]);
    if (!matches) throw new TypeError('negative_review_endpoints_mismatch');
    knownNegativeReviews.set(review.pairId, review);
  }
  const safeNegativePairs = new Set([...knownNegativeReviews].filter(([, review]) => review.decision === 'DISTINCT').map(([pairId]) => pairId));
  const pairManifest = new Map([...pairIds].map(([pairId, groups]) => [pairId, { groups: [...groups], safe: safeNegativePairs.has(pairId) }]));
  const unsafeGroups = new Set([...pairManifest.values()].filter((pair) => !pair.safe).flatMap((pair) => pair.groups));
  const outputGroups = new Set([...eligibleGroups].filter((group) => !unsafeGroups.has(group)));
  const outputRows = prepared.filter((entry) => outputGroups.has(entry.row?.source?.semanticGroup)).map((entry) => entry.row);
  const outputRowIds = new Set(outputRows.map((row) => row.id));
  for (const pairId of [...safeNegativePairs]) {
    const review = knownNegativeReviews.get(pairId);
    if ([...review.leftSourceRowIds, ...review.rightSourceRowIds].some((id) => !outputRowIds.has(id))) safeNegativePairs.delete(pairId);
  }
  const bindings = prepared.filter((entry) => outputGroups.has(entry.row?.source?.semanticGroup)).map((entry) => ({
    outputRowId: entry.row.id,
    sourceRowId: entry.row.id,
    reviewItemId: entry.itemId,
    datasetSha256,
    reviewCount: entry.reviews,
    correctionApplied: entry.corrected,
    packetSha256s: [...new Set((decisions.get(entry.itemId) ?? []).map((review) => review.packetSha256))].sort()
  }));
  const rowErrors = outputRows.flatMap((row) => validateTrainingExample(row).map((error) => `${row.id}: ${error}`));
  const targetErrors = prepared.flatMap((entry) => entry.targetErrors.map((error) => `${entry.row?.id ?? entry.itemId}: ${error}`));
  rowErrors.push(...targetErrors);
  const splitErrors = validateConceptDisjointSplits(outputRows);
  if (outputFile) writeAtomic(outputFile, outputRows.map((row) => JSON.stringify(row)).join('\n') + (outputRows.length ? '\n' : ''));
  if (bindingFile) writeAtomic(bindingFile, bindings.map((binding) => JSON.stringify(binding)).join('\n') + (bindings.length ? '\n' : ''));
  const report = {
    format: 'openlunum-certified-training-review/0.1',
    datasetSha256,
    inputRows: rows.length,
    submittedReviewRows: reviews.length,
    reviewedRows: prepared.filter((entry) => entry.reviews > 0).length,
    finalAcceptedRows: prepared.filter((entry) => entry.accepted).length,
    correctionsAppliedRows: prepared.filter((entry) => entry.corrected).length,
    eligibleGroupsBeforeSafety: eligibleGroups.size,
    outputGroups: outputGroups.size,
    outputRows: outputRows.length,
    excludedRows: rows.length - outputRows.length,
    rowBindingCount: bindings.length,
    pairReviews: negativeReviews.length,
    safeNegativePairs: safeNegativePairs.size,
    deterministicValidation: { rowErrors, splitErrors, pass: rowErrors.length === 0 && splitErrors.length === 0 },
    trainingGoldEligible: outputRows.length > 0 && rowErrors.length === 0 && splitErrors.length === 0 && safeNegativePairs.size > 0 && prepared.every((entry) => entry.reviews > 0),
    failureReasons: [
      ...(prepared.some((entry) => entry.reviews === 0) ? ['unreviewed_rows_excluded_or_present'] : []),
      ...(prepared.some((entry) => outputGroups.has(entry.row?.source?.semanticGroup) && !entry.accepted) ? ['non_accept_final_reviews_present'] : []),
      ...(safeNegativePairs.size === 0 ? ['no_reviewed_safe_critical_negative_pairs'] : []),
      ...(rowErrors.length || splitErrors.length ? ['deterministic_validation_failed'] : []),
      ...(outputRows.length !== bindings.length ? ['output_binding_mismatch'] : [])
    ],
    generatedAt: new Date().toISOString()
  };
  if (reportFile) writeAtomic(reportFile, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [datasetFile, packetFile, ledgerFile, correctionFile, negativeFile, outputFile, reportFile, bindingFile] = process.argv.slice(2);
  if (!datasetFile || !packetFile || !ledgerFile || !outputFile || !reportFile) throw new Error('usage: certify-training-review.mjs <dataset> <packets> <ledger> <corrections> <negative-reviews> <output> <report> <bindings>');
  console.log(JSON.stringify(certifyTrainingReview({ datasetFile: path.resolve(datasetFile), packetFile: path.resolve(packetFile), ledgerFile: path.resolve(ledgerFile), correctionFile: correctionFile && path.resolve(correctionFile), negativeFile: negativeFile && path.resolve(negativeFile), outputFile: path.resolve(outputFile), reportFile: path.resolve(reportFile), bindingFile: bindingFile && path.resolve(bindingFile) }), null, 2));
}
