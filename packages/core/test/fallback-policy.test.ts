import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFallback, DEFAULT_FALLBACK_POLICY, type FallbackPolicy, type FallbackContext } from '../src/fallback-policy.js';
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
