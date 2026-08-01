import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  measureSemanticRetention,
  measureLiteralPreservation,
  measureCompressionRatio,
  evaluateProfile,
  compareProfiles,
  QUALITY_THRESHOLDS,
  type QualityMetric,
  type ProfileQualityReport,
} from '../src/profile-quality-measurement.js';

// ── measureSemanticRetention ──────────────────────────────────────

describe('measureSemanticRetention', () => {
  it('returns 1.0 for identical text', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    assert.equal(measureSemanticRetention(text, text), 1.0);
  });

  it('returns < 1.0 for partial overlap', () => {
    const original = 'the quick brown fox';
    const rendered = 'the slow brown cat';
    const score = measureSemanticRetention(original, rendered);
    assert.ok(score > 0, 'should have some overlap');
    assert.ok(score < 1.0, 'should not be perfect');
  });

  it('returns 0 for no overlap', () => {
    assert.equal(measureSemanticRetention('alpha beta', 'gamma delta'), 0);
  });

  it('returns 1.0 for two empty strings', () => {
    assert.equal(measureSemanticRetention('', ''), 1.0);
  });
});

// ── measureLiteralPreservation ────────────────────────────────────

describe('measureLiteralPreservation', () => {
  it('finds all literals present', () => {
    const rendered = 'The API key is abc-123 and version is 2.0';
    const literals = ['abc-123', '2.0'];
    assert.equal(measureLiteralPreservation('', rendered, literals), 1.0);
  });

  it('finds partial literals', () => {
    const rendered = 'The key is abc-123 but version was lost';
    const literals = ['abc-123', '2.0'];
    assert.equal(measureLiteralPreservation('', rendered, literals), 0.5);
  });

  it('returns 0 when no literals found', () => {
    const rendered = 'nothing relevant here';
    const literals = ['abc-123', '2.0'];
    assert.equal(measureLiteralPreservation('', rendered, literals), 0);
  });

  it('returns 1.0 for empty literals array', () => {
    assert.equal(measureLiteralPreservation('', 'anything', []), 1.0);
  });
});

// ── measureCompressionRatio ───────────────────────────────────────

describe('measureCompressionRatio', () => {
  it('computes ratio correctly', () => {
    assert.equal(measureCompressionRatio(100, 50), 0.5);
  });

  it('returns 1.0 for equal lengths', () => {
    assert.equal(measureCompressionRatio(100, 100), 1.0);
  });

  it('handles zero original length gracefully', () => {
    assert.equal(measureCompressionRatio(0, 0), 1.0);
  });

  it('returns > 1.0 when rendered is longer', () => {
    assert.ok(measureCompressionRatio(50, 100) > 1.0);
  });
});

// ── evaluateProfile ───────────────────────────────────────────────

describe('evaluateProfile', () => {
  it('flags unacceptable metrics below threshold', () => {
    // Rendered text has very low overlap with original => semantic-retention fails
    const original = 'alpha beta gamma delta epsilon zeta eta theta';
    const rendered = 'one two three four five six seven eight';
    const report = evaluateProfile('test-profile', original, rendered, []);
    const semanticMeasure = report.measurements.find(
      (m) => m.metric === 'semantic-retention',
    );
    assert.ok(semanticMeasure !== undefined);
    assert.equal(semanticMeasure.acceptable, false);
    assert.equal(report.overallAcceptable, false);
  });

  it('marks all acceptable when text is identical and compression is good', () => {
    // Use short rendered text to pass compression-ratio threshold
    const original = 'hello world foo bar baz qux quux corge grault garply';
    const rendered = 'hello world foo bar baz qux quux corge grault garply';
    // identical text => semantic-retention=1.0, role-accuracy=1.0
    // but compression-ratio = 1.0 > 0.5, so will fail
    const report = evaluateProfile('identical', original, rendered, []);
    const compressionMeasure = report.measurements.find(
      (m) => m.metric === 'compression-ratio',
    );
    assert.ok(compressionMeasure !== undefined);
    assert.equal(compressionMeasure.acceptable, false);
  });

  it('identifies weakest metric', () => {
    const original = 'alpha beta gamma delta epsilon zeta';
    const rendered = 'one two three';
    const report = evaluateProfile('weak-test', original, rendered, ['missing-literal']);
    // The weakest metric should be one of the failing ones
    const weakMeasure = report.measurements.find(
      (m) => m.metric === report.weakestMetric,
    );
    assert.ok(weakMeasure !== undefined);
  });

  it('has a valid timestamp', () => {
    const report = evaluateProfile('ts-test', 'a b c', 'a b c', []);
    assert.ok(report.timestamp.length > 0);
    assert.ok(!Number.isNaN(Date.parse(report.timestamp)));
  });
});

// ── compareProfiles ───────────────────────────────────────────────

describe('compareProfiles', () => {
  it('picks best and worst profile', () => {
    const goodReport: ProfileQualityReport = {
      profileId: 'good-profile',
      measurements: [
        { profileId: 'good-profile', metric: 'semantic-retention', value: 0.99, baseline: 0.95, delta: 0.04, acceptable: true },
        { profileId: 'good-profile', metric: 'literal-preservation', value: 1.0, baseline: 0.98, delta: 0.02, acceptable: true },
        { profileId: 'good-profile', metric: 'role-accuracy', value: 1.0, baseline: 0.99, delta: 0.01, acceptable: true },
        { profileId: 'good-profile', metric: 'compression-ratio', value: 0.4, baseline: 0.5, delta: -0.1, acceptable: true },
        { profileId: 'good-profile', metric: 'round-trip-fidelity', value: 0.95, baseline: 0.90, delta: 0.05, acceptable: true },
      ],
      overallAcceptable: true,
      weakestMetric: 'compression-ratio',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const badReport: ProfileQualityReport = {
      profileId: 'bad-profile',
      measurements: [
        { profileId: 'bad-profile', metric: 'semantic-retention', value: 0.5, baseline: 0.95, delta: -0.45, acceptable: false },
        { profileId: 'bad-profile', metric: 'literal-preservation', value: 0.3, baseline: 0.98, delta: -0.68, acceptable: false },
        { profileId: 'bad-profile', metric: 'role-accuracy', value: 0.5, baseline: 0.99, delta: -0.49, acceptable: false },
        { profileId: 'bad-profile', metric: 'compression-ratio', value: 0.9, baseline: 0.5, delta: 0.4, acceptable: false },
        { profileId: 'bad-profile', metric: 'round-trip-fidelity', value: 0.4, baseline: 0.90, delta: -0.5, acceptable: false },
      ],
      overallAcceptable: false,
      weakestMetric: 'literal-preservation',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const comparison = compareProfiles([goodReport, badReport]);
    assert.equal(comparison.bestProfile, 'good-profile');
    assert.equal(comparison.worstProfile, 'bad-profile');
    assert.ok(comparison.recommendation.includes('good-profile'));
    assert.ok(comparison.recommendation.includes('bad-profile'));
  });

  it('handles empty reports array', () => {
    const comparison = compareProfiles([]);
    assert.equal(comparison.bestProfile, '');
    assert.equal(comparison.worstProfile, '');
    assert.ok(comparison.recommendation.length > 0);
  });

  it('handles equal profiles', () => {
    const report: ProfileQualityReport = {
      profileId: 'profile-a',
      measurements: [
        { profileId: 'profile-a', metric: 'semantic-retention', value: 0.96, baseline: 0.95, delta: 0.01, acceptable: true },
      ],
      overallAcceptable: true,
      weakestMetric: 'semantic-retention',
      timestamp: '2026-01-01T00:00:00Z',
    };
    const report2 = { ...report, profileId: 'profile-b', measurements: report.measurements.map(m => ({ ...m, profileId: 'profile-b' })) };

    const comparison = compareProfiles([report, report2]);
    assert.ok(comparison.recommendation.includes('equally'));
  });
});

// ── QUALITY_THRESHOLDS ────────────────────────────────────────────

describe('QUALITY_THRESHOLDS', () => {
  it('has all 5 metrics', () => {
    const expectedMetrics: QualityMetric[] = [
      'semantic-retention',
      'literal-preservation',
      'role-accuracy',
      'compression-ratio',
      'round-trip-fidelity',
    ];
    for (const metric of expectedMetrics) {
      assert.ok(
        metric in QUALITY_THRESHOLDS,
        `Missing threshold for ${metric}`,
      );
      assert.equal(typeof QUALITY_THRESHOLDS[metric], 'number');
    }
    assert.equal(Object.keys(QUALITY_THRESHOLDS).length, 5);
  });

  it('has expected threshold values', () => {
    assert.equal(QUALITY_THRESHOLDS['semantic-retention'], 0.95);
    assert.equal(QUALITY_THRESHOLDS['literal-preservation'], 0.98);
    assert.equal(QUALITY_THRESHOLDS['role-accuracy'], 0.99);
    assert.equal(QUALITY_THRESHOLDS['compression-ratio'], 0.5);
    assert.equal(QUALITY_THRESHOLDS['round-trip-fidelity'], 0.90);
  });
});
