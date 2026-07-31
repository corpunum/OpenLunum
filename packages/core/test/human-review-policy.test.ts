import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateHumanReview,
  setHumanReviewFlag,
  getHumanReviewFlag,
  clearHumanReviewFlag,
  annotationsRequireReview,
  createHumanReviewFallback,
  shouldForceNaturalFallback,
  CONFIDENCE_REVIEW_THRESHOLD,
  PROXIMITY_THRESHOLD,
  PROTECTED_LITERAL_DENSITY_THRESHOLD,
  SAFETY_INVARIANT_NEAR_MISS_LIMIT,
  type HumanReviewResult,
  type ReviewTriggerDetail,
  type HumanReviewFlag,
  type HumanReviewFallbackRecord,
} from '../src/human-review-policy.js';
import type { FallbackDecision } from '../src/fallback-policy.js';
import type { LunumSem } from '../src/types.js';

// ── Test helpers ──────────────────────────────────────────────────

function makeSem(
  predicate = 'prefer',
  roles: Record<string, unknown> = { agent: { type: 'actor', id: 'user' } }
): LunumSem {
  return {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate, roles, negated: false }]
  } as unknown as LunumSem;
}

// ── Constants ─────────────────────────────────────────────────────

test('thresholds have expected default values', () => {
  assert.ok(CONFIDENCE_REVIEW_THRESHOLD > 0 && CONFIDENCE_REVIEW_THRESHOLD <= 1);
  assert.ok(PROXIMITY_THRESHOLD > 0 && PROXIMITY_THRESHOLD < 0.5);
  assert.ok(PROTECTED_LITERAL_DENSITY_THRESHOLD >= 0 && PROTECTED_LITERAL_DENSITY_THRESHOLD <= 1);
  assert.ok(SAFETY_INVARIANT_NEAR_MISS_LIMIT >= 0);
});

// ── evaluateHumanReview: low confidence ───────────────────────────

test('low confidence triggers review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    parseConfidence: {
      score: 0.6,
      evidence: { syntacticValidity: 0.8, roleCompletion: 0.7 },
      minEvidence: 0.7,
      uncertaintyReasons: [],
      meetsMinimumEvidence: true
    }
  });

  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.automaticUseBlocked, true);
  assert.equal(result.forceNaturalFallback, true);
  assert.equal(result.triggers.length, 1);
  assert.equal(result.triggers[0]!.category, 'low_confidence');
  assert.ok(result.primaryTrigger);
});

test('confidence at threshold does not trigger review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    parseConfidence: {
      score: CONFIDENCE_REVIEW_THRESHOLD,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [],
      meetsMinimumEvidence: false
    }
  });

  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.automaticUseBlocked, false);
  assert.equal(result.triggers.length, 0);
});

test('confidence above threshold does not trigger review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    parseConfidence: {
      score: 0.99,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [],
      meetsMinimumEvidence: true
    }
  });

  assert.equal(result.requiresHumanReview, false);
});

test('NaN confidence triggers review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    parseConfidence: {
      score: NaN,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [],
      meetsMinimumEvidence: false
    }
  });

  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.triggers[0]!.category, 'low_confidence');
  assert.equal(result.triggers[0]!.evidence, 0); // NaN is treated as 0
});

// ── evaluateHumanReview: prohibited domain proximity ──────────────

test('prohibited domain near-miss triggers review', () => {
  // Use pre-computed classification with confidence in the proximity band [0.35, 0.5)
  const result = evaluateHumanReview({
    sem: makeSem(),
    domainClassification: {
      domains: [{
        domain: 'legal_advice',
        matchedKeywords: ['sue'],
        matchedPatterns: [],
        confidence: 0.42
      }],
      isProhibited: true,
      primaryDomain: 'legal_advice'
    }
  });

  assert.equal(result.requiresHumanReview, true);
  assert.ok(result.triggers.some(t => t.category === 'prohibited_domain_proximity'));
});

test('prohibited domain above 0.5 does not trigger proximity review', () => {
  // High confidence match (> 0.5) means the hard block already applies;
  // the proximity trigger is specifically for the [PROXIMITY_THRESHOLD, 0.5) band.
  // We pass a pre-computed classification with confidence 0.6.
  const result = evaluateHumanReview({
    sem: makeSem(),
    domainClassification: {
      domains: [{
        domain: 'legal_advice',
        matchedKeywords: ['sue'],
        matchedPatterns: [],
        confidence: 0.6
      }],
      isProhibited: true,
      primaryDomain: 'legal_advice'
    }
  });

  assert.equal(result.requiresHumanReview, false);
});

test('weak domain match below proximity threshold does not trigger review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    domainClassification: {
      domains: [{
        domain: 'legal_advice',
        matchedKeywords: ['sue'],
        matchedPatterns: [],
        confidence: 0.2
      }],
      isProhibited: true,
      primaryDomain: 'legal_advice'
    }
  });

  assert.equal(result.requiresHumanReview, false);
});

test('no domain match does not trigger review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    sourceText: 'The weather is nice today'
  });

  // May or may not trigger depending on other factors; we just check
  // that a non-prohibited domain does not add a proximity trigger.
  const domainTrigger = result.triggers.find(
    t => t.category === 'prohibited_domain_proximity'
  );
  assert.equal(domainTrigger, undefined);
});

// ── evaluateHumanReview: safety invariant near-miss ───────────────

test('safety invariant near-miss triggers review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    gatedComparison: {
      exactFingerprint: false,
      exactCanonical: false,
      featureRecall: 0.96,
      featurePrecision: 0.97,
      missingFeatures: [],
      extraFeatures: [],
      hardMismatch: false,
      hardInvariants: [
        { code: 'role-identity', detail: 'role mismatch', path: '' }
      ],
      blockingInvariants: [
        { code: 'role-identity', detail: 'role mismatch', path: '' }
      ],
      verdict: 'mismatch',
      gateBlocked: true,
      gateReport: {
        totalGatesChecked: 5,
        gatesPassed: 4,
        gatesFailed: 1,
        failedGateCodes: ['role-identity'],
        enforced: true
      }
    }
  });

  assert.equal(result.requiresHumanReview, true);
  assert.ok(result.triggers.some(t => t.category === 'safety_invariant_near_miss'));
});

test('no blocking invariants does not trigger review', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    gatedComparison: {
      exactFingerprint: true,
      exactCanonical: true,
      featureRecall: 1.0,
      featurePrecision: 1.0,
      missingFeatures: [],
      extraFeatures: [],
      hardMismatch: false,
      hardInvariants: [],
      blockingInvariants: [],
      verdict: 'match',
      gateBlocked: false,
      gateReport: {
        totalGatesChecked: 5,
        gatesPassed: 5,
        gatesFailed: 0,
        failedGateCodes: [],
        enforced: true
      }
    }
  });

  const invariantTrigger = result.triggers.find(
    t => t.category === 'safety_invariant_near_miss'
  );
  assert.equal(invariantTrigger, undefined);
});

// ── evaluateHumanReview: protected literal density ────────────────

test('high protected literal density triggers review', () => {
  // A record with all clauses having protected literals (e.g., proper names)
  const highDensitySem = {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'fact',
    clauses: [
      {
        predicate: 'refer',
        roles: { agent: { type: 'person', id: 'Alice' }, patient: { type: 'entity', id: 'Bob' } },
        negated: false
      },
      {
        predicate: 'refer',
        roles: { agent: { type: 'person', id: 'Charlie' }, patient: { type: 'entity', id: 'Diana' } },
        negated: false
      }
    ]
  } as unknown as LunumSem;

  const result = evaluateHumanReview({
    sem: highDensitySem
  });

  // With default registry (undefined), proper names are detected as protected.
  // Both clauses have protected names → density = 1.0 ≥ threshold.
  assert.equal(result.requiresHumanReview, true);
  assert.ok(result.triggers.some(t => t.category === 'protected_literal_density'));
});

test('low protected literal density does not trigger review', () => {
  // Record with empty roles → no protected literals
  const lowDensitySem = {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'preference',
    clauses: [
      {
        predicate: 'prefer',
        roles: {},
        negated: false
      }
    ]
  } as unknown as LunumSem;

  const result = evaluateHumanReview({
    sem: lowDensitySem
  });

  const literalTrigger = result.triggers.find(
    t => t.category === 'protected_literal_density'
  );
  assert.equal(literalTrigger, undefined);
});

// ── evaluateHumanReview: multiple triggers ────────────────────────

test('multiple triggers all fire when conditions are met', () => {
  const result = evaluateHumanReview({
    sem: makeSem('authorize', { agent: { type: 'person', id: 'Alice' } }),
    sourceText: 'I should sue for breach of contract',
    domainClassification: {
      domains: [{
        domain: 'legal_advice',
        matchedKeywords: ['sue'],
        matchedPatterns: [],
        confidence: 0.42
      }],
      isProhibited: true,
      primaryDomain: 'legal_advice'
    },
    parseConfidence: {
      score: 0.5,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [],
      meetsMinimumEvidence: false
    },
    gatedComparison: {
      exactFingerprint: false,
      exactCanonical: false,
      featureRecall: 0.9,
      featurePrecision: 0.9,
      missingFeatures: [],
      extraFeatures: [],
      hardMismatch: false,
      hardInvariants: [
        { code: 'role-identity', detail: 'role changed', path: '' }
      ],
      blockingInvariants: [
        { code: 'role-identity', detail: 'role changed', path: '' }
      ],
      verdict: 'mismatch',
      gateBlocked: true,
      gateReport: {
        totalGatesChecked: 5,
        gatesPassed: 4,
        gatesFailed: 1,
        failedGateCodes: ['role-identity'],
        enforced: true
      }
    }
  });

  assert.equal(result.requiresHumanReview, true);
  assert.ok(result.triggers.length >= 3, 'expected multiple triggers but got ' + result.triggers.length);

  const categories = new Set(result.triggers.map(t => t.category));
  assert.ok(categories.has('low_confidence'), 'missing low_confidence trigger');
  assert.ok(categories.has('prohibited_domain_proximity'), 'missing proximity trigger');
  assert.ok(categories.has('safety_invariant_near_miss'), 'missing invariant trigger');
});

test('primary trigger is highest priority', () => {
  const result = evaluateHumanReview({
    sem: makeSem('authorize', { agent: { type: 'person', id: 'Alice' } }),
    sourceText: 'I should sue for breach of contract',
    domainClassification: {
      domains: [{
        domain: 'legal_advice',
        matchedKeywords: ['sue'],
        matchedPatterns: [],
        confidence: 0.42
      }],
      isProhibited: true,
      primaryDomain: 'legal_advice'
    },
    parseConfidence: {
      score: 0.5,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [],
      meetsMinimumEvidence: false
    },
    gatedComparison: {
      exactFingerprint: false,
      exactCanonical: false,
      featureRecall: 0.9,
      featurePrecision: 0.9,
      missingFeatures: [],
      extraFeatures: [],
      hardMismatch: false,
      hardInvariants: [{ code: 'negation-flip', detail: 'negated', path: '' }],
      blockingInvariants: [{ code: 'negation-flip', detail: 'negated', path: '' }],
      verdict: 'mismatch',
      gateBlocked: true,
      gateReport: {
        totalGatesChecked: 5,
        gatesPassed: 4,
        gatesFailed: 1,
        failedGateCodes: ['negation-flip'],
        enforced: true
      }
    }
  });

  assert.ok(result.primaryTrigger);
  assert.equal(result.primaryTrigger!.category, 'prohibited_domain_proximity');
});

// ── evaluateHumanReview: no triggers ──────────────────────────────

test('no triggers when all conditions are healthy', () => {
  const result = evaluateHumanReview({
    sem: makeSem(),
    sourceText: 'The user prefers English',
    parseConfidence: {
      score: 0.99,
      evidence: {},
      minEvidence: 0,
      uncertaintyReasons: [],
      meetsMinimumEvidence: true
    }
  });

  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.automaticUseBlocked, false);
  assert.equal(result.forceNaturalFallback, false);
  assert.equal(result.triggers.length, 0);
  assert.equal(result.primaryTrigger, null);
});

test('empty clauses does not trigger', () => {
  const emptySem = {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'fact',
    clauses: []
  } as unknown as LunumSem;

  const result = evaluateHumanReview({
    sem: emptySem
  });

  assert.equal(result.requiresHumanReview, false);
});

// ── Human review flag management ──────────────────────────────────

test('setHumanReviewFlag annotates record', () => {
  const annotations: Record<string, unknown> = {};
  const flag: HumanReviewFlag = { approved: false, pending: true };
  const result = setHumanReviewFlag(annotations, flag);

  assert.equal(result, annotations); // same object
  const stored = getHumanReviewFlag(annotations);
  assert.ok(stored);
  assert.equal(stored!.approved, false);
  assert.equal(stored!.pending, true);
});

test('getHumanReviewFlag returns null when absent', () => {
  const annotations: Record<string, unknown> = {};
  assert.equal(getHumanReviewFlag(annotations), null);
});

test('clearHumanReviewFlag removes the flag', () => {
  const annotations: Record<string, unknown> = { humanReview: { approved: false, pending: true } };
  clearHumanReviewFlag(annotations);
  assert.equal(getHumanReviewFlag(annotations), null);
});

test('annotationsRequireReview returns true for pending record', () => {
  const annotations: Record<string, unknown> = {
    humanReview: { approved: false, pending: true }
  };
  assert.equal(annotationsRequireReview(annotations), true);
});

test('annotationsRequireReview returns true for unapproved record', () => {
  const annotations: Record<string, unknown> = {
    humanReview: { approved: false, pending: false }
  };
  assert.equal(annotationsRequireReview(annotations), true);
});

test('annotationsRequireReview returns false for approved record', () => {
  const annotations: Record<string, unknown> = {
    humanReview: { approved: true, pending: false }
  };
  assert.equal(annotationsRequireReview(annotations), false);
});

test('annotationsRequireReview returns false when no flag present', () => {
  const annotations: Record<string, unknown> = {};
  assert.equal(annotationsRequireReview(annotations), false);
});

// ── Human review fallback ─────────────────────────────────────────

test('createHumanReviewFallback preserves natural text and sem', () => {
  const sem = makeSem();
  const naturalText = 'I prefer coffee over tea';
  const triggers: ReviewTriggerDetail[] = [
    { category: 'low_confidence', reason: 'low confidence', evidence: 0.5 }
  ];

  const record = createHumanReviewFallback(naturalText, sem, triggers);

  assert.equal(record.naturalText, naturalText);
  assert.equal(record.sem, sem);
  assert.equal(record.triggers, triggers);
  assert.equal(record.pendingReview, true);
});

test('createHumanReviewFallback with no triggers is not pending', () => {
  const record = createHumanReviewFallback('text', makeSem(), []);
  assert.equal(record.pendingReview, false);
});

// ── shouldForceNaturalFallback ────────────────────────────────────

test('shouldForceNaturalFallback forces fallback when review required', () => {
  const decision: FallbackDecision = {
    action: 'store',
    reasons: ['all clear'],
    confidence: 0.8
  };

  const result = shouldForceNaturalFallback(decision, true);

  assert.equal(result.action, 'fallback');
  assert.ok(result.reasons.some(r => r.includes('human-review-required')));
});

test('shouldForceNaturalFallback does not alter decision when review not required', () => {
  const decision: FallbackDecision = {
    action: 'store',
    reasons: ['all clear'],
    confidence: 0.8
  };

  const result = shouldForceNaturalFallback(decision, false);

  assert.equal(result.action, 'store');
  assert.equal(result.reasons.length, 1);
  assert.equal(result.reasons[0], 'all clear');
});

// ── Integration: full record evaluation ───────────────────────────

test('evaluateHumanReview returns structured result with all fields', () => {
  const sem = makeSem();
  const result = evaluateHumanReview({ sem });

  assert.ok(result);
  assert.ok('requiresHumanReview' in result);
  assert.ok('triggers' in result);
  assert.ok('primaryTrigger' in result);
  assert.ok('sem' in result);
  assert.ok('automaticUseBlocked' in result);
  assert.ok('forceNaturalFallback' in result);
  assert.equal(result.sem, sem);
});
