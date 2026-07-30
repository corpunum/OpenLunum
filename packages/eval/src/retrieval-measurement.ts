/**
 * Cross-language retrieval measurement for R9.1, R9.2
 */

import { readFileSync } from 'node:fs';
import { compareSem, fingerprintSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export const RETRIEVAL_MEASUREMENT_VERSION = '0.1.0';

export interface RetrievalPairItem {
  queryText: string;
  queryLanguage: string;
  targetText: string;
  targetLanguage: string;
  semanticGroup: string;
  expectedMatch: boolean;
  querySem?: LunumSem;
  targetSem?: LunumSem;
}

export interface LanguagePairMetrics {
  pair: string;
  totalPairs: number;
  positivePairs: number;
  negativePairs: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  falsePositiveRate: number;
}

export interface RetrievalMeasurementReport {
  version: string;
  datasetPath: string;
  totalPairs: number;
  positivePairs: number;
  negativePairs: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  falsePositiveRate: number;
  byLanguagePair: Record<string, LanguagePairMetrics>;
  generatedAt: string;
}

function buildFallbackSem(text: string, semanticGroup: string): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: semanticGroup || 'statement',
    clauses: [
      {
        predicate: semanticGroup || 'match',
        roles: { text },
        negated: false
      }
    ]
  };
}

/**
 * Measure cross-language retrieval quality on a jsonl dataset.
 */
export function measureRetrievalQuality(datasetPath: string): RetrievalMeasurementReport {
  const content = readFileSync(datasetPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const items: RetrievalPairItem[] = lines.map((line) => JSON.parse(line));

  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  const pairBuckets = new Map<
    string,
    {
      tp: number;
      tn: number;
      fp: number;
      fn: number;
      positives: number;
      negatives: number;
    }
  >();

  for (const item of items) {
    const qLang = item.queryLanguage.toUpperCase();
    const tLang = item.targetLanguage.toUpperCase();
    const pairKey = `${qLang}-${tLang}`;

    if (!pairBuckets.has(pairKey)) {
      pairBuckets.set(pairKey, {
        tp: 0,
        tn: 0,
        fp: 0,
        fn: 0,
        positives: 0,
        negatives: 0
      });
    }
    const bucket = pairBuckets.get(pairKey)!;

    if (item.expectedMatch) {
      bucket.positives++;
    } else {
      bucket.negatives++;
    }

    const querySem = item.querySem ?? buildFallbackSem(item.queryText, item.semanticGroup);
    const targetSem = item.targetSem ?? buildFallbackSem(item.targetText, item.semanticGroup);

    const qFp = fingerprintSem(querySem);
    const tFp = fingerprintSem(targetSem);

    const comparison = compareSem(querySem, targetSem);

    const isFpMatch = qFp === tFp;
    const isSemMatch =
      comparison.exactCanonical || (comparison.featureRecall >= 0.8 && !comparison.hardMismatch);
    const predictedMatch = isFpMatch || isSemMatch;

    if (item.expectedMatch) {
      if (predictedMatch) {
        truePositives++;
        bucket.tp++;
      } else {
        falseNegatives++;
        bucket.fn++;
      }
    } else {
      if (predictedMatch) {
        falsePositives++;
        bucket.fp++;
      } else {
        trueNegatives++;
        bucket.tn++;
      }
    }
  }

  const positivePairs = truePositives + falseNegatives;
  const negativePairs = trueNegatives + falsePositives;
  const totalPairs = items.length;

  const precision =
    truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1.0;
  const recall =
    truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0.0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;
  const falsePositiveRate =
    falsePositives + trueNegatives > 0 ? falsePositives / (falsePositives + trueNegatives) : 0.0;

  const byLanguagePair: Record<string, LanguagePairMetrics> = {};

  for (const [pair, b] of pairBuckets.entries()) {
    const pairPrecision = b.tp + b.fp > 0 ? b.tp / (b.tp + b.fp) : 1.0;
    const pairRecall = b.tp + b.fn > 0 ? b.tp / (b.tp + b.fn) : 0.0;
    const pairF1 =
      pairPrecision + pairRecall > 0
        ? (2 * pairPrecision * pairRecall) / (pairPrecision + pairRecall)
        : 0.0;
    const pairFpr = b.fp + b.tn > 0 ? b.fp / (b.fp + b.tn) : 0.0;

    byLanguagePair[pair] = {
      pair,
      totalPairs: b.positives + b.negatives,
      positivePairs: b.positives,
      negativePairs: b.negatives,
      truePositives: b.tp,
      trueNegatives: b.tn,
      falsePositives: b.fp,
      falseNegatives: b.fn,
      precision: pairPrecision,
      recall: pairRecall,
      f1: pairF1,
      falsePositiveRate: pairFpr
    };
  }

  return {
    version: RETRIEVAL_MEASUREMENT_VERSION,
    datasetPath,
    totalPairs,
    positivePairs,
    negativePairs,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    falsePositiveRate,
    byLanguagePair,
    generatedAt: new Date().toISOString()
  };
}
