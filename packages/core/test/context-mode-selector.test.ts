/**
 * Tests for the context mode selector (R7.6 — Issue #510).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectContextMode,
  selectContextModePerClause,
  computeTokenSavingsRatio,
  domainForcesNatural,
  computeWellParsedFraction,
  clauseLevelMixedAnalysis,
  MIN_CONFIDENCE_FOR_LUNUM,
  CONFIDENCE_HIGH_THRESHOLD,
  TOKEN_SAVINGS_THRESHOLD,
  MAX_LITERAL_DENSITY,
  MIN_OKAY_CLAUSE_FRACTION,
  type ContextModeEligibility,
  type ContextModeDecision
} from '../src/context-mode-selector.js';
import { PROHIBITED_DOMAIN_IDS } from '../src/prohibited-domains.js';

function makeInput(overrides: Partial<ContextModeEligibility> = {}): ContextModeEligibility {
  return {
    parseConfidence: 0.95,
    literalDensity: 0.1,
    originalTokenCount: 100,
    lunumTokenCount: 60,
    tokenBudget: 200,
    wellParsedClauseCount: 5,
    totalClauseCount: 5,
    clauseConfidences: [0.95, 0.92, 0.97, 0.91, 0.98],
    hasValidatedSemantics: true,
    requiresHumanReview: false,
    ...overrides
  };
}

function assertMode(r: ContextModeDecision, mode: string): void {
  assert.equal(r.mode, mode);
  assert.ok(Array.isArray(r.reasons));
  assert.ok(typeof r.explanation === 'string' && r.explanation.length > 0);
}

// ── Thresholds ─────────────────────────────────────────────────────

test('threshold constants have expected values', () => {
  assert.equal(MIN_CONFIDENCE_FOR_LUNUM, 0.7);
  assert.equal(CONFIDENCE_HIGH_THRESHOLD, 0.9);
  assert.ok(TOKEN_SAVINGS_THRESHOLD > 0);
  assert.ok(MAX_LITERAL_DENSITY > 0);
  assert.ok(MIN_OKAY_CLAUSE_FRACTION > 0 && MIN_OKAY_CLAUSE_FRACTION < 1);
});

// ── domainForcesNatural ────────────────────────────────────────────

test('prohibited domains force natural', () => {
  for (const d of PROHIBITED_DOMAIN_IDS) {
    assert.equal(domainForcesNatural(d), true, d);
  }
});

test('natural-only categories force natural', () => {
  assert.equal(domainForcesNatural('exact_quote'), true);
  assert.equal(domainForcesNatural('code'), true);
  assert.equal(domainForcesNatural('legal_text'), true);
  assert.equal(domainForcesNatural('ambiguous'), true);
});

test('eligible categories do not force natural', () => {
  assert.equal(domainForcesNatural('preference'), false);
  assert.equal(domainForcesNatural('simple_fact'), false);
});

test('null/undefined/empty do not force natural', () => {
  assert.equal(domainForcesNatural(null), false);
  assert.equal(domainForcesNatural(''), false);
});

// ── computeTokenSavingsRatio ───────────────────────────────────────

test('positive / zero / negative savings', () => {
  assert.equal(computeTokenSavingsRatio(100, 60), 0.4);
  assert.equal(computeTokenSavingsRatio(100, 100), 0);
  assert.equal(computeTokenSavingsRatio(100, 120), -0.2);
  assert.ok(Number.isNaN(computeTokenSavingsRatio(0, 50)));
  assert.ok(Number.isNaN(computeTokenSavingsRatio(-10, 50)));
});

// ── computeWellParsedFraction ──────────────────────────────────────

test('computeWellParsedFraction', () => {
  assert.equal(computeWellParsedFraction(5, 5), 1);
  assert.equal(computeWellParsedFraction(2, 4), 0.5);
  assert.equal(computeWellParsedFraction(0, 5), 0);
  assert.equal(computeWellParsedFraction(null, 5), null);
  assert.equal(computeWellParsedFraction(5, null), null);
  assert.equal(computeWellParsedFraction(null, null), null);
  assert.equal(computeWellParsedFraction(0, 0), null);
});

// ── clauseLevelMixedAnalysis ───────────────────────────────────────

test('all high / all low / mixed signals', () => {
  assert.equal(clauseLevelMixedAnalysis([0.95, 0.92], 0.7).mixed, false);
  assert.equal(clauseLevelMixedAnalysis([0.3, 0.2], 0.7).mixed, false);
  assert.equal(clauseLevelMixedAnalysis([0.95, 0.5], 0.7).mixed, true);
  assert.equal(clauseLevelMixedAnalysis([], 0.7).mixed, false);
  assert.equal(clauseLevelMixedAnalysis(Array(19).fill(0.9).concat([0.3]), 0.7).mixed, false);
});

// ── selectContextMode — natural ────────────────────────────────────

test('natural — prohibited domain', () => {
  assertMode(selectContextMode(makeInput({ domainCategory: 'legal_advice' })), 'natural');
});

test('natural — natural-only category', () => {
  assertMode(selectContextMode(makeInput({ domainCategory: 'exact_quote' })), 'natural');
});

test('natural — requires human review', () => {
  assertMode(selectContextMode(makeInput({ requiresHumanReview: true })), 'natural');
});

test('natural — low confidence', () => {
  assertMode(selectContextMode(makeInput({ parseConfidence: 0.5, domainCategory: 'preference' })), 'natural');
});

test('natural — high literal density', () => {
  assertMode(selectContextMode(makeInput({ literalDensity: 0.8 })), 'natural');
  assertMode(selectContextMode(makeInput({ literalDensity: MAX_LITERAL_DENSITY })), 'natural');
});

test('natural — default / null / NaN confidence', () => {
  assertMode(selectContextMode({}), 'natural');
  assertMode(selectContextMode({ parseConfidence: null }), 'natural');
  assertMode(selectContextMode({ parseConfidence: NaN }), 'natural');
});

// ── selectContextMode — lunum ──────────────────────────────────────

test('lunum — high confidence + token savings', () => {
  const r = selectContextMode(makeInput({ parseConfidence: 0.95, domainCategory: 'preference' }));
  assertMode(r, 'lunum');
  assert.ok(r.reasons.includes('high_confidence'));
  assert.ok(r.reasons.includes('token_savings_sufficient'));
});

test('lunum — no budget constraint', () => {
  assertMode(selectContextMode(makeInput({ parseConfidence: 0.95, tokenBudget: null, domainCategory: 'simple_fact' })), 'lunum');
});

test('lunum — decent confidence + fits budget', () => {
  assertMode(selectContextMode(makeInput({ parseConfidence: 0.75, domainCategory: 'tool_event' })), 'lunum');
});

test('lunum too large for budget', () => {
  assertMode(selectContextMode(makeInput({ parseConfidence: 0.95, lunumTokenCount: 250, domainCategory: 'preference' })), 'natural');
});

// ── selectContextMode — mixed ──────────────────────────────────────

test('mixed — clause-level mixed signals', () => {
  const r = selectContextMode(makeInput({
    parseConfidence: 0.8,
    wellParsedClauseCount: 3,
    totalClauseCount: 5,
    clauseConfidences: [0.95, 0.92, 0.85, 0.4, 0.3],
    domainCategory: 'preference'
  }));
  assertMode(r, 'mixed');
  assert.ok(r.reasons.includes('clause_level_mixed'));
});

test('not mixed — all high confidence', () => {
  assert.equal(selectContextMode(makeInput({
    clauseConfidences: [0.95, 0.92, 0.97, 0.91, 0.98],
    domainCategory: 'preference'
  })).mode, 'lunum');
});

// ── Decision output contract ───────────────────────────────────────

test('decision has required fields', () => {
  const r = selectContextMode(makeInput({ parseConfidence: 0.5 }));
  assert.ok('mode' in r);
  assert.ok('reasons' in r);
  assert.ok('explanation' in r);
  assert.ok(Array.isArray(r.reasons));
  assert.equal(typeof r.explanation, 'string');
  assert.ok(r.explanation.length > 0);
  for (const reason of r.reasons) {
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
  }
});

// ── selectContextModePerClause ─────────────────────────────────────

test('per-clause — all high confidence', () => {
  const cs = [
    { predicate: 'prefer', roles: { agent: { type: 'actor', id: 'a' } } },
    { predicate: 'delete', roles: { agent: { type: 'actor', id: 'a' } } }
  ];
  const r = selectContextModePerClause(cs, makeInput({ clauseConfidences: [0.95, 0.92] }));
  assert.equal(r.length, 2);
  assert.equal(r[0]!.mode, 'lunum');
  assert.equal(r[1]!.mode, 'lunum');
  assert.equal(r[0]!.clauseIndex, 0);
  assert.equal(r[1]!.clauseIndex, 1);
});

test('per-clause — mixed confidence', () => {
  const cs = [
    { predicate: 'prefer', roles: { agent: { type: 'actor', id: 'a' } } },
    { predicate: 'delete', roles: { agent: { type: 'actor', id: 'a' } } }
  ];
  const r = selectContextModePerClause(cs, makeInput({ clauseConfidences: [0.95, 0.5] }));
  assert.equal(r[0]!.mode, 'lunum');
  assert.equal(r[1]!.mode, 'natural');
});

test('per-clause — low confidence', () => {
  const cs = [
    { predicate: 'prefer', roles: { agent: { type: 'actor', id: 'a' } } },
    { predicate: 'delete', roles: { agent: { type: 'actor', id: 'a' } } }
  ];
  const r = selectContextModePerClause(cs, makeInput({ clauseConfidences: [0.5, 0.3] }));
  assert.equal(r[0]!.mode, 'natural');
  assert.equal(r[1]!.mode, 'natural');
});

test('per-clause — missing confidence falls back to overall', () => {
  const cs = [
    { predicate: 'prefer', roles: { agent: { type: 'actor', id: 'a' } } },
    { predicate: 'delete', roles: { agent: { type: 'actor', id: 'a' } } }
  ];
  const r = selectContextModePerClause(cs, makeInput({
    clauseConfidences: [0.95],
    parseConfidence: 0.95
  }));
  assert.equal(r[0]!.mode, 'lunum');
  assert.equal(r[1]!.mode, 'lunum');
});

test('per-clause — reason and confidence fields', () => {
  const cs = [{ predicate: 'prefer', roles: { agent: { type: 'actor', id: 'a' } } }];
  const r = selectContextModePerClause(cs, makeInput({ clauseConfidences: [0.95] }));
  const c0 = r[0]!;
  assert.equal(typeof c0.reason, 'string');
  assert.ok(c0.reason.length > 0);
  assert.ok('confidence' in c0);
  assert.equal(c0.confidence, 0.95);
});
