/**
 * Tests for the production parse gates module (readiness R2.7, issue #458).
 *
 * `checkParseGates` is a pure function over an already-aggregated
 * `ParseResults` summary, so it is tested directly against hand-built
 * fixtures: an all-pass baseline, one failure per individual gate, the
 * safety-invariant floor (which cannot be lowered even via explicit
 * override), and custom config overrides for the other gates.
 *
 * `ParseGateEvaluator` is also tested for multi-scope evaluation, including:
 * all scopes passing, individual scope failures, per-gate aggregation across
 * scopes, and custom gate config application.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARSE_GATES,
  SAFETY_INVARIANT_PASS_RATE_FLOOR,
  checkParseGates,
  ParseGateEvaluator,
  type ParseGateConfig,
  type ParseResults
} from '../src/parse-gates.js';

/** A `ParseResults` fixture that clears every default gate. */
const passingResults: ParseResults = {
  validParseRate: 0.97,
  exactMatchRate: 0.9,
  featureRecall: 0.95,
  featurePrecision: 0.95,
  safetyInvariantPassRate: 1.0,
  fallbackRate: 0.05
};

test('DEFAULT_PARSE_GATES matches the suggested production thresholds', () => {
  assert.equal(DEFAULT_PARSE_GATES.validParseRate, 0.95);
  assert.equal(DEFAULT_PARSE_GATES.exactMatchRate, 0.85);
  assert.equal(DEFAULT_PARSE_GATES.featureRecallMin, 0.90);
  assert.equal(DEFAULT_PARSE_GATES.featurePrecisionMin, 0.90);
  assert.equal(DEFAULT_PARSE_GATES.safetyInvariantPassRate, 1.0);
  assert.equal(DEFAULT_PARSE_GATES.fallbackRate, 0.10);
});

test('checkParseGates: all gates pass on a comfortably-clearing result', () => {
  const verdict = checkParseGates(passingResults);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.gates.length, 6);
  for (const gate of verdict.gates) {
    assert.equal(gate.passed, true, `expected gate ${gate.gate} to pass`);
  }
});

test('checkParseGates: defaults are used when no config is supplied', () => {
  const verdict = checkParseGates(passingResults);
  assert.deepEqual(verdict.config, DEFAULT_PARSE_GATES);
});

test('checkParseGates: validParseRate below threshold fails only that gate', () => {
  const results: ParseResults = { ...passingResults, validParseRate: 0.5 };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, false);
  const gate = verdict.gates.find((g) => g.gate === 'validParseRate');
  assert.equal(gate!.passed, false);
  assert.equal(gate!.actual, 0.5);
  const others = verdict.gates.filter((g) => g.gate !== 'validParseRate');
  for (const other of others) assert.equal(other.passed, true);
});

test('checkParseGates: exactMatchRate below threshold fails only that gate', () => {
  const results: ParseResults = { ...passingResults, exactMatchRate: 0.5 };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.gates.find((g) => g.gate === 'exactMatchRate')!.passed, false);
});

test('checkParseGates: featureRecall below threshold fails only that gate', () => {
  const results: ParseResults = { ...passingResults, featureRecall: 0.5 };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.gates.find((g) => g.gate === 'featureRecallMin')!.passed, false);
});

test('checkParseGates: featurePrecision below threshold fails only that gate', () => {
  const results: ParseResults = { ...passingResults, featurePrecision: 0.5 };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.gates.find((g) => g.gate === 'featurePrecisionMin')!.passed, false);
});

test('checkParseGates: safetyInvariantPassRate below 1.0 fails only that gate', () => {
  const results: ParseResults = { ...passingResults, safetyInvariantPassRate: 0.999 };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.gates.find((g) => g.gate === 'safetyInvariantPassRate')!.passed, false);
});

test('checkParseGates: fallbackRate above threshold (max, not min) fails only that gate', () => {
  const results: ParseResults = { ...passingResults, fallbackRate: 0.5 };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, false);
  const gate = verdict.gates.find((g) => g.gate === 'fallbackRate');
  assert.equal(gate!.passed, false);
  // Sanity: a LOWER fallback rate than the default threshold still passes.
  const lowFallback = checkParseGates({ ...passingResults, fallbackRate: 0.0 });
  assert.equal(lowFallback.gates.find((g) => g.gate === 'fallbackRate')!.passed, true);
});

test('safety invariant gate cannot be lowered below 1.0 via config override', () => {
  const laxConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, safetyInvariantPassRate: 0.5 };
  // Even with an "official" 0.5 safety pass rate requested, a run at 0.99
  // (i.e. below the true floor of 1.0) must still fail the gate.
  const results: ParseResults = { ...passingResults, safetyInvariantPassRate: 0.99 };
  const verdict = checkParseGates(results, laxConfig);
  assert.equal(verdict.passed, false);
  const gate = verdict.gates.find((g) => g.gate === 'safetyInvariantPassRate');
  assert.equal(gate!.passed, false);
  assert.equal(gate!.threshold, SAFETY_INVARIANT_PASS_RATE_FLOOR, 'the resolved threshold must be clamped to the 1.0 floor, not the lax override');
  assert.equal(verdict.config.safetyInvariantPassRate, SAFETY_INVARIANT_PASS_RATE_FLOOR);
});

test('safety invariant gate cannot be lowered even by an extremely lax override (e.g. 0)', () => {
  const laxConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, safetyInvariantPassRate: 0 };
  const results: ParseResults = { ...passingResults, safetyInvariantPassRate: 1.0 };
  const verdict = checkParseGates(results, laxConfig);
  // A perfect 1.0 result still passes -- the floor doesn't reject good results,
  // it only refuses to let the threshold itself be lowered.
  assert.equal(verdict.gates.find((g) => g.gate === 'safetyInvariantPassRate')!.passed, true);
  assert.equal(verdict.config.safetyInvariantPassRate, SAFETY_INVARIANT_PASS_RATE_FLOOR);
});

test('custom config overrides: a stricter custom config can fail a result that clears defaults', () => {
  const strictConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, exactMatchRate: 0.99 };
  const verdict = checkParseGates(passingResults, strictConfig);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.gates.find((g) => g.gate === 'exactMatchRate')!.passed, false);
});

test('custom config overrides: a looser custom config can pass a result that fails defaults', () => {
  const looseConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, validParseRate: 0.3, exactMatchRate: 0.3, fallbackRate: 0.9 };
  const results: ParseResults = { ...passingResults, validParseRate: 0.4, exactMatchRate: 0.4, fallbackRate: 0.6 };
  const verdict = checkParseGates(results, looseConfig);
  assert.equal(verdict.passed, true);
});

test('checkParseGates: boundary values (exactly at threshold) pass', () => {
  const results: ParseResults = {
    validParseRate: DEFAULT_PARSE_GATES.validParseRate,
    exactMatchRate: DEFAULT_PARSE_GATES.exactMatchRate,
    featureRecall: DEFAULT_PARSE_GATES.featureRecallMin,
    featurePrecision: DEFAULT_PARSE_GATES.featurePrecisionMin,
    safetyInvariantPassRate: 1.0,
    fallbackRate: DEFAULT_PARSE_GATES.fallbackRate
  };
  const verdict = checkParseGates(results);
  assert.equal(verdict.passed, true);
});

// --- Tests for ParseGateEvaluator ---

test('ParseGateEvaluator: default constructor uses DEFAULT_PARSE_GATES', () => {
  const evaluator = new ParseGateEvaluator();
  const config = evaluator.getConfig();
  assert.deepEqual(config, DEFAULT_PARSE_GATES);
});

test('ParseGateEvaluator: custom config is applied and enforced', () => {
  const customConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, exactMatchRate: 0.99 };
  const evaluator = new ParseGateEvaluator(customConfig);
  const config = evaluator.getConfig();
  assert.equal(config.exactMatchRate, 0.99);
});

test('ParseGateEvaluator: evaluate() with all-passing scopes returns allPassed = true', () => {
  const evaluator = new ParseGateEvaluator();
  const scopedResults = {
    en: passingResults,
    el: { ...passingResults, validParseRate: 0.96 }
  };
  const report = evaluator.evaluate(scopedResults);
  assert.equal(report.allPassed, true);
  assert.equal(report.scopeVerdicts.length, 2);
  for (const verdict of report.scopeVerdicts) {
    assert.equal(verdict.passed, true, `expected scope ${verdict.scope} to pass`);
  }
});

test('ParseGateEvaluator: single failing scope causes allPassed = false', () => {
  const evaluator = new ParseGateEvaluator();
  const scopedResults = {
    en: passingResults,
    el: { ...passingResults, validParseRate: 0.5 }
  };
  const report = evaluator.evaluate(scopedResults);
  assert.equal(report.allPassed, false);
  const enVerdict = report.scopeVerdicts.find((v) => v.scope === 'en');
  const elVerdict = report.scopeVerdicts.find((v) => v.scope === 'el');
  assert.equal(enVerdict!.passed, true);
  assert.equal(elVerdict!.passed, false);
});

test('ParseGateEvaluator: per-gate aggregation correctly identifies failing gates', () => {
  const evaluator = new ParseGateEvaluator();
  const scopedResults = {
    en: { ...passingResults, validParseRate: 0.5 },
    el: { ...passingResults, exactMatchRate: 0.5 }
  };
  const report = evaluator.evaluate(scopedResults);
  assert.equal(report.allPassed, false);
  // validParseRate fails in the 'en' scope.
  assert.equal(report.gateAggregate.validParseRate, false);
  // exactMatchRate fails in the 'el' scope.
  assert.equal(report.gateAggregate.exactMatchRate, false);
  // Other gates pass in all scopes.
  assert.equal(report.gateAggregate.featureRecallMin, true);
  assert.equal(report.gateAggregate.featurePrecisionMin, true);
  assert.equal(report.gateAggregate.safetyInvariantPassRate, true);
  assert.equal(report.gateAggregate.fallbackRate, true);
});

test('ParseGateEvaluator: evaluateScope() returns a single scope verdict', () => {
  const evaluator = new ParseGateEvaluator();
  const verdict = evaluator.evaluateScope('en', passingResults);
  assert.equal(verdict.scope, 'en');
  assert.equal(verdict.passed, true);
  assert.equal(verdict.gates.length, 6);
  for (const gate of verdict.gates) {
    assert.equal(gate.passed, true);
  }
});

test('ParseGateEvaluator: evaluateScope() with failing result returns passed = false', () => {
  const evaluator = new ParseGateEvaluator();
  const failingResults = { ...passingResults, validParseRate: 0.5 };
  const verdict = evaluator.evaluateScope('en', failingResults);
  assert.equal(verdict.scope, 'en');
  assert.equal(verdict.passed, false);
  const gate = verdict.gates.find((g) => g.gate === 'validParseRate');
  assert.equal(gate!.passed, false);
});

test('ParseGateEvaluator: custom config affects multi-scope evaluation', () => {
  const customConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, exactMatchRate: 0.99 };
  const evaluator = new ParseGateEvaluator(customConfig);
  const scopedResults = {
    en: passingResults,
    el: { ...passingResults, exactMatchRate: 0.9 }
  };
  const report = evaluator.evaluate(scopedResults);
  assert.equal(report.allPassed, false);
  // The 'el' scope should fail because exactMatchRate (0.9) is below the custom threshold (0.99).
  const elVerdict = report.scopeVerdicts.find((v) => v.scope === 'el');
  assert.equal(elVerdict!.passed, false);
  const gate = elVerdict!.gates.find((g) => g.gate === 'exactMatchRate');
  assert.equal(gate!.passed, false);
  assert.equal(gate!.threshold, 0.99);
});

test('ParseGateEvaluator: empty scope map results in allPassed = true', () => {
  const evaluator = new ParseGateEvaluator();
  const report = evaluator.evaluate({});
  assert.equal(report.allPassed, true);
  assert.equal(report.scopeVerdicts.length, 0);
});

test('ParseGateEvaluator: multiple failing scopes aggregate correctly', () => {
  const evaluator = new ParseGateEvaluator();
  const scopedResults = {
    en: { ...passingResults, validParseRate: 0.5, featureRecall: 0.5 },
    el: { ...passingResults, exactMatchRate: 0.5, featurePrecision: 0.5 },
    id: { ...passingResults, fallbackRate: 0.9 }
  };
  const report = evaluator.evaluate(scopedResults);
  assert.equal(report.allPassed, false);
  assert.equal(report.scopeVerdicts.length, 3);
  // Check gate aggregates.
  assert.equal(report.gateAggregate.validParseRate, false);
  assert.equal(report.gateAggregate.featureRecallMin, false);
  assert.equal(report.gateAggregate.exactMatchRate, false);
  assert.equal(report.gateAggregate.featurePrecisionMin, false);
  assert.equal(report.gateAggregate.fallbackRate, false);
  assert.equal(report.gateAggregate.safetyInvariantPassRate, true);
});

test('ParseGateEvaluator: safety invariant floor is enforced across scopes', () => {
  const laxConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, safetyInvariantPassRate: 0.5 };
  const evaluator = new ParseGateEvaluator(laxConfig);
  const scopedResults = {
    en: { ...passingResults, safetyInvariantPassRate: 0.99 },
    el: passingResults
  };
  const report = evaluator.evaluate(scopedResults);
  // The 'en' scope should fail because safetyInvariantPassRate (0.99) is below the floor (1.0).
  assert.equal(report.allPassed, false);
  const enVerdict = report.scopeVerdicts.find((v) => v.scope === 'en');
  assert.equal(enVerdict!.passed, false);
  const gate = enVerdict!.gates.find((g) => g.gate === 'safetyInvariantPassRate');
  assert.equal(gate!.passed, false);
  assert.equal(gate!.threshold, SAFETY_INVARIANT_PASS_RATE_FLOOR);
});

test('ParseGateEvaluator: large-scale multi-scope evaluation', () => {
  const evaluator = new ParseGateEvaluator();
  const scopedResults: Record<string, ParseResults> = {};
  const languages = ['en', 'el', 'id', 'es', 'fr', 'de'];

  // Create results for each language, with one failing.
  for (const lang of languages) {
    if (lang === 'id') {
      scopedResults[lang] = { ...passingResults, exactMatchRate: 0.5 };
    } else {
      scopedResults[lang] = passingResults;
    }
  }

  const report = evaluator.evaluate(scopedResults);
  assert.equal(report.allPassed, false);
  assert.equal(report.scopeVerdicts.length, 6);

  // Check that only 'id' fails.
  for (const verdict of report.scopeVerdicts) {
    if (verdict.scope === 'id') {
      assert.equal(verdict.passed, false);
    } else {
      assert.equal(verdict.passed, true);
    }
  }

  // Only exactMatchRate should fail globally.
  assert.equal(report.gateAggregate.exactMatchRate, false);
  for (const [gate, passed] of Object.entries(report.gateAggregate)) {
    if (gate !== 'exactMatchRate') {
      assert.equal(passed, true, `expected gate ${gate} to pass globally`);
    }
  }
});

test('ParseGateEvaluator: config is included in report', () => {
  const customConfig: ParseGateConfig = { ...DEFAULT_PARSE_GATES, validParseRate: 0.9 };
  const evaluator = new ParseGateEvaluator(customConfig);
  const report = evaluator.evaluate({ en: passingResults });
  assert.equal(report.config.validParseRate, 0.9);
  // Safety invariant floor should still be enforced.
  assert.equal(report.config.safetyInvariantPassRate, SAFETY_INVARIANT_PASS_RATE_FLOOR);
});
