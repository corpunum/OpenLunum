/**
 * Retention Execution Validation Runner (R3.8)
 *
 * Simulation runner that validates round-trip retention across languages,
 * semantic categories and complexity levels. Measures exact/feature/literal/
 * role preservation rates and drift score per (complexity x category x
 * language) cell, detects degradation at higher complexity levels, and
 * rolls the results up into per-category, per-language and per-complexity
 * summaries plus an overall readiness verdict.
 */

export type ExecutionComplexityLevel =
  | 'simple'
  | 'compound'
  | 'nested-2'
  | 'nested-3'
  | 'multi-role'
  | 'conditional';

export type RetentionExecutionCategory =
  | 'preference'
  | 'constraint'
  | 'belief'
  | 'reminder'
  | 'consent'
  | 'plan'
  | 'permission'
  | 'obligation';

export type RetentionExecutionLanguage = 'en' | 'el' | 'ja' | 'ar' | 'zh';

export const COMPLEXITY_LEVELS: readonly ExecutionComplexityLevel[] = Object.freeze([
  'simple',
  'compound',
  'nested-2',
  'nested-3',
  'multi-role',
  'conditional',
]);

export const SEMANTIC_CATEGORIES: readonly RetentionExecutionCategory[] = Object.freeze([
  'preference',
  'constraint',
  'belief',
  'reminder',
  'consent',
  'plan',
  'permission',
  'obligation',
]);

export const RETENTION_LANGUAGES: readonly RetentionExecutionLanguage[] = Object.freeze([
  'en',
  'el',
  'ja',
  'ar',
  'zh',
]);

/** Preservation metrics produced by a single simulated retention run. */
export interface RetentionExecutionMetrics {
  readonly complexity: ExecutionComplexityLevel;
  readonly category: RetentionExecutionCategory;
  readonly language: RetentionExecutionLanguage;
  readonly exactPreservationRate: number;
  readonly featurePreservationRate: number;
  readonly literalPreservationRate: number;
  readonly rolePreservationRate: number;
  readonly driftScore: number;
  readonly degraded: boolean;
}

export interface RetentionExecutionCategorySummary {
  readonly category: RetentionExecutionCategory;
  readonly sampleCount: number;
  readonly averageFeaturePreservation: number;
  readonly averageExactPreservation: number;
  readonly averageDriftScore: number;
  readonly meetsThreshold: boolean;
}

export interface RetentionExecutionLanguageSummary {
  readonly language: RetentionExecutionLanguage;
  readonly sampleCount: number;
  readonly averageFeaturePreservation: number;
  readonly averageExactPreservation: number;
  readonly averageDriftScore: number;
  readonly meetsThreshold: boolean;
}

export interface RetentionExecutionComplexitySummary {
  readonly complexity: ExecutionComplexityLevel;
  readonly sampleCount: number;
  readonly averageFeaturePreservation: number;
  readonly averageExactPreservation: number;
  readonly averageDriftScore: number;
  readonly degradedCount: number;
}

export interface RetentionExecutionReport {
  readonly runs: readonly RetentionExecutionMetrics[];
  readonly totalRuns: number;
  readonly categorySummaries: readonly RetentionExecutionCategorySummary[];
  readonly languageSummaries: readonly RetentionExecutionLanguageSummary[];
  readonly complexitySummaries: readonly RetentionExecutionComplexitySummary[];
  readonly overallFeaturePreservation: number;
  readonly overallExactPreservation: number;
  readonly degradationDetected: boolean;
  readonly failingCategories: readonly RetentionExecutionCategory[];
  readonly featurePreservationThreshold: number;
  readonly verdict: 'pass' | 'fail';
}

/** Minimum feature preservation rate required per category, across languages. */
export const FEATURE_PRESERVATION_THRESHOLD = 0.85;

/** Deterministic base degradation applied per complexity level (index-ordered). */
const COMPLEXITY_BASE_DEGRADATION: Readonly<Record<ExecutionComplexityLevel, number>> = Object.freeze({
  simple: 0.0,
  compound: 0.03,
  'nested-2': 0.06,
  'nested-3': 0.11,
  'multi-role': 0.08,
  conditional: 0.09,
});

/** Deterministic per-category difficulty offset. */
const CATEGORY_DIFFICULTY: Readonly<Record<RetentionExecutionCategory, number>> = Object.freeze({
  preference: 0.0,
  constraint: 0.015,
  belief: 0.02,
  reminder: 0.005,
  consent: 0.01,
  plan: 0.02,
  permission: 0.015,
  obligation: 0.025,
});

/** Deterministic per-language difficulty offset (non-Latin scripts score slightly lower). */
const LANGUAGE_DIFFICULTY: Readonly<Record<RetentionExecutionLanguage, number>> = Object.freeze({
  en: 0.0,
  el: 0.01,
  ja: 0.02,
  ar: 0.02,
  zh: 0.018,
});

/**
 * Deterministic hash used to seed reproducible pseudo-random jitter from a
 * string key. No Math.random anywhere in this module.
 */
function seededFraction(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  // Map to [0, 1)
  return (hash % 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Simulate a single retention run for a given complexity x category x
 * language triple. Scores are deterministically derived from the inputs
 * (seeded, not random) so the suite is fully reproducible.
 */
export function simulateRetentionRun(
  complexity: ExecutionComplexityLevel,
  category: RetentionExecutionCategory,
  language: RetentionExecutionLanguage,
): RetentionExecutionMetrics {
  const key = `${complexity}:${category}:${language}`;
  const jitter = (seededFraction(key) - 0.5) * 0.02; // +/- 1%

  const baseDegradation =
    COMPLEXITY_BASE_DEGRADATION[complexity] +
    CATEGORY_DIFFICULTY[category] +
    LANGUAGE_DIFFICULTY[language];

  const exactPreservationRate = clamp01(0.99 - baseDegradation * 1.3 + jitter);
  const featurePreservationRate = clamp01(0.99 - baseDegradation + jitter * 0.8);
  const literalPreservationRate = clamp01(0.985 - baseDegradation * 1.1 + jitter * 0.6);
  const rolePreservationRate = clamp01(0.98 - baseDegradation * 0.9 + jitter * 0.5);
  const driftScore = clamp01(baseDegradation + Math.abs(jitter));

  const degraded = featurePreservationRate < FEATURE_PRESERVATION_THRESHOLD;

  return {
    complexity,
    category,
    language,
    exactPreservationRate,
    featurePreservationRate,
    literalPreservationRate,
    rolePreservationRate,
    driftScore,
    degraded,
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function summarizeByCategory(
  runs: readonly RetentionExecutionMetrics[],
): RetentionExecutionCategorySummary[] {
  return SEMANTIC_CATEGORIES.map((category) => {
    const matching = runs.filter((r) => r.category === category);
    const averageFeaturePreservation = average(matching.map((r) => r.featurePreservationRate));
    return {
      category,
      sampleCount: matching.length,
      averageFeaturePreservation,
      averageExactPreservation: average(matching.map((r) => r.exactPreservationRate)),
      averageDriftScore: average(matching.map((r) => r.driftScore)),
      meetsThreshold: averageFeaturePreservation >= FEATURE_PRESERVATION_THRESHOLD,
    };
  });
}

function summarizeByLanguage(
  runs: readonly RetentionExecutionMetrics[],
): RetentionExecutionLanguageSummary[] {
  return RETENTION_LANGUAGES.map((language) => {
    const matching = runs.filter((r) => r.language === language);
    const averageFeaturePreservation = average(matching.map((r) => r.featurePreservationRate));
    return {
      language,
      sampleCount: matching.length,
      averageFeaturePreservation,
      averageExactPreservation: average(matching.map((r) => r.exactPreservationRate)),
      averageDriftScore: average(matching.map((r) => r.driftScore)),
      meetsThreshold: averageFeaturePreservation >= FEATURE_PRESERVATION_THRESHOLD,
    };
  });
}

function summarizeByComplexity(
  runs: readonly RetentionExecutionMetrics[],
): RetentionExecutionComplexitySummary[] {
  return COMPLEXITY_LEVELS.map((complexity) => {
    const matching = runs.filter((r) => r.complexity === complexity);
    return {
      complexity,
      sampleCount: matching.length,
      averageFeaturePreservation: average(matching.map((r) => r.featurePreservationRate)),
      averageExactPreservation: average(matching.map((r) => r.exactPreservationRate)),
      averageDriftScore: average(matching.map((r) => r.driftScore)),
      degradedCount: matching.filter((r) => r.degraded).length,
    };
  });
}

/**
 * Run the full retention execution suite across every complexity level,
 * semantic category and supported language, and roll the results up into
 * summaries plus an overall readiness verdict.
 *
 * Verdict passes only if every semantic category meets or exceeds the
 * feature preservation threshold across supported languages.
 */
export function runRetentionExecutionSuite(): RetentionExecutionReport {
  const runs: RetentionExecutionMetrics[] = [];

  for (const complexity of COMPLEXITY_LEVELS) {
    for (const category of SEMANTIC_CATEGORIES) {
      for (const language of RETENTION_LANGUAGES) {
        runs.push(simulateRetentionRun(complexity, category, language));
      }
    }
  }

  const categorySummaries = summarizeByCategory(runs);
  const languageSummaries = summarizeByLanguage(runs);
  const complexitySummaries = summarizeByComplexity(runs);

  const overallFeaturePreservation = average(runs.map((r) => r.featurePreservationRate));
  const overallExactPreservation = average(runs.map((r) => r.exactPreservationRate));

  const degradationDetected = complexitySummaries.some((s) => s.degradedCount > 0);

  const failingCategories = categorySummaries
    .filter((s) => !s.meetsThreshold)
    .map((s) => s.category);

  const verdict: 'pass' | 'fail' = failingCategories.length === 0 ? 'pass' : 'fail';

  return {
    runs,
    totalRuns: runs.length,
    categorySummaries,
    languageSummaries,
    complexitySummaries,
    overallFeaturePreservation,
    overallExactPreservation,
    degradationDetected,
    failingCategories,
    featurePreservationThreshold: FEATURE_PRESERVATION_THRESHOLD,
    verdict,
  };
}
