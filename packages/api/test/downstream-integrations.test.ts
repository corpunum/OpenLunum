import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWNSTREAM_INTEGRATIONS,
  validateIntegrationContract,
  testIntegration,
  runIntegrationSuite,
} from '../src/downstream-integrations.js';

describe('downstream-integrations', () => {
  describe('DOWNSTREAM_INTEGRATIONS', () => {
    it('defines at least two independent integrations', () => {
      assert.ok(DOWNSTREAM_INTEGRATIONS.length >= 2);
      const ids = new Set(DOWNSTREAM_INTEGRATIONS.map(i => i.id));
      assert.equal(ids.size, DOWNSTREAM_INTEGRATIONS.length);
    });

    it('all integrations have validated or higher status', () => {
      for (const integration of DOWNSTREAM_INTEGRATIONS) {
        assert.ok(
          integration.status === 'validated' || integration.status === 'production',
          `${integration.id} status is ${integration.status}, expected validated or production`,
        );
      }
    });

    it('all integrations have rollback procedures', () => {
      for (const integration of DOWNSTREAM_INTEGRATIONS) {
        assert.ok(integration.rollbackProcedure.length > 0, `${integration.id} missing rollback procedure`);
      }
    });
  });

  describe('validateIntegrationContract', () => {
    it('validates all built-in contracts', () => {
      for (const contract of DOWNSTREAM_INTEGRATIONS) {
        const result = validateIntegrationContract(contract);
        assert.ok(result.valid, `${contract.id}: ${result.errors.join(', ')}`);
      }
    });

    it('rejects contract with no API surface', () => {
      const bad = {
        ...DOWNSTREAM_INTEGRATIONS[0]!,
        apiSurface: [] as const,
      };
      const result = validateIntegrationContract(bad);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('API surface')));
    });

    it('rejects contract with no required endpoints', () => {
      const bad = {
        ...DOWNSTREAM_INTEGRATIONS[0]!,
        apiSurface: Object.freeze([
          Object.freeze({ endpoint: '/v1/optional', method: 'GET' as const, purpose: 'optional', required: false }),
        ]),
      };
      const result = validateIntegrationContract(bad);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('required endpoints')));
    });
  });

  describe('testIntegration', () => {
    it('all built-in integrations pass', () => {
      for (const contract of DOWNSTREAM_INTEGRATIONS) {
        const result = testIntegration(contract);
        assert.ok(result.passed, `${contract.id} failed: ${result.details.join('; ')}`);
        assert.ok(result.apiSurfaceCoverage > 0);
        assert.ok(result.dataFlowValidation);
        assert.ok(result.errorHandlingValidation);
      }
    });

    it('agent-memory uses degrade-gracefully strategy', () => {
      const agentMemory = DOWNSTREAM_INTEGRATIONS.find(i => i.id === 'agent-memory')!;
      assert.equal(agentMemory.errorContract.strategy, 'degrade-gracefully');
    });

    it('knowledge-base uses retry-then-fallback strategy', () => {
      const kb = DOWNSTREAM_INTEGRATIONS.find(i => i.id === 'knowledge-base')!;
      assert.equal(kb.errorContract.strategy, 'retry-then-fallback');
    });
  });

  describe('runIntegrationSuite', () => {
    it('produces passing report', () => {
      const report = runIntegrationSuite();
      assert.ok(report.overallPass);
      assert.ok(report.coverage > 0);
      assert.equal(report.results.length, DOWNSTREAM_INTEGRATIONS.length);
      assert.equal(report.integrations.length, DOWNSTREAM_INTEGRATIONS.length);
    });
  });
});
