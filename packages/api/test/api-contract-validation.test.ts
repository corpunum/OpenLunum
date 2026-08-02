import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_ENDPOINT_CONTRACTS,
  validateEndpoint,
  checkCompatibility,
  runContractValidation,
} from '../src/api-contract-validation.js';
import type { EndpointContract, HttpMethod } from '../src/api-contract-validation.js';

describe('api-contract-validation', () => {
  describe('API_ENDPOINT_CONTRACTS', () => {
    it('has 6 endpoints', () => {
      assert.equal(API_ENDPOINT_CONTRACTS.length, 6);
    });

    it('health endpoint does not require auth', () => {
      const health = API_ENDPOINT_CONTRACTS.find(e => e.path === '/v1/health')!;
      assert.equal(health.requiresAuth, false);
    });

    it('all endpoints are v1', () => {
      for (const ep of API_ENDPOINT_CONTRACTS) {
        assert.equal(ep.version, '1.0');
      }
    });
  });

  describe('validateEndpoint', () => {
    it('valid endpoint has no violations', () => {
      const result = validateEndpoint(API_ENDPOINT_CONTRACTS[0]!);
      assert.equal(result.status, 'valid');
      assert.equal(result.violations.length, 0);
    });

    it('detects zero rate limit', () => {
      const bad: EndpointContract = {
        path: '/test', method: 'POST', version: '1.0',
        requiresAuth: true, rateLimit: 0, maxRequestBytes: 1024, timeoutMs: 5000,
      };
      const result = validateEndpoint(bad);
      assert.equal(result.status, 'broken');
      assert.ok(result.violations.some(v => v.field === 'rateLimit'));
    });

    it('warns on excessive timeout', () => {
      const slow: EndpointContract = {
        path: '/test', method: 'POST', version: '1.0',
        requiresAuth: true, rateLimit: 100, maxRequestBytes: 1024, timeoutMs: 120000,
      };
      const result = validateEndpoint(slow);
      assert.ok(result.violations.some(v => v.field === 'timeoutMs'));
    });

    it('detects auth on health endpoint', () => {
      const badHealth: EndpointContract = {
        path: '/v1/health', method: 'GET', version: '1.0',
        requiresAuth: true, rateLimit: 100, maxRequestBytes: 0, timeoutMs: 2000,
      };
      const result = validateEndpoint(badHealth);
      assert.ok(result.violations.some(v => v.field === 'requiresAuth'));
    });

    it('reports version compliance', () => {
      const result = validateEndpoint(API_ENDPOINT_CONTRACTS[0]!);
      assert.equal(result.versionCompliant, true);
    });

    it('records response time', () => {
      const result = validateEndpoint(API_ENDPOINT_CONTRACTS[0]!);
      assert.ok(result.responseTimeMs >= 0);
    });
  });

  describe('checkCompatibility', () => {
    it('identical endpoints are compatible', () => {
      const check = checkCompatibility(API_ENDPOINT_CONTRACTS, API_ENDPOINT_CONTRACTS);
      assert.equal(check.backwardCompatible, true);
      assert.equal(check.breakingChanges.length, 0);
    });

    it('detects removed endpoints', () => {
      const fewer = API_ENDPOINT_CONTRACTS.slice(0, 3);
      const check = checkCompatibility(API_ENDPOINT_CONTRACTS, fewer);
      assert.ok(check.removedEndpoints.length > 0);
      assert.equal(check.backwardCompatible, false);
    });

    it('detects added endpoints', () => {
      const extra: EndpointContract[] = [
        ...API_ENDPOINT_CONTRACTS,
        { path: '/v1/new', method: 'POST' as HttpMethod, version: '1.0', requiresAuth: true, rateLimit: 100, maxRequestBytes: 1024, timeoutMs: 5000 },
      ];
      const check = checkCompatibility(API_ENDPOINT_CONTRACTS, extra);
      assert.ok(check.addedEndpoints.length > 0);
      assert.equal(check.backwardCompatible, true);
    });

    it('detects auth requirement change as breaking', () => {
      const modified = API_ENDPOINT_CONTRACTS.map(e =>
        e.path === '/v1/health' ? { ...e, requiresAuth: true } : e,
      );
      const check = checkCompatibility(API_ENDPOINT_CONTRACTS, modified);
      assert.equal(check.backwardCompatible, false);
    });
  });

  describe('runContractValidation', () => {
    it('validates all endpoints', () => {
      const report = runContractValidation();
      assert.equal(report.totalEndpoints, 6);
    });

    it('counts match total', () => {
      const report = runContractValidation();
      assert.equal(report.validCount + report.degradedCount + report.brokenCount, report.totalEndpoints);
    });

    it('all default endpoints are valid', () => {
      const report = runContractValidation();
      assert.equal(report.overallStatus, 'valid');
    });

    it('includes compatibility when previous provided', () => {
      const report = runContractValidation(API_ENDPOINT_CONTRACTS, API_ENDPOINT_CONTRACTS);
      assert.ok(report.compatibility !== null);
      assert.equal(report.compatibility!.backwardCompatible, true);
    });

    it('no compatibility when no previous', () => {
      const report = runContractValidation();
      assert.equal(report.compatibility, null);
    });
  });
});
