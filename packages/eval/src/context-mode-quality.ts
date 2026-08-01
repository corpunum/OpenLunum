/**
 * Context Mode Quality Measurement (R7.4)
 *
 * Measures downstream accuracy, literal/role preservation, latency and cost
 * per context mode (natural / lunum / mixed). Provides comparison utilities
 * to select the best mode within configurable tolerances.
 */

// ── Types ──────────────────────────────────────────────────────────

export type ContextMode = 'natural' | 'lunum' | 'mixed';

export type QualityDimension =
  | 'accuracy'
  | 'literal-preservation'
  | 'role-preservation'
  | 'latency'
  | 'cost';

export interface ModeQualityMeasurement {
  mode: ContextMode;
  dimension: QualityDimension;
  value: number;
  unit: string;
  baseline: number;
  delta: number;
  withinTolerance: boolean;
}

export interface ModeQualityConfig {
  tolerances: Record<QualityDimension, number>;
}

// ── Constants ──────────────────────────────────────────────────────

export const DEFAULT_QUALITY_TOLERANCES: Record<QualityDimension, number> = {
  'accuracy': 0.05,
  'literal-preservation': 0.02,
  'role-preservation': 0.01,
  'latency': 0.20,
  'cost': 0.50,
};

// ── Measurement Functions ──────────────────────────────────────────

/**
 * Exact-match accuracy: fraction of predicted values matching expected.
 */
export function measureAccuracy(predicted: string[], expected: string[]): number {
  if (expected.length === 0) return 1.0;
  let matches = 0;
  for (let i = 0; i < expected.length; i++) {
    if (i < predicted.length && predicted[i] === expected[i]) {
      matches++;
    }
  }
  return matches / expected.length;
}

/**
 * Fraction of expected literal strings found in the output.
 */
export function measureLiteralPreservation(output: string, expectedLiterals: string[]): number {
  if (expectedLiterals.length === 0) return 1.0;
  let found = 0;
  for (const literal of expectedLiterals) {
    if (output.includes(literal)) {
      found++;
    }
  }
  return found / expectedLiterals.length;
}

/**
 * Fraction of expected role identifiers found in the output.
 */
export function measureRolePreservation(output: string, expectedRoles: string[]): number {
  if (expectedRoles.length === 0) return 1.0;
  let found = 0;
  for (const role of expectedRoles) {
    if (output.includes(role)) {
      found++;
    }
  }
  return found / expectedRoles.length;
}

/**
 * Estimate cost in dollars given a token count and per-million-token price.
 */
export function estimateTokenCost(tokenCount: number, costPerMillionTokens: number): number {
  return (tokenCount / 1_000_000) * costPerMillionTokens;
}

// ── Comparison Report ──────────────────────────────────────────────

export interface ModeComparisonReport {
  timestamp: string;
  modes: ContextMode[];
  measurements: ModeQualityMeasurement[];
  bestMode: ContextMode;
  summary: string;
}

/**
 * Compare context modes based on quality measurements and pick the best one.
 *
 * Best mode selection: among modes whose accuracy measurements are within
 * tolerance, pick the one with the highest accuracy value. Falls back to
 * 'natural' if no mode qualifies.
 */
export function compareContextModes(
  measurements: ModeQualityMeasurement[],
  config?: ModeQualityConfig,
): ModeComparisonReport {
  const tolerances = config?.tolerances ?? DEFAULT_QUALITY_TOLERANCES;

  // Determine unique modes present
  const modeSet = new Set<ContextMode>();
  for (const m of measurements) {
    modeSet.add(m.mode);
  }
  const modes = Array.from(modeSet);

  // Tag each measurement's withinTolerance based on config
  const tagged: ModeQualityMeasurement[] = measurements.map(m => ({
    ...m,
    withinTolerance: Math.abs(m.delta) <= tolerances[m.dimension],
  }));

  // Find modes where all measurements are within tolerance
  const qualifyingModes: ContextMode[] = [];
  for (const mode of modes) {
    const modeMeasurements = tagged.filter(m => m.mode === mode);
    const allWithin = modeMeasurements.every(m => m.withinTolerance);
    if (allWithin) {
      qualifyingModes.push(mode);
    }
  }

  // Among qualifying modes, pick highest accuracy
  let bestMode: ContextMode = 'natural';
  let bestAccuracy = -Infinity;

  for (const mode of (qualifyingModes.length > 0 ? qualifyingModes : modes)) {
    const accMeasurement = tagged.find(
      m => m.mode === mode && m.dimension === 'accuracy',
    );
    const acc = accMeasurement?.value ?? 0;
    if (acc > bestAccuracy) {
      bestAccuracy = acc;
      bestMode = mode;
    }
  }

  // Build summary
  const parts: string[] = [];
  parts.push(`Best mode: ${bestMode}`);
  if (qualifyingModes.length > 0) {
    parts.push(`${qualifyingModes.length} mode(s) within tolerance`);
  } else {
    parts.push('no mode fully within tolerance; picked highest accuracy');
  }
  parts.push(`accuracy: ${bestAccuracy.toFixed(3)}`);

  return {
    timestamp: new Date().toISOString(),
    modes,
    measurements: tagged,
    bestMode,
    summary: parts.join('; '),
  };
}
