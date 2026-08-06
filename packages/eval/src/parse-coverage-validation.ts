export type ParseLanguageGroup =
  | 'latin'
  | 'cyrillic'
  | 'cjk'
  | 'arabic'
  | 'indic'
  | 'southeast-asian';

export type ParseInputType =
  | 'plain-text'
  | 'structured-markup'
  | 'code-mixed'
  | 'abbreviations'
  | 'proper-nouns';

export interface LanguageGroupProfile {
  group: ParseLanguageGroup;
  description: string;
  languageCount: number;
  scriptComplexity: number;
}

export interface ParseInputProfile {
  type: ParseInputType;
  description: string;
  difficultyMultiplier: number;
}

export interface ParseCoverageResult {
  group: ParseLanguageGroup;
  inputType: ParseInputType;
  parseSuccessRate: number;
  featureExtractionRate: number;
  schemaConformanceRate: number;
  overallScore: number;
}

export interface LanguageGroupSummary {
  group: ParseLanguageGroup;
  totalTests: number;
  meanParseSuccess: number;
  meanFeatureExtraction: number;
  meanSchemaConformance: number;
  meanOverall: number;
}

export interface InputTypeSummary {
  inputType: ParseInputType;
  totalTests: number;
  meanOverall: number;
}

export interface ParseCoverageReport {
  results: readonly ParseCoverageResult[];
  groupSummaries: readonly LanguageGroupSummary[];
  inputTypeSummaries: readonly InputTypeSummary[];
  totalTests: number;
  overallCoverage: number;
  weakestGroup: ParseLanguageGroup;
  verdict: 'comprehensive' | 'adequate' | 'insufficient';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const LANGUAGE_GROUPS: readonly LanguageGroupProfile[] = Object.freeze([
  Object.freeze({ group: 'latin' as ParseLanguageGroup, description: 'Latin-script languages (EN, ES, FR, DE, ID)', languageCount: 5, scriptComplexity: 0.3 }),
  Object.freeze({ group: 'cyrillic' as ParseLanguageGroup, description: 'Cyrillic-script languages (RU, UK, BG)', languageCount: 3, scriptComplexity: 0.4 }),
  Object.freeze({ group: 'cjk' as ParseLanguageGroup, description: 'CJK languages (ZH, JA, KO)', languageCount: 3, scriptComplexity: 0.8 }),
  Object.freeze({ group: 'arabic' as ParseLanguageGroup, description: 'Arabic-script languages (AR, FA)', languageCount: 2, scriptComplexity: 0.7 }),
  Object.freeze({ group: 'indic' as ParseLanguageGroup, description: 'Indic-script languages (HI, BN, TA)', languageCount: 3, scriptComplexity: 0.6 }),
  Object.freeze({ group: 'southeast-asian' as ParseLanguageGroup, description: 'Southeast Asian languages (TH, VI)', languageCount: 2, scriptComplexity: 0.65 }),
]);

export const PARSE_INPUT_TYPES: readonly ParseInputProfile[] = Object.freeze([
  Object.freeze({ type: 'plain-text' as ParseInputType, description: 'Simple sentences', difficultyMultiplier: 1.0 }),
  Object.freeze({ type: 'structured-markup' as ParseInputType, description: 'Structured/tagged input', difficultyMultiplier: 0.9 }),
  Object.freeze({ type: 'code-mixed' as ParseInputType, description: 'Code-mixed multilingual text', difficultyMultiplier: 0.7 }),
  Object.freeze({ type: 'abbreviations' as ParseInputType, description: 'Domain abbreviations and acronyms', difficultyMultiplier: 0.8 }),
  Object.freeze({ type: 'proper-nouns' as ParseInputType, description: 'Named entities and proper nouns', difficultyMultiplier: 0.85 }),
]);

export function simulateParseCoverage(
  group: LanguageGroupProfile,
  input: ParseInputProfile,
): ParseCoverageResult {
  const seed = hashSeed(`${group.group}:${input.type}`);

  const baseSuccess = (1 - group.scriptComplexity * 0.3) * input.difficultyMultiplier;
  const parseSuccessRate = Math.round(Math.min(1, baseSuccess + seed * 0.1) * 1000) / 1000;
  const featureExtractionRate = Math.round(Math.min(1, parseSuccessRate * 0.95 + seed * 0.03) * 1000) / 1000;
  const schemaConformanceRate = Math.round(Math.min(1, parseSuccessRate * 0.98 + seed * 0.02) * 1000) / 1000;
  const overallScore = Math.round((parseSuccessRate * 0.4 + featureExtractionRate * 0.3 + schemaConformanceRate * 0.3) * 1000) / 1000;

  return {
    group: group.group,
    inputType: input.type,
    parseSuccessRate,
    featureExtractionRate,
    schemaConformanceRate,
    overallScore,
  };
}

export function runParseCoverageValidation(
  groups: readonly LanguageGroupProfile[] = LANGUAGE_GROUPS,
  inputs: readonly ParseInputProfile[] = PARSE_INPUT_TYPES,
): ParseCoverageReport {
  const results: ParseCoverageResult[] = [];

  for (const group of groups) {
    for (const input of inputs) {
      results.push(simulateParseCoverage(group, input));
    }
  }

  const groupSummaries: LanguageGroupSummary[] = [];
  for (const group of groups) {
    const gr = results.filter(r => r.group === group.group);
    groupSummaries.push({
      group: group.group,
      totalTests: gr.length,
      meanParseSuccess: Math.round(gr.reduce((s, r) => s + r.parseSuccessRate, 0) / gr.length * 1000) / 1000,
      meanFeatureExtraction: Math.round(gr.reduce((s, r) => s + r.featureExtractionRate, 0) / gr.length * 1000) / 1000,
      meanSchemaConformance: Math.round(gr.reduce((s, r) => s + r.schemaConformanceRate, 0) / gr.length * 1000) / 1000,
      meanOverall: Math.round(gr.reduce((s, r) => s + r.overallScore, 0) / gr.length * 1000) / 1000,
    });
  }

  const inputTypeSummaries: InputTypeSummary[] = [];
  for (const input of inputs) {
    const ir = results.filter(r => r.inputType === input.type);
    inputTypeSummaries.push({
      inputType: input.type,
      totalTests: ir.length,
      meanOverall: Math.round(ir.reduce((s, r) => s + r.overallScore, 0) / ir.length * 1000) / 1000,
    });
  }

  const overallCoverage = Math.round(results.reduce((s, r) => s + r.overallScore, 0) / results.length * 1000) / 1000;

  let weakestGroup = groupSummaries[0]!.group;
  let weakestScore = groupSummaries[0]!.meanOverall;
  for (const gs of groupSummaries) {
    if (gs.meanOverall < weakestScore) {
      weakestScore = gs.meanOverall;
      weakestGroup = gs.group;
    }
  }

  let verdict: 'comprehensive' | 'adequate' | 'insufficient';
  if (overallCoverage >= 0.8) {
    verdict = 'comprehensive';
  } else if (overallCoverage >= 0.6) {
    verdict = 'adequate';
  } else {
    verdict = 'insufficient';
  }

  return {
    results,
    groupSummaries,
    inputTypeSummaries,
    totalTests: results.length,
    overallCoverage,
    weakestGroup,
    verdict,
  };
}
