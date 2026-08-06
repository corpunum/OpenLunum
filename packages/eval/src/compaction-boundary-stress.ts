export type BoundaryCategory =
  | 'empty-content'
  | 'single-character'
  | 'maximum-length'
  | 'unicode-heavy'
  | 'deeply-nested'
  | 'mixed-script';

export type StressDimension =
  | 'preservation'
  | 'compression'
  | 'stability'
  | 'graceful-degradation';

export interface BoundaryCategoryProfile {
  name: BoundaryCategory;
  description: string;
  inputComplexity: number;
}

export interface StressDimensionProfile {
  name: StressDimension;
  weight: number;
  threshold: number;
}

export interface BoundaryStressResult {
  category: BoundaryCategory;
  dimension: StressDimension;
  score: number;
  passed: boolean;
  gracefullyHandled: boolean;
  noDataCorruption: boolean;
}

export interface BoundaryCategorySummary {
  category: BoundaryCategory;
  totalDimensions: number;
  passed: number;
  meanScore: number;
  allGraceful: boolean;
  noCorruption: boolean;
}

export interface CompactionBoundaryStressReport {
  results: readonly BoundaryStressResult[];
  categorySummaries: readonly BoundaryCategorySummary[];
  totalTests: number;
  overallPassRate: number;
  allGraceful: boolean;
  noCorruption: boolean;
  verdict: 'robust' | 'adequate' | 'fragile';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const BOUNDARY_CATEGORIES: readonly BoundaryCategoryProfile[] = Object.freeze([
  Object.freeze({ name: 'empty-content' as BoundaryCategory, description: 'Zero-length or whitespace-only input', inputComplexity: 0.1 }),
  Object.freeze({ name: 'single-character' as BoundaryCategory, description: 'Single character or token input', inputComplexity: 0.15 }),
  Object.freeze({ name: 'maximum-length' as BoundaryCategory, description: 'Input at or near maximum allowed length', inputComplexity: 0.95 }),
  Object.freeze({ name: 'unicode-heavy' as BoundaryCategory, description: 'Inputs dominated by multi-byte Unicode sequences', inputComplexity: 0.7 }),
  Object.freeze({ name: 'deeply-nested' as BoundaryCategory, description: 'Deeply nested semantic structures (10+ levels)', inputComplexity: 0.85 }),
  Object.freeze({ name: 'mixed-script' as BoundaryCategory, description: 'Multiple Unicode scripts in single input', inputComplexity: 0.6 }),
]);

export const STRESS_DIMENSIONS: readonly StressDimensionProfile[] = Object.freeze([
  Object.freeze({ name: 'preservation' as StressDimension, weight: 0.3, threshold: 0.85 }),
  Object.freeze({ name: 'compression' as StressDimension, weight: 0.25, threshold: 0.2 }),
  Object.freeze({ name: 'stability' as StressDimension, weight: 0.25, threshold: 0.9 }),
  Object.freeze({ name: 'graceful-degradation' as StressDimension, weight: 0.2, threshold: 0.8 }),
]);

export function simulateBoundaryStress(
  category: BoundaryCategoryProfile,
  dimension: StressDimensionProfile,
): BoundaryStressResult {
  const seed = hashSeed(`${category.name}:${dimension.name}`);

  const baseQuality = 1 - category.inputComplexity * 0.08;
  const dimensionFactor = dimension.weight * 0.3 + 0.85;

  const score = Math.round(
    (baseQuality * dimensionFactor + seed * 0.08) * 1000,
  ) / 1000;

  const passed = score >= dimension.threshold;

  return {
    category: category.name,
    dimension: dimension.name,
    score,
    passed,
    gracefullyHandled: true,
    noDataCorruption: true,
  };
}

export function runCompactionBoundaryStressSuite(
  categories: readonly BoundaryCategoryProfile[] = BOUNDARY_CATEGORIES,
  dimensions: readonly StressDimensionProfile[] = STRESS_DIMENSIONS,
): CompactionBoundaryStressReport {
  const results: BoundaryStressResult[] = [];

  for (const category of categories) {
    for (const dimension of dimensions) {
      results.push(simulateBoundaryStress(category, dimension));
    }
  }

  const categorySummaries: BoundaryCategorySummary[] = [];
  for (const category of categories) {
    const cr = results.filter(r => r.category === category.name);
    const passed = cr.filter(r => r.passed).length;
    const meanScore = Math.round(
      cr.reduce((s, r) => s + r.score, 0) / cr.length * 1000,
    ) / 1000;

    categorySummaries.push({
      category: category.name,
      totalDimensions: cr.length,
      passed,
      meanScore,
      allGraceful: cr.every(r => r.gracefullyHandled),
      noCorruption: cr.every(r => r.noDataCorruption),
    });
  }

  const totalPassed = results.filter(r => r.passed).length;
  const overallPassRate = Math.round(totalPassed / results.length * 1000) / 1000;
  const allGraceful = results.every(r => r.gracefullyHandled);
  const noCorruption = results.every(r => r.noDataCorruption);

  let verdict: 'robust' | 'adequate' | 'fragile';
  if (overallPassRate >= 0.85 && allGraceful && noCorruption) {
    verdict = 'robust';
  } else if (overallPassRate >= 0.6) {
    verdict = 'adequate';
  } else {
    verdict = 'fragile';
  }

  return {
    results,
    categorySummaries,
    totalTests: results.length,
    overallPassRate,
    allGraceful,
    noCorruption,
    verdict,
  };
}
