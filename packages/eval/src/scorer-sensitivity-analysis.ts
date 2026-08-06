export type SensitivityDimension =
  | 'threshold-variation'
  | 'input-perturbation'
  | 'weight-shift'
  | 'feature-dropout'
  | 'noise-injection';

export type ScorerComponent =
  | 'exact-match'
  | 'feature-recall'
  | 'role-identity'
  | 'negation-check'
  | 'modality-check'
  | 'literal-integrity';

export interface SensitivityDimensionProfile {
  name: SensitivityDimension;
  description: string;
  magnitude: number;
}

export interface ScorerComponentProfile {
  name: ScorerComponent;
  weight: number;
  critical: boolean;
}

export interface SensitivityResult {
  dimension: SensitivityDimension;
  component: ScorerComponent;
  baselineScore: number;
  perturbedScore: number;
  delta: number;
  stable: boolean;
  calibrationConfident: boolean;
}

export interface ComponentSensitivitySummary {
  component: ScorerComponent;
  totalDimensions: number;
  stableCount: number;
  maxDelta: number;
  meanDelta: number;
}

export interface ScorerSensitivityReport {
  results: readonly SensitivityResult[];
  componentSummaries: readonly ComponentSensitivitySummary[];
  totalTests: number;
  totalUnstable: number;
  overallStability: number;
  verdict: 'calibrated' | 'sensitive' | 'uncalibrated';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const SENSITIVITY_DIMENSIONS: readonly SensitivityDimensionProfile[] = Object.freeze([
  Object.freeze({ name: 'threshold-variation' as SensitivityDimension, description: 'Vary decision threshold ±5%', magnitude: 0.05 }),
  Object.freeze({ name: 'input-perturbation' as SensitivityDimension, description: 'Add minor input variations', magnitude: 0.03 }),
  Object.freeze({ name: 'weight-shift' as SensitivityDimension, description: 'Shift component weights ±10%', magnitude: 0.10 }),
  Object.freeze({ name: 'feature-dropout' as SensitivityDimension, description: 'Drop one feature signal', magnitude: 0.08 }),
  Object.freeze({ name: 'noise-injection' as SensitivityDimension, description: 'Inject Gaussian noise', magnitude: 0.04 }),
]);

export const SCORER_COMPONENTS: readonly ScorerComponentProfile[] = Object.freeze([
  Object.freeze({ name: 'exact-match' as ScorerComponent, weight: 0.25, critical: false }),
  Object.freeze({ name: 'feature-recall' as ScorerComponent, weight: 0.20, critical: false }),
  Object.freeze({ name: 'role-identity' as ScorerComponent, weight: 0.15, critical: true }),
  Object.freeze({ name: 'negation-check' as ScorerComponent, weight: 0.15, critical: true }),
  Object.freeze({ name: 'modality-check' as ScorerComponent, weight: 0.15, critical: true }),
  Object.freeze({ name: 'literal-integrity' as ScorerComponent, weight: 0.10, critical: false }),
]);

export function simulateSensitivityTest(
  dimension: SensitivityDimensionProfile,
  component: ScorerComponentProfile,
): SensitivityResult {
  const seed = hashSeed(`${dimension.name}:${component.name}`);

  const baselineScore = Math.round((0.85 + component.weight * 0.3 + seed * 0.05) * 1000) / 1000;

  const perturbation = (seed - 0.5) * dimension.magnitude * 0.6;
  const perturbedScore = Math.round((baselineScore + perturbation) * 1000) / 1000;

  const delta = Math.round((perturbedScore - baselineScore) * 1000) / 1000;

  const stabilityThreshold = component.critical ? 0.02 : 0.05;
  const stable = Math.abs(delta) <= stabilityThreshold;

  const calibrationConfident = Math.abs(delta) <= dimension.magnitude * 0.5;

  return {
    dimension: dimension.name,
    component: component.name,
    baselineScore,
    perturbedScore,
    delta,
    stable,
    calibrationConfident,
  };
}

export function runScorerSensitivitySuite(
  dimensions: readonly SensitivityDimensionProfile[] = SENSITIVITY_DIMENSIONS,
  components: readonly ScorerComponentProfile[] = SCORER_COMPONENTS,
): ScorerSensitivityReport {
  const results: SensitivityResult[] = [];

  for (const dimension of dimensions) {
    for (const component of components) {
      results.push(simulateSensitivityTest(dimension, component));
    }
  }

  const componentSummaries: ComponentSensitivitySummary[] = [];
  for (const component of components) {
    const cr = results.filter(r => r.component === component.name);
    const stableCount = cr.filter(r => r.stable).length;
    const deltas = cr.map(r => Math.abs(r.delta));
    const maxDelta = Math.round(Math.max(...deltas) * 1000) / 1000;
    const meanDelta = Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length * 1000) / 1000;

    componentSummaries.push({
      component: component.name,
      totalDimensions: cr.length,
      stableCount,
      maxDelta,
      meanDelta,
    });
  }

  const totalUnstable = results.filter(r => !r.stable).length;
  const overallStability = Math.round((1 - totalUnstable / results.length) * 1000) / 1000;

  let verdict: 'calibrated' | 'sensitive' | 'uncalibrated';
  if (overallStability >= 0.85 && results.every(r => r.calibrationConfident)) {
    verdict = 'calibrated';
  } else if (overallStability >= 0.6) {
    verdict = 'sensitive';
  } else {
    verdict = 'uncalibrated';
  }

  return {
    results,
    componentSummaries,
    totalTests: results.length,
    totalUnstable,
    overallStability,
    verdict,
  };
}
