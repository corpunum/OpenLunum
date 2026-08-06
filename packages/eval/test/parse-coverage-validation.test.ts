import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_GROUPS,
  PARSE_INPUT_TYPES,
  simulateParseCoverage,
  runParseCoverageValidation,
} from '../src/parse-coverage-validation.js';

describe('parse-coverage-validation', () => {
  describe('constants', () => {
    it('has 6 language groups', () => {
      assert.equal(LANGUAGE_GROUPS.length, 6);
    });

    it('has 5 input types', () => {
      assert.equal(PARSE_INPUT_TYPES.length, 5);
    });

    it('groups are unique', () => {
      const groups = LANGUAGE_GROUPS.map(g => g.group);
      assert.equal(new Set(groups).size, groups.length);
    });
  });

  describe('simulateParseCoverage', () => {
    it('returns valid metrics', () => {
      const r = simulateParseCoverage(LANGUAGE_GROUPS[0]!, PARSE_INPUT_TYPES[0]!);
      assert.ok(r.parseSuccessRate >= 0 && r.parseSuccessRate <= 1);
      assert.ok(r.featureExtractionRate >= 0 && r.featureExtractionRate <= 1);
      assert.ok(r.schemaConformanceRate >= 0 && r.schemaConformanceRate <= 1);
      assert.ok(r.overallScore >= 0 && r.overallScore <= 1);
    });

    it('is deterministic', () => {
      const a = simulateParseCoverage(LANGUAGE_GROUPS[0]!, PARSE_INPUT_TYPES[0]!);
      const b = simulateParseCoverage(LANGUAGE_GROUPS[0]!, PARSE_INPUT_TYPES[0]!);
      assert.deepEqual(a, b);
    });

    it('latin has higher success than cjk for plain text', () => {
      const latin = simulateParseCoverage(LANGUAGE_GROUPS[0]!, PARSE_INPUT_TYPES[0]!);
      const cjk = simulateParseCoverage(LANGUAGE_GROUPS[2]!, PARSE_INPUT_TYPES[0]!);
      assert.ok(latin.parseSuccessRate >= cjk.parseSuccessRate);
    });

    it('plain text has higher success than code-mixed', () => {
      const plain = simulateParseCoverage(LANGUAGE_GROUPS[0]!, PARSE_INPUT_TYPES[0]!);
      const mixed = simulateParseCoverage(LANGUAGE_GROUPS[0]!, PARSE_INPUT_TYPES[2]!);
      assert.ok(plain.parseSuccessRate >= mixed.parseSuccessRate);
    });
  });

  describe('runParseCoverageValidation', () => {
    it('produces correct total tests', () => {
      const report = runParseCoverageValidation();
      assert.equal(report.totalTests, 6 * 5);
    });

    it('has 6 group summaries', () => {
      const report = runParseCoverageValidation();
      assert.equal(report.groupSummaries.length, 6);
    });

    it('has 5 input type summaries', () => {
      const report = runParseCoverageValidation();
      assert.equal(report.inputTypeSummaries.length, 5);
    });

    it('overall coverage is reasonable', () => {
      const report = runParseCoverageValidation();
      assert.ok(report.overallCoverage > 0.6);
    });

    it('verdict is comprehensive or adequate', () => {
      const report = runParseCoverageValidation();
      assert.ok(report.verdict === 'comprehensive' || report.verdict === 'adequate');
    });

    it('weakest group is identified', () => {
      const report = runParseCoverageValidation();
      const validGroups = LANGUAGE_GROUPS.map(g => g.group);
      assert.ok(validGroups.includes(report.weakestGroup));
    });

    it('accepts custom subset', () => {
      const report = runParseCoverageValidation(
        LANGUAGE_GROUPS.slice(0, 2),
        PARSE_INPUT_TYPES.slice(0, 3),
      );
      assert.equal(report.totalTests, 2 * 3);
    });
  });
});
