import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVENTIONS_VERSION,
  DEFAULT_CONVENTIONS,
  computePercentile,
  computeMean,
  computeStdDev,
  computeMedian,
  computeIQR,
  computeDescriptiveStats,
  verifyRecomputation,
} from '../src/statistical-conventions.js';

describe('statistical-conventions', () => {
  describe('DEFAULT_CONVENTIONS', () => {
    it('has version 1.0', () => {
      assert.equal(DEFAULT_CONVENTIONS.version, '1.0');
      assert.equal(CONVENTIONS_VERSION, '1.0');
    });

    it('uses nearest-rank percentile', () => {
      assert.equal(DEFAULT_CONVENTIONS.percentile.method, 'nearest-rank');
    });

    it('uses arithmetic mean', () => {
      assert.equal(DEFAULT_CONVENTIONS.aggregation.central, 'arithmetic-mean');
    });

    it('requires 30 minimum samples for CI', () => {
      assert.equal(DEFAULT_CONVENTIONS.confidence.minSamples, 30);
    });

    it('does not automatically remove outliers', () => {
      assert.equal(DEFAULT_CONVENTIONS.outlierHandling.method, 'none');
    });
  });

  describe('computePercentile', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('p50 returns median (nearest-rank)', () => {
      assert.equal(computePercentile(sorted, 50), 5);
    });

    it('p0 returns minimum', () => {
      assert.equal(computePercentile(sorted, 0), 1);
    });

    it('p100 returns maximum', () => {
      assert.equal(computePercentile(sorted, 100), 10);
    });

    it('handles empty array', () => {
      assert.equal(computePercentile([], 50), 0);
    });

    it('handles single element', () => {
      assert.equal(computePercentile([42], 50), 42);
    });

    it('linear interpolation differs from nearest-rank', () => {
      const vals = [1, 2, 3, 4];
      const nr = computePercentile(vals, 50, 'nearest-rank');
      const li = computePercentile(vals, 50, 'linear-interpolation');
      assert.equal(nr, 2);
      assert.equal(li, 2.5);
    });
  });

  describe('computeMean', () => {
    it('computes correct mean', () => {
      assert.equal(computeMean([1, 2, 3, 4, 5]), 3);
    });

    it('handles empty array', () => {
      assert.equal(computeMean([]), 0);
    });

    it('handles single element', () => {
      assert.equal(computeMean([42]), 42);
    });
  });

  describe('computeStdDev', () => {
    it('computes Bessel-corrected std dev', () => {
      const sd = computeStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
      assert.ok(Math.abs(sd - 2.138) < 0.01);
    });

    it('returns 0 for single element', () => {
      assert.equal(computeStdDev([42]), 0);
    });

    it('returns 0 for empty array', () => {
      assert.equal(computeStdDev([]), 0);
    });
  });

  describe('computeMedian', () => {
    it('odd count', () => {
      assert.equal(computeMedian([1, 2, 3, 4, 5]), 3);
    });

    it('even count (nearest-rank)', () => {
      assert.equal(computeMedian([1, 2, 3, 4]), 2);
    });
  });

  describe('computeIQR', () => {
    it('computes IQR', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const iqr = computeIQR(sorted);
      assert.ok(iqr > 0);
    });
  });

  describe('computeDescriptiveStats', () => {
    it('produces complete stats', () => {
      const values = Array.from({ length: 50 }, (_, i) => i + 1);
      const stats = computeDescriptiveStats(values);
      assert.equal(stats.n, 50);
      assert.ok(stats.mean > 0);
      assert.ok(stats.stdDev > 0);
      assert.equal(stats.min, 1);
      assert.equal(stats.max, 50);
      assert.equal(stats.sufficientForCI, true);
    });

    it('marks insufficient samples', () => {
      const stats = computeDescriptiveStats([1, 2, 3]);
      assert.equal(stats.sufficientForCI, false);
    });

    it('handles empty input', () => {
      const stats = computeDescriptiveStats([]);
      assert.equal(stats.n, 0);
      assert.equal(stats.mean, 0);
    });
  });

  describe('verifyRecomputation', () => {
    it('verifies correct stats', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = computeDescriptiveStats(values);
      const result = verifyRecomputation(values, stats);
      assert.equal(result.match, true);
      assert.equal(result.discrepancies.length, 0);
    });

    it('detects tampered mean', () => {
      const values = [1, 2, 3, 4, 5];
      const stats = computeDescriptiveStats(values);
      const tampered = { ...stats, mean: 999 };
      const result = verifyRecomputation(values, tampered);
      assert.equal(result.match, false);
      assert.ok(result.discrepancies.some(d => d.includes('mean')));
    });
  });
});
