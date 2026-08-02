/**
 * Multilingual parse model-family simulation runner (readiness R2.10).
 *
 * Simulates structured-parse quality across the model families the parse
 * pipeline is expected to run on (qwen, llama, gemma, generic) and a fixed
 * set of test languages (en, el, es, ja, zh, ar). For every family x
 * language combination it produces deterministic, seeded simulated
 * measurements -- valid parse rate, exact match rate, feature recall, and
 * fallback rate -- and aggregates them into per-family and per-language
 * summaries plus an overall cross-family production-readiness verdict.
 *
 * This module does not call any real model or parser: it is a self-contained
 * simulation harness for readiness planning and regression-shape testing.
 * Scores are derived from a deterministic hash of `family:language` (no
 * `Math.random`), so repeated runs are bit-for-bit reproducible.
 */

export const PARSE_MODEL_FAMILY_RUNNER_VERSION = '0.1.0' as const;

export type ParseModelFamilyId = 'qwen' | 'llama' | 'gemma' | 'generic';

export type TestLanguageCode = 'en' | 'el' | 'es' | 'ja' | 'zh' | 'ar';

export type ParseDifficulty = 'easy' | 'medium' | 'hard';

/** Simulated parse characteristics for a model family. */
export interface ModelFamilyProfile {
  id: ParseModelFamilyId;
  displayName: string;
  /** Simulated baseline parse accuracy for this family, in [0, 1]. */
  baseAccuracy: number;
  /** Simulated mean per-item parse latency in milliseconds. */
  speedMsPerItem: number;
  /** Languages this family is expected to support in production. */
  supportedLanguages: readonly TestLanguageCode[];
}

/** A test language with an expected parse-difficulty rating. */
export interface TestLanguageProfile {
  code: TestLanguageCode;
  displayName: string;
  difficulty: ParseDifficulty;
  /** Simulated accuracy penalty applied for this language's difficulty, in [0, 1]. */
  difficultyPenalty: number;
}

export const MODEL_FAMILIES: readonly ModelFamilyProfile[] = Object.freeze([
  Object.freeze({
    id: 'qwen',
    displayName: 'Qwen',
    baseAccuracy: 0.98,
    speedMsPerItem: 45,
    supportedLanguages: Object.freeze(['en', 'el', 'es', 'ja', 'zh', 'ar']),
  }),
  Object.freeze({
    id: 'llama',
    displayName: 'Llama',
    baseAccuracy: 0.965,
    speedMsPerItem: 55,
    supportedLanguages: Object.freeze(['en', 'el', 'es', 'ja', 'zh']),
  }),
  Object.freeze({
    id: 'gemma',
    displayName: 'Gemma',
    baseAccuracy: 0.96,
    speedMsPerItem: 40,
    supportedLanguages: Object.freeze(['en', 'el', 'es', 'ja', 'zh', 'ar']),
  }),
  Object.freeze({
    id: 'generic',
    displayName: 'Generic',
    baseAccuracy: 0.93,
    speedMsPerItem: 65,
    supportedLanguages: Object.freeze(['en', 'es']),
  }),
]) as readonly ModelFamilyProfile[];

export const TEST_LANGUAGES: readonly TestLanguageProfile[] = Object.freeze([
  Object.freeze({ code: 'en', displayName: 'English', difficulty: 'easy', difficultyPenalty: 0.0 }),
  Object.freeze({ code: 'es', displayName: 'Spanish', difficulty: 'easy', difficultyPenalty: 0.01 }),
  Object.freeze({ code: 'el', displayName: 'Greek', difficulty: 'medium', difficultyPenalty: 0.02 }),
  Object.freeze({ code: 'zh', displayName: 'Chinese', difficulty: 'hard', difficultyPenalty: 0.04 }),
  Object.freeze({ code: 'ja', displayName: 'Japanese', difficulty: 'hard', difficultyPenalty: 0.04 }),
  Object.freeze({ code: 'ar', displayName: 'Arabic', difficulty: 'hard', difficultyPenalty: 0.05 }),
]) as readonly TestLanguageProfile[];

export interface ParseRunMetrics {
  validParseRate: number;
  exactMatchRate: number;
  featureRecall: number;
  fallbackRate: number;
}

export interface ParseRunResult {
  family: ParseModelFamilyId;
  language: TestLanguageCode;
  /** Whether this family declares production support for this language. */
  supported: boolean;
  metrics: ParseRunMetrics;
  itemCount: number;
  meanLatencyMs: number;
}

/** Production gate thresholds a family x language run must clear to be considered passing. */
export interface ParseFamilyGateConfig {
  minValidParseRate: number;
  minExactMatchRate: number;
  minFeatureRecall: number;
  maxFallbackRate: number;
}

export const DEFAULT_PARSE_FAMILY_GATES: ParseFamilyGateConfig = Object.freeze({
  minValidParseRate: 0.85,
  minExactMatchRate: 0.70,
  minFeatureRecall: 0.80,
  maxFallbackRate: 0.20,
});

export interface ParseFamilyGateCheck {
  passed: boolean;
  failures: readonly string[];
}

/** Deterministic 32-bit FNV-1a hash of a seed string. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random fraction in [0, 1) derived from a seed string. */
function seededFraction(seed: string): number {
  return (hashSeed(seed) % 100000) / 100000;
}

/** Deterministic signed jitter in [-magnitude, magnitude) derived from a seed string. */
function seededJitter(seed: string, magnitude: number): number {
  return (seededFraction(seed) - 0.5) * 2 * magnitude;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Simulates a single parse run for a model family against a test language,
 * deriving deterministic (seeded, non-random) metrics from the family's
 * simulated base accuracy, the language's difficulty penalty, and whether
 * the family declares production support for the language.
 */
export function simulateParseRun(
  family: ModelFamilyProfile,
  language: TestLanguageProfile,
  itemCount = 200,
): ParseRunResult {
  const seed = `${family.id}:${language.code}`;
  const supported = family.supportedLanguages.includes(language.code);
  const unsupportedPenalty = supported ? 1.0 : 0.6;

  const jitter1 = seededJitter(`${seed}:valid`, 0.01);
  const jitter2 = seededJitter(`${seed}:exact`, 0.01);
  const jitter3 = seededJitter(`${seed}:recall`, 0.01);
  const jitter4 = seededJitter(`${seed}:fallback`, 0.01);

  const validParseRate = clamp01(
    (family.baseAccuracy - language.difficultyPenalty) * unsupportedPenalty + jitter1,
  );
  const exactMatchRate = clamp01(
    validParseRate - 0.05 - language.difficultyPenalty * 0.5 + jitter2,
  );
  const featureRecall = clamp01(validParseRate - 0.02 + jitter3);
  const fallbackRate = clamp01(
    (1 - validParseRate) * 0.5 + (supported ? 0 : 0.25) + jitter4 * 0.1,
  );

  const latencyJitter = seededFraction(`${seed}:latency`) * 8 - 4;
  const meanLatencyMs = Math.max(1, family.speedMsPerItem + language.difficultyPenalty * 100 + latencyJitter);

  return {
    family: family.id,
    language: language.code,
    supported,
    metrics: {
      validParseRate,
      exactMatchRate,
      featureRecall,
      fallbackRate,
    },
    itemCount,
    meanLatencyMs: Math.round(meanLatencyMs * 100) / 100,
  };
}

/** Checks a single run's metrics against gate thresholds. */
export function checkParseFamilyGates(
  metrics: ParseRunMetrics,
  gates: ParseFamilyGateConfig = DEFAULT_PARSE_FAMILY_GATES,
): ParseFamilyGateCheck {
  const failures: string[] = [];

  if (metrics.validParseRate < gates.minValidParseRate) {
    failures.push(`validParseRate ${metrics.validParseRate.toFixed(4)} < ${gates.minValidParseRate}`);
  }
  if (metrics.exactMatchRate < gates.minExactMatchRate) {
    failures.push(`exactMatchRate ${metrics.exactMatchRate.toFixed(4)} < ${gates.minExactMatchRate}`);
  }
  if (metrics.featureRecall < gates.minFeatureRecall) {
    failures.push(`featureRecall ${metrics.featureRecall.toFixed(4)} < ${gates.minFeatureRecall}`);
  }
  if (metrics.fallbackRate > gates.maxFallbackRate) {
    failures.push(`fallbackRate ${metrics.fallbackRate.toFixed(4)} > ${gates.maxFallbackRate}`);
  }

  return { passed: failures.length === 0, failures };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface ParseFamilySummary {
  family: ParseModelFamilyId;
  displayName: string;
  totalRuns: number;
  supportedRuns: number;
  supportedRunsPassed: number;
  allSupportedPassed: boolean;
  meanValidParseRateSupported: number;
  meanExactMatchRateSupported: number;
  meanFeatureRecallSupported: number;
  meanFallbackRateSupported: number;
  meanLatencyMsSupported: number;
  failingLanguages: readonly TestLanguageCode[];
}

export interface ParseLanguageSummary {
  language: TestLanguageCode;
  displayName: string;
  difficulty: ParseDifficulty;
  familiesSupporting: number;
  familiesPassing: number;
  allSupportingFamiliesPassed: boolean;
  meanValidParseRateSupported: number;
  meanExactMatchRateSupported: number;
  failingFamilies: readonly ParseModelFamilyId[];
}

export interface ModelFamilyParseSuiteReport {
  version: typeof PARSE_MODEL_FAMILY_RUNNER_VERSION;
  gates: ParseFamilyGateConfig;
  runs: readonly ParseRunResult[];
  familySummaries: readonly ParseFamilySummary[];
  languageSummaries: readonly ParseLanguageSummary[];
  verdict: 'production-ready' | 'not-ready';
  failingFamilies: readonly ParseModelFamilyId[];
}

/**
 * Runs the full family x language simulation matrix and produces per-family
 * and per-language summaries plus an overall cross-family verdict.
 *
 * A family x language combination is only held to the gates when the family
 * declares production support for that language (`supportedLanguages`).
 * Unsupported combinations are still simulated and reported (for visibility
 * into fallback behavior) but do not count against the family's or the
 * overall verdict. The overall verdict is `production-ready` only if every
 * family passes the gates on all of its supported languages.
 */
export function runModelFamilyParseSuite(
  families: readonly ModelFamilyProfile[] = MODEL_FAMILIES,
  languages: readonly TestLanguageProfile[] = TEST_LANGUAGES,
  gates: ParseFamilyGateConfig = DEFAULT_PARSE_FAMILY_GATES,
  itemCount = 200,
): ModelFamilyParseSuiteReport {
  const runs: ParseRunResult[] = [];
  for (const family of families) {
    for (const language of languages) {
      runs.push(simulateParseRun(family, language, itemCount));
    }
  }

  const familySummaries: ParseFamilySummary[] = families.map((family) => {
    const familyRuns = runs.filter((r) => r.family === family.id);
    const supportedRuns = familyRuns.filter((r) => r.supported);
    const failingLanguages: TestLanguageCode[] = [];
    let supportedRunsPassed = 0;

    for (const run of supportedRuns) {
      const check = checkParseFamilyGates(run.metrics, gates);
      if (check.passed) {
        supportedRunsPassed++;
      } else {
        failingLanguages.push(run.language);
      }
    }

    return {
      family: family.id,
      displayName: family.displayName,
      totalRuns: familyRuns.length,
      supportedRuns: supportedRuns.length,
      supportedRunsPassed,
      allSupportedPassed: supportedRuns.length > 0 && supportedRunsPassed === supportedRuns.length,
      meanValidParseRateSupported: mean(supportedRuns.map((r) => r.metrics.validParseRate)),
      meanExactMatchRateSupported: mean(supportedRuns.map((r) => r.metrics.exactMatchRate)),
      meanFeatureRecallSupported: mean(supportedRuns.map((r) => r.metrics.featureRecall)),
      meanFallbackRateSupported: mean(supportedRuns.map((r) => r.metrics.fallbackRate)),
      meanLatencyMsSupported: mean(supportedRuns.map((r) => r.meanLatencyMs)),
      failingLanguages,
    };
  });

  const languageSummaries: ParseLanguageSummary[] = languages.map((language) => {
    const languageRuns = runs.filter((r) => r.language === language.code);
    const supportedRuns = languageRuns.filter((r) => r.supported);
    const failingFamilies: ParseModelFamilyId[] = [];
    let familiesPassing = 0;

    for (const run of supportedRuns) {
      const check = checkParseFamilyGates(run.metrics, gates);
      if (check.passed) {
        familiesPassing++;
      } else {
        failingFamilies.push(run.family);
      }
    }

    return {
      language: language.code,
      displayName: language.displayName,
      difficulty: language.difficulty,
      familiesSupporting: supportedRuns.length,
      familiesPassing,
      allSupportingFamiliesPassed: supportedRuns.length > 0 && familiesPassing === supportedRuns.length,
      meanValidParseRateSupported: mean(supportedRuns.map((r) => r.metrics.validParseRate)),
      meanExactMatchRateSupported: mean(supportedRuns.map((r) => r.metrics.exactMatchRate)),
      failingFamilies,
    };
  });

  const failingFamilies = familySummaries.filter((f) => !f.allSupportedPassed).map((f) => f.family);

  return {
    version: PARSE_MODEL_FAMILY_RUNNER_VERSION,
    gates,
    runs,
    familySummaries,
    languageSummaries,
    verdict: failingFamilies.length === 0 ? 'production-ready' : 'not-ready',
    failingFamilies,
  };
}
