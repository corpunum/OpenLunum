/**
 * Production parse gates (readiness R2.7, issue #375).
 *
 * Defines the threshold configuration a parse-experiment run must clear
 * before its target scope (a language, a model profile, a supported
 * semantic-group set, etc.) can be declared production-ready. This module
 * does NOT run experiments or compute scores itself -- it consumes an
 * already-aggregated `ParseResults` summary (the kind of totals
 * `parse-experiment.ts` / `runner.ts` already produce) and checks it against
 * configurable thresholds.
 *
 * It does not touch the near-semantic scorer, its 0.8 threshold, or any
 * scoring logic -- see `threshold-sweep.ts` for that frozen threshold's own
 * measurement. The gate thresholds defined here are a separate, independent
 * concept: they describe when an *aggregate parse run* is good enough to
 * ship, not how any single pair is scored.
 */

/**
 * Configurable production parse gate thresholds. All fields are *minimums*
 * (a run must be >= the threshold to pass) except `fallbackRate`, which is a
 * *maximum* (a run must be <= the threshold to pass).
 */
export interface ParseGateConfig {
  /** Minimum fraction of inputs that must produce a valid, schema-conformant parse. */
  validParseRate: number;
  /** Minimum fraction of inputs that must produce an exact semantic match against gold. */
  exactMatchRate: number;
  /** Minimum mean feature recall across parsed inputs. */
  featureRecallMin: number;
  /** Minimum mean feature precision across parsed inputs. */
  featurePrecisionMin: number;
  /**
   * Minimum pass rate for safety-critical invariants (e.g. protected-literal
   * placement, hard-compatibility checks). Fixed at 1.0 -- see
   * `checkParseGates`, which refuses to honor a lower override.
   */
  safetyInvariantPassRate: number;
  /** Maximum fraction of inputs allowed to fall back to natural text instead of a structured parse. */
  fallbackRate: number;
}

/**
 * Default production parse gate thresholds. These are suggested starting
 * points for owner calibration, not frozen constants -- callers may pass a
 * custom `ParseGateConfig` to `checkParseGates`, except `safetyInvariantPassRate`,
 * which can never be relaxed below 1.0 regardless of what is passed in.
 */
export const DEFAULT_PARSE_GATES: ParseGateConfig = {
  validParseRate: 0.95,
  exactMatchRate: 0.85,
  featureRecallMin: 0.90,
  featurePrecisionMin: 0.90,
  safetyInvariantPassRate: 1.0,
  fallbackRate: 0.10
};

/** The minimum floor safety invariants are held to, independent of any config passed in. */
export const SAFETY_INVARIANT_PASS_RATE_FLOOR = 1.0;

/**
 * Aggregate results for a parse run (a language, a model profile, or any
 * other scoped slice) that `checkParseGates` evaluates against a
 * `ParseGateConfig`. All rates are expected in [0, 1].
 */
export interface ParseResults {
  /** Fraction of inputs that produced a valid, schema-conformant parse. */
  validParseRate: number;
  /** Fraction of inputs that produced an exact semantic match against gold. */
  exactMatchRate: number;
  /** Mean feature recall across parsed inputs. */
  featureRecall: number;
  /** Mean feature precision across parsed inputs. */
  featurePrecision: number;
  /** Pass rate for safety-critical invariants. */
  safetyInvariantPassRate: number;
  /** Fraction of inputs that fell back to natural text instead of a structured parse. */
  fallbackRate: number;
}

export type ParseGateName =
  | 'validParseRate'
  | 'exactMatchRate'
  | 'featureRecallMin'
  | 'featurePrecisionMin'
  | 'safetyInvariantPassRate'
  | 'fallbackRate';

export interface ParseGateResult {
  gate: ParseGateName;
  /** The threshold the result was checked against (post-floor, for safetyInvariantPassRate). */
  threshold: number;
  /** The observed value from `ParseResults`. */
  actual: number;
  passed: boolean;
}

export interface ParseGateVerdict {
  passed: boolean;
  gates: ParseGateResult[];
  config: ParseGateConfig;
}

/**
 * Applies the safety-invariant floor: `safetyInvariantPassRate` in a config
 * can never be lowered below `SAFETY_INVARIANT_PASS_RATE_FLOOR` (1.0), no
 * matter what a caller passes in. Every other threshold is configurable.
 */
function resolveConfig(config: ParseGateConfig): ParseGateConfig {
  return {
    ...config,
    safetyInvariantPassRate: Math.max(config.safetyInvariantPassRate, SAFETY_INVARIANT_PASS_RATE_FLOOR)
  };
}

/**
 * Checks an aggregated parse run against production parse gate thresholds.
 * Returns a per-gate breakdown plus an overall pass/fail. Defaults to
 * `DEFAULT_PARSE_GATES` when no config is supplied.
 */
export function checkParseGates(results: ParseResults, config: ParseGateConfig = DEFAULT_PARSE_GATES): ParseGateVerdict {
  const resolved = resolveConfig(config);

  const gates: ParseGateResult[] = [
    { gate: 'validParseRate', threshold: resolved.validParseRate, actual: results.validParseRate, passed: results.validParseRate >= resolved.validParseRate },
    { gate: 'exactMatchRate', threshold: resolved.exactMatchRate, actual: results.exactMatchRate, passed: results.exactMatchRate >= resolved.exactMatchRate },
    { gate: 'featureRecallMin', threshold: resolved.featureRecallMin, actual: results.featureRecall, passed: results.featureRecall >= resolved.featureRecallMin },
    { gate: 'featurePrecisionMin', threshold: resolved.featurePrecisionMin, actual: results.featurePrecision, passed: results.featurePrecision >= resolved.featurePrecisionMin },
    { gate: 'safetyInvariantPassRate', threshold: resolved.safetyInvariantPassRate, actual: results.safetyInvariantPassRate, passed: results.safetyInvariantPassRate >= resolved.safetyInvariantPassRate },
    { gate: 'fallbackRate', threshold: resolved.fallbackRate, actual: results.fallbackRate, passed: results.fallbackRate <= resolved.fallbackRate }
  ];

  return {
    passed: gates.every((gate) => gate.passed),
    gates,
    config: resolved
  };
}
