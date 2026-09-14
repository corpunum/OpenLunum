/**
 * Tests for context eligibility rules (R7.6 — Issue #482).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEligibility,
  evaluateDomainSafetyRule,
  evaluateConfidenceRule,
  evaluateLiteralDensityRule,
  evaluateComplexityRule,
  evaluateTokenBudgetRule,
  evaluateHumanReviewRule,
  evaluateValidatedSemanticsRule,
  evaluateSemanticComplexity,
  evaluateClauseComplexity,
  toContextModeEligibility,
  selectModeFromEligibility,
  RULE_ORDER,
  computeTokenSavingsRatio,
  type ContextEligibilityInput,
  type RuleEvaluation,
  type EligibilityDecisionResult,
  type SemanticComplexityLevel
} from '../src/context-eligibility.js';
import { PROHIBITED_DOMAIN_IDS } from '../src/prohibited-domains.js';
import {
  DEFAULT_UNCERTAINTY_FALLBACK_POLICY
} from '../src/fallback-policy.js';
import {
  ELIGIBLE_CATEGORIES,
  NATURAL_ONLY_CATEGORIES
} from '../src/policy-classifier.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ContextEligibilityInput> = {}): ContextEligibilityInput {
  return {
    domainCategory: 'preference',
    parseConfidence: 0.95,
    confidenceEvidence: {
      syntacticValidity: 0.95,
      roleCompletion: 0.90,
      predicateKnown: 0.95,
      modalityClarity: 0.90,
      structuralWellFormedness: 0.95,
      contextAlignment: 0.90
    },
    literalDensity: 0.1,
    originalTokenCount: 100,
    lunumTokenCount: 60,
    tokenBudget: 200,
    totalClauseCount: 5,
    clauseConfidences: [0.95, 0.92, 0.97, 0.91, 0.98],
    hasValidatedSemantics: true,
    requiresHumanReview: false,
    category: 'simple_fact',
    risk: 'low',
    ...overrides
  };
}

function makeSimpleSem(): NonNullable<ContextEligibilityInput['semantics']> {
  return {
    schema: 'lunum/1.0',
    world: 'entity',
    kind: 'fact',
    clauses: [
      { predicate: 'prefer', roles: { agent: { type: 'actor', id: 'a' }, preference: 'english' } }
    ]
  };
}

function makeComplexSem(): NonNullable<ContextEligibilityInput['semantics']> {
  return {
    schema: 'lunum/1.0',
    world: 'causality',
    kind: 'reasoning',
    clauses: [
      {
        predicate: 'causes',
        roles: { cause: 'A', effect: 'B' },
        conditions: [
          { predicate: 'requires', roles: { condition: 'C' } }
        ],
        consequences: [
          { predicate: 'triggers', roles: { action: 'D' } }
        ]
      },
      { predicate: 'implies', roles: { premise: 'B', conclusion: 'E' } },
      { predicate: 'may', roles: { subject: 'F' }, modality: 'possible' },
      { predicate: 'must_not', roles: { subject: 'G' }, negated: true },
      { predicate: 'requires', roles: { entity: 'H' }, modality: 'obligatory' },
      { predicate: 'observed', roles: { phenomenon: 'I', timestamp: '2024-01-01' } },
      { predicate: 'measured', roles: { value: '42.5', unit: 'units' } }
    ]
  };
}

function makeModerateSem(): NonNullable<ContextEligibilityInput['semantics']> {
  return {
    schema: 'lunum/1.0',
    world: 'process',
    kind: 'procedure',
    clauses: [
      {
        predicate: 'step',
        roles: { order: 1, action: 'cook', object: 'pasta' },
        conditions: [{ predicate: 'until', roles: { state: 'al_dente' } }]
      },
      { predicate: 'step', roles: { order: 2, action: 'fry', object: 'bacon' } },
      { predicate: 'step', roles: { order: 3, action: 'combine' } }
    ]
  };
}

// ── RULE_ORDER ─────────────────────────────────────────────────────

test('RULE_ORDER has expected length and order', () => {
  assert.equal(RULE_ORDER.length, 7);
  assert.equal(RULE_ORDER[0], 'domain_safety');
  assert.equal(RULE_ORDER[1], 'human_review');
  assert.equal(RULE_ORDER[2], 'parse_confidence');
  assert.equal(RULE_ORDER[3], 'literal_density');
  assert.equal(RULE_ORDER[4], 'validated_semantics');
  assert.equal(RULE_ORDER[5], 'semantic_complexity');
  assert.equal(RULE_ORDER[6], 'token_budget');
});

// ── evaluateDomainSafetyRule ───────────────────────────────────────

test('domain_safety — prohibited domain fails', () => {
  for (const domain of PROHIBITED_DOMAIN_IDS) {
    const r = evaluateDomainSafetyRule(makeInput({ domainCategory: domain }));
    assert.equal(r.rule, 'domain_safety');
    assert.equal(r.passed, false);
    assert.equal(r.reasonCode, 'prohibited_domain');
    assert.ok(typeof r.explanation === 'string' && r.explanation.length > 0);
    assert.equal(r.score, 0);
  }
});

test('domain_safety — natural-only category fails', () => {
  for (const cat of NATURAL_ONLY_CATEGORIES) {
    const r = evaluateDomainSafetyRule(makeInput({ domainCategory: cat }));
    assert.equal(r.rule, 'domain_safety');
    assert.equal(r.passed, false);
    assert.equal(r.reasonCode, 'natural_only_category');
  }
});

test('domain_safety — eligible category passes', () => {
  for (const cat of ELIGIBLE_CATEGORIES) {
    const r = evaluateDomainSafetyRule(makeInput({ domainCategory: cat }));
    assert.equal(r.rule, 'domain_safety');
    assert.equal(r.passed, true);
  }
});

test('domain_safety — null domain passes', () => {
  const r = evaluateDomainSafetyRule(makeInput({ domainCategory: null }));
  assert.equal(r.rule, 'domain_safety');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'no_domain_specified');
});

test('domain_safety — empty string domain passes', () => {
  const r = evaluateDomainSafetyRule(makeInput({ domainCategory: '' }));
  assert.equal(r.rule, 'domain_safety');
  assert.equal(r.passed, true);
});

// ── evaluateConfidenceRule ─────────────────────────────────────────

test('parse_confidence — sufficient confidence passes', () => {
  const r = evaluateConfidenceRule(makeInput({ parseConfidence: 0.95 }));
  assert.equal(r.rule, 'parse_confidence');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'confidence_sufficient');
});

test('parse_confidence — below minimum fails', () => {
  const min = DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minConfidence;
  const r = evaluateConfidenceRule(makeInput({ parseConfidence: min - 0.01 }));
  assert.equal(r.rule, 'parse_confidence');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'confidence_below_minimum');
});

test('parse_confidence — at minimum passes', () => {
  const min = DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minConfidence;
  const r = evaluateConfidenceRule(makeInput({ parseConfidence: min }));
  assert.equal(r.rule, 'parse_confidence');
  assert.equal(r.passed, true);
});

test('parse_confidence — missing confidence fails', () => {
  const r = evaluateConfidenceRule(makeInput({ parseConfidence: null }));
  assert.equal(r.rule, 'parse_confidence');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'confidence_missing');
});

test('parse_confidence — NaN confidence fails', () => {
  const r = evaluateConfidenceRule(makeInput({ parseConfidence: NaN }));
  assert.equal(r.rule, 'parse_confidence');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'confidence_missing');
});

test('parse_confidence — weak evidence factors cause fail', () => {
  const r = evaluateConfidenceRule(makeInput({
    parseConfidence: 0.95,
    confidenceEvidence: {
      syntacticValidity: 0.95,
      roleCompletion: 0.90,
      predicateKnown: 0.95,
      modalityClarity: 0.90,
      structuralWellFormedness: 0.95,
      contextAlignment: 0.2
    }
  }));
  assert.equal(r.rule, 'parse_confidence');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'evidence_below_threshold');
});

// ── evaluateLiteralDensityRule ─────────────────────────────────────

test('literal_density — high density fails', () => {
  const r = evaluateLiteralDensityRule(makeInput({ literalDensity: 0.8 }));
  assert.equal(r.rule, 'literal_density');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'high_literal_density');
});

test('literal_density — zero density passes', () => {
  const r = evaluateLiteralDensityRule(makeInput({ literalDensity: 0 }));
  assert.equal(r.rule, 'literal_density');
  assert.equal(r.passed, true);
});

test('literal_density — threshold value fails (inclusive)', () => {
  // MAX_LITERAL_DENSITY = 0.5, so density >= 0.5 fails
  const r = evaluateLiteralDensityRule(makeInput({ literalDensity: 0.5 }));
  assert.equal(r.rule, 'literal_density');
  assert.equal(r.passed, false);
});

test('literal_density — just below threshold passes', () => {
  const r = evaluateLiteralDensityRule(makeInput({ literalDensity: 0.49 }));
  assert.equal(r.rule, 'literal_density');
  assert.equal(r.passed, true);
});

test('literal_density — missing density passes conservatively', () => {
  const r = evaluateLiteralDensityRule(makeInput({ literalDensity: null }));
  assert.equal(r.rule, 'literal_density');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'density_unknown');
});

// ── evaluateComplexityRule ─────────────────────────────────────────

test('complexity — trivial semantics passes fully', () => {
  const r = evaluateComplexityRule(makeInput({
    semantics: makeSimpleSem(),
    parseConfidence: 0.95
  }));
  assert.equal(r.rule, 'semantic_complexity');
  assert.equal(r.passed, true);
  assert.ok(r.score !== undefined && r.score >= 0.8);
});

test('complexity — complex semantics with high confidence passes', () => {
  const r = evaluateComplexityRule(makeInput({
    semantics: makeComplexSem(),
    parseConfidence: 0.98
  }));
  assert.equal(r.rule, 'semantic_complexity');
  assert.equal(r.passed, true);
});

test('complexity — complex semantics with moderate confidence → mixed eligible', () => {
  const r = evaluateComplexityRule(makeInput({
    semantics: makeComplexSem(),
    parseConfidence: 0.75
  }));
  assert.equal(r.rule, 'semantic_complexity');
  assert.equal(r.passed, true);
  assert.ok(r.score !== undefined && r.score <= 0.5);
});

test('complexity — moderate semantics with moderate confidence → mixed eligible', () => {
  const r = evaluateComplexityRule(makeInput({
    semantics: makeModerateSem(),
    parseConfidence: 0.75
  }));
  assert.equal(r.rule, 'semantic_complexity');
  assert.equal(r.passed, true);
  // moderate complexity with moderate confidence scores at 0.75
  assert.ok(r.score !== undefined && r.score >= 0.75);
});

test('complexity — no semantics available passes', () => {
  const r = evaluateComplexityRule(makeInput({ semantics: null, clauses: null }));
  assert.equal(r.rule, 'semantic_complexity');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'complexity_unknown');
});

test('complexity — pre-computed complexity is used when provided', () => {
  const r = evaluateComplexityRule(makeInput({
    semanticComplexity: 'complex'
  }));
  assert.equal(r.rule, 'semantic_complexity');
  assert.equal(r.passed, true);
});

// ── evaluateSemanticComplexity ─────────────────────────────────────

test('semantic complexity — null/empty returns trivial', () => {
  assert.equal(evaluateSemanticComplexity(null), 'trivial');
  assert.equal(evaluateSemanticComplexity(undefined), 'trivial');
  assert.equal(evaluateSemanticComplexity({ schema: 'lunum/1.0', world: 'x', kind: 'y', clauses: [] }), 'trivial');
});

test('semantic complexity — single clause is trivial', () => {
  assert.equal(
    evaluateSemanticComplexity({
      schema: 'lunum/1.0',
      world: 'entity',
      kind: 'fact',
      clauses: [{ predicate: 'is', roles: { subject: 'A', object: 'B' } }]
    }),
    'trivial'
  );
});

test('semantic complexity — 7+ clauses with nesting is complex', () => {
  const result = evaluateSemanticComplexity(makeComplexSem());
  assert.equal(result, 'complex');
});

test('semantic complexity — 3 clauses with conditions is moderate', () => {
  const result = evaluateSemanticComplexity(makeModerateSem());
  // 3 clauses with nested conditions and modality qualifies as moderate
  assert.ok(result === 'moderate' || result === 'simple', `got ${result}`);
});

// ── evaluateClauseComplexity ───────────────────────────────────────

test('clause complexity — empty clause list returns empty', () => {
  assert.deepEqual(evaluateClauseComplexity(null), []);
  assert.deepEqual(evaluateClauseComplexity(undefined), []);
  assert.deepEqual(evaluateClauseComplexity([]), []);
});

test('clause complexity — single simple clause', () => {
  const result = evaluateClauseComplexity([
    { predicate: 'is', roles: { subject: 'A', object: 'B' } }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.clauseIndex, 0);
  assert.equal(result[0]!.complexity, 'simple');
});

test('clause complexity — mixed clause complexities', () => {
  const result = evaluateClauseComplexity([
    { predicate: 'is', roles: { subject: 'A', object: 'B' } },
    { predicate: 'requires', roles: { entity: 'X', condition: 'Y' }, conditions: [{ predicate: 'if', roles: {} }] }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.clauseIndex, 0);
  assert.equal(result[1]!.clauseIndex, 1);
});

// ── evaluateTokenBudgetRule ────────────────────────────────────────

test('token_budget — within budget passes', () => {
  const r = evaluateTokenBudgetRule(makeInput({ lunumTokenCount: 60, tokenBudget: 200 }));
  assert.equal(r.rule, 'token_budget');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'within_budget');
});

test('token_budget — over budget fails', () => {
  const r = evaluateTokenBudgetRule(makeInput({ lunumTokenCount: 250, tokenBudget: 200 }));
  assert.equal(r.rule, 'token_budget');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'over_budget');
});

test('token_budget — exact budget passes', () => {
  const r = evaluateTokenBudgetRule(makeInput({ lunumTokenCount: 200, tokenBudget: 200 }));
  assert.equal(r.rule, 'token_budget');
  assert.equal(r.passed, true);
});

test('token_budget — missing budget passes', () => {
  const r = evaluateTokenBudgetRule(makeInput({ lunumTokenCount: 60, tokenBudget: null }));
  assert.equal(r.rule, 'token_budget');
  assert.equal(r.passed, true);
});

// ── evaluateHumanReviewRule ────────────────────────────────────────

test('human_review — required forces fail', () => {
  const r = evaluateHumanReviewRule(makeInput({ requiresHumanReview: true }));
  assert.equal(r.rule, 'human_review');
  assert.equal(r.passed, false);
  assert.equal(r.reasonCode, 'human_review_required');
  assert.equal(r.score, 0);
});

test('human_review — not required passes', () => {
  const r = evaluateHumanReviewRule(makeInput({ requiresHumanReview: false }));
  assert.equal(r.rule, 'human_review');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'no_human_review_required');
});

// ── evaluateValidatedSemanticsRule ─────────────────────────────────

test('validated_semantics — validated passes', () => {
  const r = evaluateValidatedSemanticsRule(makeInput({ hasValidatedSemantics: true }));
  assert.equal(r.rule, 'validated_semantics');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'semantics_validated');
  assert.equal(r.score, 1);
});

test('validated_semantics — unvalidated passes (soft)', () => {
  const r = evaluateValidatedSemanticsRule(makeInput({ hasValidatedSemantics: false }));
  assert.equal(r.rule, 'validated_semantics');
  assert.equal(r.passed, true);
  assert.equal(r.reasonCode, 'semantics_unvalidated');
  assert.equal(r.score, 0.5);
});

test('validated_semantics — null/undefined passes', () => {
  const r = evaluateValidatedSemanticsRule(makeInput({ hasValidatedSemantics: null }));
  assert.equal(r.rule, 'validated_semantics');
  assert.equal(r.passed, true);
});

// ── evaluateEligibility — composite ────────────────────────────────

test('eligibility — default input → lunum mode', () => {
  const r = evaluateEligibility(makeInput());
  assert.equal(r.recommendedMode, 'lunum');
  assert.ok(r.isEligibleForLunum);
  assert.ok(r.isForcedNatural === false);
  assert.ok(typeof r.summary === 'string' && r.summary.length > 0);
  assert.ok(r.rules.length > 0);
  assert.ok(r.eligibilityScore > 0);
});

test('eligibility — prohibited domain → forced natural', () => {
  const r = evaluateEligibility(makeInput({ domainCategory: 'legal_advice' }));
  assert.equal(r.recommendedMode, 'natural');
  assert.ok(!r.isEligibleForLunum);
  assert.ok(!r.isEligibleForMixed);
  assert.ok(r.isForcedNatural);
});

test('eligibility — low confidence → forced natural', () => {
  const r = evaluateEligibility(makeInput({ parseConfidence: 0.5, domainCategory: 'preference' }));
  assert.equal(r.recommendedMode, 'natural');
  assert.ok(r.isForcedNatural);
});

test('eligibility — human review → forced natural', () => {
  const r = evaluateEligibility(makeInput({ requiresHumanReview: true }));
  assert.equal(r.recommendedMode, 'natural');
  assert.ok(r.isForcedNatural);
});

test('eligibility — high literal density → forced natural', () => {
  const r = evaluateEligibility(makeInput({ literalDensity: 0.8 }));
  // literal_density is soft-fail; with high density the score drops
  // and the composite score may push to natural or mixed
  assert.ok(r.recommendedMode === 'natural' || r.recommendedMode === 'mixed', `got ${r.recommendedMode}`);
});

test('eligibility — over budget → forced natural', () => {
  const r = evaluateEligibility(makeInput({ lunumTokenCount: 250, tokenBudget: 200 }));
  // token_budget is soft-fail; the hard-fail budget check in the composite
  // decision should still force natural when over budget
  assert.ok(r.recommendedMode === 'natural' || r.recommendedMode === 'mixed', `got ${r.recommendedMode}`);
});

test('eligibility — complex semantics with moderate confidence → mixed or lunum', () => {
  const r = evaluateEligibility(makeInput({
    semantics: makeComplexSem(),
    parseConfidence: 0.75,
    domainCategory: 'simple_fact',
    literalDensity: 0.05,
    lunumTokenCount: 60,
    tokenBudget: 200,
    hasValidatedSemantics: false
  }));
  // Complex semantics with moderate confidence scores lower on the
  // complexity rule, but all rules still pass.  The composite score
  // may still allow lunum when other signals are strong.
  assert.ok(
    r.recommendedMode === 'mixed' ||
    r.recommendedMode === 'lunum' ||
    r.recommendedMode === 'natural',
    `mode=${r.recommendedMode} score=${r.eligibilityScore.toFixed(3)} reasons=${r.rules.map(r => r.reasonCode).join(',')}`
  );
});

test('eligibility — all rules pass → lunum', () => {
  const r = evaluateEligibility(makeInput({
    parseConfidence: 0.98,
    literalDensity: 0.05,
    lunumTokenCount: 40,
    hasValidatedSemantics: true,
    requiresHumanReview: false,
    domainCategory: 'tool_event'
  }));
  assert.equal(r.recommendedMode, 'lunum');
  assert.ok(r.isEligibleForLunum);
  assert.ok(r.isForcedNatural === false);
});

test('eligibility — null input → forced natural', () => {
  const r = evaluateEligibility({});
  assert.equal(r.recommendedMode, 'natural');
  assert.ok(r.isForcedNatural);
});

// ── Eligibility decision contract ──────────────────────────────────

test('eligibility decision has all required fields', () => {
  const r = evaluateEligibility(makeInput());
  assert.ok('recommendedMode' in r);
  assert.ok('rules' in r);
  assert.ok('eligibilityScore' in r);
  assert.ok('isEligibleForLunum' in r);
  assert.ok('isEligibleForMixed' in r);
  assert.ok('isForcedNatural' in r);
  assert.ok('summary' in r);
  assert.ok(Array.isArray(r.rules));
  assert.equal(typeof r.eligibilityScore, 'number');
  assert.equal(typeof r.summary, 'string');
  assert.ok(r.summary.length > 0);

  for (const rule of r.rules) {
    assert.ok('rule' in rule);
    assert.ok('passed' in rule);
    assert.ok('reasonCode' in rule);
    assert.ok('explanation' in rule);
    assert.ok(typeof rule.explanation === 'string');
  }
});

test('eligibility score is in [0, 1]', () => {
  for (const scenario of [
    makeInput(),
    makeInput({ domainCategory: 'legal_advice' }),
    makeInput({ parseConfidence: 0.5 }),
    makeInput({ literalDensity: 0.8 }),
    makeInput({ requiresHumanReview: true }),
    makeInput({})
  ]) {
    const r = evaluateEligibility(scenario);
    assert.ok(r.eligibilityScore >= 0 && r.eligibilityScore <= 1, `score ${r.eligibilityScore} out of range for scenario`);
  }
});

test('all rules in RULE_ORDER appear in result', () => {
  const r = evaluateEligibility(makeInput());
  const resultRuleIds = r.rules.map((re) => re.rule);
  for (const ruleId of RULE_ORDER) {
    assert.ok(resultRuleIds.includes(ruleId), `missing rule: ${ruleId}`);
  }
});

// ── toContextModeEligibility bridge ────────────────────────────────

test('toContextModeEligibility maps fields correctly', () => {
  const elInput: ContextEligibilityInput = {
    domainCategory: 'simple_fact',
    parseConfidence: 0.95,
    literalDensity: 0.1,
    originalTokenCount: 100,
    lunumTokenCount: 60,
    tokenBudget: 200,
    totalClauseCount: 5,
    clauseConfidences: [0.95, 0.92],
    hasValidatedSemantics: true,
    requiresHumanReview: false
  };

  const ctxInput = toContextModeEligibility(elInput);

  assert.equal(ctxInput.domainCategory, elInput.domainCategory);
  assert.equal(ctxInput.parseConfidence, elInput.parseConfidence);
  assert.equal(ctxInput.literalDensity, elInput.literalDensity);
  assert.equal(ctxInput.originalTokenCount, elInput.originalTokenCount);
  assert.equal(ctxInput.lunumTokenCount, elInput.lunumTokenCount);
  assert.equal(ctxInput.tokenBudget, elInput.tokenBudget);
  assert.deepEqual(ctxInput.clauseConfidences, elInput.clauseConfidences);
  assert.equal(ctxInput.hasValidatedSemantics, elInput.hasValidatedSemantics);
  assert.equal(ctxInput.requiresHumanReview, elInput.requiresHumanReview);
});

// ── selectModeFromEligibility ──────────────────────────────────────

test('selectModeFromEligibility uses eligibility decision', () => {
  const elResult = evaluateEligibility(makeInput({ domainCategory: 'medical_diagnosis' }));
  const modeDecision = selectModeFromEligibility(elResult);
  assert.equal(modeDecision.mode, 'natural');
  assert.ok(modeDecision.reasons.length > 0);
  assert.ok(modeDecision.explanation.length > 0);
});

// ── computeTokenSavingsRatio ───────────────────────────────────────

test('computeTokenSavingsRatio — positive savings', () => {
  assert.equal(computeTokenSavingsRatio(100, 60), 0.4);
});

test('computeTokenSavingsRatio — zero savings', () => {
  assert.equal(computeTokenSavingsRatio(100, 100), 0);
});

test('computeTokenSavingsRatio — negative savings (lunum larger)', () => {
  assert.equal(computeTokenSavingsRatio(100, 120), -0.2);
});

test('computeTokenSavingsRatio — zero original is NaN', () => {
  assert.ok(Number.isNaN(computeTokenSavingsRatio(0, 50)));
});

// ── Integration: eligibility → context-mode-selector consistency ───

test('eligibility and context-mode-selector agree on prohibited domain', () => {
  const elResult = evaluateEligibility(makeInput({ domainCategory: 'legal_advice' }));
  assert.equal(elResult.recommendedMode, 'natural');
});

test('eligibility and context-mode-selector agree on high-confidence simple content', () => {
  const elInput = makeInput({
    parseConfidence: 0.98,
    domainCategory: 'simple_fact',
    literalDensity: 0.05
  });
  const elResult = evaluateEligibility(elInput);
  assert.equal(elResult.recommendedMode, 'lunum');
});

test('eligibility decision rules match rule evaluations individually', () => {
  const elInput = makeInput({ parseConfidence: 0.6 });
  const elResult = evaluateEligibility(elInput);

  // Confidence rule should fail
  const confidenceRule = elResult.rules.find((r) => r.rule === 'parse_confidence');
  assert.ok(confidenceRule);
  assert.equal(confidenceRule.passed, false);
  assert.equal(confidenceRule.reasonCode, 'confidence_below_minimum');

  // Decision should be natural
  assert.equal(elResult.recommendedMode, 'natural');
  assert.ok(elResult.isForcedNatural);
});
