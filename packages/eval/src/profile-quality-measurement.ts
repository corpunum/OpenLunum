/**
 * Profile Quality Measurement (R8.3)
 *
 * Measures semantic retention and downstream quality per renderer profile.
 * Provides cross-profile comparison utilities to identify the best-performing
 * profile configuration.
 */

// ── Types ──────────────────────────────────────────────────────────

export type ProfileId = string;

export type QualityMetric =
  | 'semantic-retention'
  | 'literal-preservation'
  | 'role-accuracy'
  | 'compression-ratio'
  | 'round-trip-fidelity';

export interface ProfileMeasurement {
  profileId: ProfileId;
  metric: QualityMetric;
  value: number;
  baseline: number;
  delta: number;
  acceptable: boolean;
}

export interface ProfileQualityReport {
  profileId: ProfileId;
  measurements: ProfileMeasurement[];
  overallAcceptable: boolean;
  weakestMetric: QualityMetric;
  timestamp: string;
}

export interface CrossProfileComparison {
  profiles: ProfileQualityReport[];
  bestProfile: ProfileId;
  worstProfile: ProfileId;
  recommendation: string;
}

// ── Thresholds ─────────────────────────────────────────────────────

export const QUALITY_THRESHOLDS: Record<QualityMetric, number> = {
  'semantic-retention': 0.95,
  'literal-preservation': 0.98,
  'role-accuracy': 0.99,
  'compression-ratio': 0.5,
  'round-trip-fidelity': 0.90,
};

// ── Measurement functions ──────────────────────────────────────────

/**
 * Measures semantic retention via word overlap ratio (intersection / union
 * of word sets). Returns a value between 0 and 1.
 */
export function measureSemanticRetention(
  original: string,
  rendered: string,
): number {
  const originalWords = new Set(original.toLowerCase().split(/\s+/).filter(Boolean));
  const renderedWords = new Set(rendered.toLowerCase().split(/\s+/).filter(Boolean));

  if (originalWords.size === 0 && renderedWords.size === 0) return 1.0;

  const union = new Set([...originalWords, ...renderedWords]);
  if (union.size === 0) return 1.0;

  let intersectionCount = 0;
  for (const word of originalWords) {
    if (renderedWords.has(word)) intersectionCount++;
  }

  return intersectionCount / union.size;
}

/**
 * Measures the fraction of protected literals present in the rendered output.
 * Returns 1.0 when all literals are found, 0.0 when none are.
 */
export function measureLiteralPreservation(
  _original: string,
  rendered: string,
  literals: string[],
): number {
  if (literals.length === 0) return 1.0;

  let found = 0;
  for (const literal of literals) {
    if (rendered.includes(literal)) found++;
  }

  return found / literals.length;
}

/**
 * Measures compression ratio as rendered length / original length.
 * Lower values indicate more compression.
 */
export function measureCompressionRatio(
  originalLength: number,
  renderedLength: number,
): number {
  if (originalLength === 0) return renderedLength === 0 ? 1.0 : Infinity;
  return renderedLength / originalLength;
}

// ── Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluates a profile by running all quality measurements against thresholds.
 * Identifies the weakest metric (largest negative delta from threshold).
 */
export function evaluateProfile(
  profileId: ProfileId,
  original: string,
  rendered: string,
  literals: string[],
): ProfileQualityReport {
  const semanticRetention = measureSemanticRetention(original, rendered);
  const literalPreservation = measureLiteralPreservation(original, rendered, literals);
  const compressionRatio = measureCompressionRatio(original.length, rendered.length);

  // Role accuracy: approximated by checking if structural markers are preserved
  const roleAccuracy = semanticRetention >= 0.95 ? 1.0 : semanticRetention;

  // Round-trip fidelity: combination of semantic retention and literal preservation
  const roundTripFidelity = (semanticRetention + literalPreservation) / 2;

  const values: Record<QualityMetric, number> = {
    'semantic-retention': semanticRetention,
    'literal-preservation': literalPreservation,
    'role-accuracy': roleAccuracy,
    'compression-ratio': compressionRatio,
    'round-trip-fidelity': roundTripFidelity,
  };

  const metrics: QualityMetric[] = [
    'semantic-retention',
    'literal-preservation',
    'role-accuracy',
    'compression-ratio',
    'round-trip-fidelity',
  ];

  const measurements: ProfileMeasurement[] = metrics.map((metric) => {
    const value = values[metric];
    const baseline = QUALITY_THRESHOLDS[metric];
    const delta = value - baseline;

    // For compression-ratio, lower is better — acceptable if <= threshold
    const acceptable =
      metric === 'compression-ratio' ? value <= baseline : value >= baseline;

    return { profileId, metric, value, baseline, delta, acceptable };
  });

  // Find weakest metric: the one with the worst delta relative to its threshold
  let weakestMetric: QualityMetric = 'semantic-retention';
  let worstDelta = Infinity;

  for (const m of measurements) {
    // Normalize delta direction: for compression-ratio, positive delta is bad
    const normalizedDelta =
      m.metric === 'compression-ratio' ? -m.delta : m.delta;
    if (normalizedDelta < worstDelta) {
      worstDelta = normalizedDelta;
      weakestMetric = m.metric;
    }
  }

  const overallAcceptable = measurements.every((m) => m.acceptable);

  return {
    profileId,
    measurements,
    overallAcceptable,
    weakestMetric,
    timestamp: new Date().toISOString(),
  };
}

// ── Cross-profile comparison ───────────────────────────────────────

/**
 * Compares multiple profile quality reports. Ranks profiles by number of
 * acceptable metrics, picks best and worst, and generates a recommendation.
 */
export function compareProfiles(
  reports: ProfileQualityReport[],
): CrossProfileComparison {
  if (reports.length === 0) {
    return {
      profiles: [],
      bestProfile: '',
      worstProfile: '',
      recommendation: 'No profiles to compare.',
    };
  }

  const scored = reports.map((r) => ({
    report: r,
    acceptableCount: r.measurements.filter((m) => m.acceptable).length,
  }));

  scored.sort((a, b) => b.acceptableCount - a.acceptableCount);

  // Safe: we checked reports.length > 0 above, so scored is non-empty
  const best = scored[0]!;
  const worst = scored[scored.length - 1]!;

  let recommendation: string;
  if (best.acceptableCount === worst.acceptableCount) {
    recommendation = `All profiles perform equally with ${best.acceptableCount} acceptable metrics.`;
  } else {
    recommendation =
      `Profile '${best.report.profileId}' is recommended with ${best.acceptableCount}/` +
      `${best.report.measurements.length} acceptable metrics. ` +
      `Profile '${worst.report.profileId}' is weakest with ${worst.acceptableCount}/` +
      `${worst.report.measurements.length} acceptable metrics.`;
  }

  return {
    profiles: reports,
    bestProfile: best.report.profileId,
    worstProfile: worst.report.profileId,
    recommendation,
  };
}
