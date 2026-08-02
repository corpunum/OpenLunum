/**
 * Parse threshold validation runner (R2 readiness).
 *
 * Builds on parse-gates.ts to provide batch validation of parse results
 * across multiple scopes (languages, models, semantic groups), detecting
 * regressions and producing structured validation reports.
 */

import type { ParseGateConfig, ParseResults } from './parse-gates.js';
import { DEFAULT_PARSE_GATES, SAFETY_INVARIANT_PASS_RATE_FLOOR } from './parse-gates.js';

export type ValidationScope = 'language' | 'model' | 'semantic-group' | 'overall';

export interface ScopedParseResults {
  scopeType: ValidationScope;
  scopeId: string;
  results: ParseResults;
  sampleCount: number;
}

export interface GateViolation {
  gate: keyof ParseGateConfig;
  threshold: number;
  actual: number;
  deficit: number;
  isSafetyGate: boolean;
}

export interface ScopeValidation {
  scopeType: ValidationScope;
  scopeId: string;
  sampleCount: number;
  passed: boolean;
  violations: readonly GateViolation[];
  safetyViolation: boolean;
  worstGate: keyof ParseGateConfig | null;
  worstDeficit: number;
}

export interface RegressionEntry {
  scopeId: string;
  gate: keyof ParseGateConfig;
  previous: number;
  current: number;
  delta: number;
  regressed: boolean;
}

export interface ValidationReport {
  config: ParseGateConfig;
  scopes: readonly ScopeValidation[];
  totalScopes: number;
  passedScopes: number;
  failedScopes: number;
  safetyFailures: number;
  regressions: readonly RegressionEntry[];
  overallVerdict: 'pass' | 'partial' | 'fail' | 'safety-fail';
}

export const GATE_KEYS: readonly (keyof ParseGateConfig)[] = Object.freeze([
  'validParseRate',
  'exactMatchRate',
  'featureRecallMin',
  'featurePrecisionMin',
  'safetyInvariantPassRate',
  'fallbackRate',
] as const);

function getResultValue(results: ParseResults, gate: keyof ParseGateConfig): number {
  switch (gate) {
    case 'validParseRate': return results.validParseRate;
    case 'exactMatchRate': return results.exactMatchRate;
    case 'featureRecallMin': return results.featureRecall;
    case 'featurePrecisionMin': return results.featurePrecision;
    case 'safetyInvariantPassRate': return results.safetyInvariantPassRate;
    case 'fallbackRate': return results.fallbackRate;
  }
}

function isInverted(gate: keyof ParseGateConfig): boolean {
  return gate === 'fallbackRate';
}

export function validateScope(
  scoped: ScopedParseResults,
  config: ParseGateConfig = DEFAULT_PARSE_GATES,
): ScopeValidation {
  const effectiveConfig = {
    ...config,
    safetyInvariantPassRate: Math.max(config.safetyInvariantPassRate, SAFETY_INVARIANT_PASS_RATE_FLOOR),
  };

  const violations: GateViolation[] = [];

  for (const gate of GATE_KEYS) {
    const threshold = effectiveConfig[gate];
    const actual = getResultValue(scoped.results, gate);
    const inverted = isInverted(gate);

    const failed = inverted ? actual > threshold : actual < threshold;

    if (failed) {
      const deficit = inverted ? actual - threshold : threshold - actual;
      violations.push({
        gate,
        threshold,
        actual,
        deficit,
        isSafetyGate: gate === 'safetyInvariantPassRate',
      });
    }
  }

  const safetyViolation = violations.some(v => v.isSafetyGate);

  let worstGate: keyof ParseGateConfig | null = null;
  let worstDeficit = 0;
  for (const v of violations) {
    if (v.deficit > worstDeficit) {
      worstDeficit = v.deficit;
      worstGate = v.gate;
    }
  }

  return {
    scopeType: scoped.scopeType,
    scopeId: scoped.scopeId,
    sampleCount: scoped.sampleCount,
    passed: violations.length === 0,
    violations,
    safetyViolation,
    worstGate,
    worstDeficit,
  };
}

export function detectRegressions(
  current: readonly ScopedParseResults[],
  previous: readonly ScopedParseResults[],
  threshold: number = 0.02,
): readonly RegressionEntry[] {
  const prevMap = new Map(previous.map(p => [p.scopeId, p]));
  const entries: RegressionEntry[] = [];

  for (const cur of current) {
    const prev = prevMap.get(cur.scopeId);
    if (!prev) continue;

    for (const gate of GATE_KEYS) {
      const curVal = getResultValue(cur.results, gate);
      const prevVal = getResultValue(prev.results, gate);
      const inverted = isInverted(gate);
      const delta = curVal - prevVal;
      const regressed = inverted ? delta > threshold : delta < -threshold;

      if (regressed) {
        entries.push({
          scopeId: cur.scopeId,
          gate,
          previous: prevVal,
          current: curVal,
          delta,
          regressed: true,
        });
      }
    }
  }

  return entries;
}

export function runValidation(
  scopes: readonly ScopedParseResults[],
  config: ParseGateConfig = DEFAULT_PARSE_GATES,
  previousResults?: readonly ScopedParseResults[],
): ValidationReport {
  const validations = scopes.map(s => validateScope(s, config));

  const passedScopes = validations.filter(v => v.passed).length;
  const failedScopes = validations.filter(v => !v.passed).length;
  const safetyFailures = validations.filter(v => v.safetyViolation).length;

  const regressions = previousResults ? detectRegressions(scopes, previousResults) : [];

  let overallVerdict: 'pass' | 'partial' | 'fail' | 'safety-fail';
  if (safetyFailures > 0) {
    overallVerdict = 'safety-fail';
  } else if (failedScopes === validations.length) {
    overallVerdict = 'fail';
  } else if (failedScopes > 0) {
    overallVerdict = 'partial';
  } else {
    overallVerdict = 'pass';
  }

  return {
    config,
    scopes: validations,
    totalScopes: validations.length,
    passedScopes,
    failedScopes,
    safetyFailures,
    regressions,
    overallVerdict,
  };
}

function makePassingResults(): ParseResults {
  return {
    validParseRate: 0.98,
    exactMatchRate: 0.92,
    featureRecall: 0.95,
    featurePrecision: 0.94,
    safetyInvariantPassRate: 1.0,
    fallbackRate: 0.04,
  };
}

function makeDegradedResults(): ParseResults {
  return {
    validParseRate: 0.90,
    exactMatchRate: 0.78,
    featureRecall: 0.85,
    featurePrecision: 0.83,
    safetyInvariantPassRate: 1.0,
    fallbackRate: 0.15,
  };
}

function makeSafetyFailResults(): ParseResults {
  return {
    validParseRate: 0.96,
    exactMatchRate: 0.88,
    featureRecall: 0.92,
    featurePrecision: 0.91,
    safetyInvariantPassRate: 0.95,
    fallbackRate: 0.06,
  };
}

export const SAMPLE_SCOPED_RESULTS: readonly ScopedParseResults[] = Object.freeze([
  Object.freeze({ scopeType: 'language' as ValidationScope, scopeId: 'en', results: makePassingResults(), sampleCount: 50 }),
  Object.freeze({ scopeType: 'language' as ValidationScope, scopeId: 'el', results: makePassingResults(), sampleCount: 30 }),
  Object.freeze({ scopeType: 'language' as ValidationScope, scopeId: 'ja', results: makeDegradedResults(), sampleCount: 25 }),
  Object.freeze({ scopeType: 'language' as ValidationScope, scopeId: 'ar', results: makeSafetyFailResults(), sampleCount: 20 }),
  Object.freeze({ scopeType: 'model' as ValidationScope, scopeId: 'qwen3.6-35b', results: makePassingResults(), sampleCount: 100 }),
]);

export function runSampleValidation(): ValidationReport {
  return runValidation(SAMPLE_SCOPED_RESULTS);
}
