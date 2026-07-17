import { test } from 'node:test';
import assert from 'node:assert';
import { 
  classifyContent,
  classifyByCategory,
  getCategoriesByType,
  getCategoryMetadata,
  isValidCategory,
  generatePolicyStats,
  ELIGIBLE_CATEGORIES,
  NATURAL_ONLY_CATEGORIES
} from '../src/policy-classifier.js';

test('classifyContent returns eligible for simple_fact with high confidence', () => {
  const result = classifyContent({
    category: 'simple_fact',
    risk: 'low',
    confidence: 0.95,
    semantic: true
  });

  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.category, 'simple_fact');
  assert.strictEqual(result.risk, 'low');
  assert.strictEqual(result.confidence, 0.95);
  assert.strictEqual(result.reasons.length, 0);
});

test('classifyContent returns not eligible for safety_constraint', () => {
  const result = classifyContent({
    category: 'safety_constraint',
    risk: 'high',
    confidence: 0.93,
    semantic: true
  });

  assert.strictEqual(result.eligible, false);
  assert.ok(result.reasons.includes('natural_only_category_safety_constraint'));
});

test('classifyContent returns not eligible for low confidence', () => {
  const result = classifyContent({
    category: 'preference',
    risk: 'low',
    confidence: 0.85,
    semantic: true
  });

  assert.strictEqual(result.eligible, false);
  assert.ok(result.reasons.some(r => r.includes('confidence_below')));
});

test('classifyContent returns not eligible for high risk', () => {
  const result = classifyContent({
    category: 'legal_text',
    risk: 'high',
    confidence: 0.95,
    semantic: true
  });

  assert.strictEqual(result.eligible, false);
  assert.ok(result.reasons.includes('risk_high'));
});

test('classifyByCategory uses typical risk for category', () => {
  const result = classifyByCategory('simple_fact', 0.95, 'Test fact', true);

  assert.strictEqual(result.risk, 'low');
  assert.strictEqual(result.eligible, true);
});

test('classifyByCategory uses high risk for safety_constraint', () => {
  const result = classifyByCategory('safety_constraint', 0.93, 'Test constraint', true);

  assert.strictEqual(result.risk, 'high');
  assert.strictEqual(result.eligible, false);
});

test('getCategoriesByType returns correct categories', () => {
  const eligible = getCategoriesByType('eligible');
  const naturalOnly = getCategoriesByType('natural_only');

  assert.ok(eligible.includes('simple_fact'));
  assert.ok(eligible.includes('preference'));
  assert.ok(!eligible.includes('safety_constraint'));

  assert.ok(naturalOnly.includes('safety_constraint'));
  assert.ok(naturalOnly.includes('code'));
  assert.ok(!naturalOnly.includes('simple_fact'));
});

test('getCategoryMetadata returns metadata for valid category', () => {
  const metadata = getCategoryMetadata('simple_fact');

  assert.ok(metadata);
  assert.strictEqual(metadata.name, 'Simple Fact');
  assert.ok(metadata.examples.length > 0);
});

test('getCategoryMetadata returns undefined for invalid category', () => {
  const metadata = getCategoryMetadata('invalid_category');

  assert.strictEqual(metadata, undefined);
});

test('isValidCategory returns true for valid categories', () => {
  assert.strictEqual(isValidCategory('simple_fact'), true);
  assert.strictEqual(isValidCategory('preference'), true);
  assert.strictEqual(isValidCategory('safety_constraint'), true);
});

test('isValidCategory returns false for invalid category', () => {
  assert.strictEqual(isValidCategory('invalid_category'), false);
});

test('generatePolicyStats calculates correct statistics', () => {
  const classifications = [
    { category: 'simple_fact', risk: 'low' as const, confidence: 0.95, eligible: true, reasons: [] },
    { category: 'safety_constraint', risk: 'high' as const, confidence: 0.93, eligible: false, reasons: ['natural_only_category_safety_constraint'] },
    { category: 'preference', risk: 'low' as const, confidence: 0.96, eligible: true, reasons: [] }
  ];

  const stats = generatePolicyStats(classifications);

  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.eligible, 2);
  assert.strictEqual(stats.naturalOnly, 1);
  assert.strictEqual(stats.riskDistribution.low, 2);
  assert.strictEqual(stats.riskDistribution.high, 1);
  assert.ok(stats.avgConfidence > 0);
});

test('generatePolicyStats handles empty input', () => {
  const stats = generatePolicyStats([]);

  assert.strictEqual(stats.total, 0);
  assert.strictEqual(stats.eligible, 0);
  assert.strictEqual(stats.avgConfidence, 0);
});

test('ELIGIBLE_CATEGORIES contains expected categories', () => {
  assert.ok(ELIGIBLE_CATEGORIES.has('simple_fact'));
  assert.ok(ELIGIBLE_CATEGORIES.has('preference'));
  assert.ok(ELIGIBLE_CATEGORIES.has('system_fact'));
});

test('NATURAL_ONLY_CATEGORIES contains expected categories', () => {
  assert.ok(NATURAL_ONLY_CATEGORIES.has('safety_constraint'));
  assert.ok(NATURAL_ONLY_CATEGORIES.has('code'));
  assert.ok(NATURAL_ONLY_CATEGORIES.has('ambiguous'));
});