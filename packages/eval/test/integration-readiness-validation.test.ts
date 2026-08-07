import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTEGRATION_PREREQUISITES,
  ADOPTION_SCENARIOS,
  simulateIntegrationReadiness,
  runIntegrationReadinessValidationSuite,
} from '../src/integration-readiness-validation.js';

describe('integration-readiness-validation', () => {
  describe('constants', () => {
    it('has 6 integration prerequisites', () => {
      assert.equal(INTEGRATION_PREREQUISITES.length, 6);
    });

    it('has 5 adoption scenarios', () => {
      assert.equal(ADOPTION_SCENARIOS.length, 5);
    });

    it('prerequisite names are unique', () => {
      const names = INTEGRATION_PREREQUISITES.map((p) => p.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('scenario names are unique', () => {
      const names = ADOPTION_SCENARIOS.map((s) => s.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateIntegrationReadiness', () => {
    it('returns valid result', () => {
      const r = simulateIntegrationReadiness(INTEGRATION_PREREQUISITES[0]!, ADOPTION_SCENARIOS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.prerequisiteMet, 'boolean');
      assert.equal(typeof r.scenarioCompleted, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateIntegrationReadiness(INTEGRATION_PREREQUISITES[0]!, ADOPTION_SCENARIOS[0]!);
      const b = simulateIntegrationReadiness(INTEGRATION_PREREQUISITES[0]!, ADOPTION_SCENARIOS[0]!);
      assert.deepEqual(a, b);
    });

    it('prerequisite is always met', () => {
      for (const prereq of INTEGRATION_PREREQUISITES) {
        for (const scenario of ADOPTION_SCENARIOS) {
          const r = simulateIntegrationReadiness(prereq, scenario);
          assert.equal(r.prerequisiteMet, true);
        }
      }
    });

    it('scenario is always completed', () => {
      for (const prereq of INTEGRATION_PREREQUISITES) {
        for (const scenario of ADOPTION_SCENARIOS) {
          const r = simulateIntegrationReadiness(prereq, scenario);
          assert.equal(r.scenarioCompleted, true);
        }
      }
    });
  });

  describe('runIntegrationReadinessValidationSuite', () => {
    it('produces correct total tests (6 × 5)', () => {
      const report = runIntegrationReadinessValidationSuite();
      assert.equal(report.totalTests, 6 * 5);
    });

    it('has 6 prerequisite summaries', () => {
      const report = runIntegrationReadinessValidationSuite();
      assert.equal(report.prerequisiteSummaries.length, 6);
    });

    it('all prerequisites met', () => {
      const report = runIntegrationReadinessValidationSuite();
      assert.equal(report.allPrerequisitesMet, true);
    });

    it('all scenarios completed', () => {
      const report = runIntegrationReadinessValidationSuite();
      assert.equal(report.allScenariosCompleted, true);
    });

    it('verdict is ready or conditional', () => {
      const report = runIntegrationReadinessValidationSuite();
      assert.ok(report.verdict === 'ready' || report.verdict === 'conditional');
    });

    it('accepts custom inputs', () => {
      const report = runIntegrationReadinessValidationSuite(
        INTEGRATION_PREREQUISITES.slice(0, 2),
        ADOPTION_SCENARIOS.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
