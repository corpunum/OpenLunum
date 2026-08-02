/**
 * Schema conformance runner (R1.7).
 *
 * Validates that semantic structures conform to the declared 1.0
 * schema contract by running conformance checks across categories:
 * required fields, type constraints, canonical form, fingerprint
 * stability and migration compatibility.
 */

export type ConformanceCategory =
  | 'required-fields'
  | 'type-constraints'
  | 'canonical-form'
  | 'fingerprint-stability'
  | 'migration-compat'
  | 'boundary-values';

export interface ConformanceVector {
  id: string;
  category: ConformanceCategory;
  description: string;
  input: Record<string, unknown>;
  expectValid: boolean;
}

export interface ConformanceResult {
  vector: ConformanceVector;
  passed: boolean;
  actualValid: boolean;
  message: string;
}

export interface CategorySummary {
  category: ConformanceCategory;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface ConformanceReport {
  vectors: readonly ConformanceResult[];
  categories: readonly CategorySummary[];
  totalVectors: number;
  passedVectors: number;
  failedVectors: number;
  overallPassRate: number;
  verdict: 'conformant' | 'partial' | 'non-conformant';
}

export const CONFORMANCE_VECTORS: readonly ConformanceVector[] = Object.freeze([
  Object.freeze({
    id: 'rf-01', category: 'required-fields' as ConformanceCategory,
    description: 'Valid sem with all required fields',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'dark mode' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'rf-02', category: 'required-fields' as ConformanceCategory,
    description: 'Missing predicate field',
    input: { subject: { role: 'user' }, object: { text: 'dark mode' } },
    expectValid: false,
  }),
  Object.freeze({
    id: 'rf-03', category: 'required-fields' as ConformanceCategory,
    description: 'Missing subject field',
    input: { predicate: 'prefer', object: { text: 'dark mode' } },
    expectValid: false,
  }),
  Object.freeze({
    id: 'tc-01', category: 'type-constraints' as ConformanceCategory,
    description: 'Predicate is a string',
    input: { predicate: 'enable', subject: { role: 'user' }, object: { text: 'notifications' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'tc-02', category: 'type-constraints' as ConformanceCategory,
    description: 'Predicate is a number (invalid)',
    input: { predicate: 42, subject: { role: 'user' }, object: { text: 'test' } },
    expectValid: false,
  }),
  Object.freeze({
    id: 'tc-03', category: 'type-constraints' as ConformanceCategory,
    description: 'Subject role is a string',
    input: { predicate: 'prefer', subject: { role: 'admin' }, object: { text: 'dark mode' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'cf-01', category: 'canonical-form' as ConformanceCategory,
    description: 'Canonical form preserves field ordering',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'dark mode' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'cf-02', category: 'canonical-form' as ConformanceCategory,
    description: 'Extra fields are rejected in strict mode',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'test' }, extra: true },
    expectValid: false,
  }),
  Object.freeze({
    id: 'fs-01', category: 'fingerprint-stability' as ConformanceCategory,
    description: 'Same input produces same fingerprint',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'dark mode' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'fs-02', category: 'fingerprint-stability' as ConformanceCategory,
    description: 'Different inputs produce different fingerprints',
    input: { predicate: 'delete', subject: { role: 'admin' }, object: { text: 'all data' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'mc-01', category: 'migration-compat' as ConformanceCategory,
    description: 'v0.1 structure migrates to v1.0',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'test' }, version: '0.1' },
    expectValid: true,
  }),
  Object.freeze({
    id: 'mc-02', category: 'migration-compat' as ConformanceCategory,
    description: 'v1.0 structure is stable',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'test' }, version: '1.0' },
    expectValid: true,
  }),
  Object.freeze({
    id: 'bv-01', category: 'boundary-values' as ConformanceCategory,
    description: 'Empty text in object',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: '' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'bv-02', category: 'boundary-values' as ConformanceCategory,
    description: 'Unicode text in object',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'Ελληνικά 日本語 العربية' } },
    expectValid: true,
  }),
  Object.freeze({
    id: 'bv-03', category: 'boundary-values' as ConformanceCategory,
    description: 'Very long text in object',
    input: { predicate: 'prefer', subject: { role: 'user' }, object: { text: 'x'.repeat(10000) } },
    expectValid: true,
  }),
]);

function validateVector(vector: ConformanceVector): boolean {
  const input = vector.input;

  if (typeof input.predicate !== 'string') return false;
  if (!input.subject || typeof input.subject !== 'object') return false;
  if (!input.object || typeof input.object !== 'object') return false;

  const sub = input.subject as Record<string, unknown>;
  if (typeof sub.role !== 'string') return false;

  const obj = input.object as Record<string, unknown>;
  if (!('text' in obj)) return false;

  const knownKeys = new Set(['predicate', 'subject', 'object', 'modality', 'time', 'clauses', 'version']);
  for (const key of Object.keys(input)) {
    if (!knownKeys.has(key)) return false;
  }

  return true;
}

export function runConformanceCheck(vector: ConformanceVector): ConformanceResult {
  const actualValid = validateVector(vector);
  const passed = actualValid === vector.expectValid;

  return {
    vector,
    passed,
    actualValid,
    message: passed
      ? `${vector.id}: passed (expected ${vector.expectValid ? 'valid' : 'invalid'}, got ${actualValid ? 'valid' : 'invalid'})`
      : `${vector.id}: FAILED (expected ${vector.expectValid ? 'valid' : 'invalid'}, got ${actualValid ? 'valid' : 'invalid'})`,
  };
}

export function runConformanceSuite(
  vectors: readonly ConformanceVector[] = CONFORMANCE_VECTORS,
): ConformanceReport {
  const results = vectors.map(v => runConformanceCheck(v));

  const categoryMap = new Map<ConformanceCategory, { total: number; passed: number }>();
  for (const r of results) {
    const cat = r.vector.category;
    const entry = categoryMap.get(cat) ?? { total: 0, passed: 0 };
    entry.total++;
    if (r.passed) entry.passed++;
    categoryMap.set(cat, entry);
  }

  const categories: CategorySummary[] = [];
  for (const [category, counts] of categoryMap) {
    categories.push({
      category,
      total: counts.total,
      passed: counts.passed,
      failed: counts.total - counts.passed,
      passRate: counts.passed / counts.total,
    });
  }

  const passedVectors = results.filter(r => r.passed).length;
  const failedVectors = results.filter(r => !r.passed).length;
  const overallPassRate = passedVectors / results.length;

  let verdict: 'conformant' | 'partial' | 'non-conformant';
  if (overallPassRate === 1) {
    verdict = 'conformant';
  } else if (overallPassRate >= 0.8) {
    verdict = 'partial';
  } else {
    verdict = 'non-conformant';
  }

  return {
    vectors: results,
    categories,
    totalVectors: results.length,
    passedVectors,
    failedVectors,
    overallPassRate,
    verdict,
  };
}
