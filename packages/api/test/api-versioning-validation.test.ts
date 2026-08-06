import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_VERSIONS,
  VERSION_ENDPOINTS,
  VERSION_TRANSITIONS,
  simulateEndpointValidation,
  simulateTransition,
  runApiVersioningValidation,
} from '../src/api-versioning-validation.js';

describe('api-versioning-validation', () => {
  describe('constants', () => {
    it('has 5 versions', () => {
      assert.equal(API_VERSIONS.length, 5);
    });

    it('has 6 endpoints', () => {
      assert.equal(VERSION_ENDPOINTS.length, 6);
    });

    it('has 4 transitions', () => {
      assert.equal(VERSION_TRANSITIONS.length, 4);
    });
  });

  describe('simulateEndpointValidation', () => {
    it('returns valid result', () => {
      const r = simulateEndpointValidation(API_VERSIONS[2]!, VERSION_ENDPOINTS[0]!);
      assert.equal(typeof r.available, 'boolean');
      assert.equal(typeof r.responseValid, 'boolean');
      assert.equal(typeof r.backwardCompatible, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateEndpointValidation(API_VERSIONS[0]!, VERSION_ENDPOINTS[0]!);
      const b = simulateEndpointValidation(API_VERSIONS[0]!, VERSION_ENDPOINTS[0]!);
      assert.deepEqual(a, b);
    });

    it('stable versions are backward compatible for available endpoints', () => {
      for (const v of API_VERSIONS.filter(v => v.stable)) {
        for (const e of VERSION_ENDPOINTS) {
          const r = simulateEndpointValidation(v, e);
          if (r.available) {
            assert.equal(r.backwardCompatible, true);
          }
        }
      }
    });

    it('unstable versions show deprecation warnings', () => {
      for (const v of API_VERSIONS.filter(v => !v.stable)) {
        for (const e of VERSION_ENDPOINTS) {
          const r = simulateEndpointValidation(v, e);
          if (r.available) {
            assert.equal(r.deprecationWarning, true);
          }
        }
      }
    });
  });

  describe('simulateTransition', () => {
    it('returns valid summary', () => {
      const t = simulateTransition(VERSION_TRANSITIONS[0]!);
      assert.equal(typeof t.migrationTested, 'boolean');
      assert.equal(typeof t.dataPreserved, 'boolean');
    });

    it('migrations with available migration are tested', () => {
      for (const tr of VERSION_TRANSITIONS) {
        const s = simulateTransition(tr);
        if (tr.migrationAvailable) {
          assert.equal(s.migrationTested, true);
        }
      }
    });
  });

  describe('runApiVersioningValidation', () => {
    it('produces correct total tests', () => {
      const report = runApiVersioningValidation();
      assert.equal(report.totalTests, 5 * 6 + 4);
    });

    it('has 5 version summaries', () => {
      const report = runApiVersioningValidation();
      assert.equal(report.versionSummaries.length, 5);
    });

    it('all stable versions valid', () => {
      const report = runApiVersioningValidation();
      assert.equal(report.allStableVersionsValid, true);
    });

    it('verdict is compatible', () => {
      const report = runApiVersioningValidation();
      assert.equal(report.verdict, 'compatible');
    });
  });
});
