import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCorrectionMetrics,
  computeFallbackMetrics,
  identifyHotspots,
  generateTelemetryReport,
  type CorrectionEvent,
  type FallbackEvent,
  type TelemetryWindow,
} from '../src/correction-telemetry.js';

function makeCorrection(overrides: Partial<CorrectionEvent> = {}): CorrectionEvent {
  return {
    id: 'c-001',
    timestamp: '2026-08-01T00:00:00Z',
    correctionType: 'semantic-override',
    component: 'parser',
    originalOutput: 'original',
    correctedOutput: 'corrected',
    userId: 'user-1',
    sessionId: 'session-1',
    confidence: 0.85,
    gateName: 'negation-gate',
    ...overrides,
  };
}

function makeFallback(overrides: Partial<FallbackEvent> = {}): FallbackEvent {
  return {
    id: 'f-001',
    timestamp: '2026-08-01T00:00:00Z',
    trigger: 'low-confidence',
    component: 'parser',
    fallbackAction: 'natural-language-passthrough',
    originalError: 'confidence below threshold',
    recoverySuccessful: true,
    latencyMs: 150,
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('correction-telemetry', () => {
  describe('computeCorrectionMetrics', () => {
    it('computes metrics for corrections', () => {
      const corrections = [
        makeCorrection({ correctionType: 'semantic-override', confidence: 0.9 }),
        makeCorrection({ id: 'c-002', correctionType: 'literal-restore', confidence: 0.7 }),
        makeCorrection({ id: 'c-003', correctionType: 'semantic-override', confidence: 0.8 }),
      ];
      const metrics = computeCorrectionMetrics(corrections, 100);
      assert.equal(metrics.totalCorrections, 3);
      assert.equal(metrics.byType['semantic-override'], 2);
      assert.equal(metrics.byType['literal-restore'], 1);
      assert.equal(metrics.correctionRate, 0.03);
      assert.ok(Math.abs(metrics.averageConfidenceAtCorrection - 0.8) < 0.001);
    });

    it('handles empty corrections', () => {
      const metrics = computeCorrectionMetrics([], 100);
      assert.equal(metrics.totalCorrections, 0);
      assert.equal(metrics.correctionRate, 0);
      assert.equal(metrics.averageConfidenceAtCorrection, 0);
    });
  });

  describe('computeFallbackMetrics', () => {
    it('computes metrics for fallbacks', () => {
      const fallbacks = [
        makeFallback({ latencyMs: 100, recoverySuccessful: true }),
        makeFallback({ id: 'f-002', latencyMs: 200, recoverySuccessful: true }),
        makeFallback({ id: 'f-003', latencyMs: 500, recoverySuccessful: false }),
      ];
      const metrics = computeFallbackMetrics(fallbacks);
      assert.equal(metrics.totalFallbacks, 3);
      assert.ok(Math.abs(metrics.recoveryRate - 2 / 3) < 0.001);
      assert.ok(Math.abs(metrics.averageLatencyMs - 266.67) < 1);
      assert.equal(metrics.p95LatencyMs, 500);
    });

    it('handles empty fallbacks', () => {
      const metrics = computeFallbackMetrics([]);
      assert.equal(metrics.totalFallbacks, 0);
      assert.equal(metrics.recoveryRate, 0);
      assert.equal(metrics.averageLatencyMs, 0);
    });
  });

  describe('identifyHotspots', () => {
    it('identifies components above threshold', () => {
      const corrections = [
        makeCorrection({ component: 'parser' }),
        makeCorrection({ id: 'c-002', component: 'parser' }),
        makeCorrection({ id: 'c-003', component: 'parser' }),
        makeCorrection({ id: 'c-004', component: 'renderer' }),
      ];
      const hotspots = identifyHotspots(corrections, [], 3);
      assert.equal(hotspots.length, 1);
      assert.equal(hotspots[0]!.component, 'parser');
      assert.equal(hotspots[0]!.eventCount, 3);
    });

    it('combines corrections and fallbacks', () => {
      const corrections = [
        makeCorrection({ component: 'parser' }),
        makeCorrection({ id: 'c-002', component: 'parser' }),
      ];
      const fallbacks = [
        makeFallback({ component: 'parser' }),
      ];
      const hotspots = identifyHotspots(corrections, fallbacks, 3);
      assert.equal(hotspots.length, 1);
      assert.equal(hotspots[0]!.eventCount, 3);
    });

    it('returns empty when no hotspots', () => {
      const hotspots = identifyHotspots([makeCorrection()], [], 5);
      assert.equal(hotspots.length, 0);
    });

    it('assigns urgency levels', () => {
      const corrections = Array.from({ length: 10 }, (_, i) =>
        makeCorrection({ id: `c-${i}`, component: 'parser' }),
      );
      const hotspots = identifyHotspots(corrections, [], 3);
      assert.equal(hotspots[0]!.urgency, 'high');
    });
  });

  describe('generateTelemetryReport', () => {
    it('generates a complete report', () => {
      const window: TelemetryWindow = {
        startTime: '2026-08-01T00:00:00Z',
        endTime: '2026-08-01T01:00:00Z',
        corrections: [
          makeCorrection({ confidence: 0.9 }),
          makeCorrection({ id: 'c-002', correctionType: 'literal-restore' }),
        ],
        fallbacks: [
          makeFallback({ recoverySuccessful: true }),
        ],
      };
      const report = generateTelemetryReport(window, 10);
      assert.equal(report.corrections.totalCorrections, 2);
      assert.equal(report.fallbacks.totalFallbacks, 1);
      assert.ok(report.corrections.correctionRate > 0);
    });

    it('adds high correction rate recommendation', () => {
      const corrections = Array.from({ length: 12 }, (_, i) =>
        makeCorrection({ id: `c-${i}` }),
      );
      const window: TelemetryWindow = {
        startTime: '2026-08-01T00:00:00Z',
        endTime: '2026-08-01T01:00:00Z',
        corrections,
        fallbacks: [],
      };
      const report = generateTelemetryReport(window, 100);
      assert.ok(report.recommendations.some(r => r.includes('exceeds 10%')));
    });

    it('adds high-confidence correction recommendation', () => {
      const corrections = [
        makeCorrection({ confidence: 0.95 }),
        makeCorrection({ id: 'c-002', confidence: 0.92 }),
      ];
      const window: TelemetryWindow = {
        startTime: '2026-08-01T00:00:00Z',
        endTime: '2026-08-01T01:00:00Z',
        corrections,
        fallbacks: [],
      };
      const report = generateTelemetryReport(window, 100);
      assert.ok(report.recommendations.some(r => r.includes('systematic bias')));
    });

    it('adds low recovery recommendation', () => {
      const fallbacks = [
        makeFallback({ recoverySuccessful: false }),
        makeFallback({ id: 'f-002', recoverySuccessful: false }),
      ];
      const window: TelemetryWindow = {
        startTime: '2026-08-01T00:00:00Z',
        endTime: '2026-08-01T01:00:00Z',
        corrections: [],
        fallbacks,
      };
      const report = generateTelemetryReport(window, 100);
      assert.ok(report.recommendations.some(r => r.includes('recovery rate below 90%')));
    });
  });
});
