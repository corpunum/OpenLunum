/**
 * Tests for the #356 (readiness R5.4) threshold-sweep module.
 *
 * `computeThresholdSweep` is a pure function over already-scored pairs, so
 * it is tested directly against small hand-built fixtures for correctness
 * (precision/recall/F1 arithmetic, threshold boundary behavior). Separately,
 * this file asserts the ACTUAL corpus (mutation v1 + v2 + held-out) is
 * loadable through `buildLabeledPairs` / `scorePairs` and that the frozen
 * 0.8 threshold is always present in `SWEEP_THRESHOLDS` (the module measures
 * that threshold, never changes it).
 *
 * `runThresholdSweep` (which writes a timestamped report to
 * reports/experiments/threshold-sweep/) is exercised by hand once per
 * meaningful corpus change to produce a committed report artifact -- it is
 * NOT re-run on every test invocation, to avoid non-deterministic
 * timestamped output churning the repo on every `pnpm test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SWEEP_THRESHOLDS,
  computeThresholdSweep,
  buildLabeledPairs,
  scorePairs,
  loadThresholdSweepDatasets,
  type ScoredPair
} from '../src/threshold-sweep.js';
import { findWorkspaceRoot } from '../src/io.js';

test('SWEEP_THRESHOLDS includes the frozen 0.8 near-semantic threshold', () => {
  assert.ok(SWEEP_THRESHOLDS.includes(0.8), 'the sweep must measure the frozen threshold, even though it never changes it');
  assert.ok(SWEEP_THRESHOLDS.length >= 5, 'expected a genuine range of thresholds, not just one or two points');
  for (const threshold of SWEEP_THRESHOLDS) {
    assert.ok(threshold >= 0 && threshold <= 1, `threshold ${threshold} out of [0,1] range`);
  }
});

test('computeThresholdSweep: perfect separation yields precision=1, recall=1 at a threshold between the clusters', () => {
  const scored: ScoredPair[] = [
    { id: 'p1', label: 'positive', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.95, hardCompatible: true },
    { id: 'p2', label: 'positive', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.9, hardCompatible: true },
    { id: 'n1', label: 'negative', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.3, hardCompatible: true },
    { id: 'n2', label: 'negative', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.1, hardCompatible: true }
  ];
  const [metrics] = computeThresholdSweep(scored, [0.6]);
  assert.equal(metrics!.truePositive, 2);
  assert.equal(metrics!.falsePositive, 0);
  assert.equal(metrics!.falseNegative, 0);
  assert.equal(metrics!.trueNegative, 2);
  assert.equal(metrics!.precision, 1);
  assert.equal(metrics!.recall, 1);
  assert.equal(metrics!.f1, 1);
  assert.equal(metrics!.accuracy, 1);
});

test('computeThresholdSweep: raising the threshold past a true positive turns it into a false negative (recall drops, precision unaffected or improves)', () => {
  const scored: ScoredPair[] = [
    { id: 'p1', label: 'positive', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.82, hardCompatible: true },
    { id: 'n1', label: 'negative', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.5, hardCompatible: true }
  ];
  const [low, high] = computeThresholdSweep(scored, [0.8, 0.9]);
  assert.equal(low!.truePositive, 1);
  assert.equal(low!.recall, 1);
  assert.equal(high!.truePositive, 0);
  assert.equal(high!.falseNegative, 1);
  assert.equal(high!.recall, 0);
});

test('computeThresholdSweep: lowering the threshold past a negative turns it into a false positive (precision drops)', () => {
  const scored: ScoredPair[] = [
    { id: 'p1', label: 'positive', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.95, hardCompatible: true },
    { id: 'n1', label: 'negative', source: 'fixture', semA: {} as never, semB: {} as never, similarity: 0.55, hardCompatible: true }
  ];
  const [high, low] = computeThresholdSweep(scored, [0.9, 0.5]);
  assert.equal(high!.falsePositive, 0);
  assert.equal(high!.precision, 1);
  assert.equal(low!.falsePositive, 1);
  assert.ok(low!.precision < 1);
});

test('computeThresholdSweep: empty input yields defined (non-NaN) precision/recall for every threshold', () => {
  const metrics = computeThresholdSweep([], [0.5, 0.8]);
  for (const row of metrics) {
    assert.ok(Number.isFinite(row.precision));
    assert.ok(Number.isFinite(row.recall));
    assert.ok(Number.isFinite(row.f1));
    assert.ok(Number.isFinite(row.accuracy));
  }
});

test('actual corpus: buildLabeledPairs loads v1+v2 mutation corpus and held-out set into a combined pair set with both labels present', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasets = await loadThresholdSweepDatasets(workspaceRoot);
  const pairs = buildLabeledPairs(datasets);
  assert.ok(pairs.length > 100, `expected a substantial combined corpus, got ${pairs.length} pairs`);
  const positive = pairs.filter((pair) => pair.label === 'positive');
  const negative = pairs.filter((pair) => pair.label === 'negative');
  assert.ok(positive.length > 0, 'expected at least one positive pair (from the held-out set)');
  assert.ok(negative.length > 0, 'expected negative pairs (from the mutation corpora)');
});

test('actual corpus: scorePairs + computeThresholdSweep run end-to-end without error and produce a monotonic-ish precision curve', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasets = await loadThresholdSweepDatasets(workspaceRoot);
  const pairs = buildLabeledPairs(datasets);
  const scored = scorePairs(pairs);
  const sweep = computeThresholdSweep(scored);
  assert.equal(sweep.length, SWEEP_THRESHOLDS.length);
  const frozen = sweep.find((row) => row.threshold === 0.8);
  assert.ok(frozen, '0.8 must be present in the computed sweep');
  // Recall is non-increasing as the threshold rises (raising the bar for a
  // "match" can never turn a false negative back into a true positive).
  for (let index = 1; index < sweep.length; index += 1) {
    assert.ok(sweep[index]!.recall <= sweep[index - 1]!.recall + 1e-9, `recall increased when threshold rose from ${sweep[index - 1]!.threshold} to ${sweep[index]!.threshold}`);
  }
});
