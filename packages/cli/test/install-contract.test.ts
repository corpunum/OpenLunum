import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyInstallation,
  verifyUpgrade,
  verifyRollback,
  getInstallGuidance,
  INSTALL_CONTRACT_VERSION,
} from '../src/install-contract.js';

describe('install contract', () => {
  describe('verifyInstallation', () => {
    it('passes when all conditions are met', () => {
      const result = verifyInstallation({
        packagePresent: true,
        expectedVersion: '0.2.0',
        actualVersion: '0.2.0',
        dependencies: new Map([['@corpunum/lunum', true]]),
        configErrors: [],
      });
      assert.equal(result.passed, true);
      assert.equal(result.packagePresent, true);
      assert.equal(result.versionCorrect, true);
      assert.equal(result.dependenciesResolved, true);
      assert.equal(result.configValid, true);
      assert.equal(result.steps.length, 4);
      assert.ok(result.steps.every(s => s.status === 'passed'));
    });

    it('fails when package is missing', () => {
      const result = verifyInstallation({
        packagePresent: false,
        expectedVersion: '0.2.0',
        actualVersion: '0.2.0',
        dependencies: new Map(),
        configErrors: [],
      });
      assert.equal(result.passed, false);
      const step = result.steps.find(s => s.name === 'package-present')!;
      assert.equal(step.status, 'failed');
    });

    it('fails when version mismatches', () => {
      const result = verifyInstallation({
        packagePresent: true,
        expectedVersion: '0.2.0',
        actualVersion: '0.1.0',
        dependencies: new Map(),
        configErrors: [],
      });
      assert.equal(result.passed, false);
      assert.equal(result.versionCorrect, false);
    });

    it('reports unresolved dependencies', () => {
      const result = verifyInstallation({
        packagePresent: true,
        expectedVersion: '0.2.0',
        actualVersion: '0.2.0',
        dependencies: new Map([['@corpunum/lunum', true], ['missing-pkg', false]]),
        configErrors: [],
      });
      assert.equal(result.passed, false);
      assert.deepEqual(result.unresolvedDependencies, ['missing-pkg']);
    });

    it('reports config errors', () => {
      const result = verifyInstallation({
        packagePresent: true,
        expectedVersion: '0.2.0',
        actualVersion: '0.2.0',
        dependencies: new Map(),
        configErrors: ['Invalid schema path'],
      });
      assert.equal(result.passed, false);
      assert.equal(result.configValid, false);
      assert.deepEqual(result.configErrors, ['Invalid schema path']);
    });
  });

  describe('verifyUpgrade', () => {
    it('passes when all upgrade conditions are met', () => {
      const result = verifyUpgrade({
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        migrationApplied: true,
        dataIntact: true,
        rollbackPointCreated: true,
      });
      assert.equal(result.passed, true);
      assert.equal(result.steps.length, 3);
    });

    it('fails when migration not applied', () => {
      const result = verifyUpgrade({
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        migrationApplied: false,
        dataIntact: true,
        rollbackPointCreated: true,
      });
      assert.equal(result.passed, false);
      const step = result.steps.find(s => s.name === 'migration-applied')!;
      assert.equal(step.status, 'failed');
    });

    it('fails when data integrity check fails', () => {
      const result = verifyUpgrade({
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        migrationApplied: true,
        dataIntact: false,
        rollbackPointCreated: true,
      });
      assert.equal(result.passed, false);
    });

    it('fails when no rollback point created', () => {
      const result = verifyUpgrade({
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        migrationApplied: true,
        dataIntact: true,
        rollbackPointCreated: false,
      });
      assert.equal(result.passed, false);
    });
  });

  describe('verifyRollback', () => {
    it('passes when rollback succeeds', () => {
      const result = verifyRollback({
        targetVersion: '0.1.0',
        previousVersionRestored: true,
        stateIntact: true,
      });
      assert.equal(result.passed, true);
      assert.equal(result.steps.length, 2);
    });

    it('fails when version not restored', () => {
      const result = verifyRollback({
        targetVersion: '0.1.0',
        previousVersionRestored: false,
        stateIntact: true,
      });
      assert.equal(result.passed, false);
      const step = result.steps.find(s => s.name === 'version-restored')!;
      assert.equal(step.status, 'failed');
    });

    it('fails when state is corrupted', () => {
      const result = verifyRollback({
        targetVersion: '0.1.0',
        previousVersionRestored: true,
        stateIntact: false,
      });
      assert.equal(result.passed, false);
    });
  });

  describe('lifecycle simulation', () => {
    it('install → upgrade → rollback full cycle', () => {
      const install = verifyInstallation({
        packagePresent: true,
        expectedVersion: '0.1.0',
        actualVersion: '0.1.0',
        dependencies: new Map([['@corpunum/lunum', true]]),
        configErrors: [],
      });
      assert.equal(install.passed, true);

      const upgrade = verifyUpgrade({
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        migrationApplied: true,
        dataIntact: true,
        rollbackPointCreated: true,
      });
      assert.equal(upgrade.passed, true);

      const rollback = verifyRollback({
        targetVersion: '0.1.0',
        previousVersionRestored: true,
        stateIntact: true,
      });
      assert.equal(rollback.passed, true);
    });
  });

  describe('getInstallGuidance', () => {
    it('returns non-empty guidance for all phases', () => {
      const guidance = getInstallGuidance();
      assert.ok(guidance.install.length > 0);
      assert.ok(guidance.upgrade.length > 0);
      assert.ok(guidance.rollback.length > 0);
      assert.equal(guidance.installContractVersion, INSTALL_CONTRACT_VERSION);
    });
  });

  it('contract version is a valid semver string', () => {
    assert.match(INSTALL_CONTRACT_VERSION, /^\d+\.\d+\.\d+$/);
  });
});
