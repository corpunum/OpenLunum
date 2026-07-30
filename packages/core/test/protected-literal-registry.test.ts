import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtectedLiteralRegistry,
  defaultRegistry,
  type ProtectedLiteralCategory,
  type DetectedLiteral
} from '../src/protected-literal-registry.js';
import type { LunumTerm } from '../src/types.js';

// Test suite for ProtectedLiteralRegistry (R6.2 readiness)

test('registry singleton: defaultRegistry is available', () => {
  assert.ok(defaultRegistry instanceof ProtectedLiteralRegistry);
});

test('registry singleton: defaultRegistry detects all 7 categories', () => {
  const categories = defaultRegistry.getCategories();
  assert.equal(categories.length, 7);
  const names = categories.map((c) => c.name);
  assert.deepEqual(names, ['quantity', 'date', 'identifier', 'range', 'url', 'path', 'structured-ref']);
});

// ============================================
// QUANTITY TESTS (3 per: detected, preserved, altered)
// ============================================

test('quantity: detected with value and unit', () => {
  const term: LunumTerm = { type: 'quantity', value: 5, unit: 'kg' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'quantity');
  assert.equal(detected!.token, JSON.stringify({ value: 5, unit: 'kg' }));
});

test('quantity: detected with currency unit', () => {
  const term: LunumTerm = { type: 'quantity', value: 100, unit: 'USD' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'quantity');
});

test('quantity: detected without unit preserves null', () => {
  const term: LunumTerm = { type: 'quantity', value: 42 };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.token, JSON.stringify({ value: 42, unit: null }));
});

test('quantity: alteration of value is caught', () => {
  const term1: LunumTerm = { type: 'quantity', value: 500, unit: 'usd' };
  const term2: LunumTerm = { type: 'quantity', value: 600, unit: 'usd' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('quantity: alteration of unit is caught', () => {
  const term1: LunumTerm = { type: 'quantity', value: 100, unit: 'kg' };
  const term2: LunumTerm = { type: 'quantity', value: 100, unit: 'lb' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('quantity: preserved when value and unit match', () => {
  const term1: LunumTerm = { type: 'quantity', value: 20, unit: 'mph' };
  const term2: LunumTerm = { type: 'quantity', value: 20, unit: 'mph' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// DATE TESTS (3 per: detected, preserved, altered)
// ============================================

test('date: detected with ISO 8601 date', () => {
  const term: LunumTerm = { type: 'date', value: '2026-07-31' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'date');
});

test('date: detected with ISO 8601 timestamp', () => {
  const term: LunumTerm = { type: 'date', value: '2026-07-31T12:30:00Z' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'date');
});

test('date: detected with timezone offset', () => {
  const term: LunumTerm = { type: 'date', value: '2026-07-31T12:30:00+02:00' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'date');
});

test('date: alteration of date is caught', () => {
  const term1: LunumTerm = { type: 'date', value: '2026-08-01' };
  const term2: LunumTerm = { type: 'date', value: '2026-08-02' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('date: preserved when dates match', () => {
  const term1: LunumTerm = { type: 'date', value: '2026-12-25' };
  const term2: LunumTerm = { type: 'date', value: '2026-12-25' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// IDENTIFIER TESTS (3 per: detected, preserved, altered)
// ============================================

test('identifier: detected with id field (ticket)', () => {
  const term: LunumTerm = { type: 'identifier', id: 'ticket-1234' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'identifier');
});

test('identifier: detected with id field (UUID)', () => {
  const term: LunumTerm = { type: 'identifier', id: 'a1b2c3d4-e5f6-4a5b-8c9d-e1f2a3b4c5d6' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'identifier');
});

test('identifier: detected with value field (account number)', () => {
  const term: LunumTerm = { type: 'identifier', value: 'ABC-100' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'identifier');
});

test('identifier: alteration of id is caught', () => {
  const term1: LunumTerm = { type: 'identifier', id: 'ticket-1234' };
  const term2: LunumTerm = { type: 'identifier', id: 'ticket-5678' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('identifier: alteration of value is caught', () => {
  const term1: LunumTerm = { type: 'identifier', value: 'ABC-100' };
  const term2: LunumTerm = { type: 'identifier', value: 'ABC-200' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('identifier: preserved when id and value match', () => {
  const term1: LunumTerm = { type: 'identifier', id: 'order-9999', value: 'ORD-2026-001' };
  const term2: LunumTerm = { type: 'identifier', id: 'order-9999', value: 'ORD-2026-001' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// RANGE TESTS (3 per: detected, preserved, altered)
// ============================================

test('range: detected with min and max', () => {
  const term: LunumTerm = { type: 'range', min: 10, max: 50, unit: 'km' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'range');
});

test('range: detected with percentage unit', () => {
  const term: LunumTerm = { type: 'range', min: 50, max: 100, unit: '%' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'range');
});

test('range: detected without unit', () => {
  const term: LunumTerm = { type: 'range', min: 1, max: 10 };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'range');
});

test('range: alteration of max value is caught', () => {
  const term1: LunumTerm = { type: 'range', min: 10, max: 50, unit: 'km' };
  const term2: LunumTerm = { type: 'range', min: 10, max: 100, unit: 'km' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('range: alteration of unit is caught', () => {
  const term1: LunumTerm = { type: 'range', min: 0, max: 100, unit: 'km' };
  const term2: LunumTerm = { type: 'range', min: 0, max: 100, unit: 'mi' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('range: preserved when all fields match', () => {
  const term1: LunumTerm = { type: 'range', min: 5, max: 20, unit: 'kg' };
  const term2: LunumTerm = { type: 'range', min: 5, max: 20, unit: 'kg' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// URL TESTS (3 per: detected, preserved, altered)
// ============================================

test('url: detected with https value', () => {
  const term: LunumTerm = { type: 'url', value: 'https://example.com' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'url');
});

test('url: detected with http value', () => {
  const term: LunumTerm = { type: 'url', value: 'http://example.org/path' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'url');
});

test('url: detected via ref field', () => {
  const term: LunumTerm = { type: 'url', ref: 'https://example.com/resource' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'url');
});

test('url: alteration of URL is caught', () => {
  const term1: LunumTerm = { type: 'url', value: 'https://example.com/a' };
  const term2: LunumTerm = { type: 'url', value: 'https://example.com/b' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('url: preserved when URLs match', () => {
  const term1: LunumTerm = { type: 'url', value: 'https://example.com/api' };
  const term2: LunumTerm = { type: 'url', value: 'https://example.com/api' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// PATH TESTS (3 per: detected, preserved, altered)
// ============================================

test('path: detected with unix path', () => {
  const term: LunumTerm = { type: 'path', value: '/usr/bin/python' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'path');
});

test('path: detected with windows path', () => {
  const term: LunumTerm = { type: 'path', value: 'C:\\Windows\\System32' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'path');
});

test('path: detected via ref field', () => {
  const term: LunumTerm = { type: 'path', ref: '/home/user/documents/file.pdf' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'path');
});

test('path: alteration of path is caught', () => {
  const term1: LunumTerm = { type: 'path', value: '/home/user/doc.pdf' };
  const term2: LunumTerm = { type: 'path', value: '/home/user/other.pdf' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('path: preserved when paths match', () => {
  const term1: LunumTerm = { type: 'path', value: '/etc/config.conf' };
  const term2: LunumTerm = { type: 'path', value: '/etc/config.conf' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// STRUCTURED-REF TESTS (3 per: detected, preserved, altered)
// ============================================

test('structured-ref: detected with section reference', () => {
  const term: LunumTerm = { type: 'structured-ref', value: '§3.2' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'structured-ref');
});

test('structured-ref: detected with version reference', () => {
  const term: LunumTerm = { type: 'structured-ref', value: 'v2.1.0' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'structured-ref');
});

test('structured-ref: detected with version pre-release', () => {
  const term: LunumTerm = { type: 'structured-ref', value: 'v1.0.0-rc.1' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'structured-ref');
});

test('structured-ref: alteration of section reference is caught', () => {
  const term1: LunumTerm = { type: 'structured-ref', value: '§1.2' };
  const term2: LunumTerm = { type: 'structured-ref', value: '§1.3' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('structured-ref: alteration of version is caught', () => {
  const term1: LunumTerm = { type: 'structured-ref', value: 'v2.1.0' };
  const term2: LunumTerm = { type: 'structured-ref', value: 'v2.2.0' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), false);
});

test('structured-ref: preserved when section references match', () => {
  const term1: LunumTerm = { type: 'structured-ref', value: '§4.5.6' };
  const term2: LunumTerm = { type: 'structured-ref', value: '§4.5.6' };
  const detected1 = defaultRegistry.detect(term1)!;
  const detected2 = defaultRegistry.detect(term2)!;
  assert.equal(defaultRegistry.isEquivalent(detected1, detected2), true);
});

// ============================================
// NON-PROTECTED LITERAL TESTS
// ============================================

test('non-protected-literal: actor type is not detected', () => {
  const term: LunumTerm = { type: 'actor', id: 'user_1' };
  const detected = defaultRegistry.detect(term);
  assert.equal(detected, undefined);
});

test('non-protected-literal: concept type is not detected', () => {
  const term: LunumTerm = { type: 'concept', id: 'document' };
  const detected = defaultRegistry.detect(term);
  assert.equal(detected, undefined);
});

test('non-protected-literal: null term is not detected', () => {
  const detected = defaultRegistry.detect(null);
  assert.equal(detected, undefined);
});

test('non-protected-literal: primitive string is not detected', () => {
  const detected = defaultRegistry.detect('hello');
  assert.equal(detected, undefined);
});

test('non-protected-literal: array is not detected', () => {
  const detected = defaultRegistry.detect(['a', 'b']);
  assert.equal(detected, undefined);
});

// ============================================
// REGISTRY API TESTS
// ============================================

test('registry: getCategory returns correct spec', () => {
  const spec = defaultRegistry.getCategory('quantity');
  assert.ok(spec);
  assert.equal(spec!.name, 'quantity');
  assert.ok(spec!.description.includes('quantities'));
});

test('registry: getCategory returns undefined for unknown category', () => {
  const spec = defaultRegistry.getCategory('unknown' as ProtectedLiteralCategory);
  assert.equal(spec, undefined);
});

test('registry: getDescription returns human-readable text', () => {
  const description = defaultRegistry.getDescription('date');
  assert.ok(description.includes('ISO'));
});

test('registry: getCategories returns all 7 specs in order', () => {
  const categories = defaultRegistry.getCategories();
  assert.equal(categories.length, 7);
  assert.equal(categories[0]!.name, 'quantity');
  assert.equal(categories[6]!.name, 'structured-ref');
});

// ============================================
// INTEGRATION TESTS
// ============================================

test('registry: detected literal maintains type after round-trip', () => {
  const term: LunumTerm = { type: 'identifier', id: 'ACCT-12345' };
  const detected = defaultRegistry.detect(term);
  assert.ok(detected);
  assert.equal(detected!.type, 'identifier');
  assert.equal((detected!.raw as Record<string, unknown>).id, 'ACCT-12345');
});

test('registry: handles mixed literal and non-literal roles', () => {
  const literalTerm: LunumTerm = { type: 'url', value: 'https://api.example.com' };
  const nonLiteralTerm: LunumTerm = { type: 'actor', id: 'service' };

  const detectedLiteral = defaultRegistry.detect(literalTerm);
  const detectedNonLiteral = defaultRegistry.detect(nonLiteralTerm);

  assert.ok(detectedLiteral);
  assert.equal(detectedNonLiteral, undefined);
});

test('registry: two different categories do not match', () => {
  const quantityTerm: LunumTerm = { type: 'quantity', value: 100, unit: 'kg' };
  const dateTerm: LunumTerm = { type: 'date', value: '2026-01-01' };

  const detectedQuantity = defaultRegistry.detect(quantityTerm)!;
  const detectedDate = defaultRegistry.detect(dateTerm)!;

  assert.equal(defaultRegistry.isEquivalent(detectedQuantity, detectedDate), false);
});
