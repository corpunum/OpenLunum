import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  measureAccuracy,
  measureLiteralPreservation,
  measureRolePreservation,
  estimateTokenCost,
  compareContextModes,
  DEFAULT_QUALITY_TOLERANCES,
  type ContextMode,
  type QualityDimension,
  type ModeQualityMeasurement,
  type ModeQualityConfig,
} from '../src/context-mode-quality.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeMeasurement(
  mode: ContextMode,
  dimension: QualityDimension,
  value: number,
  overrides: Partial<ModeQualityMeasurement> = {},
): ModeQualityMeasurement {
  return {
    mode,
    dimension,
    value,
    unit: dimension === 'latency' ? 'ms' : dimension === 'cost' ? 'USD' : 'ratio',
    baseline: value,
    delta: 0,
    withinTolerance: true,
    ...overrides,
  };
}

// ── measureAccuracy ────────────────────────────────────────────────

describe('measureAccuracy', () => {
  it('returns 1.0 for perfect match', () => {
    assert.equal(measureAccuracy(['a', 'b', 'c'], ['a', 'b', 'c']), 1.0);
  });

  it('returns 0.5 for half match', () => {
    assert.equal(measureAccuracy(['a', 'x'], ['a', 'b']), 0.5);
  });

  it('returns 0 for no match', () => {
    assert.equal(measureAccuracy(['x', 'y'], ['a', 'b']), 0);
  });

  it('returns 1.0 for empty expected', () => {
    assert.equal(measureAccuracy(['a'], []), 1.0);
  });
});

// ── measureLiteralPreservation ─────────────────────────────────────

describe('measureLiteralPreservation', () => {
  it('finds all literals', () => {
    assert.equal(
      measureLiteralPreservation('The cat sat on the mat', ['cat', 'mat']),
      1.0,
    );
  });

  it('finds partial literals', () => {
    assert.equal(
      measureLiteralPreservation('The cat sat on the floor', ['cat', 'mat']),
      0.5,
    );
  });

  it('finds none', () => {
    assert.equal(
      measureLiteralPreservation('The dog ran in the park', ['cat', 'mat']),
      0,
    );
  });

  it('returns 1.0 for empty expected', () => {
    assert.equal(measureLiteralPreservation('anything', []), 1.0);
  });
});

// ── measureRolePreservation ────────────────────────────────────────

describe('measureRolePreservation', () => {
  it('finds all roles', () => {
    assert.equal(
      measureRolePreservation('agent acted on object at location', ['agent', 'object', 'location']),
      1.0,
    );
  });

  it('finds partial roles', () => {
    assert.equal(
      measureRolePreservation('agent acted on something', ['agent', 'object', 'location']),
      1 / 3,
    );
  });

  it('finds none', () => {
    assert.equal(
      measureRolePreservation('nothing here', ['agent', 'object']),
      0,
    );
  });

  it('returns 1.0 for empty expected', () => {
    assert.equal(measureRolePreservation('anything', []), 1.0);
  });
});

// ── estimateTokenCost ──────────────────────────────────────────────

describe('estimateTokenCost', () => {
  it('computes correctly for known values', () => {
    // 1000 tokens at $3 per million = $0.003
    assert.equal(estimateTokenCost(1000, 3), 0.003);
  });

  it('returns 0 for 0 tokens', () => {
    assert.equal(estimateTokenCost(0, 10), 0);
  });

  it('handles 1 million tokens exactly', () => {
    assert.equal(estimateTokenCost(1_000_000, 5), 5);
  });
});

// ── compareContextModes ────────────────────────────────────────────

describe('compareContextModes', () => {
  it('picks best mode by highest accuracy', () => {
    const measurements: ModeQualityMeasurement[] = [
      makeMeasurement('natural', 'accuracy', 0.8),
      makeMeasurement('lunum', 'accuracy', 0.95),
      makeMeasurement('mixed', 'accuracy', 0.9),
    ];

    const report = compareContextModes(measurements);
    assert.equal(report.bestMode, 'lunum');
    assert.ok(report.summary.includes('lunum'));
    assert.equal(report.modes.length, 3);
  });

  it('respects tolerances — excludes out-of-tolerance modes', () => {
    const config: ModeQualityConfig = {
      tolerances: {
        'accuracy': 0.05,
        'literal-preservation': 0.02,
        'role-preservation': 0.01,
        'latency': 0.20,
        'cost': 0.50,
      },
    };

    const measurements: ModeQualityMeasurement[] = [
      // lunum has high accuracy but huge latency delta (out of tolerance)
      makeMeasurement('lunum', 'accuracy', 0.95),
      makeMeasurement('lunum', 'latency', 500, { baseline: 100, delta: 4.0 }),
      // natural is within tolerance on everything
      makeMeasurement('natural', 'accuracy', 0.85),
      makeMeasurement('natural', 'latency', 110, { baseline: 100, delta: 0.10 }),
    ];

    const report = compareContextModes(measurements, config);
    assert.equal(report.bestMode, 'natural');
  });

  it('returns a valid timestamp', () => {
    const measurements = [makeMeasurement('natural', 'accuracy', 0.9)];
    const report = compareContextModes(measurements);
    assert.ok(!isNaN(Date.parse(report.timestamp)));
  });
});

// ── DEFAULT_QUALITY_TOLERANCES ─────────────────────────────────────

describe('DEFAULT_QUALITY_TOLERANCES', () => {
  it('has all 5 dimensions', () => {
    const dims: QualityDimension[] = [
      'accuracy',
      'literal-preservation',
      'role-preservation',
      'latency',
      'cost',
    ];
    for (const dim of dims) {
      assert.ok(
        dim in DEFAULT_QUALITY_TOLERANCES,
        `missing dimension: ${dim}`,
      );
      assert.equal(typeof DEFAULT_QUALITY_TOLERANCES[dim], 'number');
    }
  });

  it('has expected default values', () => {
    assert.equal(DEFAULT_QUALITY_TOLERANCES['accuracy'], 0.05);
    assert.equal(DEFAULT_QUALITY_TOLERANCES['literal-preservation'], 0.02);
    assert.equal(DEFAULT_QUALITY_TOLERANCES['role-preservation'], 0.01);
    assert.equal(DEFAULT_QUALITY_TOLERANCES['latency'], 0.20);
    assert.equal(DEFAULT_QUALITY_TOLERANCES['cost'], 0.50);
  });
});
