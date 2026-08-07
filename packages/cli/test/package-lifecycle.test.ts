import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_LIFECYCLE_VERSION,
  INSTALLATION_METHODS,
  INSTALLATION_METHOD_SPECS,
  createInstallSteps,
  verifyInstallation,
  createUpgradeSteps,
  verifyUpgrade,
  createRollbackSteps,
  verifyRollback,
  getLifecycleGuidance,
} from '../src/package-lifecycle.js';

describe('package-lifecycle', () => {
  describe('constants', () => {
    it('PACKAGE_LIFECYCLE_VERSION is a valid semver string', () => {
      assert.match(PACKAGE_LIFECYCLE_VERSION, /^\d+\.\d+\.\d+$/);
    });

    it('INSTALLATION_METHODS contains npm, pnpm, source', () => {
      assert.deepEqual(INSTALLATION_METHODS, ['npm', 'pnpm', 'source']);
    });

    it('INSTALLATION_METHOD_SPECS has three entries with required fields', () => {
      assert.equal(INSTALLATION_METHOD_SPECS.length, 3);
      for (const spec of INSTALLATION_METHOD_SPECS) {
        assert.ok(spec.method);
        assert.ok(spec.commandTemplate);
        assert.ok(spec.description);
        assert.equal(typeof spec.requiresRegistry, 'boolean');
        assert.equal(typeof spec.supportsOffline, 'boolean');
      }
    });
  });

  describe('verifyInstallation', () => {
    it('passes when all conditions are met', () => {
      const result = verifyInstallation({
        method: 'npm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(result.passed, true);
      assert.equal(result.steps.length, 5);
      assert.ok(result.steps.every((s) => s.status === 'passed'));
      assert.ok(result.summary.includes('succeeded'));
    });

    it('fails when package is missing', () => {
      const result = verifyInstallation({
        method: 'npm',
        version: '0.2.0',
        packagePresent: false,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const step0 = result.steps.at(0);
      assert.ok(step0);
      assert.equal(step0.status, 'failed');
      assert.ok(step0.error);
    });

    it('fails when version mismatches', () => {
      const result = verifyInstallation({
        method: 'npm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: false,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const step1 = result.steps.at(1);
      assert.ok(step1);
      assert.equal(step1.status, 'failed');
    });

    it('fails when dependencies unresolved', () => {
      const result = verifyInstallation({
        method: 'npm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: false,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const step2 = result.steps.at(2);
      assert.ok(step2);
      assert.equal(step2.status, 'failed');
    });

    it('fails when config has errors', () => {
      const result = verifyInstallation({
        method: 'pnpm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: false,
        configErrors: ['Invalid schema path', 'Missing config key'],
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const step3 = result.steps.at(3);
      assert.ok(step3);
      assert.equal(step3.status, 'failed');
      assert.ok(step3.error);
    });

    it('fails when build fails', () => {
      const result = verifyInstallation({
        method: 'source',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: false,
      });
      assert.equal(result.passed, false);
      const step4 = result.steps.at(4);
      assert.ok(step4);
      assert.equal(step4.status, 'failed');
    });

    it('returns contract version in result', () => {
      const result = verifyInstallation({
        method: 'npm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(result.contractVersion, PACKAGE_LIFECYCLE_VERSION);
    });

    it('records method and version in result', () => {
      const result = verifyInstallation({
        method: 'pnpm',
        version: '0.3.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(result.method, 'pnpm');
      assert.equal(result.version, '0.3.0');
    });

    it('install steps use correct method and command', () => {
      const steps = createInstallSteps({
        method: 'npm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      for (const step of steps) {
        assert.equal(step.method, 'npm');
        assert.ok(step.command.includes('0.2.0'));
        assert.ok(step.status === 'passed' || step.status === 'failed');
      }
    });
  });

  describe('verifyUpgrade', () => {
    it('passes when all upgrade conditions are met', () => {
      const result = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, true);
      assert.equal(result.steps.length, 6);
      assert.ok(result.steps.every((s) => s.status === 'passed'));
      assert.ok(result.summary.includes('succeeded'));
    });

    it('fails when migration not applied after schema change', () => {
      const result = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: false,
        migrationSuccess: false,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const step = result.steps.find((s) => s.name === 'schema-migration');
      assert.ok(step);
      assert.equal(step.status, 'failed');
    });

    it('passes migration step when schema did not change', () => {
      const result = verifyUpgrade({
        method: 'pnpm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: false,
        migrationSuccess: false,
        schemaVersionChanged: false,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, true);
      const step = result.steps.find((s) => s.name === 'schema-migration');
      assert.ok(step);
      assert.equal(step.status, 'passed');
    });

    it('fails when data integrity check fails', () => {
      const result = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: false,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const uStep3 = result.steps.at(3);
      assert.ok(uStep3);
      assert.equal(uStep3.status, 'failed');
    });

    it('fails when rollback point not created', () => {
      const result = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: false,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const uStep0 = result.steps.at(0);
      assert.ok(uStep0);
      assert.equal(uStep0.status, 'failed');
    });

    it('fails when build fails after upgrade', () => {
      const result = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: false,
      });
      assert.equal(result.passed, false);
      const uStep5 = result.steps.at(5);
      assert.ok(uStep5);
      assert.equal(uStep5.status, 'failed');
    });

    it('upgrade steps contain version and migration info', () => {
      const result = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      for (const step of result.steps) {
        assert.equal(step.fromVersion, '0.1.0');
        assert.equal(step.toVersion, '0.2.0');
      }
      assert.equal(result.fromVersion, '0.1.0');
      assert.equal(result.toVersion, '0.2.0');
    });
  });

  describe('verifyRollback', () => {
    it('passes when all rollback conditions are met', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, true);
      assert.equal(result.steps.length, 7);
      assert.ok(result.steps.every((s) => s.status === 'passed'));
      assert.ok(result.summary.includes('succeeded'));
    });

    it('fails when rollback point missing', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: false,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const rStep0 = result.steps.at(0);
      assert.ok(rStep0);
      assert.equal(rStep0.status, 'failed');
    });

    it('fails when version not restored', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: false,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const rStep1 = result.steps.at(1);
      assert.ok(rStep1);
      assert.equal(rStep1.status, 'failed');
    });

    it('fails when state corrupted', () => {
      const result = verifyRollback({
        method: 'pnpm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: false,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const rStep2 = result.steps.at(2);
      assert.ok(rStep2);
      assert.equal(rStep2.status, 'failed');
    });

    it('fails when records not verified', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: false,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const rStep3 = result.steps.at(3);
      assert.ok(rStep3);
      assert.equal(rStep3.status, 'failed');
    });

    it('fails when integrity hash mismatch', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: false,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const rStep4 = result.steps.at(4);
      assert.ok(rStep4);
      assert.equal(rStep4.status, 'failed');
    });

    it('fails when state files inaccessible', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: false,
        buildSuccess: true,
      });
      assert.equal(result.passed, false);
      const rStep5 = result.steps.at(5);
      assert.ok(rStep5);
      assert.equal(rStep5.status, 'failed');
    });

    it('fails when build fails after rollback', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: false,
      });
      assert.equal(result.passed, false);
      const rStep6 = result.steps.at(6);
      assert.ok(rStep6);
      assert.equal(rStep6.status, 'failed');
    });

    it('rollback steps contain data-safety checks', () => {
      const result = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      for (const step of result.steps) {
        assert.equal(step.targetVersion, '0.1.0');
        assert.ok(step.dataSafetyChecks);
      }
    });
  });

  describe('getLifecycleGuidance', () => {
    it('returns non-empty guidance for all phases', () => {
      const guidance = getLifecycleGuidance();
      assert.ok(guidance.install.length > 0);
      assert.ok(guidance.upgrade.length > 0);
      assert.ok(guidance.rollback.length > 0);
    });

    it('includes package lifecycle version', () => {
      const guidance = getLifecycleGuidance();
      assert.equal(guidance.packageLifecycleVersion, PACKAGE_LIFECYCLE_VERSION);
    });

    it('includes supported methods and specs', () => {
      const guidance = getLifecycleGuidance();
      assert.equal(guidance.supportedMethods.length, 3);
      assert.equal(guidance.methodSpecs.length, 3);
    });
  });

  describe('full lifecycle simulation', () => {
    it('install → upgrade → rollback', () => {
      // Install succeeds
      const install = verifyInstallation({
        method: 'pnpm',
        version: '0.1.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(install.passed, true);

      // Upgrade succeeds
      const upgrade = verifyUpgrade({
        method: 'pnpm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(upgrade.passed, true);

      // Rollback succeeds
      const rollback = verifyRollback({
        method: 'pnpm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(rollback.passed, true);
    });

    it('install → upgrade fails → rollback succeeds', () => {
      const install = verifyInstallation({
        method: 'npm',
        version: '0.1.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      assert.equal(install.passed, true);

      // Upgrade fails due to data integrity
      const upgrade = verifyUpgrade({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: false,
        configMigrated: true,
        buildSuccess: true,
      });
      assert.equal(upgrade.passed, false);

      // Rollback still succeeds because rollback point was created
      const rollback = verifyRollback({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      assert.equal(rollback.passed, true);
    });
  });

  describe('step naming and structure', () => {
    it('install steps have unique names', () => {
      const steps = createInstallSteps({
        method: 'npm',
        version: '0.2.0',
        packagePresent: true,
        versionMatches: true,
        dependenciesResolved: true,
        configValid: true,
        configErrors: [],
        buildSuccess: true,
      });
      const names = steps.map((s) => s.name);
      const unique = new Set(names);
      assert.equal(names.length, unique.size);
    });

    it('upgrade steps have unique names', () => {
      const steps = createUpgradeSteps({
        method: 'npm',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        rollbackPointCreated: true,
        migrationScriptAvailable: true,
        migrationApplied: true,
        migrationSuccess: true,
        schemaVersionChanged: true,
        dataIntact: true,
        configMigrated: true,
        buildSuccess: true,
      });
      const names = steps.map((s) => s.name);
      const unique = new Set(names);
      assert.equal(names.length, unique.size);
    });

    it('rollback steps have unique names', () => {
      const steps = createRollbackSteps({
        method: 'npm',
        targetVersion: '0.1.0',
        rollbackPointExists: true,
        previousVersionRestored: true,
        stateIntact: true,
        recordsVerified: true,
        integrityHashMatches: true,
        stateFilesIntact: true,
        buildSuccess: true,
      });
      const names = steps.map((s) => s.name);
      const unique = new Set(names);
      assert.equal(names.length, unique.size);
    });
  });
});
