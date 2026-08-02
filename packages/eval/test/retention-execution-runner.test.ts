import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLEXITY_LEVELS,
  SEMANTIC_CATEGORIES,
  RETENTION_LANGUAGES,
  FEATURE_PRESERVATION_THRESHOLD,
  simulateRetentionRun,
  runRetentionExecutionSuite,
} from '../src/retention-execution-runner.js';

describe('retention-execution-runner', () => {
  describe('static test data', () => {
    it('has 6 complexity levels', () => {
      assert.equal(COMPLEXITY_LEVELS.length, 6);
      assert.deepEqual(
        [...COMPLEXITY_LEVELS].sort(),
        ['compound', 'conditional', 'multi-role', 'nested-2', 'nested-3', 'simple'].sort(),
      );
    });

    it('has 8 semantic categories', () => {
      assert.equal(SEMANTIC_CATEGORIES.length, 8);
      assert.deepEqual(
        [...SEMANTIC_CATEGORIES].sort(),
        [
          'belief',
          'consent',
          'constraint',
          'obligation',
          'permission',
          'plan',
          'preference',
          'reminder',
        ].sort(),
      );
    });

    it('has 5 test languages', () => {
      assert.equal(RETENTION_LANGUAGES.length, 5);
      assert.deepEqual([...RETENTION_LANGUAGES].sort(), ['ar', 'el', 'en', 'ja', 'zh'].sort());
    });
  });

  describe('simulateRetentionRun', () => {
    it('returns valid preservation metrics within [0, 1]', () => {
      const result = simulateRetentionRun('simple', 'preference', 'en');
      assert.equal(result.complexity, 'simple');
      assert.equal(result.category, 'preference');
      assert.equal(result.language, 'en');
      for (const rate of [
        result.exactPreservationRate,
        result.featurePreservationRate,
        result.literalPreservationRate,
        result.rolePreservationRate,
        result.driftScore,
      ]) {
        assert.ok(rate >= 0 && rate <= 1, `expected rate in [0,1], got ${rate}`);
      }
      assert.equal(typeof result.degraded, 'boolean');
    });

    it('is deterministic for the same inputs', () => {
      const a = simulateRetentionRun('nested-3', 'obligation', 'ja');
      const b = simulateRetentionRun('nested-3', 'obligation', 'ja');
      assert.deepEqual(a, b);
    });

    it('simple complexity has highest preservation vs nested-3', () => {
      const simple = simulateRetentionRun('simple', 'constraint', 'en');
      const nested3 = simulateRetentionRun('nested-3', 'constraint', 'en');
      assert.ok(simple.featurePreservationRate > nested3.featurePreservationRate);
      assert.ok(simple.exactPreservationRate > nested3.exactPreservationRate);
    });
  });

  describe('runRetentionExecutionSuite', () => {
    const report = runRetentionExecutionSuite();

    it('produces the correct total run count (6 x 8 x 5)', () => {
      assert.equal(report.totalRuns, 6 * 8 * 5);
      assert.equal(report.runs.length, report.totalRuns);
    });

    it('produces per-category summaries for all 8 categories', () => {
      assert.equal(report.categorySummaries.length, 8);
      const categories = report.categorySummaries.map((s) => s.category).sort();
      assert.deepEqual(categories, [...SEMANTIC_CATEGORIES].sort());
    });

    it('produces per-language summaries for all 5 languages', () => {
      assert.equal(report.languageSummaries.length, 5);
      const languages = report.languageSummaries.map((s) => s.language).sort();
      assert.deepEqual(languages, [...RETENTION_LANGUAGES].sort());
      for (const lang of RETENTION_LANGUAGES) {
        const summary = report.languageSummaries.find((s) => s.language === lang);
        assert.ok(summary, `expected a summary for language ${lang}`);
        assert.equal(summary!.sampleCount, 6 * 8);
      }
    });

    it('produces per-complexity summaries for all 6 levels', () => {
      assert.equal(report.complexitySummaries.length, 6);
      const complexities = report.complexitySummaries.map((s) => s.complexity).sort();
      assert.deepEqual(complexities, [...COMPLEXITY_LEVELS].sort());
    });

    it('shows nested-3 complexity degrading relative to simple', () => {
      const simpleSummary = report.complexitySummaries.find((s) => s.complexity === 'simple')!;
      const nested3Summary = report.complexitySummaries.find((s) => s.complexity === 'nested-3')!;
      assert.ok(simpleSummary.averageFeaturePreservation > nested3Summary.averageFeaturePreservation);
      assert.ok(nested3Summary.averageDriftScore > simpleSummary.averageDriftScore);
    });

    it('flags category degradation using the feature preservation threshold', () => {
      assert.equal(report.featurePreservationThreshold, FEATURE_PRESERVATION_THRESHOLD);
      for (const summary of report.categorySummaries) {
        assert.equal(
          summary.meetsThreshold,
          summary.averageFeaturePreservation >= FEATURE_PRESERVATION_THRESHOLD,
        );
      }
    });

    it('produces an overall verdict consistent with failing categories', () => {
      assert.ok(report.verdict === 'pass' || report.verdict === 'fail');
      if (report.failingCategories.length > 0) {
        assert.equal(report.verdict, 'fail');
      } else {
        assert.equal(report.verdict, 'pass');
      }
    });

    it('computes overall preservation rates within [0, 1]', () => {
      assert.ok(report.overallFeaturePreservation >= 0 && report.overallFeaturePreservation <= 1);
      assert.ok(report.overallExactPreservation >= 0 && report.overallExactPreservation <= 1);
    });
  });
});
