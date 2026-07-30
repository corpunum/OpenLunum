import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFallback,
  evaluateHighRiskFallback,
  isHighRisk,
  DEFAULT_FALLBACK_POLICY,
  DEFAULT_UNCERTAINTY_FALLBACK_POLICY,
  computeParseConfidence,
  hasMinimumEvidence,
  evaluateUncertaintyFallback,
  createNaturalLanguageFallback,
  type FallbackPolicy,
  type FallbackContext,
  type ConfidenceEvidenceFactors,
  type ParseConfidence,
  type UncertaintyFallbackPolicy,
} from '../src/fallback-policy.js';
import type { LunumSem } from '../src/types.js';

function makeSem(predicate = 'prefer', roles: Record<string, unknown> = { agent: { type: 'actor', id: 'user' } }): LunumSem {
  return {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate, roles, negated: false }]
  } as unknown as LunumSem;
}

const knownPredicates = new Set(['prefer', 'delete', 'enable', 'approve']);

test('DEFAULT_FALLBACK_POLICY has expected defaults', () => {
  assert.equal(DEFAULT_FALLBACK_POLICY.minConfidence, 0.6);
  assert.equal(DEFAULT_FALLBACK_POLICY.requireAllRoles, true);
  assert.equal(DEFAULT_FALLBACK_POLICY.requirePredicateInVocabulary, true);
  assert.equal(DEFAULT_FALLBACK_POLICY.maxMissingFeatures, 0);
  assert.equal(DEFAULT_FALLBACK_POLICY.reviewBandWidth, 0.15);
});

test('high confidence, all checks pass -> store', () => {
  const decision = evaluateFallback(makeSem(), 0.95, { knownPredicates, expectedRoles: ['agent'] });
  assert.equal(decision.action, 'store');
  assert.equal(decision.reasons.length, 0);
  assert.equal(decision.confidence, 0.95);
});

test('low confidence -> fallback', () => {
  const decision = evaluateFallback(makeSem(), 0.3, { knownPredicates });
  assert.equal(decision.action, 'fallback');
  assert.ok(decision.reasons.some((r) => r.includes('confidence')));
});

test('borderline confidence (in review band) -> review', () => {
  const decision = evaluateFallback(makeSem(), 0.55, { knownPredicates });
  assert.equal(decision.action, 'review');
  assert.ok(decision.reasons.some((r) => r.includes('review band')));
});

test('exactly at threshold -> store', () => {
  const decision = evaluateFallback(makeSem(), 0.6, { knownPredicates });
  assert.equal(decision.action, 'store');
});

test('zero confidence -> fallback', () => {
  const decision = evaluateFallback(makeSem(), 0);
  assert.equal(decision.action, 'fallback');
});

test('perfect confidence -> store', () => {
  const decision = evaluateFallback(makeSem(), 1.0, { knownPredicates });
  assert.equal(decision.action, 'store');
});

test('missing roles -> fallback', () => {
  const decision = evaluateFallback(makeSem(), 0.95, {
    knownPredicates,
    expectedRoles: ['agent', 'theme']
  });
  assert.equal(decision.action, 'fallback');
  assert.ok(decision.reasons.some((r) => r.includes('missing expected roles')));
});

test('predicate not in vocabulary -> review', () => {
  const decision = evaluateFallback(makeSem('custom_predicate'), 0.95, { knownPredicates });
  assert.equal(decision.action, 'review');
  assert.ok(decision.reasons.some((r) => r.includes('not in controlled vocabulary')));
});

test('missing features beyond max -> fallback', () => {
  const decision = evaluateFallback(makeSem(), 0.95, {
    knownPredicates,
    missingFeatureCount: 3
  });
  assert.equal(decision.action, 'fallback');
  assert.ok(decision.reasons.some((r) => r.includes('missing features')));
});

test('custom policy overrides defaults', () => {
  const laxPolicy: FallbackPolicy = {
    minConfidence: 0.3,
    requireAllRoles: false,
    requirePredicateInVocabulary: false,
    maxMissingFeatures: 5,
    reviewBandWidth: 0.1
  };
  const decision = evaluateFallback(makeSem('unknown'), 0.35, {
    knownPredicates,
    expectedRoles: ['agent', 'theme'],
    missingFeatureCount: 4
  }, laxPolicy);
  assert.equal(decision.action, 'store');
});

test('no context checks still evaluates confidence', () => {
  const decision = evaluateFallback(makeSem(), 0.8);
  assert.equal(decision.action, 'store');
});

test('fallback reasons take precedence over review reasons', () => {
  const decision = evaluateFallback(makeSem('unknown'), 0.3, { knownPredicates });
  assert.equal(decision.action, 'fallback');
});

test('isHighRisk: detects safety-critical predicates', () => {
  const result = isHighRisk(makeSem('grant'));
  assert.equal(result.highRisk, true);
  assert.ok(result.reasons.some(r => r.includes('grant')));
});

test('isHighRisk: detects obligation modalities', () => {
  const sem = {
    schema: 'lunum-sem/0.2', world: 'real', kind: 'command',
    clauses: [{ predicate: 'disclose', roles: { agent: { type: 'actor', id: 'system' } }, negated: false, modality: 'must' }]
  } as unknown as LunumSem;
  const result = isHighRisk(sem);
  assert.equal(result.highRisk, true);
  assert.ok(result.reasons.some(r => r.includes('must')));
});

test('isHighRisk: detects safety-critical conditions', () => {
  const sem = {
    schema: 'lunum-sem/0.2', world: 'real', kind: 'command',
    clauses: [{ predicate: 'process', roles: {}, negated: false, conditions: [
      { predicate: 'authorize', roles: {}, negated: false }
    ] }]
  } as unknown as LunumSem;
  const result = isHighRisk(sem);
  assert.equal(result.highRisk, true);
  assert.ok(result.reasons.some(r => r.includes('authorize')));
});

test('isHighRisk: benign predicates are not high risk', () => {
  const result = isHighRisk(makeSem('prefer'));
  assert.equal(result.highRisk, false);
  assert.equal(result.reasons.length, 0);
});

test('evaluateHighRiskFallback: high-risk store becomes review', () => {
  const record = evaluateHighRiskFallback(
    makeSem('delete'), 0.95, 'Delete all user data',
    { knownPredicates: new Set(['delete']), expectedRoles: ['agent'] }
  );
  assert.equal(record.decision.action, 'review');
  assert.equal(record.decision.highRisk, true);
  assert.equal(record.preserveNatural, true);
  assert.equal(record.naturalText, 'Delete all user data');
  assert.ok(record.decision.reasons.some(r => r.includes('high-risk')));
});

test('evaluateHighRiskFallback: high-risk fallback stays fallback', () => {
  const record = evaluateHighRiskFallback(
    makeSem('grant'), 0.2, 'Grant admin access',
    { knownPredicates: new Set(['grant']) }
  );
  assert.equal(record.decision.action, 'fallback');
  assert.equal(record.decision.highRisk, true);
  assert.ok(record.decision.reasons.some(r => r.includes('high-risk')));
});

test('evaluateHighRiskFallback: non-high-risk store stays store', () => {
  const record = evaluateHighRiskFallback(
    makeSem('prefer'), 0.95, 'I prefer dark mode',
    { knownPredicates: new Set(['prefer']), expectedRoles: ['agent'] }
  );
  assert.equal(record.decision.action, 'store');
  assert.equal(record.decision.highRisk, undefined);
  assert.equal(record.preserveNatural, true);
});

test('evaluateHighRiskFallback: always preserves natural text', () => {
  const record = evaluateHighRiskFallback(
    makeSem('prefer'), 0.95, 'Some text', {}
  );
  assert.equal(record.preserveNatural, true);
  assert.equal(record.naturalText, 'Some text');
});

// ── ParseConfidence Tests (R2.8) ────────────────────────────────────

test('DEFAULT_UNCERTAINTY_FALLBACK_POLICY has expected defaults', () => {
  assert.equal(DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minConfidence, 0.7);
  assert.equal(DEFAULT_UNCERTAINTY_FALLBACK_POLICY.minEvidenceThreshold, 0.6);
  assert.equal(DEFAULT_UNCERTAINTY_FALLBACK_POLICY.requireAllEvidenceFactors, true);
  assert.equal(DEFAULT_UNCERTAINTY_FALLBACK_POLICY.autoFallbackOnLowEvidence, true);
  assert.equal(DEFAULT_UNCERTAINTY_FALLBACK_POLICY.preserveNaturalOnFallback, true);
});

test('computeParseConfidence: high evidence factors -> high score', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.95,
    roleCompletion: 0.90,
    predicateKnown: 0.85,
    modalityClarity: 0.80,
    structuralWellFormedness: 0.95,
    contextAlignment: 0.85,
  };
  const confidence = computeParseConfidence(evidence);
  assert.ok(confidence.score > 0.8, `Expected score > 0.8, got ${confidence.score}`);
  assert.equal(confidence.meetsMinimumEvidence, true);
});

test('computeParseConfidence: low evidence factors -> low score', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.3,
    roleCompletion: 0.2,
    predicateKnown: 0.25,
    modalityClarity: 0.3,
    structuralWellFormedness: 0.2,
    contextAlignment: 0.3,
  };
  const confidence = computeParseConfidence(evidence);
  assert.ok(confidence.score < 0.5, `Expected score < 0.5, got ${confidence.score}`);
  assert.equal(confidence.meetsMinimumEvidence, false);
});

test('computeParseConfidence: mixed evidence -> moderate score', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.8,
    roleCompletion: 0.6,
    predicateKnown: 0.7,
    modalityClarity: 0.65,
    structuralWellFormedness: 0.75,
    contextAlignment: 0.7,
  };
  const confidence = computeParseConfidence(evidence);
  assert.ok(confidence.score >= 0.5 && confidence.score <= 0.8);
});

test('computeParseConfidence: NaN evidence -> score 0 (fail-safe)', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: NaN,
    roleCompletion: 0.8,
    predicateKnown: 0.8,
    modalityClarity: 0.8,
    structuralWellFormedness: 0.8,
    contextAlignment: 0.8,
  };
  const confidence = computeParseConfidence(evidence);
  assert.equal(confidence.score, 0);
  assert.equal(confidence.meetsMinimumEvidence, false);
  assert.ok(confidence.uncertaintyReasons.some(r => r.category === 'lowEvidence'));
});

test('computeParseConfidence: undefined evidence -> score 0 (fail-safe)', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: undefined as any,
    roleCompletion: 0.8,
    predicateKnown: 0.8,
    modalityClarity: 0.8,
    structuralWellFormedness: 0.8,
    contextAlignment: 0.8,
  };
  const confidence = computeParseConfidence(evidence);
  assert.equal(confidence.score, 0);
});

test('computeParseConfidence: clamped to [0, 1]', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 2.0,
    roleCompletion: 1.5,
    predicateKnown: 1.0,
    modalityClarity: 1.0,
    structuralWellFormedness: 1.0,
    contextAlignment: 1.0,
  };
  const confidence = computeParseConfidence(evidence);
  assert.ok(confidence.score <= 1.0);
  assert.ok(confidence.score >= 0);
});

test('computeParseConfidence: includes uncertainty reasons', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.5,
    roleCompletion: 0.5,
    predicateKnown: 0.5,
    modalityClarity: 0.5,
    structuralWellFormedness: 0.5,
    contextAlignment: 0.5,
  };
  const reasons = [
    { category: 'ambiguity' as const, description: 'Multiple interpretations possible' },
    { category: 'incomplete' as const, description: 'Missing role information' }
  ];
  const confidence = computeParseConfidence(evidence, reasons);
  assert.equal(confidence.uncertaintyReasons.length, 2);
  assert.deepEqual(confidence.uncertaintyReasons[0]!.category, 'ambiguity');
});

test('hasMinimumEvidence: returns false for missing confidence', () => {
  assert.equal(hasMinimumEvidence(undefined), false);
  assert.equal(hasMinimumEvidence(null), false);
});

test('hasMinimumEvidence: returns false for invalid confidence', () => {
  const confidence: ParseConfidence = {
    score: NaN,
    evidence: {
      syntacticValidity: NaN,
      roleCompletion: NaN,
      predicateKnown: NaN,
      modalityClarity: NaN,
      structuralWellFormedness: NaN,
      contextAlignment: NaN,
    },
    minEvidence: NaN,
    uncertaintyReasons: [],
    meetsMinimumEvidence: false
  };
  assert.equal(hasMinimumEvidence(confidence), false);
});

test('hasMinimumEvidence: returns true when all evidence factors meet threshold', () => {
  const confidence: ParseConfidence = {
    score: 0.7,
    evidence: {
      syntacticValidity: 0.7,
      roleCompletion: 0.7,
      predicateKnown: 0.7,
      modalityClarity: 0.7,
      structuralWellFormedness: 0.7,
      contextAlignment: 0.7,
    },
    minEvidence: 0.7,
    uncertaintyReasons: [],
    meetsMinimumEvidence: true
  };
  assert.equal(hasMinimumEvidence(confidence), true);
});

test('hasMinimumEvidence: returns false when min evidence below threshold', () => {
  const confidence: ParseConfidence = {
    score: 0.75,
    evidence: {
      syntacticValidity: 0.9,
      roleCompletion: 0.5,
      predicateKnown: 0.8,
      modalityClarity: 0.8,
      structuralWellFormedness: 0.8,
      contextAlignment: 0.8,
    },
    minEvidence: 0.5,
    uncertaintyReasons: [],
    meetsMinimumEvidence: false
  };
  assert.equal(hasMinimumEvidence(confidence), false);
});

test('hasMinimumEvidence: with requireAllEvidenceFactors=false, depends on minEvidence', () => {
  const confidence: ParseConfidence = {
    score: 0.75,
    evidence: {
      syntacticValidity: 0.9,
      roleCompletion: 0.5,
      predicateKnown: 0.8,
      modalityClarity: 0.8,
      structuralWellFormedness: 0.8,
      contextAlignment: 0.8,
    },
    minEvidence: 0.5,
    uncertaintyReasons: [],
    meetsMinimumEvidence: false
  };
  const laxPolicy: UncertaintyFallbackPolicy = {
    ...DEFAULT_UNCERTAINTY_FALLBACK_POLICY,
    requireAllEvidenceFactors: false,
  };
  assert.equal(hasMinimumEvidence(confidence, laxPolicy), false);
});

test('evaluateUncertaintyFallback: high confidence + high evidence -> store', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.95,
    roleCompletion: 0.90,
    predicateKnown: 0.85,
    modalityClarity: 0.80,
    structuralWellFormedness: 0.95,
    contextAlignment: 0.85,
  };
  const confidence = computeParseConfidence(evidence);
  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test');
  assert.equal(decision.action, 'store');
  assert.equal(decision.reasons.length, 0);
});

test('evaluateUncertaintyFallback: low confidence -> fallback', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.3,
    roleCompletion: 0.2,
    predicateKnown: 0.25,
    modalityClarity: 0.3,
    structuralWellFormedness: 0.2,
    contextAlignment: 0.3,
  };
  const confidence = computeParseConfidence(evidence);
  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test');
  assert.equal(decision.action, 'fallback');
  assert.ok(decision.reasons.some(r => r.includes('confidence') || r.includes('evidence')));
});

test('evaluateUncertaintyFallback: missing confidence -> fallback (fail-safe)', () => {
  const decision = evaluateUncertaintyFallback(makeSem(), undefined, 'test');
  assert.equal(decision.action, 'fallback');
  assert.equal(decision.confidence, 0);
  assert.ok(decision.reasons.some(r => r.includes('missing')));
});

test('evaluateUncertaintyFallback: null confidence -> fallback (fail-safe)', () => {
  const decision = evaluateUncertaintyFallback(makeSem(), null, 'test');
  assert.equal(decision.action, 'fallback');
  assert.equal(decision.confidence, 0);
});

test('evaluateUncertaintyFallback: NaN confidence -> fallback (fail-safe)', () => {
  const confidence: ParseConfidence = {
    score: NaN,
    evidence: {
      syntacticValidity: NaN,
      roleCompletion: NaN,
      predicateKnown: NaN,
      modalityClarity: NaN,
      structuralWellFormedness: NaN,
      contextAlignment: NaN,
    },
    minEvidence: NaN,
    uncertaintyReasons: [],
    meetsMinimumEvidence: false
  };
  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test');
  assert.equal(decision.action, 'fallback');
  assert.equal(decision.confidence, 0);
});

test('evaluateUncertaintyFallback: borderline confidence -> review', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.68,
    roleCompletion: 0.68,
    predicateKnown: 0.68,
    modalityClarity: 0.68,
    structuralWellFormedness: 0.68,
    contextAlignment: 0.68,
  };
  const confidence = computeParseConfidence(evidence);
  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test');
  assert.equal(decision.action, 'review');
  assert.ok(decision.reasons.some(r => r.includes('review band')));
});

test('evaluateUncertaintyFallback: preserves uncertainty reasons from confidence', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.8,
    roleCompletion: 0.55,
    predicateKnown: 0.8,
    modalityClarity: 0.8,
    structuralWellFormedness: 0.8,
    contextAlignment: 0.8,
  };
  const reasons = [
    { category: 'ambiguity' as const, description: 'Multiple possible interpretations' }
  ];
  const confidence = computeParseConfidence(evidence, reasons);
  // Verify parseConfidence has the uncertainty reasons
  assert.equal(confidence.uncertaintyReasons.length, 1);
  assert.equal(confidence.uncertaintyReasons[0]!.category, 'ambiguity');

  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test');
  // Decision should include both evidence reasons and uncertainty reasons
  assert.ok(decision.reasons.length > 0);
  assert.ok(decision.reasons.some(r => r.includes('evidence')) || decision.reasons.some(r => r.includes('ambiguity')));
});

test('evaluateUncertaintyFallback: autoFallbackOnLowEvidence triggers fallback', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.75,
    roleCompletion: 0.4,
    predicateKnown: 0.75,
    modalityClarity: 0.75,
    structuralWellFormedness: 0.75,
    contextAlignment: 0.75,
  };
  const confidence = computeParseConfidence(evidence);
  const strictPolicy: UncertaintyFallbackPolicy = {
    ...DEFAULT_UNCERTAINTY_FALLBACK_POLICY,
    autoFallbackOnLowEvidence: true,
  };
  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test', {}, strictPolicy);
  assert.equal(decision.action, 'fallback');
  assert.ok(decision.reasons.some(r => r.includes('evidence')));
});

test('evaluateUncertaintyFallback: autoFallbackOnLowEvidence=false allows review', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.8,
    roleCompletion: 0.58,
    predicateKnown: 0.8,
    modalityClarity: 0.8,
    structuralWellFormedness: 0.8,
    contextAlignment: 0.8,
  };
  const confidence = computeParseConfidence(evidence);
  const lenientPolicy: UncertaintyFallbackPolicy = {
    ...DEFAULT_UNCERTAINTY_FALLBACK_POLICY,
    autoFallbackOnLowEvidence: false,
    minConfidence: 0.75,
  };
  const decision = evaluateUncertaintyFallback(makeSem(), confidence, 'test', {}, lenientPolicy);
  assert.equal(decision.action, 'review');
});

test('createNaturalLanguageFallback: preserves natural text on high evidence', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.95,
    roleCompletion: 0.90,
    predicateKnown: 0.85,
    modalityClarity: 0.80,
    structuralWellFormedness: 0.95,
    contextAlignment: 0.85,
  };
  const confidence = computeParseConfidence(evidence);
  const record = createNaturalLanguageFallback(makeSem(), confidence, 'I prefer dark mode');
  assert.equal(record.preserveNatural, true);
  assert.equal(record.naturalText, 'I prefer dark mode');
});

test('createNaturalLanguageFallback: preserves natural text on low evidence', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.3,
    roleCompletion: 0.2,
    predicateKnown: 0.25,
    modalityClarity: 0.3,
    structuralWellFormedness: 0.2,
    contextAlignment: 0.3,
  };
  const confidence = computeParseConfidence(evidence);
  const record = createNaturalLanguageFallback(makeSem(), confidence, 'Complex instruction');
  assert.equal(record.preserveNatural, true);
  assert.equal(record.naturalText, 'Complex instruction');
});

test('createNaturalLanguageFallback: handles missing confidence (fail-safe)', () => {
  const record = createNaturalLanguageFallback(makeSem(), undefined, 'Some text');
  assert.equal(record.preserveNatural, true);
  assert.equal(record.naturalText, 'Some text');
  assert.equal(record.parseConfidence.score, 0);
  assert.equal(record.decision.confidence, 0);
  assert.ok(record.decision.reasons.some(r => r.includes('missing')));
});

test('createNaturalLanguageFallback: includes parseConfidence in record', () => {
  const evidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.8,
    roleCompletion: 0.8,
    predicateKnown: 0.8,
    modalityClarity: 0.8,
    structuralWellFormedness: 0.8,
    contextAlignment: 0.8,
  };
  const confidence = computeParseConfidence(evidence);
  const record = createNaturalLanguageFallback(makeSem(), confidence, 'Test text');
  assert.ok(record.parseConfidence);
  assert.equal(record.parseConfidence.score, confidence.score);
});

test('createNaturalLanguageFallback: decision action reflects evidence quality', () => {
  const highEvidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.95,
    roleCompletion: 0.90,
    predicateKnown: 0.85,
    modalityClarity: 0.80,
    structuralWellFormedness: 0.95,
    contextAlignment: 0.85,
  };
  const highConfidence = computeParseConfidence(highEvidence);
  const highRecord = createNaturalLanguageFallback(makeSem(), highConfidence, 'Test');
  assert.equal(highRecord.decision.action, 'store');

  const lowEvidence: ConfidenceEvidenceFactors = {
    syntacticValidity: 0.3,
    roleCompletion: 0.2,
    predicateKnown: 0.25,
    modalityClarity: 0.3,
    structuralWellFormedness: 0.2,
    contextAlignment: 0.3,
  };
  const lowConfidence = computeParseConfidence(lowEvidence);
  const lowRecord = createNaturalLanguageFallback(makeSem(), lowConfidence, 'Test');
  assert.equal(lowRecord.decision.action, 'fallback');
});
