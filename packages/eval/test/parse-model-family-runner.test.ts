import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSE_MODEL_FAMILY_RUNNER_VERSION,
  MODEL_FAMILIES,
  TEST_LANGUAGES,
  DEFAULT_PARSE_FAMILY_GATES,
  simulateParseRun,
  checkParseFamilyGates,
  runModelFamilyParseSuite,
} from '../src/parse-model-family-runner.js';

describe('parse-model-family-runner constants', () => {
  it('version is semver', () => {
    assert.match(PARSE_MODEL_FAMILY_RUNNER_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('MODEL_FAMILIES has exactly 4 entries', () => {
    assert.strictEqual(MODEL_FAMILIES.length, 4);
    assert.deepStrictEqual(
      [...MODEL_FAMILIES.map((f) => f.id)].sort(),
      ['gemma', 'generic', 'llama', 'qwen'],
    );
  });

  it('TEST_LANGUAGES has exactly 6 entries', () => {
    assert.strictEqual(TEST_LANGUAGES.length, 6);
    assert.deepStrictEqual(
      [...TEST_LANGUAGES.map((l) => l.code)].sort(),
      ['ar', 'el', 'en', 'es', 'ja', 'zh'],
    );
  });

  it('every family has at least one supported language', () => {
    for (const family of MODEL_FAMILIES) {
      assert.ok(family.supportedLanguages.length > 0, `${family.id} has no supported languages`);
    }
  });

  it('MODEL_FAMILIES and TEST_LANGUAGES are frozen', () => {
    assert.ok(Object.isFrozen(MODEL_FAMILIES));
    assert.ok(Object.isFrozen(TEST_LANGUAGES));
    for (const family of MODEL_FAMILIES) {
      assert.ok(Object.isFrozen(family));
    }
    for (const language of TEST_LANGUAGES) {
      assert.ok(Object.isFrozen(language));
    }
  });
});

describe('simulateParseRun', () => {
  it('returns metrics in [0, 1] and a positive item count / latency', () => {
    for (const family of MODEL_FAMILIES) {
      for (const language of TEST_LANGUAGES) {
        const result = simulateParseRun(family, language);
        assert.strictEqual(result.family, family.id);
        assert.strictEqual(result.language, language.code);
        assert.strictEqual(result.itemCount, 200);
        assert.ok(result.meanLatencyMs > 0);
        for (const value of Object.values(result.metrics)) {
          assert.ok(value >= 0 && value <= 1, `metric out of range: ${value}`);
        }
      }
    }
  });

  it('is deterministic across repeated calls (same seed -> same result)', () => {
    const family = MODEL_FAMILIES[0]!;
    const language = TEST_LANGUAGES[0]!;
    const a = simulateParseRun(family, language);
    const b = simulateParseRun(family, language);
    assert.deepStrictEqual(a, b);
  });

  it('marks supported flag correctly from family.supportedLanguages', () => {
    const qwen = MODEL_FAMILIES.find((f) => f.id === 'qwen')!;
    const generic = MODEL_FAMILIES.find((f) => f.id === 'generic')!;
    const ar = TEST_LANGUAGES.find((l) => l.code === 'ar')!;

    const qwenAr = simulateParseRun(qwen, ar);
    assert.strictEqual(qwenAr.supported, true);

    const genericAr = simulateParseRun(generic, ar);
    assert.strictEqual(genericAr.supported, false);
  });

  it('unsupported combinations score markedly worse than supported ones', () => {
    const generic = MODEL_FAMILIES.find((f) => f.id === 'generic')!;
    const en = TEST_LANGUAGES.find((l) => l.code === 'en')!;
    const ar = TEST_LANGUAGES.find((l) => l.code === 'ar')!;

    const supportedRun = simulateParseRun(generic, en);
    const unsupportedRun = simulateParseRun(generic, ar);

    assert.ok(unsupportedRun.metrics.validParseRate < supportedRun.metrics.validParseRate);
    assert.ok(unsupportedRun.metrics.fallbackRate > supportedRun.metrics.fallbackRate);
  });
});

describe('checkParseFamilyGates', () => {
  it('passes metrics comfortably above thresholds', () => {
    const check = checkParseFamilyGates({
      validParseRate: 0.95,
      exactMatchRate: 0.9,
      featureRecall: 0.92,
      fallbackRate: 0.02,
    });
    assert.strictEqual(check.passed, true);
    assert.deepStrictEqual(check.failures, []);
  });

  it('fails and reports each violated gate', () => {
    const check = checkParseFamilyGates({
      validParseRate: 0.5,
      exactMatchRate: 0.4,
      featureRecall: 0.4,
      fallbackRate: 0.6,
    });
    assert.strictEqual(check.passed, false);
    assert.strictEqual(check.failures.length, 4);
  });
});

describe('runModelFamilyParseSuite', () => {
  const report = runModelFamilyParseSuite();

  it('produces one run per family x language combination', () => {
    assert.strictEqual(report.runs.length, MODEL_FAMILIES.length * TEST_LANGUAGES.length);
  });

  it('produces a family summary for every family', () => {
    assert.strictEqual(report.familySummaries.length, MODEL_FAMILIES.length);
    assert.deepStrictEqual(
      [...report.familySummaries.map((f) => f.family)].sort(),
      [...MODEL_FAMILIES.map((f) => f.id)].sort(),
    );
  });

  it('produces a language summary for every language', () => {
    assert.strictEqual(report.languageSummaries.length, TEST_LANGUAGES.length);
    assert.deepStrictEqual(
      [...report.languageSummaries.map((l) => l.language)].sort(),
      [...TEST_LANGUAGES.map((l) => l.code)].sort(),
    );
  });

  it('family summary supportedRuns matches the family supportedLanguages count', () => {
    for (const family of MODEL_FAMILIES) {
      const summary = report.familySummaries.find((f) => f.family === family.id)!;
      assert.strictEqual(summary.supportedRuns, family.supportedLanguages.length);
      assert.strictEqual(summary.totalRuns, TEST_LANGUAGES.length);
    }
  });

  it('language summary familiesSupporting matches how many families list that language', () => {
    for (const language of TEST_LANGUAGES) {
      const summary = report.languageSummaries.find((l) => l.language === language.code)!;
      const expected = MODEL_FAMILIES.filter((f) => f.supportedLanguages.includes(language.code)).length;
      assert.strictEqual(summary.familiesSupporting, expected);
    }
  });

  it('all families pass gates on their supported languages', () => {
    for (const summary of report.familySummaries) {
      assert.strictEqual(
        summary.allSupportedPassed,
        true,
        `family ${summary.family} failed on: ${summary.failingLanguages.join(', ')}`,
      );
      assert.strictEqual(summary.supportedRunsPassed, summary.supportedRuns);
      assert.deepStrictEqual(summary.failingLanguages, []);
    }
  });

  it('overall verdict is production-ready when all families pass', () => {
    assert.strictEqual(report.verdict, 'production-ready');
    assert.deepStrictEqual(report.failingFamilies, []);
  });

  it('uses DEFAULT_PARSE_FAMILY_GATES by default', () => {
    assert.deepStrictEqual(report.gates, DEFAULT_PARSE_FAMILY_GATES);
  });

  it('produces a not-ready verdict with stricter gates', () => {
    const strict = runModelFamilyParseSuite(MODEL_FAMILIES, TEST_LANGUAGES, {
      minValidParseRate: 0.999,
      minExactMatchRate: 0.999,
      minFeatureRecall: 0.999,
      maxFallbackRate: 0.0001,
    });
    assert.strictEqual(strict.verdict, 'not-ready');
    assert.ok(strict.failingFamilies.length > 0);
  });

  it('respects a custom itemCount', () => {
    const custom = runModelFamilyParseSuite(MODEL_FAMILIES, TEST_LANGUAGES, DEFAULT_PARSE_FAMILY_GATES, 50);
    for (const run of custom.runs) {
      assert.strictEqual(run.itemCount, 50);
    }
  });
});
