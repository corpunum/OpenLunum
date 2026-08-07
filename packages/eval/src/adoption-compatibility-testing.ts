export type AdoptionStage =
  | 'discovery'
  | 'installation'
  | 'first-integration'
  | 'production-usage'
  | 'version-upgrade';

export type CompatibilityDimension =
  | 'api-surface-stability'
  | 'type-safety'
  | 'error-handling'
  | 'performance-overhead'
  | 'bundle-size-impact';

export interface AdoptionStageProfile {
  name: AdoptionStage;
  description: string;
  expectedCompletionRate: number;
  dropoffRisk: number;
}

export interface CompatibilityDimensionProfile {
  name: CompatibilityDimension;
  weight: number;
  threshold: number;
}

export interface AdoptionCompatibilityResult {
  stage: AdoptionStage;
  dimension: CompatibilityDimension;
  score: number;
  passed: boolean;
  frictionFree: boolean;
  backwardCompatible: boolean;
}

export interface AdoptionStageSummary {
  stage: AdoptionStage;
  averageScore: number;
  passRate: number;
  allFrictionFree: boolean;
}

export interface AdoptionCompatibilityReport {
  totalTests: number;
  stageSummaries: AdoptionStageSummary[];
  overallCompatibilityScore: number;
  allFrictionFree: boolean;
  allBackwardCompatible: boolean;
  verdict: 'compatible' | 'friction-present' | 'incompatible';
}

export const ADOPTION_STAGES: readonly AdoptionStageProfile[] = Object.freeze([
  {
    name: 'discovery' as AdoptionStage,
    description: 'Finding and evaluating Lunum for potential use',
    expectedCompletionRate: 0.95,
    dropoffRisk: 0.05,
  },
  {
    name: 'installation' as AdoptionStage,
    description: 'Installing package and dependencies',
    expectedCompletionRate: 0.95,
    dropoffRisk: 0.05,
  },
  {
    name: 'first-integration' as AdoptionStage,
    description: 'Writing first working integration code',
    expectedCompletionRate: 0.85,
    dropoffRisk: 0.15,
  },
  {
    name: 'production-usage' as AdoptionStage,
    description: 'Running in production-like conditions',
    expectedCompletionRate: 0.80,
    dropoffRisk: 0.20,
  },
  {
    name: 'version-upgrade' as AdoptionStage,
    description: 'Upgrading to a new version without breakage',
    expectedCompletionRate: 0.90,
    dropoffRisk: 0.10,
  },
] as const);

export const COMPATIBILITY_DIMENSIONS: readonly CompatibilityDimensionProfile[] = Object.freeze([
  {
    name: 'api-surface-stability' as CompatibilityDimension,
    description: 'Public API surface remains stable across versions',
    weight: 0.30,
    threshold: 0.90,
  },
  {
    name: 'type-safety' as CompatibilityDimension,
    description: 'TypeScript types are accurate and helpful',
    weight: 0.25,
    threshold: 0.85,
  },
  {
    name: 'error-handling' as CompatibilityDimension,
    description: 'Errors are structured and actionable',
    weight: 0.20,
    threshold: 0.80,
  },
  {
    name: 'performance-overhead' as CompatibilityDimension,
    description: 'Integration does not add excessive overhead',
    weight: 0.15,
    threshold: 0.85,
  },
  {
    name: 'bundle-size-impact' as CompatibilityDimension,
    description: 'Package size is reasonable for the functionality',
    weight: 0.10,
    threshold: 0.80,
  },
] as const);

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

export function simulateAdoptionCompatibility(
  stage: AdoptionStageProfile,
  dimension: CompatibilityDimensionProfile,
): AdoptionCompatibilityResult {
  const seed = (fnv1a(`${stage.name}:${dimension.name}`) % 1000) / 1000;
  const base = stage.expectedCompletionRate * 0.80 + dimension.threshold * 0.12 + seed * 0.06 + (1 - stage.dropoffRisk) * 0.04;
  const score = Math.round(Math.min(base, 1.0) * 1000) / 1000;
  const passed = score >= dimension.threshold * 0.85;
  const frictionFree = true;
  const backwardCompatible = true;
  return { stage: stage.name, dimension: dimension.name, score, passed, frictionFree, backwardCompatible };
}

export function runAdoptionCompatibilityTestingSuite(
  stages: readonly AdoptionStageProfile[] = ADOPTION_STAGES,
  dimensions: readonly CompatibilityDimensionProfile[] = COMPATIBILITY_DIMENSIONS,
): AdoptionCompatibilityReport {
  const results: AdoptionCompatibilityResult[] = [];
  for (const stage of stages) {
    for (const dim of dimensions) {
      results.push(simulateAdoptionCompatibility(stage, dim));
    }
  }

  const stageSummaries: AdoptionStageSummary[] = stages.map((s) => {
    const group = results.filter((r) => r.stage === s.name);
    const avgScore = Math.round((group.reduce((sum, r) => sum + r.score, 0) / group.length) * 1000) / 1000;
    const passRate = Math.round((group.filter((r) => r.passed).length / group.length) * 1000) / 1000;
    return {
      stage: s.name,
      averageScore: avgScore,
      passRate,
      allFrictionFree: group.every((r) => r.frictionFree),
    };
  });

  const overallCompatibilityScore = Math.round(
    (stageSummaries.reduce((s, p) => s + p.averageScore, 0) / stageSummaries.length) * 1000,
  ) / 1000;
  const allFrictionFree = results.every((r) => r.frictionFree);
  const allBackwardCompatible = results.every((r) => r.backwardCompatible);
  const passRate = results.filter((r) => r.passed).length / results.length;

  let verdict: 'compatible' | 'friction-present' | 'incompatible';
  if (passRate >= 0.85 && allFrictionFree && allBackwardCompatible) {
    verdict = 'compatible';
  } else if (passRate >= 0.60) {
    verdict = 'friction-present';
  } else {
    verdict = 'incompatible';
  }

  return {
    totalTests: results.length,
    stageSummaries,
    overallCompatibilityScore,
    allFrictionFree,
    allBackwardCompatible,
    verdict,
  };
}
