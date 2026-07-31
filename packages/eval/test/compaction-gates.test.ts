import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCompactionGates,
  DEFAULT_COMPACTION_GATES,
  type CompactionGateConfig,
} from '../src/compaction-gates.js';
import type { BenchmarkReport, BenchmarkResult } from '../src/context-compaction-benchmark.js';

function makeResult(mode: 'natural' | 'lunum' | 'mixed', overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    taskId: 'test-1',
    mode,
    tokenCount: mode === 'natural' ? 100 : 70,
    tokenCountMethod: 'calibrated',
    preservedLiterals: true,
    preservedRoles: true,
    preservedNegation: true,
    preservedModality: true,
    contextSizeBytes: mode === 'natural' ? 400 : 280,
    outputPreserves: true,
    outputKeywordOverlap: 0.8,
    taskSuccess: true,
    ...overrides,
  };
}

function makeReport(overrides: Partial<BenchmarkReport['summary']> = {}, results?: BenchmarkResult[]): BenchmarkReport {
  const defaultResults = results ?? [
    makeResult('natural'),
    makeResult('lunum'),
    makeResult('mixed'),
  ];
  return {
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    tasks: [],
    results: defaultResults,
    summary: {
      naturalAvgTokens: 100,
      lunumAvgTokens: 70,
      mixedAvgTokens: 85,
      compressionRatio: 0.7,
      preservationRate: 1.0,
      outputPreservationRate: 1.0,
      avgKeywordOverlap: 0.8,
      naturalTokensPerSuccess: 100,
      lunumTokensPerSuccess: 70,
      mixedTokensPerSuccess: 85,
      ...overrides,
    },
  };
}

describe('compaction gates', () => {
  it('default thresholds have expected values', () => {
    assert.equal(DEFAULT_COMPACTION_GATES.minPreservationRate, 0.95);
    assert.equal(DEFAULT_COMPACTION_GATES.minCompressionImprovement, 0.10);
    assert.equal(DEFAULT_COMPACTION_GATES.maxFallbackQualityLoss, 0.05);
    assert.equal(DEFAULT_COMPACTION_GATES.minOutputPreservationRate, 0.90);
  });

  it('all gates pass for a healthy report', () => {
    const report = makeReport({ preservationRate: 1.0, compressionRatio: 0.7, outputPreservationRate: 1.0 });
    const result = evaluateCompactionGates(report);
    assert.equal(result.passed, true);
    assert.equal(result.verdicts.length, 4);
    assert.ok(result.verdicts.every(v => v.passed));
    assert.equal(result.naturalFallbackSound, true);
  });

  it('fails when preservation rate is below threshold', () => {
    const report = makeReport({ preservationRate: 0.90 });
    const result = evaluateCompactionGates(report);
    assert.equal(result.passed, false);
    const v = result.verdicts.find(v => v.name === 'preservation_rate')!;
    assert.equal(v.passed, false);
    assert.equal(v.actual, 0.90);
    assert.equal(v.threshold, 0.95);
  });

  it('fails when compression improvement is below threshold', () => {
    const report = makeReport({ compressionRatio: 0.95 });
    const result = evaluateCompactionGates(report);
    assert.equal(result.passed, false);
    const v = result.verdicts.find(v => v.name === 'compression_improvement')!;
    assert.equal(v.passed, false);
    assert.ok(v.actual < 0.10);
  });

  it('fails when output preservation is below threshold', () => {
    const report = makeReport({ outputPreservationRate: 0.80 });
    const result = evaluateCompactionGates(report);
    assert.equal(result.passed, false);
    const v = result.verdicts.find(v => v.name === 'output_preservation')!;
    assert.equal(v.passed, false);
  });

  it('fails when fallback quality loss exceeds threshold', () => {
    const results = [
      makeResult('natural', { outputPreserves: true }),
      makeResult('lunum', { outputPreserves: false }),
      makeResult('mixed'),
    ];
    const report = makeReport({ outputPreservationRate: 0.9 }, results);
    const result = evaluateCompactionGates(report);
    const v = result.verdicts.find(v => v.name === 'fallback_quality_loss')!;
    assert.equal(v.passed, false);
    assert.equal(v.actual, 1.0);
  });

  it('natural fallback is sound when natural output preservation meets threshold', () => {
    const results = [
      makeResult('natural', { outputPreserves: true }),
      makeResult('lunum', { outputPreserves: false }),
    ];
    const report = makeReport({ outputPreservationRate: 0.9 }, results);
    const result = evaluateCompactionGates(report);
    assert.equal(result.naturalFallbackSound, true);
  });

  it('natural fallback is unsound when natural output preservation is below threshold', () => {
    const results = [
      makeResult('natural', { outputPreserves: false }),
      makeResult('lunum', { outputPreserves: true }),
    ];
    const report = makeReport({ outputPreservationRate: 0.5 }, results);
    const result = evaluateCompactionGates(report);
    assert.equal(result.naturalFallbackSound, false);
  });

  it('accepts custom gate config', () => {
    const loose: CompactionGateConfig = {
      minPreservationRate: 0.50,
      minCompressionImprovement: 0.01,
      maxFallbackQualityLoss: 0.50,
      minOutputPreservationRate: 0.50,
    };
    const report = makeReport({ preservationRate: 0.60, compressionRatio: 0.95, outputPreservationRate: 0.60 });
    const result = evaluateCompactionGates(report, loose);
    assert.equal(result.passed, true);
  });

  it('each verdict has correct direction field', () => {
    const report = makeReport();
    const result = evaluateCompactionGates(report);
    const directions = new Map(result.verdicts.map(v => [v.name, v.direction]));
    assert.equal(directions.get('preservation_rate'), 'gte');
    assert.equal(directions.get('compression_improvement'), 'gte');
    assert.equal(directions.get('output_preservation'), 'gte');
    assert.equal(directions.get('fallback_quality_loss'), 'lte');
  });
});
