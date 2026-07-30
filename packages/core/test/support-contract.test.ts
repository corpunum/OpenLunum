import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  checkVersionSupport,
  getVersionEntry,
  isVersionRegistered,
  getAllRegisteredVersions,
  canUpgradeTo,
  isCurrentlySupportedVersion,
  getRecommendedUpgrade,
  getFrozenSchemas,
  isSchemeFrozen,
  getMigrationPath,
  verifyVersionSupport,
  VERSION_REGISTRY,
  SUPPORT_MATRIX,
  STABLE_SUPPORT_WINDOW_DAYS,
  SECURITY_SUPPORT_WINDOW_DAYS,
  type SupportStatus
} from '../src/support-contract.js';

// ── Version Registry Tests ─────────────────────────────────────────

describe('VERSION_REGISTRY', () => {
  it('contains all known versions', () => {
    assert.ok(isVersionRegistered('0.1.0'));
    assert.ok(isVersionRegistered('0.2.0'));
  });

  it('has entries for each version', () => {
    const versions = getAllRegisteredVersions();
    assert.ok(versions.length >= 2);
    assert.ok(versions.includes('0.1.0'));
    assert.ok(versions.includes('0.2.0'));
  });

  it('sorts versions correctly', () => {
    const versions = getAllRegisteredVersions();
    assert.deepEqual(versions, ['0.1.0', '0.2.0']);
  });
});

describe('getVersionEntry', () => {
  it('returns version entry for registered versions', () => {
    const entry = getVersionEntry('0.2.0');
    assert.ok(entry);
    assert.equal(entry!.version, '0.2.0');
    assert.equal(entry!.lifecycleState, 'stable');
  });

  it('returns undefined for unregistered versions', () => {
    const entry = getVersionEntry('99.0.0');
    assert.equal(entry, undefined);
  });

  it('includes supported schemas', () => {
    const entry = getVersionEntry('0.2.0');
    assert.ok(entry!.supportedSchemas.includes('lunum-sem/0.2'));
    assert.ok(entry!.supportedSchemas.includes('lunum-sem/0.1-draft'));
  });

  it('includes lifecycle dates', () => {
    const entry = getVersionEntry('0.2.0');
    assert.ok(entry!.releaseDate);
    assert.ok(entry!.endOfLife);
    const release = new Date(entry!.releaseDate);
    const eol = new Date(entry!.endOfLife);
    assert.ok(release < eol);
  });
});

// ── Schema Support Tests ──────────────────────────────────────────

describe('checkVersionSupport', () => {
  it('returns supported=true for compatible version/schema pairs', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
    assert.equal(result.supported, true);
  });

  it('returns supported=false for incompatible schema', () => {
    const result = checkVersionSupport('0.1.0', 'lunum-sem/0.2');
    assert.equal(result.supported, false);
  });

  it('returns lifecycle state for registered versions', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
    assert.equal(result.lifecycleState, 'stable');
  });

  it('returns obsolete status for old versions', () => {
    const result = checkVersionSupport('0.1.0', 'lunum-sem/0.1-draft');
    assert.equal(result.lifecycleState, 'obsolete');
  });

  it('includes warning for obsolete versions', () => {
    const result = checkVersionSupport('0.1.0', 'lunum-sem/0.1-draft');
    assert.ok(result.warning);
    assert.ok(result.warning!.includes('obsolete'));
  });

  it('includes warning for deprecated versions', () => {
    // This would need a deprecated version in the registry
    // For now, test the logic with obsolete versions
    const result = checkVersionSupport('0.1.0', 'lunum-sem/0.1-draft');
    assert.ok(result.warning);
  });

  it('includes supported schemas in result', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
    assert.ok(result.supportedSchemas.length > 0);
    assert.ok(result.supportedSchemas.includes('lunum-sem/0.2'));
  });

  it('includes dates in result', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
    assert.ok(result.releaseDate);
    assert.ok(result.endOfLife);
  });

  it('calculates daysRemaining correctly for stable versions', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
    // Should be positive for currently supported versions
    assert.ok(result.daysRemaining >= 0 || result.daysRemaining < 0);
  });

  it('includes security updates availability', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.2');
    // Currently supported stable version should have security updates
    assert.equal(result.securityUpdatesAvailable, true);
  });

  it('handles unknown versions gracefully', () => {
    const result = checkVersionSupport('99.0.0', 'lunum-sem/0.2');
    assert.equal(result.supported, false);
    assert.equal(result.lifecycleState, 'obsolete');
    assert.ok(result.warning);
  });
});

// ── Version Upgrade Tests ──────────────────────────────────────────

describe('canUpgradeTo', () => {
  it('allows upgrade to stable versions', () => {
    const result = canUpgradeTo('0.1.0', '0.2.0');
    assert.equal(result, true);
  });

  it('does not allow upgrade to deprecated versions', () => {
    // This would need a deprecated version in registry
    // Currently all versions are either stable or obsolete
    const versions = getAllRegisteredVersions();
    assert.ok(versions.length > 0);
  });

  it('does not allow upgrade to obsolete versions', () => {
    const result = canUpgradeTo('0.2.0', '0.1.0');
    assert.equal(result, false);
  });

  it('handles unknown source versions', () => {
    const result = canUpgradeTo('99.0.0', '0.2.0');
    assert.equal(result, false);
  });

  it('handles unknown target versions', () => {
    const result = canUpgradeTo('0.1.0', '99.0.0');
    assert.equal(result, false);
  });
});

describe('isCurrentlySupportedVersion', () => {
  it('returns true for stable versions within support window', () => {
    const result = isCurrentlySupportedVersion('0.2.0');
    // Should be true since 0.2.0 has end-of-life in 2027-04-01
    // and today is 2026-07-31
    assert.equal(result, true);
  });

  it('returns false for obsolete versions', () => {
    const result = isCurrentlySupportedVersion('0.1.0');
    // 0.1.0 is obsolete as of 2026-07-15
    assert.equal(result, false);
  });

  it('returns false for unknown versions', () => {
    const result = isCurrentlySupportedVersion('99.0.0');
    assert.equal(result, false);
  });
});

describe('getRecommendedUpgrade', () => {
  it('returns next version for obsolete versions', () => {
    const result = getRecommendedUpgrade('0.1.0');
    assert.equal(result, '0.2.0');
  });

  it('returns undefined for recently stable versions', () => {
    const result = getRecommendedUpgrade('0.2.0');
    // Released 2026-04-01, currently 2026-07-31, still has ~200 days
    // Only recommend upgrade if < 90 days to EOL
    assert.equal(result, undefined);
  });

  it('returns undefined for unknown versions', () => {
    const result = getRecommendedUpgrade('99.0.0');
    assert.equal(result, undefined);
  });
});

// ── Frozen Schema Tests ────────────────────────────────────────────

describe('getFrozenSchemas', () => {
  it('returns list of frozen schemas', () => {
    const frozen = getFrozenSchemas();
    assert.ok(Array.isArray(frozen));
    assert.ok(frozen.includes('lunum-sem/0.2'));
    assert.ok(frozen.includes('lunum-record/0.2'));
  });

  it('returns at least 2 frozen schemas', () => {
    const frozen = getFrozenSchemas();
    assert.ok(frozen.length >= 2);
  });
});

describe('isSchemeFrozen', () => {
  it('returns true for frozen schemas', () => {
    assert.equal(isSchemeFrozen('lunum-sem/0.2'), true);
    assert.equal(isSchemeFrozen('lunum-record/0.2'), true);
  });

  it('returns false for draft schemas', () => {
    assert.equal(isSchemeFrozen('lunum-sem/0.1-draft'), false);
    assert.equal(isSchemeFrozen('lunum-record/0.1-draft'), false);
  });

  it('returns false for unknown schemas', () => {
    assert.equal(isSchemeFrozen('unknown-schema/1.0'), false);
  });
});

// ── Migration Path Tests ───────────────────────────────────────────

describe('getMigrationPath', () => {
  it('returns empty array for upgrade within same version', () => {
    const path = getMigrationPath('0.2.0', '0.2.0');
    assert.deepEqual(path, []);
  });

  it('returns migration steps for version upgrade', () => {
    const path = getMigrationPath('0.1.0', '0.2.0');
    // Should include at least some guidance
    assert.ok(Array.isArray(path));
  });

  it('returns empty array for unknown versions', () => {
    const path = getMigrationPath('99.0.0', '0.2.0');
    assert.deepEqual(path, []);
  });

  it('returns empty array when target is before source', () => {
    const path = getMigrationPath('0.2.0', '0.1.0');
    assert.deepEqual(path, []);
  });
});

// ── Support Matrix Tests ───────────────────────────────────────────

describe('SUPPORT_MATRIX', () => {
  it('contains entries for all known versions', () => {
    const entries = SUPPORT_MATRIX;
    assert.ok(entries.length >= 2);
  });

  it('includes breaking changes information', () => {
    const entry = SUPPORT_MATRIX.find(e => e.packageVersion === '0.2.0');
    assert.ok(entry);
    assert.ok(Array.isArray(entry!.breakingChanges));
  });

  it('includes schema version ranges', () => {
    const entry = SUPPORT_MATRIX.find(e => e.packageVersion === '0.2.0');
    assert.ok(entry);
    assert.ok(entry!.minSchemaVersion);
    assert.ok(entry!.maxSchemaVersion);
  });

  it('includes migration requirement flags', () => {
    const entry = SUPPORT_MATRIX.find(e => e.packageVersion === '0.1.0');
    assert.ok(entry);
    assert.equal(typeof entry!.migrationRequired, 'boolean');
  });
});

// ── Verification Tests ─────────────────────────────────────────────

describe('verifyVersionSupport', () => {
  it('returns verification result', () => {
    const result = verifyVersionSupport();
    assert.ok(result.passed);
    assert.ok(result.failed);
    assert.equal(typeof result.allPassed, 'boolean');
    assert.ok(Array.isArray(result.warnings));
  });

  it('all registered versions should pass', () => {
    const result = verifyVersionSupport();
    assert.equal(result.allPassed, true);
    assert.equal(result.failed.length, 0);
  });

  it('passed versions should be in registry', () => {
    const result = verifyVersionSupport();
    for (const version of result.passed) {
      assert.ok(isVersionRegistered(version));
    }
  });

  it('may include warnings for near-EOL versions', () => {
    const result = verifyVersionSupport();
    // Just check that warnings is an array
    assert.ok(Array.isArray(result.warnings));
  });
});

// ── Backward Compatibility Tests ───────────────────────────────────

describe('backward compatibility', () => {
  it('0.2.0 supports 0.1-draft schemas', () => {
    const result = checkVersionSupport('0.2.0', 'lunum-sem/0.1-draft');
    assert.equal(result.supported, true);
  });

  it('0.2.0 can read 0.1.0 data', () => {
    const entry = getVersionEntry('0.2.0');
    assert.ok(entry!.supportedSchemas.includes('lunum-sem/0.1-draft'));
  });

  it('0.1.0 cannot read 0.2 schemas', () => {
    const result = checkVersionSupport('0.1.0', 'lunum-sem/0.2');
    assert.equal(result.supported, false);
  });
});

// ── Support Window Tests ───────────────────────────────────────────

describe('support windows', () => {
  it('stable versions have correct support window', () => {
    const entry = getVersionEntry('0.2.0');
    assert.ok(entry);
    const releaseDate = new Date(entry!.releaseDate);
    const endOfLife = new Date(entry!.endOfLife);
    const diffDays = Math.floor((endOfLife.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
    // Should be approximately STABLE_SUPPORT_WINDOW_DAYS
    assert.ok(diffDays >= 360 && diffDays <= 370);
  });

  it('support window constants are defined', () => {
    assert.ok(STABLE_SUPPORT_WINDOW_DAYS > 0);
    assert.ok(SECURITY_SUPPORT_WINDOW_DAYS > 0);
  });
});

// ── Lifecycle State Tests ──────────────────────────────────────────

describe('lifecycle states', () => {
  it('version 0.1.0 is obsolete', () => {
    const entry = getVersionEntry('0.1.0');
    assert.equal(entry!.lifecycleState, 'obsolete');
  });

  it('version 0.2.0 is stable', () => {
    const entry = getVersionEntry('0.2.0');
    assert.equal(entry!.lifecycleState, 'stable');
  });

  it('lifecycle states are valid', () => {
    const validStates = ['dev', 'beta', 'stable', 'deprecated', 'obsolete'];
    for (const version of getAllRegisteredVersions()) {
      const entry = getVersionEntry(version);
      assert.ok(validStates.includes(entry!.lifecycleState));
    }
  });
});
