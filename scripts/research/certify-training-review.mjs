#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadJsonLines, validateTrainingExample, validateConceptDisjointSplits } from './training-program.mjs';
import { reviewItemIdForSourceId } from './training-review.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJsonl = (file) => loadJsonLines(file);

function correctedRow(row, proposal) {
  if (proposal?.action !== 'CORRECTED' || !proposal.correctedCandidate) return row;
  const candidate = proposal.correctedCandidate;
  if (candidate.outcome !== 'parse') return null;
  return { ...row, target: { ...row.target, outcome: 'parse', ir: candidate } };
}

/**
 * Build a review-derived subset. A group is included only when every one of
 * its six realizations has exclusively ACCEPT reviews after accepted review-
 * backed corrections. Invalid safety links are excluded rather than edited.
 */
export function certifyTrainingReview({ datasetFile, ledgerFile, correctionFile, negativeFile, outputFile, reportFile }) {
  const rows = readJsonl(datasetFile);
  const datasetSha256 = sha256(fs.readFileSync(datasetFile));
  const reviews = readJsonl(ledgerFile);
  const proposals = correctionFile && fs.existsSync(correctionFile) ? new Map(readJsonl(correctionFile).map((row) => [row.itemId, row])) : new Map();
  const decisions = new Map();
  for (const review of reviews) {
    if (review.datasetSha256 !== datasetSha256) throw new Error('review_dataset_hash_mismatch');
    if (!decisions.has(review.itemId)) decisions.set(review.itemId, []);
    decisions.get(review.itemId).push(review);
  }
  const prepared = rows.map((row) => {
    const itemId = reviewItemIdForSourceId(row.id);
    const itemReviews = decisions.get(itemId) ?? [];
    const proposal = proposals.get(itemId);
    const corrected = itemReviews.some((review) => ['correction-reviewer', 'final-correction-reviewer', 'rejected-correction-reviewer'].includes(review.reviewerId) && review.decision === 'ACCEPT');
    const finalCorrectionReject = itemReviews.some((review) => ['correction-reviewer', 'final-correction-reviewer', 'rejected-correction-reviewer'].includes(review.reviewerId) && ['REJECT', 'AMBIGUOUS'].includes(review.decision));
    const accepted = itemReviews.length > 0 && (itemReviews.every((review) => review.decision === 'ACCEPT') || (corrected && proposal?.action === 'CORRECTED' && !finalCorrectionReject));
    return { row: correctedRow(row, corrected ? proposal : null), itemId, accepted, reviews: itemReviews.length, corrected };
  });
  const byGroup = new Map();
  for (const entry of prepared) {
    const group = entry.row?.source?.semanticGroup;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(entry);
  }
  const eligibleGroups = new Set([...byGroup].filter(([, members]) => members.length === 6 && members.every((entry) => entry.accepted && entry.row)).map(([group]) => group));
  const negativeReviews = negativeFile && fs.existsSync(negativeFile) ? readJsonl(negativeFile) : [];
  const safeNegativePairs = new Set(negativeReviews.filter((review) => review.decision === 'DISTINCT').map((review) => review.pairId));
  const pairIds = new Map();
  for (const row of rows) for (const pairId of row.target?.criticalNegativePairIds ?? []) {
    if (!pairIds.has(pairId)) pairIds.set(pairId, new Set());
    pairIds.get(pairId).add(row.source.semanticGroup);
  }
  const pairManifest = new Map([...pairIds].map(([pairId, groups]) => [pairId, { groups: [...groups], safe: safeNegativePairs.has(pairId) }]));
  const unsafeGroups = new Set([...pairManifest.values()].filter((pair) => !pair.safe).flatMap((pair) => pair.groups));
  const outputGroups = new Set([...eligibleGroups].filter((group) => !unsafeGroups.has(group)));
  const outputRows = prepared.filter((entry) => outputGroups.has(entry.row.source.semanticGroup)).map((entry) => entry.row);
  const rowErrors = outputRows.flatMap((row) => validateTrainingExample(row).map((error) => `${row.id}: ${error}`));
  const splitErrors = validateConceptDisjointSplits(outputRows);
  if (outputFile) fs.writeFileSync(outputFile, outputRows.map((row) => JSON.stringify(row)).join('\n') + (outputRows.length ? '\n' : ''));
  const report = {
    format: 'openlunum-certified-training-review/0.1',
    datasetSha256,
    inputRows: rows.length,
    submittedReviewRows: reviews.length,
    reviewedRows: prepared.filter((entry) => entry.reviews > 0).length,
    acceptedRows: prepared.filter((entry) => entry.accepted).length,
    correctedRows: prepared.filter((entry) => entry.corrected).length,
    eligibleGroups: eligibleGroups.size,
    outputGroups: outputGroups.size,
    outputRows: outputRows.length,
    pairReviews: negativeReviews.length,
    safeNegativePairs: safeNegativePairs.size,
    deterministicValidation: { rowErrors, splitErrors, pass: rowErrors.length === 0 && splitErrors.length === 0 },
    trainingGoldEligible: outputRows.length > 0 && rowErrors.length === 0 && splitErrors.length === 0 && safeNegativePairs.size > 0 && prepared.every((entry) => entry.reviews > 0),
    failureReasons: [
      ...(prepared.some((entry) => entry.reviews === 0) ? ['unreviewed_rows_excluded_or_present'] : []),
      ...(prepared.some((entry) => !entry.accepted) ? ['non_accept_reviews_present'] : []),
      ...(safeNegativePairs.size === 0 ? ['no_reviewed_safe_critical_negative_pairs'] : []),
      ...(rowErrors.length || splitErrors.length ? ['deterministic_validation_failed'] : [])
    ],
    generatedAt: new Date().toISOString()
  };
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [datasetFile, ledgerFile, correctionFile, negativeFile, outputFile, reportFile] = process.argv.slice(2);
  if (!datasetFile || !ledgerFile || !outputFile || !reportFile) throw new Error('usage: certify-training-review.mjs <dataset> <ledger> <corrections> <negative-reviews> <output> <report>');
  console.log(JSON.stringify(certifyTrainingReview({ datasetFile: path.resolve(datasetFile), ledgerFile: path.resolve(ledgerFile), correctionFile: correctionFile && path.resolve(correctionFile), negativeFile: negativeFile && path.resolve(negativeFile), outputFile: path.resolve(outputFile), reportFile: path.resolve(reportFile) }), null, 2));
}
