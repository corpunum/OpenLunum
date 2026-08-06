import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_CASE_CATEGORIES,
  simulateEdgeCaseValidation,
  runCanonicalizationEdgeCaseSuite,
} from '../src/canonicalization-edge-cases.js';

describe('canonicalization-edge-cases', () => {
  describe('constants', () => {
    it('has 8 categories', () => {
      assert.equal(EDGE_CASE_CATEGORIES.length, 8);
    });

    it('categories are unique', () => {
      const cats = EDGE_CASE_CATEGORIES.map(c => c.category);
      assert.equal(new Set(cats).size, cats.length);
    });

    it('all categories have at least 4 scenarios', () => {
      for (const cat of EDGE_CASE_CATEGORIES) {
        assert.ok(cat.scenarioCount >= 4);
      }
    });
  });

  describe('simulateEdgeCaseValidation', () => {
    it('returns valid result structure', () => {
      const r = simulateEdgeCaseValidation(EDGE_CASE_CATEGORIES[0]!, 0);
      assert.ok(['preserved', 'normalized', 'lost', 'corrupted'].includes(r.outcome));
      assert.ok(r.confidence >= 0 && r.confidence <= 1);
      assert.equal(typeof r.roundTripStable, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateEdgeCaseValidation(EDGE_CASE_CATEGORIES[0]!, 0);
      const b = simulateEdgeCaseValidation(EDGE_CASE_CATEGORIES[0]!, 0);
      assert.deepEqual(a, b);
    });

    it('different scenarios produce different results', () => {
      const r0 = simulateEdgeCaseValidation(EDGE_CASE_CATEGORIES[0]!, 0);
      const r1 = simulateEdgeCaseValidation(EDGE_CASE_CATEGORIES[0]!, 1);
      assert.notDeepEqual(r0, r1);
    });

    it('preserved outcome is round-trip stable', () => {
      const results: import('../src/canonicalization-edge-cases.js').EdgeCaseResult[] = [];
      for (const cat of EDGE_CASE_CATEGORIES) {
        for (let i = 0; i < cat.scenarioCount; i++) {
          results.push(simulateEdgeCaseValidation(cat, i));
        }
      }
      const preserved = results.filter(r => r.outcome === 'preserved');
      assert.ok(preserved.length > 0);
      for (const r of preserved) {
        assert.equal(r.roundTripStable, true);
      }
    });
  });

  describe('runCanonicalizationEdgeCaseSuite', () => {
    it('produces correct total tests', () => {
      const expectedTotal = EDGE_CASE_CATEGORIES.reduce((s, c) => s + c.scenarioCount, 0);
      const report = runCanonicalizationEdgeCaseSuite();
      assert.equal(report.totalTests, expectedTotal);
    });

    it('has 8 category summaries', () => {
      const report = runCanonicalizationEdgeCaseSuite();
      assert.equal(report.categorySummaries.length, 8);
    });

    it('category counts sum to total scenarios', () => {
      const report = runCanonicalizationEdgeCaseSuite();
      for (const cs of report.categorySummaries) {
        assert.equal(cs.preserved + cs.normalized + cs.lost + cs.corrupted, cs.totalScenarios);
      }
    });

    it('preservation rate is high', () => {
      const report = runCanonicalizationEdgeCaseSuite();
      assert.ok(report.overallPreservationRate >= 0.8);
    });

    it('verdict is robust or acceptable', () => {
      const report = runCanonicalizationEdgeCaseSuite();
      assert.ok(report.verdict === 'robust' || report.verdict === 'acceptable');
    });

    it('accepts custom subset', () => {
      const report = runCanonicalizationEdgeCaseSuite(EDGE_CASE_CATEGORIES.slice(0, 2));
      const expected = EDGE_CASE_CATEGORIES[0]!.scenarioCount + EDGE_CASE_CATEGORIES[1]!.scenarioCount;
      assert.equal(report.totalTests, expected);
      assert.equal(report.categorySummaries.length, 2);
    });
  });
});
