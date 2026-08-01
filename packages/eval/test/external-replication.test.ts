import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLICATION_PACKAGES,
  validateReplicationPackage,
  checkEnvironmentCompatibility,
  compareResults,
  simulateReplication,
  runReplicationSuite,
} from '../src/external-replication.js';
import type { EnvironmentDescriptor } from '../src/external-replication.js';

const TEST_ENV: EnvironmentDescriptor = {
  id: 'test-env-001',
  platform: 'linux-x64',
  nodeVersion: 'v22.0.0',
  packageVersion: '0.2.0',
  independent: true,
};

describe('external-replication', () => {
  describe('REPLICATION_PACKAGES', () => {
    it('defines at least three replication targets', () => {
      assert.ok(REPLICATION_PACKAGES.length >= 3);
      const targets = new Set(REPLICATION_PACKAGES.map(p => p.target));
      assert.ok(targets.size >= 3);
    });

    it('all packages have unique IDs', () => {
      const ids = new Set(REPLICATION_PACKAGES.map(p => p.id));
      assert.equal(ids.size, REPLICATION_PACKAGES.length);
    });

    it('all packages have dataset references and expected results', () => {
      for (const pkg of REPLICATION_PACKAGES) {
        assert.ok(pkg.datasetRef.length > 0, `${pkg.id} missing dataset ref`);
        assert.ok(pkg.expectedResults.length > 0, `${pkg.id} missing expected results`);
      }
    });
  });

  describe('validateReplicationPackage', () => {
    it('validates all built-in packages', () => {
      for (const pkg of REPLICATION_PACKAGES) {
        const result = validateReplicationPackage(pkg);
        assert.ok(result.valid, `${pkg.id}: ${result.errors.join(', ')}`);
      }
    });

    it('rejects package without expected results', () => {
      const bad = { ...REPLICATION_PACKAGES[0]!, expectedResults: [] as const };
      const result = validateReplicationPackage(bad);
      assert.equal(result.valid, false);
    });

    it('rejects negative tolerance', () => {
      const bad = {
        ...REPLICATION_PACKAGES[0]!,
        expectedResults: [{ metric: 'test', expectedValue: 1.0, tolerance: -0.1, unit: 'ratio' }],
      };
      const result = validateReplicationPackage(bad);
      assert.equal(result.valid, false);
    });
  });

  describe('checkEnvironmentCompatibility', () => {
    it('compatible environment passes', () => {
      const result = checkEnvironmentCompatibility(REPLICATION_PACKAGES[0]!, TEST_ENV);
      assert.ok(result.compatible);
      assert.equal(result.missing.length, 0);
    });

    it('old node version fails', () => {
      const oldEnv: EnvironmentDescriptor = { ...TEST_ENV, nodeVersion: 'v18.0.0' };
      const result = checkEnvironmentCompatibility(REPLICATION_PACKAGES[0]!, oldEnv);
      assert.equal(result.compatible, false);
      assert.ok(result.missing.length > 0);
    });
  });

  describe('compareResults', () => {
    it('matches when all within tolerance', () => {
      const expectations = REPLICATION_PACKAGES[0]!.expectedResults;
      const measurements = expectations.map(e => ({
        metric: e.metric,
        measuredValue: e.expectedValue,
        expectedValue: e.expectedValue,
        tolerance: e.tolerance,
        withinTolerance: true,
      }));
      const { allMatch, divergences } = compareResults(expectations, measurements);
      assert.ok(allMatch);
      assert.equal(divergences.length, 0);
    });

    it('reports missing measurements', () => {
      const { allMatch, divergences } = compareResults(
        REPLICATION_PACKAGES[0]!.expectedResults,
        [],
      );
      assert.equal(allMatch, false);
      assert.ok(divergences.length > 0);
    });
  });

  describe('simulateReplication', () => {
    it('produces replicated status for valid environment', () => {
      const attempt = simulateReplication(REPLICATION_PACKAGES[0]!, TEST_ENV);
      assert.equal(attempt.status, 'replicated');
      assert.equal(attempt.divergences.length, 0);
      assert.ok(attempt.results.length > 0);
    });
  });

  describe('runReplicationSuite', () => {
    it('all packages replicate in compatible environment', () => {
      const report = runReplicationSuite(TEST_ENV);
      assert.ok(report.overallReplicable);
      assert.equal(report.replicationRate, 1);
      assert.equal(report.attempts.length, REPLICATION_PACKAGES.length);
    });

    it('fails for incompatible environment', () => {
      const oldEnv: EnvironmentDescriptor = { ...TEST_ENV, nodeVersion: 'v16.0.0' };
      const report = runReplicationSuite(oldEnv);
      assert.equal(report.overallReplicable, false);
      assert.ok(report.replicationRate < 1);
    });
  });
});
