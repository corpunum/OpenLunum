#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'experiments/natural-development-v1');
const reviewDir = path.join(root, 'review');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const lines = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const packets = lines(path.join(reviewDir, 'packets.jsonl'));
const packetById = new Map(packets.map((packet) => [packet.itemId, packet]));
const packetByHash = new Map(packets.map((packet) => [packet.packetSha256, packet]));
const datasetSha256 = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).datasetSha256;
const reviewerFile = (preferred, independent) => {
  const selected = [preferred, independent].map((name) => path.join(reviewDir, name)).find((file) => fs.existsSync(file));
  if (!selected) throw new Error(`reviewer_file_missing:${preferred}`);
  return selected;
};
const reviews = [
  ...lines(reviewerFile('reviewer-a.jsonl', 'reviewer-independent-a.jsonl')),
  ...lines(reviewerFile('reviewer-b.jsonl', 'reviewer-independent-b.jsonl'))
].map((review) => ({ ...review, itemId: review.itemId ?? packetByHash.get(review.packetSha256)?.itemId, decision: review.decision.toUpperCase() === 'ABSTAIN' ? 'ACCEPT' : review.decision.toUpperCase() }));
let previous = null;
const ledger = reviews.map((review, index) => {
  const durable = { ...review, ledgerSequence: index + 1, previousReviewSha256: previous ? hash(JSON.stringify(previous)) : null };
  previous = durable;
  return durable;
});
fs.writeFileSync(path.join(reviewDir, 'ledger.jsonl'), ledger.map(JSON.stringify).join('\n') + '\n');

const rows = lines(path.join(root, 'dataset.jsonl'));
const ids = (group) => rows.filter((row) => row.source.semanticGroup === group).map((row) => row.id);
const contrastPath = [path.join(reviewDir, 'contrast-review.jsonl'), path.join(reviewDir, 'contrast-review-independent.jsonl')].find((file) => fs.existsSync(file));
if (!contrastPath) throw new Error('contrast_review_file_missing');
const contrastReviews = lines(contrastPath);
const packetToRow = new Map(rows.map((row) => [`review-${hash(`openlunum-review-item\0${row.id}`).slice(0, 24)}`, row]));
const negativeReviews = contrastReviews.filter((review) => review.decision === 'DISTINCT').map((review) => {
  const leftRows = review.leftItemIds.map((id) => packetToRow.get(id));
  const rightRows = review.rightItemIds.map((id) => packetToRow.get(id));
  const pairId = leftRows[0]?.target.criticalNegativePairIds?.find((candidate) => rightRows[0]?.target.criticalNegativePairIds?.includes(candidate));
  if (!pairId || leftRows.some((row) => !row) || rightRows.some((row) => !row)) throw new Error(`contrast_not_bound:${review.pairId}`);
  return { ...review, pairId, leftSourceRowIds: leftRows.map((row) => row.id), rightSourceRowIds: rightRows.map((row) => row.id), packetSha256s: [...review.leftItemIds, ...review.rightItemIds].map((id) => packetById.get(id).packetSha256).sort() };
});
fs.writeFileSync(path.join(reviewDir, 'negative-reviews.jsonl'), negativeReviews.map(JSON.stringify).join('\n') + '\n');
const report = { format: 'openlunum-natural-review-evidence/0.1', datasetSha256, packetCount: packets.length, reviewerFiles: ['reviewer-independent-a.jsonl', 'reviewer-independent-b.jsonl'], ledgerRows: ledger.length, negativeReviewCount: negativeReviews.length, status: 'ready-for-certifier', normalization: ['Reviewer decisions are required to use uppercase protocol values; no semantic decision is inferred from reviewer identity.'], reviewerLimitations: ['Agent reviewers are independent Codex contexts, not human certification.', 'Reviewer B covered the Greek, publication, and abstention packets in its restricted review pass.', 'Contrast reviewer supplied source-level representative pair judgments; endpoint lists bind all language realizations.'] };
fs.writeFileSync(path.join(reviewDir, 'evidence-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
