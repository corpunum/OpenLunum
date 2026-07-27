import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRetrievalDataset,
  loadMultilingualRecords,
  evaluateRetrievalPair,
  computePrecisionRecall,
  type CrossLanguageRetrievalItem,
  type PairResult,
} from '../src/cross-language-precision.js';

let dataset: CrossLanguageRetrievalItem[];

test('cross-language-retrieval: loads dataset with ≥24 positive and ≥6 negative pairs', async () => {
  dataset = await loadRetrievalDataset();
  const positive = dataset.filter(d => !d.negative);
  const negative = dataset.filter(d => d.negative);
  assert.ok(positive.length >= 24, `expected ≥24 positive pairs, got ${positive.length}`);
  assert.ok(negative.length >= 6, `expected ≥6 negative pairs, got ${negative.length}`);
});

test('cross-language-retrieval: covers multiple language pairs', async () => {
  if (!dataset) dataset = await loadRetrievalDataset();
  const pairs = new Set(dataset.map(d => `${d.queryLanguage}→${d.targetLanguage}`));
  assert.ok(pairs.size >= 4, `expected ≥4 language pairs, got ${pairs.size}: ${[...pairs].join(', ')}`);
});

test('cross-language-retrieval: covers multiple semantic groups', async () => {
  if (!dataset) dataset = await loadRetrievalDataset();
  const groups = new Set(dataset.map(d => d.semanticGroup));
  assert.ok(groups.size >= 6, `expected ≥6 semantic groups, got ${groups.size}`);
});

test('cross-language-retrieval: every item has queryId and rationale', async () => {
  if (!dataset) dataset = await loadRetrievalDataset();
  for (const item of dataset) {
    assert.ok(item.queryId, `${item.id} missing queryId`);
    assert.ok(item.rationale, `${item.id} missing rationale`);
  }
});

test('cross-language-retrieval: positive pairs reference existing multilingual records', async () => {
  if (!dataset) dataset = await loadRetrievalDataset();
  const records = await loadMultilingualRecords();
  const positive = dataset.filter(d => !d.negative);
  for (const item of positive) {
    assert.ok(records.has(item.queryId), `${item.id} references missing query record: ${item.queryId}`);
    for (const matchId of item.expectedMatchIds) {
      assert.ok(records.has(matchId), `${item.id} references missing match record: ${matchId}`);
    }
  }
});

test('cross-language-retrieval: fingerprints match within same semantic group', async () => {
  const records = await loadMultilingualRecords();
  if (!dataset) dataset = await loadRetrievalDataset();
  const positive = dataset.filter(d => !d.negative);
  const results: PairResult[] = positive.map(item => evaluateRetrievalPair(item, records));
  const matched = results.filter(r => r.fingerprintMatch);
  assert.ok(
    matched.length / positive.length >= 0.9,
    `expected ≥90% fingerprint match rate for positive pairs, got ${matched.length}/${positive.length}`,
  );
});

test('cross-language-retrieval: fingerprints do not match across different semantic groups', async () => {
  const records = await loadMultilingualRecords();
  if (!dataset) dataset = await loadRetrievalDataset();
  const negative = dataset.filter(d => d.negative);
  const results: PairResult[] = negative.map(item => evaluateRetrievalPair(item, records));
  const falslyMatched = results.filter(r => r.fingerprintMatch);
  assert.equal(falslyMatched.length, 0, `expected 0 false positives across groups, got ${falslyMatched.length}`);
});

test('cross-language-retrieval: precision/recall metrics computed per language pair', async () => {
  const records = await loadMultilingualRecords();
  if (!dataset) dataset = await loadRetrievalDataset();
  const results: PairResult[] = dataset.map(item => evaluateRetrievalPair(item, records));
  const summary = computePrecisionRecall(results);
  assert.ok(summary.byLanguagePair.length >= 4, `expected ≥4 language pairs in summary`);
  assert.ok(summary.overallPrecision >= 0.9, `precision too low: ${summary.overallPrecision}`);
  assert.ok(summary.overallRecall >= 0.8, `recall too low: ${summary.overallRecall}`);
  assert.ok(summary.overallF1 > 0, 'F1 should be positive');
});
