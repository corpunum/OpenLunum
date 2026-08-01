export const CONVENTIONS_VERSION = '1.0' as const;

export type PercentileMethod = 'nearest-rank' | 'linear-interpolation';
export type AggregationMethod = 'arithmetic-mean' | 'median' | 'geometric-mean';
export type ConfidenceMethod = 'bootstrap-percentile' | 'normal-approximation';

export interface StatisticalConventions {
  version: string;
  percentile: {
    method: PercentileMethod;
    description: string;
  };
  aggregation: {
    central: AggregationMethod;
    spread: 'standard-deviation' | 'iqr';
    description: string;
  };
  confidence: {
    method: ConfidenceMethod;
    level: number;
    minSamples: number;
    description: string;
  };
  rounding: {
    percentages: number;
    scores: number;
    latencyMs: number;
    description: string;
  };
  outlierHandling: {
    method: 'none' | 'iqr-fence' | 'z-score';
    threshold: number;
    description: string;
  };
}

export const DEFAULT_CONVENTIONS: Readonly<StatisticalConventions> = Object.freeze({
  version: CONVENTIONS_VERSION,
  percentile: {
    method: 'nearest-rank' as PercentileMethod,
    description: 'p-th percentile = value at index ceil(n * p / 100) - 1 in the sorted array. ' +
      'This is the simplest unambiguous definition and matches NumPy method="lower".',
  },
  aggregation: {
    central: 'arithmetic-mean' as AggregationMethod,
    spread: 'standard-deviation' as const,
    description: 'Arithmetic mean for central tendency, sample standard deviation (Bessel-corrected, n-1) for spread.',
  },
  confidence: {
    method: 'bootstrap-percentile' as ConfidenceMethod,
    level: 0.95,
    minSamples: 30,
    description: 'Bootstrap percentile method with 10,000 resamples at 95% confidence. ' +
      'Requires at least 30 samples. Below minimum, report point estimate with "insufficient samples" warning.',
  },
  rounding: {
    percentages: 1,
    scores: 3,
    latencyMs: 3,
    description: 'Percentages to 1 decimal (e.g., 85.2%), scores to 3 decimals (e.g., 0.823), latencies to 3 decimals (e.g., 1.234ms).',
  },
  outlierHandling: {
    method: 'none' as const,
    threshold: 0,
    description: 'No automatic outlier removal. All measurements are reported. ' +
      'Outlier analysis may be performed separately but never silently excluded from primary results.',
  },
});

export function computePercentile(sorted: readonly number[], p: number, method: PercentileMethod = 'nearest-rank'): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0]!;
  if (p >= 100) return sorted[sorted.length - 1]!;

  if (method === 'nearest-rank') {
    const idx = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
  }

  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  const fraction = rank - lower;
  return sorted[lower]! + fraction * (sorted[upper]! - sorted[lower]!);
}

export function computeMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeStdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = computeMean(values);
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

export function computeMedian(sorted: readonly number[]): number {
  return computePercentile(sorted, 50);
}

export function computeIQR(sorted: readonly number[]): number {
  const q1 = computePercentile(sorted, 25);
  const q3 = computePercentile(sorted, 75);
  return q3 - q1;
}

export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  iqr: number;
  sufficientForCI: boolean;
}

export function computeDescriptiveStats(
  values: readonly number[],
  conventions: StatisticalConventions = DEFAULT_CONVENTIONS,
): DescriptiveStats {
  if (values.length === 0) {
    return {
      n: 0, mean: 0, median: 0, stdDev: 0,
      min: 0, max: 0,
      p5: 0, p25: 0, p50: 0, p75: 0, p95: 0, p99: 0,
      iqr: 0, sufficientForCI: false,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const method = conventions.percentile.method;

  return {
    n: values.length,
    mean: roundTo(computeMean(values), conventions.rounding.scores),
    median: roundTo(computeMedian(sorted), conventions.rounding.scores),
    stdDev: roundTo(computeStdDev(values), conventions.rounding.scores),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p5: roundTo(computePercentile(sorted, 5, method), conventions.rounding.scores),
    p25: roundTo(computePercentile(sorted, 25, method), conventions.rounding.scores),
    p50: roundTo(computePercentile(sorted, 50, method), conventions.rounding.scores),
    p75: roundTo(computePercentile(sorted, 75, method), conventions.rounding.scores),
    p95: roundTo(computePercentile(sorted, 95, method), conventions.rounding.scores),
    p99: roundTo(computePercentile(sorted, 99, method), conventions.rounding.scores),
    iqr: roundTo(computeIQR(sorted), conventions.rounding.scores),
    sufficientForCI: values.length >= conventions.confidence.minSamples,
  };
}

export function verifyRecomputation(
  values: readonly number[],
  reported: DescriptiveStats,
  conventions: StatisticalConventions = DEFAULT_CONVENTIONS,
): { match: boolean; discrepancies: string[] } {
  const recomputed = computeDescriptiveStats(values, conventions);
  const discrepancies: string[] = [];

  const fields: (keyof DescriptiveStats)[] = [
    'n', 'mean', 'median', 'stdDev', 'p5', 'p25', 'p50', 'p75', 'p95', 'p99',
  ];

  for (const field of fields) {
    if (recomputed[field] !== reported[field]) {
      discrepancies.push(
        `${field}: reported=${String(reported[field])}, recomputed=${String(recomputed[field])}`,
      );
    }
  }

  return { match: discrepancies.length === 0, discrepancies };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
