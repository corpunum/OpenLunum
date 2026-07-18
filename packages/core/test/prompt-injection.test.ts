import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdversarialInputs,
  runInjectionTests,
  runAllInjectionTests,
  checkAllDetected,
  type InjectionTestCase,
  type InjectionTestResult
} from '../src/prompt-injection.js';
import type { LunumSem } from '../src/types.js';

// ── Helpers ────────────────────────────────────────────────────────

function createValidSem(kind: string, predicates: string[]): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind,
    clauses: predicates.map(p => ({ predicate: p, roles: { subject: 'test', object: 'test' } }))
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('getAdversarialInputs', () => {
  it('returns exactly 10 test cases', () => {
    const cases = getAdversarialInputs();
    assert.strictEqual(cases.length, 10);
  });

  it('has unique IDs for all test cases', () => {
    const cases = getAdversarialInputs();
    const ids = cases.map(c => c.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, 10);
  });

  it('has all 10 injection types represented', () => {
    const cases = getAdversarialInputs();
    const types = new Set(cases.map(c => c.type));
    assert.strictEqual(types.size, 10);
    assert.ok(types.has('extra-clause'));
    assert.ok(types.has('predicate-injection'));
    assert.ok(types.has('role-tampering'));
    assert.ok(types.has('false-provenance'));
    assert.ok(types.has('fingerprint-corruption'));
    assert.ok(types.has('risk-manipulation'));
    assert.ok(types.has('category-override'));
    assert.ok(types.has('modality-injection'));
    assert.ok(types.has('condition-bypass'));
    assert.ok(types.has('annotation-injection'));
  });

  it('every test case expects detection', () => {
    const cases = getAdversarialInputs();
    for (const c of cases) {
      assert.strictEqual(c.expectedDetected, true);
    }
  });

  it('has descriptions for all test cases', () => {
    const cases = getAdversarialInputs();
    for (const c of cases) {
      assert.ok(c.description && c.description.length > 0);
    }
  });

  it('has valid LunumSem structures', () => {
    const cases = getAdversarialInputs();
    for (const c of cases) {
      assert.ok(c.sem.schema);
      assert.ok(c.sem.world);
      assert.ok(c.sem.kind);
      assert.ok(Array.isArray(c.sem.clauses));
      assert.ok(c.sem.clauses.length > 0);
    }
  });

  it('has expected detection mechanisms', () => {
    const cases = getAdversarialInputs();
    const validDetections = ['validateSem', 'schema-mismatch', 'policy-violation', 'fingerprint-mismatch'];
    for (const c of cases) {
      assert.ok(validDetections.includes(c.expectedDetection));
    }
  });
});

describe('runInjectionTests', () => {
  it('detects all expected injections in default set', () => {
    const summary = runInjectionTests();
    assert.strictEqual(summary.totalTests, 10);
    assert.ok(summary.detected >= 8, `Expected at least 8 detections, got ${summary.detected}`);
    assert.ok(summary.passRate >= 0.8, `Expected pass rate >= 0.8, got ${summary.passRate}`);
  });

  it('returns results for all test cases', () => {
    const summary = runInjectionTests();
    assert.strictEqual(summary.results.length, 10);
  });

  it('marks passed tests correctly', () => {
    const summary = runInjectionTests();
    const passedCount = summary.results.filter(r => r.passed).length;
    assert.strictEqual(passedCount, summary.detected);
  });

  it('handles custom test cases', () => {
    const customCases: InjectionTestCase[] = [
      {
        id: 'custom-1',
        type: 'extra-clause',
        description: 'Custom test',
        sem: createValidSem('test', ['test_pred']),
        expectedDetected: false,
        expectedDetection: 'validateSem'
      },
      {
        id: 'custom-2',
        type: 'predicate-injection',
        description: 'Custom test 2',
        sem: createValidSem('test', ['safety_constraint']),
        expectedDetected: true,
        expectedDetection: 'policy-violation'
      },
      {
        id: 'custom-3',
        type: 'extra-clause',
        description: 'Custom test 3',
        sem: createValidSem('test', ['override_safety']),
        expectedDetected: true,
        expectedDetection: 'policy-violation'
      }
    ];

    const summary = runInjectionTests(customCases);
    assert.strictEqual(summary.totalTests, 3);
    assert.strictEqual(summary.detected, 2);
  });

  it('handles empty test case array', () => {
    const summary = runInjectionTests([]);
    assert.strictEqual(summary.totalTests, 0);
    assert.strictEqual(summary.detected, 0);
    assert.strictEqual(summary.passRate, 0);
  });
});

describe('runAllInjectionTests', () => {
  it('produces a summary with 10 tests', () => {
    const summary = runAllInjectionTests();
    assert.strictEqual(summary.totalTests, 10);
    assert.ok(summary.detected > 0);
  });

  it('returns structured results', () => {
    const summary = runAllInjectionTests();
    for (const result of summary.results) {
      assert.ok(result.id);
      assert.ok(result.type);
      assert.ok(typeof result.detected === 'boolean');
      assert.ok(result.passed !== undefined);
    }
  });
});

describe('checkAllDetected', () => {
  it('reports whether all injections were detected', () => {
    const { allDetected, summary } = checkAllDetected();
    assert.ok(typeof allDetected === 'boolean');
    assert.strictEqual(allDetected, summary.missed === 0);
  });

  it('summary is non-empty', () => {
    const { summary } = checkAllDetected();
    assert.ok(summary.totalTests > 0);
  });
});

describe('detection mechanisms', () => {
  it('detects extra clause injection', () => {
    const cases = getAdversarialInputs();
    const extraClause = cases.find(c => c.type === 'extra-clause')!;
    const summary = runInjectionTests([extraClause]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects predicate injection', () => {
    const cases = getAdversarialInputs();
    const predInj = cases.find(c => c.type === 'predicate-injection')!;
    const summary = runInjectionTests([predInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects role tampering', () => {
    const cases = getAdversarialInputs();
    const roleTamper = cases.find(c => c.type === 'role-tampering')!;
    const summary = runInjectionTests([roleTamper]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects false provenance', () => {
    const cases = getAdversarialInputs();
    const provInj = cases.find(c => c.type === 'false-provenance')!;
    const summary = runInjectionTests([provInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects fingerprint corruption', () => {
    const cases = getAdversarialInputs();
    const fpInj = cases.find(c => c.type === 'fingerprint-corruption')!;
    const summary = runInjectionTests([fpInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects risk manipulation', () => {
    const cases = getAdversarialInputs();
    const riskInj = cases.find(c => c.type === 'risk-manipulation')!;
    const summary = runInjectionTests([riskInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects category override', () => {
    const cases = getAdversarialInputs();
    const catInj = cases.find(c => c.type === 'category-override')!;
    const summary = runInjectionTests([catInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects modality injection', () => {
    const cases = getAdversarialInputs();
    const modInj = cases.find(c => c.type === 'modality-injection')!;
    const summary = runInjectionTests([modInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects condition bypass', () => {
    const cases = getAdversarialInputs();
    const condInj = cases.find(c => c.type === 'condition-bypass')!;
    const summary = runInjectionTests([condInj]);
    assert.ok(summary.results[0]!.detected);
  });

  it('detects annotation injection', () => {
    const cases = getAdversarialInputs();
    const annotInj = cases.find(c => c.type === 'annotation-injection')!;
    const summary = runInjectionTests([annotInj]);
    assert.ok(summary.results[0]!.detected);
  });
});

describe('adversarial input diversity', () => {
  it('covers different clause counts', () => {
    const cases = getAdversarialInputs();
    const clauseCounts = cases.map(c => c.sem.clauses.length);
    assert.ok(clauseCounts.includes(1), 'Should have single-clause injections');
    assert.ok(clauseCounts.some(c => c >= 2), 'Should have multi-clause injections');
  });

  it('covers different predicate types', () => {
    const cases = getAdversarialInputs();
    const predicates = new Set<string>();
    for (const c of cases) {
      for (const clause of c.sem.clauses) {
        predicates.add(clause.predicate);
      }
    }
    assert.ok(predicates.size >= 12, `Should cover many predicates, found ${predicates.size}`);
  });

  it('covers different risk levels', () => {
    const cases = getAdversarialInputs();
    const kinds = new Set(cases.map(c => c.sem.kind));
    assert.ok(kinds.size >= 4, 'Should cover different kind categories');
  });
});
