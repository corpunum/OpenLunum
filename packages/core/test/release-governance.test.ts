import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_CONTRACTS,
  checkUpgradeCompatibility,
  validateGovernanceContracts,
} from '../src/release-governance.js';

describe('release-governance', () => {
  describe('PACKAGE_CONTRACTS', () => {
    it('has 3 packages', () => {
      assert.equal(PACKAGE_CONTRACTS.length, 3);
    });

    it('all packages are preview channel', () => {
      for (const c of PACKAGE_CONTRACTS) {
        assert.equal(c.channel, 'preview');
      }
    });

    it('all packages have public API', () => {
      for (const c of PACKAGE_CONTRACTS) {
        assert.ok(c.publicApi.length > 0, `${c.packageName} has no public API`);
      }
    });

    it('all packages have upgrade guarantees', () => {
      for (const c of PACKAGE_CONTRACTS) {
        assert.ok(c.upgradeGuarantees.length > 0, `${c.packageName} has no upgrade guarantees`);
      }
    });

    it('core package has fingerprint guarantee', () => {
      const core = PACKAGE_CONTRACTS.find(c => c.packageName === '@corpunum/lunum');
      assert.ok(core);
      assert.ok(core.upgradeGuarantees.some(g => g.includes('fingerprint') || g.includes('Fingerprint')));
    });
  });

  describe('validateGovernanceContracts', () => {
    it('current contracts are valid', () => {
      const result = validateGovernanceContracts(PACKAGE_CONTRACTS);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('rejects duplicate packages', () => {
      const dupes = [...PACKAGE_CONTRACTS, PACKAGE_CONTRACTS[0]!];
      const result = validateGovernanceContracts(dupes);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Duplicate')));
    });
  });

  describe('checkUpgradeCompatibility', () => {
    it('patch upgrade is compatible', () => {
      const result = checkUpgradeCompatibility('@corpunum/lunum', '0.2.0', '0.2.1');
      assert.equal(result.compatible, true);
      assert.equal(result.breakingChanges.length, 0);
    });

    it('minor upgrade suggests changelog review', () => {
      const result = checkUpgradeCompatibility('@corpunum/lunum', '0.2.0', '0.3.0');
      assert.equal(result.compatible, true);
      assert.ok(result.migrationSteps.length > 0);
    });

    it('major upgrade flags breaking changes', () => {
      const result = checkUpgradeCompatibility('@corpunum/lunum', '0.2.0', '1.0.0');
      assert.equal(result.compatible, false);
      assert.ok(result.breakingChanges.length > 0);
    });

    it('unknown package is incompatible', () => {
      const result = checkUpgradeCompatibility('@unknown/pkg', '1.0.0', '2.0.0');
      assert.equal(result.compatible, false);
    });

    it('invalid version is incompatible', () => {
      const result = checkUpgradeCompatibility('@corpunum/lunum', 'bad', '0.2.0');
      assert.equal(result.compatible, false);
    });
  });
});
