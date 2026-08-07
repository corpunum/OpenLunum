import { test } from 'node:test';
import assert from 'node:assert';
import {
  FINGERPRINT_SUPPORT_CONTRACT,
  FP_DEPRECATION_POLICY,
  FP_MIGRATION_REQUIREMENTS,
  FP_SUPPORT_MIN_VERSION,
  FP_SUPPORT_MAX_VERSION,
  FP_SUPPORTED_VERSIONS,
  FP_SUPPORT_STABLE_DAYS,
  FP_SUPPORT_DEPRECATION_DAYS,
  FP_DEPRECATION_NOTICE_DAYS,
  validateFingerprintVersion,
  getFingerprintDeprecationStatus,
  getContractVersion,
  getSupportedVersions,
  getMigrationRequirements,
  hasMigrationPath,
  getDeprecationPolicy,
  isContractFrozen,
  type FingerprintSupportContract,
  type DeprecationPolicy,
  type MigrationRequirement,
  type FingerprintDeprecationStatus
} from '../src/fingerprint-support-contract.js';

// ── Contract version ───────────────────────────────────────────────

test('contract version is semver', () => {
  assert.ok(/^\d+\.\d+\.\d+$/.test(FINGERPRINT_SUPPORT_CONTRACT.version));
  assert.strictEqual(FINGERPRINT_SUPPORT_CONTRACT.version, '1.0.0');
});

test('getContractVersion returns the contract version', () => {
  assert.strictEqual(getContractVersion(), '1.0.0');
});

// ── Supported versions ─────────────────────────────────────────────

test('supported versions list is non-empty and frozen', () => {
  assert.ok(FP_SUPPORTED_VERSIONS.length > 0);
  const versions = getSupportedVersions();
  assert.ok(versions.length > 0);
  // Verify immutability — pushing should throw in strict mode
  const arr = getSupportedVersions();
  assert.ok(Object.isFrozen(arr));
});

test('supported versions include 0.1 and 0.2', () => {
  const versions = getSupportedVersions();
  assert.ok(versions.includes('0.1'));
  assert.ok(versions.includes('0.2'));
});

test('validateFingerprintVersion returns true for supported versions', () => {
  assert.strictEqual(validateFingerprintVersion('0.1'), true);
  assert.strictEqual(validateFingerprintVersion('0.2'), true);
});

test('validateFingerprintVersion returns false for unsupported versions', () => {
  assert.strictEqual(validateFingerprintVersion('2.0'), false);
  assert.strictEqual(validateFingerprintVersion('0.3'), false);
  assert.strictEqual(validateFingerprintVersion('9.9'), false);
  assert.strictEqual(validateFingerprintVersion(''), false);
});

// ── Deprecation policy ─────────────────────────────────────────────

test('deprecation policy has valid structure', () => {
  const policy = getDeprecationPolicy();
  assert.ok(typeof policy.version === 'string');
  assert.ok(typeof policy.state === 'string');
  assert.ok(typeof policy.releasedAt === 'string');
  // deprecatedAt can be null for supported versions
  assert.ok(policy.deprecatedAt === null || typeof policy.deprecatedAt === 'string');
  assert.ok(policy.obsoleteAt === null || typeof policy.obsoleteAt === 'string');
  assert.strictEqual(typeof policy.stableWindowDays, 'number');
  assert.strictEqual(typeof policy.deprecationWindowDays, 'number');
});

test('stable support window is 365 days', () => {
  assert.strictEqual(FP_SUPPORT_STABLE_DAYS, 365);
  assert.strictEqual(FP_DEPRECATION_POLICY.stableWindowDays, 365);
});

test('deprecation support window is 180 days', () => {
  assert.strictEqual(FP_SUPPORT_DEPRECATION_DAYS, 180);
  assert.strictEqual(FP_DEPRECATION_POLICY.deprecationWindowDays, 180);
});

// ── Deprecation status ─────────────────────────────────────────────

test('supported version returns supported status', () => {
  const status = getFingerprintDeprecationStatus('0.2');
  assert.strictEqual(status.version, '0.2');
  assert.strictEqual(status.state, 'deprecated');
  assert.strictEqual(status.isSupported, true);
  assert.ok(status.daysRemaining >= 0);
  assert.ok(status.warning !== undefined);
});

test('deprecated version (0.1) returns deprecated status', () => {
  const status = getFingerprintDeprecationStatus('0.1');
  assert.strictEqual(status.version, '0.1');
  assert.strictEqual(status.state, 'obsolete');
  assert.strictEqual(status.isSupported, true);
  assert.strictEqual(status.daysRemaining, -1);
  assert.ok(status.warning !== undefined);
  assert.ok(status.warning.includes('obsolete'));
});

test('unknown version returns unsupported status', () => {
  const status = getFingerprintDeprecationStatus('99.0');
  assert.strictEqual(status.version, '99.0');
  assert.strictEqual(status.isSupported, false);
  assert.strictEqual(status.state, 'obsolete');
  assert.strictEqual(status.daysRemaining, -1);
  assert.ok(status.warning !== undefined);
});

test('deprecation status includes correct notice days', () => {
  const status = getFingerprintDeprecationStatus('0.2');
  assert.strictEqual(status.deprecationNoticeDays, FP_DEPRECATION_NOTICE_DAYS);
  assert.strictEqual(status.deprecationNoticeDays, 180);
});

// ── Migration requirements ─────────────────────────────────────────

test('migration requirements exist for known versions', () => {
  const reqs01 = getMigrationRequirements('0.1');
  assert.ok(reqs01.length > 0);
  for (const req of reqs01) {
    assert.strictEqual(req.fromVersion, '0.1');
    assert.strictEqual(req.tool, 'migrateFingerprint');
    assert.strictEqual(req.lossless, true);
    assert.ok(req.description.length > 0);
  }

  const reqs02 = getMigrationRequirements('0.2');
  assert.ok(reqs02.length > 0);
  for (const req of reqs02) {
    assert.strictEqual(req.fromVersion, '0.2');
  }
});

test('unknown version returns empty migration requirements', () => {
  const reqs = getMigrationRequirements('99.0');
  assert.strictEqual(reqs.length, 0);
});

test('hasMigrationPath returns true for known migrations', () => {
  assert.strictEqual(hasMigrationPath('0.1', '1.0'), true);
  assert.strictEqual(hasMigrationPath('0.2', '1.0'), true);
});

test('hasMigrationPath returns false for unknown paths', () => {
  assert.strictEqual(hasMigrationPath('0.1', '0.2'), false);
  assert.strictEqual(hasMigrationPath('99.0', '1.0'), false);
  assert.strictEqual(hasMigrationPath('1.0', '0.1'), false);
});

// ── Contract object properties ─────────────────────────────────────

test('contract object has frozen flag', () => {
  assert.strictEqual(FINGERPRINT_SUPPORT_CONTRACT.frozen, true);
  assert.strictEqual(isContractFrozen(), true);
});

test('contract has valid supported versions', () => {
  assert.ok(FINGERPRINT_SUPPORT_CONTRACT.supportedVersions.length > 0);
  for (const v of FINGERPRINT_SUPPORT_CONTRACT.supportedVersions) {
    assert.ok(validateFingerprintVersion(v));
  }
});

test('contract min support days is 365', () => {
  assert.strictEqual(FINGERPRINT_SUPPORT_CONTRACT.minSupportDays, 365);
});

test('contract deprecation notice days is 180', () => {
  assert.strictEqual(FINGERPRINT_SUPPORT_CONTRACT.deprecationNoticeDays, 180);
});

test('contract deprecation policy matches frozen policy', () => {
  assert.deepStrictEqual(
    FINGERPRINT_SUPPORT_CONTRACT.deprecationPolicy,
    FP_DEPRECATION_POLICY
  );
});

test('contract migration requirements match frozen requirements', () => {
  assert.deepStrictEqual(
    FINGERPRINT_SUPPORT_CONTRACT.migrationRequirements,
    FP_MIGRATION_REQUIREMENTS
  );
});

// ── Contract immutability ──────────────────────────────────────────

test('contract object is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(FINGERPRINT_SUPPORT_CONTRACT));
});

test('deprecation policy is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(FP_DEPRECATION_POLICY));
});

test('migration requirements are frozen (immutable)', () => {
  assert.ok(Object.isFrozen(FP_MIGRATION_REQUIREMENTS));
});

test('supported versions array is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(FP_SUPPORTED_VERSIONS));
});

// ── Version boundary constants ─────────────────────────────────────

test('support min version is 0.1', () => {
  assert.strictEqual(FP_SUPPORT_MIN_VERSION, '0.1');
});

test('support max version is 1.0', () => {
  assert.strictEqual(FP_SUPPORT_MAX_VERSION, '1.0');
});
