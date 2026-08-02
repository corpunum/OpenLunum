import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_KEYS,
  SAMPLE_SCOPED_RESULTS,
  validateScope,
  detectRegressions,
  runValidation,
  runSampleValidation,
} from '../src/parse-threshold-validation.js';
import { DEFAULT_PARSE_GATES } from '../src/parse-gates.js';
import type { ScopedParseResults, ValidationScope } from '../src/parse-threshold-validation.js';

describe('parse-threshold-validation', () => {
  describe('GATE_KEYS', () => {
    it('has 6 gate keys', () => {
      assert.equal(GATE_KEYS.length, 6);
    });

    it('includes safety invariant', () => {
      assert.ok(GATE_KEYS.includes('safetyInvariantPassRate'));
    });
  });

  describe('SAMPLE_SCOPED_RESULTS', () => {
    it('has 5 scoped results', () => {
      assert.equal(SAMPLE_SCOPED_RESULTS.length, 5);
    });

    it('covers language and model scopes', () => {
      const types = new Set(SAMPLE_SCOPED_RESULTS.map(s => s.scopeType));
      assert.ok(types.has('language'));
      assert.ok(types.has('model'));
    });
  });

  describe('validateScope', () => {
    it('passing results produce no violations', () => {
      const scoped: ScopedParseResults = {
        scopeType: 'language',
        scopeId: 'en',
        results: {
          validParseRate: 0.98,
          exactMatchRate: 0.92,
          featureRecall: 0.95,
          featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0,
          fallbackRate: 0.04,
        },
        sampleCount: 50,
      };
      const result = validateScope(scoped);
      assert.equal(result.passed, true);
      assert.equal(result.violations.length, 0);
      assert.equal(result.safetyViolation, false);
    });

    it('low exact match triggers violation', () => {
      const scoped: ScopedParseResults = {
        scopeType: 'language',
        scopeId: 'test',
        results: {
          validParseRate: 0.98,
          exactMatchRate: 0.70,
          featureRecall: 0.95,
          featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0,
          fallbackRate: 0.04,
        },
        sampleCount: 50,
      };
      const result = validateScope(scoped);
      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.gate === 'exactMatchRate'));
    });

    it('safety violation is flagged separately', () => {
      const scoped: ScopedParseResults = {
        scopeType: 'language',
        scopeId: 'test',
        results: {
          validParseRate: 0.98,
          exactMatchRate: 0.92,
          featureRecall: 0.95,
          featurePrecision: 0.94,
          safetyInvariantPassRate: 0.90,
          fallbackRate: 0.04,
        },
        sampleCount: 50,
      };
      const result = validateScope(scoped);
      assert.equal(result.safetyViolation, true);
    });

    it('high fallback rate triggers violation (inverted gate)', () => {
      const scoped: ScopedParseResults = {
        scopeType: 'language',
        scopeId: 'test',
        results: {
          validParseRate: 0.98,
          exactMatchRate: 0.92,
          featureRecall: 0.95,
          featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0,
          fallbackRate: 0.20,
        },
        sampleCount: 50,
      };
      const result = validateScope(scoped);
      assert.ok(result.violations.some(v => v.gate === 'fallbackRate'));
    });

    it('identifies worst gate by deficit', () => {
      const scoped: ScopedParseResults = {
        scopeType: 'language',
        scopeId: 'test',
        results: {
          validParseRate: 0.80,
          exactMatchRate: 0.60,
          featureRecall: 0.95,
          featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0,
          fallbackRate: 0.04,
        },
        sampleCount: 50,
      };
      const result = validateScope(scoped);
      assert.equal(result.worstGate, 'exactMatchRate');
      assert.ok(result.worstDeficit > 0.15);
    });

    it('respects custom config', () => {
      const relaxed = { ...DEFAULT_PARSE_GATES, exactMatchRate: 0.50 };
      const scoped: ScopedParseResults = {
        scopeType: 'language',
        scopeId: 'test',
        results: {
          validParseRate: 0.98,
          exactMatchRate: 0.60,
          featureRecall: 0.95,
          featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0,
          fallbackRate: 0.04,
        },
        sampleCount: 50,
      };
      const result = validateScope(scoped, relaxed);
      assert.equal(result.passed, true);
    });
  });

  describe('detectRegressions', () => {
    it('detects regression when score drops', () => {
      const prev: ScopedParseResults[] = [{
        scopeType: 'language' as ValidationScope,
        scopeId: 'en',
        results: {
          validParseRate: 0.98, exactMatchRate: 0.92,
          featureRecall: 0.95, featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0, fallbackRate: 0.04,
        },
        sampleCount: 50,
      }];
      const cur: ScopedParseResults[] = [{
        scopeType: 'language' as ValidationScope,
        scopeId: 'en',
        results: {
          validParseRate: 0.98, exactMatchRate: 0.80,
          featureRecall: 0.95, featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0, fallbackRate: 0.04,
        },
        sampleCount: 50,
      }];
      const regs = detectRegressions(cur, prev);
      assert.ok(regs.length > 0);
      assert.ok(regs.some(r => r.gate === 'exactMatchRate' && r.regressed));
    });

    it('detects fallback rate regression (inverted)', () => {
      const prev: ScopedParseResults[] = [{
        scopeType: 'language' as ValidationScope,
        scopeId: 'en',
        results: {
          validParseRate: 0.98, exactMatchRate: 0.92,
          featureRecall: 0.95, featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0, fallbackRate: 0.04,
        },
        sampleCount: 50,
      }];
      const cur: ScopedParseResults[] = [{
        scopeType: 'language' as ValidationScope,
        scopeId: 'en',
        results: {
          validParseRate: 0.98, exactMatchRate: 0.92,
          featureRecall: 0.95, featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0, fallbackRate: 0.12,
        },
        sampleCount: 50,
      }];
      const regs = detectRegressions(cur, prev);
      assert.ok(regs.some(r => r.gate === 'fallbackRate' && r.regressed));
    });

    it('no regression when scores improve', () => {
      const prev: ScopedParseResults[] = [{
        scopeType: 'language' as ValidationScope,
        scopeId: 'en',
        results: {
          validParseRate: 0.90, exactMatchRate: 0.80,
          featureRecall: 0.85, featurePrecision: 0.84,
          safetyInvariantPassRate: 1.0, fallbackRate: 0.10,
        },
        sampleCount: 50,
      }];
      const cur: ScopedParseResults[] = [{
        scopeType: 'language' as ValidationScope,
        scopeId: 'en',
        results: {
          validParseRate: 0.98, exactMatchRate: 0.92,
          featureRecall: 0.95, featurePrecision: 0.94,
          safetyInvariantPassRate: 1.0, fallbackRate: 0.04,
        },
        sampleCount: 50,
      }];
      const regs = detectRegressions(cur, prev);
      assert.equal(regs.length, 0);
    });
  });

  describe('runValidation', () => {
    it('produces correct scope counts', () => {
      const report = runValidation(SAMPLE_SCOPED_RESULTS);
      assert.equal(report.totalScopes, 5);
      assert.equal(report.passedScopes + report.failedScopes, report.totalScopes);
    });

    it('detects safety failures in sample data', () => {
      const report = runValidation(SAMPLE_SCOPED_RESULTS);
      assert.ok(report.safetyFailures > 0);
    });

    it('safety failures produce safety-fail verdict', () => {
      const report = runValidation(SAMPLE_SCOPED_RESULTS);
      assert.equal(report.overallVerdict, 'safety-fail');
    });

    it('all-passing produces pass verdict', () => {
      const passing: ScopedParseResults[] = [
        { scopeType: 'language', scopeId: 'en', results: { validParseRate: 0.98, exactMatchRate: 0.92, featureRecall: 0.95, featurePrecision: 0.94, safetyInvariantPassRate: 1.0, fallbackRate: 0.04 }, sampleCount: 50 },
        { scopeType: 'language', scopeId: 'el', results: { validParseRate: 0.97, exactMatchRate: 0.90, featureRecall: 0.93, featurePrecision: 0.92, safetyInvariantPassRate: 1.0, fallbackRate: 0.05 }, sampleCount: 30 },
      ];
      const report = runValidation(passing);
      assert.equal(report.overallVerdict, 'pass');
    });

    it('includes regressions when previous provided', () => {
      const prev: ScopedParseResults[] = [
        { scopeType: 'language' as ValidationScope, scopeId: 'en', results: { validParseRate: 0.98, exactMatchRate: 0.92, featureRecall: 0.95, featurePrecision: 0.94, safetyInvariantPassRate: 1.0, fallbackRate: 0.04 }, sampleCount: 50 },
      ];
      const cur: ScopedParseResults[] = [
        { scopeType: 'language' as ValidationScope, scopeId: 'en', results: { validParseRate: 0.98, exactMatchRate: 0.75, featureRecall: 0.95, featurePrecision: 0.94, safetyInvariantPassRate: 1.0, fallbackRate: 0.04 }, sampleCount: 50 },
      ];
      const report = runValidation(cur, DEFAULT_PARSE_GATES, prev);
      assert.ok(report.regressions.length > 0);
    });
  });

  describe('runSampleValidation', () => {
    it('returns a complete report', () => {
      const report = runSampleValidation();
      assert.equal(report.totalScopes, 5);
      assert.ok(report.config);
      assert.ok(report.scopes.length === 5);
    });
  });
});
