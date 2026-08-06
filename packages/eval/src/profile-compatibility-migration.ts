export type MigrationPathId =
  | 'qwen-safe-to-tight'
  | 'qwen-tight-to-short'
  | 'llama-safe-to-tight'
  | 'gemma-safe-to-short'
  | 'cross-family-qwen-llama'
  | 'cross-family-llama-gemma';

export type CompatibilityDimension =
  | 'semantic-preservation'
  | 'format-stability'
  | 'fallback-safety'
  | 'rollback-support'
  | 'version-detection';

export interface MigrationPathProfile {
  name: MigrationPathId;
  description: string;
  sourceFamily: string;
  targetFamily: string;
  crossFamily: boolean;
}

export interface CompatibilityDimensionProfile {
  name: CompatibilityDimension;
  weight: number;
  minimumScore: number;
}

export interface MigrationTestResult {
  path: MigrationPathId;
  dimension: CompatibilityDimension;
  score: number;
  passed: boolean;
  semanticsPreserved: boolean;
  rollbackSafe: boolean;
}

export interface MigrationPathSummary {
  path: MigrationPathId;
  totalDimensions: number;
  passed: number;
  meanScore: number;
  allSemanticsPreserved: boolean;
  allRollbackSafe: boolean;
}

export interface ProfileCompatibilityMigrationReport {
  results: readonly MigrationTestResult[];
  pathSummaries: readonly MigrationPathSummary[];
  totalTests: number;
  overallPassRate: number;
  allSemanticsPreserved: boolean;
  allRollbackSafe: boolean;
  verdict: 'safe' | 'cautious' | 'unsafe';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const MIGRATION_PATHS: readonly MigrationPathProfile[] = Object.freeze([
  Object.freeze({ name: 'qwen-safe-to-tight' as MigrationPathId, description: 'Qwen safe profile to tight profile', sourceFamily: 'qwen', targetFamily: 'qwen', crossFamily: false }),
  Object.freeze({ name: 'qwen-tight-to-short' as MigrationPathId, description: 'Qwen tight profile to short profile', sourceFamily: 'qwen', targetFamily: 'qwen', crossFamily: false }),
  Object.freeze({ name: 'llama-safe-to-tight' as MigrationPathId, description: 'Llama safe profile to tight profile', sourceFamily: 'llama', targetFamily: 'llama', crossFamily: false }),
  Object.freeze({ name: 'gemma-safe-to-short' as MigrationPathId, description: 'Gemma safe profile to short profile', sourceFamily: 'gemma', targetFamily: 'gemma', crossFamily: false }),
  Object.freeze({ name: 'cross-family-qwen-llama' as MigrationPathId, description: 'Cross-family migration from Qwen to Llama', sourceFamily: 'qwen', targetFamily: 'llama', crossFamily: true }),
  Object.freeze({ name: 'cross-family-llama-gemma' as MigrationPathId, description: 'Cross-family migration from Llama to Gemma', sourceFamily: 'llama', targetFamily: 'gemma', crossFamily: true }),
]);

export const COMPATIBILITY_DIMENSIONS: readonly CompatibilityDimensionProfile[] = Object.freeze([
  Object.freeze({ name: 'semantic-preservation' as CompatibilityDimension, weight: 0.3, minimumScore: 0.9 }),
  Object.freeze({ name: 'format-stability' as CompatibilityDimension, weight: 0.2, minimumScore: 0.85 }),
  Object.freeze({ name: 'fallback-safety' as CompatibilityDimension, weight: 0.2, minimumScore: 0.9 }),
  Object.freeze({ name: 'rollback-support' as CompatibilityDimension, weight: 0.15, minimumScore: 0.85 }),
  Object.freeze({ name: 'version-detection' as CompatibilityDimension, weight: 0.15, minimumScore: 0.8 }),
]);

export function simulateMigrationTest(
  path: MigrationPathProfile,
  dimension: CompatibilityDimensionProfile,
): MigrationTestResult {
  const seed = hashSeed(`${path.name}:${dimension.name}`);

  const familyPenalty = path.crossFamily ? 0.08 : 0;
  const baseScore = 0.88 + seed * 0.12 - familyPenalty;
  const score = Math.round(Math.min(1, Math.max(0, baseScore)) * 1000) / 1000;

  return {
    path: path.name,
    dimension: dimension.name,
    score,
    passed: score >= dimension.minimumScore,
    semanticsPreserved: true,
    rollbackSafe: true,
  };
}

export function runProfileCompatibilityMigrationSuite(
  paths: readonly MigrationPathProfile[] = MIGRATION_PATHS,
  dimensions: readonly CompatibilityDimensionProfile[] = COMPATIBILITY_DIMENSIONS,
): ProfileCompatibilityMigrationReport {
  const results: MigrationTestResult[] = [];

  for (const path of paths) {
    for (const dimension of dimensions) {
      results.push(simulateMigrationTest(path, dimension));
    }
  }

  const pathSummaries: MigrationPathSummary[] = [];
  for (const path of paths) {
    const pr = results.filter(r => r.path === path.name);
    const passed = pr.filter(r => r.passed).length;
    const meanScore = Math.round(
      pr.reduce((s, r) => s + r.score, 0) / pr.length * 1000,
    ) / 1000;

    pathSummaries.push({
      path: path.name,
      totalDimensions: pr.length,
      passed,
      meanScore,
      allSemanticsPreserved: pr.every(r => r.semanticsPreserved),
      allRollbackSafe: pr.every(r => r.rollbackSafe),
    });
  }

  const totalPassed = results.filter(r => r.passed).length;
  const overallPassRate = Math.round(totalPassed / results.length * 1000) / 1000;
  const allSemanticsPreserved = results.every(r => r.semanticsPreserved);
  const allRollbackSafe = results.every(r => r.rollbackSafe);

  let verdict: 'safe' | 'cautious' | 'unsafe';
  if (overallPassRate >= 0.9 && allSemanticsPreserved && allRollbackSafe) {
    verdict = 'safe';
  } else if (overallPassRate >= 0.6) {
    verdict = 'cautious';
  } else {
    verdict = 'unsafe';
  }

  return {
    results,
    pathSummaries,
    totalTests: results.length,
    overallPassRate,
    allSemanticsPreserved,
    allRollbackSafe,
    verdict,
  };
}
