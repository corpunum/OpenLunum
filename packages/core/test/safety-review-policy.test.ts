import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRecordRisk,
  getReviewRequirement,
  decideFallback,
  REVIEW_POLICY,
  type SafetyRiskLevel,
  type ReviewRequirement,
  type RiskClassification,
  type SafetyFallbackDecision,
  type ReviewAuditEntry,
} from '../src/safety-review-policy.js';

// ── REVIEW_POLICY ────────────────────────────────────────────────

describe('REVIEW_POLICY', () => {
  it('has exactly 4 entries', () => {
    assert.equal(REVIEW_POLICY.length, 4);
  });

  it('covers all four risk levels', () => {
    const levels = REVIEW_POLICY.map((r) => r.riskLevel);
    assert.deepStrictEqual(levels, ['low', 'medium', 'high', 'critical']);
  });
});

// ── classifyRecordRisk ───────────────────────────────────────────

describe('classifyRecordRisk', () => {
  it('returns critical for negation + obligation', () => {
    const result = classifyRecordRisk(
      'contract-clause',
      true,  // hasNegation
      true,  // hasObligation
      false, // hasPermission
      false, // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'critical');
    assert.equal(result.recordType, 'contract-clause');
  });

  it('returns critical for negation + permission', () => {
    const result = classifyRecordRisk(
      'license-term',
      true,  // hasNegation
      false, // hasObligation
      true,  // hasPermission
      false, // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'critical');
  });

  it('returns high for protected literals', () => {
    const result = classifyRecordRisk(
      'personal-record',
      false, // hasNegation
      false, // hasObligation
      false, // hasPermission
      true,  // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'high');
  });

  it('returns high for obligation without negation', () => {
    const result = classifyRecordRisk(
      'policy-statement',
      false, // hasNegation
      true,  // hasObligation
      false, // hasPermission
      false, // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'high');
  });

  it('returns high for permission without negation', () => {
    const result = classifyRecordRisk(
      'access-grant',
      false, // hasNegation
      false, // hasObligation
      true,  // hasPermission
      false, // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'high');
  });

  it('returns medium for negation only', () => {
    const result = classifyRecordRisk(
      'general-statement',
      true,  // hasNegation
      false, // hasObligation
      false, // hasPermission
      false, // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'medium');
  });

  it('returns low for plain records', () => {
    const result = classifyRecordRisk(
      'description',
      false, // hasNegation
      false, // hasObligation
      false, // hasPermission
      false, // hasProtectedLiteral
    );
    assert.equal(result.riskLevel, 'low');
  });
});

// ── getReviewRequirement ─────────────────────────────────────────

describe('getReviewRequirement', () => {
  it('returns correct policy for low', () => {
    const req = getReviewRequirement('low');
    assert.equal(req.humanReviewRequired, false);
    assert.equal(req.naturalFallbackRequired, false);
  });

  it('returns correct policy for medium', () => {
    const req = getReviewRequirement('medium');
    assert.equal(req.humanReviewRequired, false);
    assert.equal(req.naturalFallbackRequired, true);
    assert.ok(req.justification.includes('nuance'));
  });

  it('returns correct policy for high', () => {
    const req = getReviewRequirement('high');
    assert.equal(req.humanReviewRequired, true);
    assert.equal(req.naturalFallbackRequired, true);
    assert.ok(req.justification.includes('human verification'));
  });

  it('returns correct policy for critical', () => {
    const req = getReviewRequirement('critical');
    assert.equal(req.humanReviewRequired, true);
    assert.equal(req.naturalFallbackRequired, true);
    assert.ok(req.justification.includes('human sign-off'));
  });
});

// ── decideFallback ───────────────────────────────────────────────

describe('decideFallback', () => {
  it('forces natural fallback for high-risk compacted records', () => {
    const decision = decideFallback('high', 'compressed');
    assert.equal(decision.useNaturalFallback, true);
    assert.equal(decision.fallbackMode, 'natural');
    assert.equal(decision.originalMode, 'compressed');
  });

  it('forces natural fallback for critical-risk compacted records', () => {
    const decision = decideFallback('critical', 'compact');
    assert.equal(decision.useNaturalFallback, true);
    assert.equal(decision.fallbackMode, 'natural');
  });

  it('keeps original mode for low-risk', () => {
    const decision = decideFallback('low', 'compressed');
    assert.equal(decision.useNaturalFallback, false);
    assert.equal(decision.originalMode, 'compressed');
  });

  it('keeps original mode for medium-risk', () => {
    const decision = decideFallback('medium', 'compact');
    assert.equal(decision.useNaturalFallback, false);
    assert.equal(decision.originalMode, 'compact');
  });

  it('keeps natural mode for high-risk already natural', () => {
    const decision = decideFallback('high', 'natural');
    assert.equal(decision.useNaturalFallback, false);
    assert.equal(decision.originalMode, 'natural');
  });
});
