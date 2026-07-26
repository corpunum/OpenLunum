/**
 * Threshold sweep for the near-semantic scorer (#356, readiness R5.4).
 *
 * Measures precision/recall of `NearSemanticFingerprintGenerator` /
 * `compareSem` across a RANGE of thresholds, using two independent
 * gold-labeled sources:
 *
 *   1. The mutation-tagged false-positive corpora (#328's
 *      `mutation-false-positive-v1.jsonl` and #356's
 *      `mutation-false-positive-v2.jsonl`): every item is a source/mutation
 *      pair whose meaning was deliberately, minimally changed, so every pair
 *      is a NEGATIVE (should not match) by dataset construction.
 *   2. #356's held-out `scorer-eval-heldout-v1.jsonl` (R5.3): independent
 *      positive AND negative pairs, hand-authored to test the scorer's
 *      general behavior and NOT derived from #346's role-binding fix.
 *
 * This module makes NO live model calls -- every comparison is gold LunumSem
 * against gold LunumSem, entirely deterministic. It does not change
 * `near-semantic-fingerprints.ts`, `compare.ts`, or the 0.8 threshold; it
 * only measures the EXISTING, unmodified scorer at a range of candidate
 * thresholds and reports the numbers. Whether to ever change the frozen 0.8
 * threshold is an owner calibration decision, not something this module
 * decides.
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { NearSemanticFingerprintGenerator } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File, writeJson } from './io.js';

export const SWEEP_THRESHOLDS: readonly number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0];

export type PairLabel = 'positive' | 'negative';

export interface LabeledPair {
  id: string;
  label: PairLabel;
  source: string;
  semA: LunumSem;
  semB: LunumSem;
}

interface MutationDatasetItem {
  id: string;
  sourceLanguage: string;
  sourceText: string;
  goldSem: LunumSem;
  sourceItemId: string;
  mutationType: string;
  protectedLiterals?: string[];
}

interface HeldoutPairItem {
  id: string;
  label: PairLabel;
  sourceLanguage: string;
  textA: string;
  textB: string;
  semA: LunumSem;
  semB: LunumSem;
  expectedSimilar: boolean;
  rationale: string;
}

/**
 * Every item in a mutation-tagged false-positive corpus is, by construction,
 * a NEGATIVE pair against the source item it was mutated from: the dataset
 * exists specifically because its `semanticDifference` field asserts the
 * meaning genuinely changed.
 */
export function mutationCorpusToLabeledPairs(
  sourceLabel: string,
  mutationItems: MutationDatasetItem[],
  sourceItems: { id: string; goldSem: LunumSem }[]
): LabeledPair[] {
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const pairs: LabeledPair[] = [];
  for (const item of mutationItems) {
    const source = sourceById.get(item.sourceItemId);
    if (!source) throw new Error(`${sourceLabel}: ${item.id} references unknown sourceItemId '${item.sourceItemId}'`);
    pairs.push({ id: item.id, label: 'negative', source: sourceLabel, semA: source.goldSem, semB: item.goldSem });
  }
  return pairs;
}

export function heldoutToLabeledPairs(sourceLabel: string, items: HeldoutPairItem[]): LabeledPair[] {
  return items.map((item) => ({ id: item.id, label: item.label, source: sourceLabel, semA: item.semA, semB: item.semB }));
}

export interface ScoredPair extends LabeledPair {
  similarity: number;
  hardCompatible: boolean;
}

export function scorePairs(pairs: LabeledPair[]): ScoredPair[] {
  // Threshold used to construct the generator is irrelevant to the raw
  // similarity score it computes -- `compareSem(...).similarity` does not
  // depend on `this.threshold`, only the derived `.similar` boolean does.
  // We read the raw score once per pair and apply candidate thresholds
  // ourselves in `computeThresholdSweep`, so every threshold in the sweep
  // is evaluated against the exact same underlying scorer output.
  const generator = new NearSemanticFingerprintGenerator(0.8);
  return pairs.map((pair) => {
    const result = generator.compareSem(pair.semA, pair.semB, {});
    return { ...pair, similarity: result.similarity, hardCompatible: result.hardCompatible ?? false };
  });
}

export interface ThresholdMetrics {
  threshold: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

export function computeThresholdSweep(scored: ScoredPair[], thresholds: readonly number[] = SWEEP_THRESHOLDS): ThresholdMetrics[] {
  return thresholds.map((threshold) => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let trueNegative = 0;
    for (const pair of scored) {
      const predictedPositive = pair.similarity >= threshold;
      const actualPositive = pair.label === 'positive';
      if (predictedPositive && actualPositive) truePositive += 1;
      else if (predictedPositive && !actualPositive) falsePositive += 1;
      else if (!predictedPositive && actualPositive) falseNegative += 1;
      else trueNegative += 1;
    }
    const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : 1;
    const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 1;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const accuracy = scored.length > 0 ? (truePositive + trueNegative) / scored.length : 1;
    return { threshold, truePositive, falsePositive, falseNegative, trueNegative, precision, recall, f1, accuracy };
  });
}

export interface ThresholdSweepDatasets {
  mutationV1: MutationDatasetItem[];
  mutationV1Source: { id: string; goldSem: LunumSem }[];
  mutationV2: MutationDatasetItem[];
  mutationV2Source: { id: string; goldSem: LunumSem }[];
  heldout: HeldoutPairItem[];
}

export async function loadThresholdSweepDatasets(workspaceRoot: string): Promise<ThresholdSweepDatasets> {
  const [mutationV1, mutationV1Source, mutationV2, mutationV2Source, heldoutRaw] = await Promise.all([
    loadDataset(path.join(workspaceRoot, 'datasets/adversarial/mutation-false-positive-v1.jsonl')),
    loadDataset(path.join(workspaceRoot, 'datasets/dev/multilingual-core-v1.jsonl')),
    loadDataset(path.join(workspaceRoot, 'datasets/adversarial/mutation-false-positive-v2.jsonl')),
    loadDataset(path.join(workspaceRoot, 'datasets/dev/synthetic-mutation-sources-v1.jsonl')),
    loadDataset(path.join(workspaceRoot, 'datasets/dev/scorer-eval-heldout-v1.jsonl'))
  ]);
  return {
    mutationV1: mutationV1 as unknown as MutationDatasetItem[],
    mutationV1Source: mutationV1Source as unknown as { id: string; goldSem: LunumSem }[],
    mutationV2: mutationV2 as unknown as MutationDatasetItem[],
    mutationV2Source: mutationV2Source as unknown as { id: string; goldSem: LunumSem }[],
    heldout: heldoutRaw as unknown as HeldoutPairItem[]
  };
}

export function buildLabeledPairs(datasets: ThresholdSweepDatasets): LabeledPair[] {
  return [
    ...mutationCorpusToLabeledPairs('mutation-false-positive-v1', datasets.mutationV1, datasets.mutationV1Source),
    ...mutationCorpusToLabeledPairs('mutation-false-positive-v2', datasets.mutationV2, datasets.mutationV2Source),
    ...heldoutToLabeledPairs('scorer-eval-heldout-v1', datasets.heldout)
  ];
}

export interface ThresholdSweepReport {
  runId: string;
  generatedAt: string;
  baselineCommit: string;
  datasets: { path: string; sha256: string; items: number }[];
  pairCounts: { total: number; positive: number; negative: number };
  sweep: ThresholdMetrics[];
  frozenThreshold: { threshold: number; metrics: ThresholdMetrics };
  pairs: { id: string; source: string; label: PairLabel; similarity: number; hardCompatible: boolean }[];
}

export async function runThresholdSweep(workspaceRoot?: string): Promise<{ report: ThresholdSweepReport; outputDirectory: string }> {
  const root = workspaceRoot ?? (await findWorkspaceRoot());
  const datasets = await loadThresholdSweepDatasets(root);
  const pairs = buildLabeledPairs(datasets);
  const scored = scorePairs(pairs);
  const sweep = computeThresholdSweep(scored);
  const frozenMetrics = sweep.find((m) => m.threshold === 0.8);
  if (!frozenMetrics) throw new Error('0.8 must be included in SWEEP_THRESHOLDS -- the frozen near-semantic threshold is not changed by this module, only measured');

  let baselineCommit = 'UNCOMMITTED';
  try {
    baselineCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* non-git export */ }

  const datasetPaths = [
    'datasets/adversarial/mutation-false-positive-v1.jsonl',
    'datasets/dev/multilingual-core-v1.jsonl',
    'datasets/adversarial/mutation-false-positive-v2.jsonl',
    'datasets/dev/synthetic-mutation-sources-v1.jsonl',
    'datasets/dev/scorer-eval-heldout-v1.jsonl'
  ];
  const datasetInfo = await Promise.all(
    datasetPaths.map(async (relativePath) => ({
      path: relativePath,
      sha256: await sha256File(path.join(root, relativePath)),
      items: (await loadDataset(path.join(root, relativePath))).length
    }))
  );

  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const report: ThresholdSweepReport = {
    runId,
    generatedAt: new Date().toISOString(),
    baselineCommit,
    datasets: datasetInfo,
    pairCounts: {
      total: pairs.length,
      positive: pairs.filter((pair) => pair.label === 'positive').length,
      negative: pairs.filter((pair) => pair.label === 'negative').length
    },
    sweep,
    frozenThreshold: { threshold: 0.8, metrics: frozenMetrics },
    pairs: scored.map((pair) => ({ id: pair.id, source: pair.source, label: pair.label, similarity: pair.similarity, hardCompatible: pair.hardCompatible }))
  };

  const outputDirectory = path.join(root, 'reports/experiments/threshold-sweep', runId);
  await mkdir(outputDirectory, { recursive: true });
  await writeJson(path.join(outputDirectory, 'summary.json'), report);
  await writeFile(path.join(outputDirectory, 'sweep.jsonl'), sweep.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await writeFile(path.join(outputDirectory, 'pairs.jsonl'), report.pairs.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await writeFile(path.join(outputDirectory, 'report.md'), renderReportMarkdown(report), 'utf8');

  return { report, outputDirectory };
}

function renderReportMarkdown(report: ThresholdSweepReport): string {
  const lines: string[] = [];
  lines.push('# Near-semantic scorer threshold sweep (#356, readiness R5.4)');
  lines.push('');
  lines.push(`- Run: \`${report.runId}\` (${report.generatedAt})`);
  lines.push(`- Baseline commit: \`${report.baselineCommit}\``);
  lines.push('- No live model was called. Every comparison is gold LunumSem against gold LunumSem, entirely deterministic.');
  lines.push('- **The 0.8 near-semantic threshold was NOT changed.** This is measurement only.');
  lines.push('');
  lines.push('## Datasets');
  lines.push('');
  lines.push('| dataset | items | sha256 |');
  lines.push('|---|---|---|');
  for (const dataset of report.datasets) lines.push(`| ${dataset.path} | ${dataset.items} | \`${dataset.sha256}\` |`);
  lines.push('');
  lines.push(`## Pairs: ${report.pairCounts.total} total (${report.pairCounts.positive} positive / ${report.pairCounts.negative} negative)`);
  lines.push('');
  lines.push('Negative pairs come from the mutation-tagged false-positive corpora (every mutated item vs its source, all deliberately non-matching by construction). Positive AND negative pairs also come from the independent, held-out `scorer-eval-heldout-v1.jsonl` set (#356 R5.3), which is not derived from #346\'s role-binding fix.');
  lines.push('');
  lines.push('## Precision / recall across thresholds');
  lines.push('');
  lines.push('| threshold | TP | FP | FN | TN | precision | recall | F1 | accuracy |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const row of report.sweep) {
    const marker = row.threshold === 0.8 ? ' **(frozen)**' : '';
    lines.push(`| ${row.threshold.toFixed(2)}${marker} | ${row.truePositive} | ${row.falsePositive} | ${row.falseNegative} | ${row.trueNegative} | ${row.precision.toFixed(3)} | ${row.recall.toFixed(3)} | ${row.f1.toFixed(3)} | ${row.accuracy.toFixed(3)} |`);
  }
  lines.push('');
  lines.push('## Frozen threshold (0.8) detail');
  lines.push('');
  const frozen = report.frozenThreshold.metrics;
  lines.push(`At the frozen 0.8 threshold: precision ${frozen.precision.toFixed(3)}, recall ${frozen.recall.toFixed(3)}, F1 ${frozen.f1.toFixed(3)}, accuracy ${frozen.accuracy.toFixed(3)} (${frozen.falsePositive} false positive${frozen.falsePositive === 1 ? '' : 's'} out of ${report.pairCounts.total} pairs).`);
  lines.push('');
  const falsePositivesAt08 = report.pairs.filter((pair) => pair.label === 'negative' && pair.similarity >= 0.8);
  if (falsePositivesAt08.length > 0) {
    lines.push('Pairs still scoring at or above 0.8 despite being labeled negative (still-live false positives at the frozen threshold):');
    lines.push('');
    for (const pair of falsePositivesAt08) lines.push(`- \`${pair.id}\` (${pair.source}): similarity ${pair.similarity.toFixed(3)}`);
    lines.push('');
  } else {
    lines.push('No negative pair scores at or above 0.8 -- zero false positives at the frozen threshold on this combined corpus.');
    lines.push('');
  }
  lines.push('## Net');
  lines.push('');
  lines.push('This is data only. `packages/core/src/near-semantic-fingerprints.ts`, `packages/core/src/compare.ts`, and the 0.8 threshold were not modified to produce or in response to these numbers. Whether to recalibrate the threshold given this precision/recall curve remains an owner decision.');
  lines.push('');
  return lines.join('\n');
}
