import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIGUITY_PROFILES,
  RESOLUTION_STRATEGIES,
  simulateAmbiguityResolution,
  runParseAmbiguityResolutionSuite,
} from '../src/parse-ambiguity-resolution.js';

describe('parse-ambiguity-resolution', () => {
  describe('constants', () => {
    it('has 7 ambiguity profiles', () => {
      assert.equal(AMBIGUITY_PROFILES.length, 7);
    });

    it('has 4 resolution strategies', () => {
      assert.equal(RESOLUTION_STRATEGIES.length, 4);
    });

    it('ambiguity names are unique', () => {
      const names = AMBIGUITY_PROFILES.map(a => a.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('includes both safety-relevant and non-safety-relevant ambiguities', () => {
      assert.ok(AMBIGUITY_PROFILES.some(a => a.safetyRelevant));
      assert.ok(AMBIGUITY_PROFILES.some(a => !a.safetyRelevant));
    });
  });

  describe('simulateAmbiguityResolution', () => {
    it('returns valid result', () => {
      const r = simulateAmbiguityResolution(AMBIGUITY_PROFILES[0]!, RESOLUTION_STRATEGIES[0]!);
      assert.equal(typeof r.resolved, 'boolean');
      assert.equal(typeof r.confidence, 'number');
      assert.equal(typeof r.safeResolution, 'boolean');
      assert.equal(typeof r.preservedMeaning, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateAmbiguityResolution(AMBIGUITY_PROFILES[0]!, RESOLUTION_STRATEGIES[0]!);
      const b = simulateAmbiguityResolution(AMBIGUITY_PROFILES[0]!, RESOLUTION_STRATEGIES[0]!);
      assert.deepEqual(a, b);
    });

    it('reject strategy never resolves', () => {
      const reject = RESOLUTION_STRATEGIES.find(s => s.name === 'reject')!;
      for (const ambiguity of AMBIGUITY_PROFILES) {
        const r = simulateAmbiguityResolution(ambiguity, reject);
        assert.equal(r.resolved, false);
        assert.equal(r.confidence, 0);
      }
    });

    it('reject strategy is always safe', () => {
      const reject = RESOLUTION_STRATEGIES.find(s => s.name === 'reject')!;
      for (const ambiguity of AMBIGUITY_PROFILES) {
        const r = simulateAmbiguityResolution(ambiguity, reject);
        assert.equal(r.safeResolution, true);
      }
    });

    it('conservative strategy is always safe', () => {
      const conservative = RESOLUTION_STRATEGIES.find(s => s.name === 'conservative')!;
      for (const ambiguity of AMBIGUITY_PROFILES) {
        const r = simulateAmbiguityResolution(ambiguity, conservative);
        assert.equal(r.safeResolution, true);
      }
    });
  });

  describe('runParseAmbiguityResolutionSuite', () => {
    it('produces correct total tests', () => {
      const report = runParseAmbiguityResolutionSuite();
      assert.equal(report.totalTests, 7 * 4);
    });

    it('has 7 ambiguity summaries', () => {
      const report = runParseAmbiguityResolutionSuite();
      assert.equal(report.ambiguitySummaries.length, 7);
    });

    it('safety rate is reasonable', () => {
      const report = runParseAmbiguityResolutionSuite();
      assert.ok(report.safetyRate >= 0.5);
    });

    it('verdict is robust or acceptable', () => {
      const report = runParseAmbiguityResolutionSuite();
      assert.ok(report.verdict === 'robust' || report.verdict === 'acceptable');
    });

    it('accepts custom inputs', () => {
      const report = runParseAmbiguityResolutionSuite(
        AMBIGUITY_PROFILES.slice(0, 3),
        RESOLUTION_STRATEGIES.slice(0, 2),
      );
      assert.equal(report.totalTests, 3 * 2);
    });
  });
});
