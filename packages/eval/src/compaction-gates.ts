/**
 * Compaction quality gates (R7.7 — Issue #511).
 *
 * Evaluates a BenchmarkReport against configurable thresholds to catch
 * regressions in context compaction. Gates verify that:
 * - Preservation rate stays above minimum (input features survive compaction)
 * - Compression ratio meets minimum improvement target
 * - Natural fallback quality loss stays within tolerance
 * - Output preservation (downstream answer quality) stays above minimum
 */

import type { BenchmarkReport } from './context-compaction-benchmark.js';

export interface CompactionGateConfig {
  minPreservationRate: number;
  minCompressionImprovement: number;
  maxFallbackQualityLoss: number;
  minOutputPreservationRate: number;
}

export const DEFAULT_COMPACTION_GATES: CompactionGateConfig = {
  minPreservationRate: 0.95,
  minCompressionImprovement: 0.10,
  maxFallbackQualityLoss: 0.05,
  minOutputPreservationRate: 0.90,
};

export interface GateVerdict {
  name: string;
  passed: boolean;
  actual: number;
  threshold: number;
  direction: 'gte' | 'lte';
}

export interface GateResult {
  passed: boolean;
  verdicts: GateVerdict[];
  naturalFallbackSound: boolean;
}

export function evaluateCompactionGates(
  report: BenchmarkReport,
  config: CompactionGateConfig = DEFAULT_COMPACTION_GATES,
): GateResult {
  const verdicts: GateVerdict[] = [];

  const preservationRate = report.summary.preservationRate;
  verdicts.push({
    name: 'preservation_rate',
    passed: preservationRate >= config.minPreservationRate,
    actual: preservationRate,
    threshold: config.minPreservationRate,
    direction: 'gte',
  });

  const compressionImprovement = 1 - report.summary.compressionRatio;
  verdicts.push({
    name: 'compression_improvement',
    passed: compressionImprovement >= config.minCompressionImprovement,
    actual: compressionImprovement,
    threshold: config.minCompressionImprovement,
    direction: 'gte',
  });

  const outputPreservation = report.summary.preservationRate;
  verdicts.push({
    name: 'output_preservation',
    passed: outputPreservation >= config.minOutputPreservationRate,
    actual: outputPreservation,
    threshold: config.minOutputPreservationRate,
    direction: 'gte',
  });

  const naturalResults = report.results.filter(r => r.mode === 'natural');
  const lunumResults = report.results.filter(r => r.mode === 'lunum');
  const naturalOutputRate = naturalResults.length > 0
    ? naturalResults.filter(r => r.preservation).length / naturalResults.length
    : 1;
  const lunumOutputRate = lunumResults.length > 0
    ? lunumResults.filter(r => r.preservation).length / lunumResults.length
    : 1;
  const qualityLoss = Math.max(0, naturalOutputRate - lunumOutputRate);

  verdicts.push({
    name: 'fallback_quality_loss',
    passed: qualityLoss <= config.maxFallbackQualityLoss,
    actual: qualityLoss,
    threshold: config.maxFallbackQualityLoss,
    direction: 'lte',
  });

  const naturalFallbackSound = naturalOutputRate >= config.minOutputPreservationRate;

  return {
    passed: verdicts.every(v => v.passed),
    verdicts,
    naturalFallbackSound,
  };
}
