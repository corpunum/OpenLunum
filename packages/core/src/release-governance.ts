export type ReleaseChannel = 'stable' | 'preview' | 'deprecated';
export type BreakingChangePolicy = 'semver-major' | 'never' | 'with-migration';

export interface VersionPolicy {
  scheme: 'semver';
  currentVersion: string;
  minimumSupportedVersion: string;
  breakingChangePolicy: BreakingChangePolicy;
  deprecationNoticeDays: number;
  migrationRequired: boolean;
}

export interface PackageContract {
  packageName: string;
  channel: ReleaseChannel;
  versionPolicy: VersionPolicy;
  publicApi: string[];
  internalApi: string[];
  upgradeGuarantees: string[];
  breakingChangeCommunication: string[];
}

export const PACKAGE_CONTRACTS: readonly PackageContract[] = Object.freeze([
  {
    packageName: '@corpunum/lunum',
    channel: 'preview' as ReleaseChannel,
    versionPolicy: {
      scheme: 'semver' as const,
      currentVersion: '0.2.0',
      minimumSupportedVersion: '0.1.0',
      breakingChangePolicy: 'with-migration' as BreakingChangePolicy,
      deprecationNoticeDays: 90,
      migrationRequired: true,
    },
    publicApi: [
      'LunumSem',
      'LunumRecord',
      'compareSem',
      'gatedCompareSem',
      'fingerprintSem',
      'canonicalizeSem',
      'parseLunum',
      'renderLunum',
    ],
    internalApi: [
      'stableStringify',
      'tokenAtlas',
    ],
    upgradeGuarantees: [
      'Schema migrations provided for 0.x → 0.y transitions',
      'Fingerprint 1.0 contract frozen — digests stable across upgrades',
      'Golden vectors verified on every release',
      'Breaking changes documented in CHANGELOG with migration guide',
    ],
    breakingChangeCommunication: [
      'CHANGELOG.md entry with migration steps',
      'GitHub release notes',
      'Deprecation warnings in code for 90 days before removal',
    ],
  },
  {
    packageName: '@corpunum/lunum-eval',
    channel: 'preview' as ReleaseChannel,
    versionPolicy: {
      scheme: 'semver' as const,
      currentVersion: '0.2.0',
      minimumSupportedVersion: '0.1.0',
      breakingChangePolicy: 'semver-major' as BreakingChangePolicy,
      deprecationNoticeDays: 60,
      migrationRequired: false,
    },
    publicApi: [
      'runExperiment',
      'runSmoke',
      'runRetentionExperiment',
      'evaluateRetentionGates',
    ],
    internalApi: [],
    upgradeGuarantees: [
      'Experiment manifests backward-compatible within 0.x',
      'Evidence format stable — new fields additive only',
    ],
    breakingChangeCommunication: [
      'CHANGELOG.md entry',
      'GitHub release notes',
    ],
  },
  {
    packageName: '@corpunum/lunum-cli',
    channel: 'preview' as ReleaseChannel,
    versionPolicy: {
      scheme: 'semver' as const,
      currentVersion: '0.2.0',
      minimumSupportedVersion: '0.1.0',
      breakingChangePolicy: 'with-migration' as BreakingChangePolicy,
      deprecationNoticeDays: 90,
      migrationRequired: true,
    },
    publicApi: [
      'parse',
      'render',
      'validate',
      'fingerprint',
    ],
    internalApi: [],
    upgradeGuarantees: [
      'Exit codes stable within 0.x',
      'Flag names stable within 0.x',
      'Output format changes are additive (new fields only)',
    ],
    breakingChangeCommunication: [
      'CHANGELOG.md entry with flag mapping',
      'GitHub release notes',
      '--help output updated',
    ],
  },
]);

export interface UpgradeCheck {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  compatible: boolean;
  migrationSteps: string[];
  breakingChanges: string[];
  warnings: string[];
}

export function checkUpgradeCompatibility(
  packageName: string,
  fromVersion: string,
  toVersion: string,
): UpgradeCheck {
  const contract = PACKAGE_CONTRACTS.find(c => c.packageName === packageName);
  const warnings: string[] = [];
  const migrationSteps: string[] = [];
  const breakingChanges: string[] = [];

  if (!contract) {
    return {
      packageName,
      fromVersion,
      toVersion,
      compatible: false,
      migrationSteps: [],
      breakingChanges: ['Unknown package — no governance contract found'],
      warnings: [],
    };
  }

  const fromParts = parseVersion(fromVersion);
  const toParts = parseVersion(toVersion);

  if (!fromParts || !toParts) {
    return {
      packageName,
      fromVersion,
      toVersion,
      compatible: false,
      migrationSteps: [],
      breakingChanges: ['Invalid version format'],
      warnings: [],
    };
  }

  if (toParts.major > fromParts.major) {
    breakingChanges.push(`Major version bump ${fromParts.major} → ${toParts.major}: review CHANGELOG for breaking changes`);
    if (contract.versionPolicy.migrationRequired) {
      migrationSteps.push('Run migration tool if available');
      migrationSteps.push('Verify golden vectors after upgrade');
    }
  }

  if (toParts.minor > fromParts.minor && toParts.major === fromParts.major) {
    migrationSteps.push('Review CHANGELOG for new features and deprecations');
  }

  const minParts = parseVersion(contract.versionPolicy.minimumSupportedVersion);
  if (minParts && compareParts(fromParts, minParts) < 0) {
    warnings.push(`Version ${fromVersion} is below minimum supported ${contract.versionPolicy.minimumSupportedVersion}`);
  }

  return {
    packageName,
    fromVersion,
    toVersion,
    compatible: breakingChanges.length === 0,
    migrationSteps,
    breakingChanges,
    warnings,
  };
}

export function validateGovernanceContracts(contracts: readonly PackageContract[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const names = new Set<string>();

  for (const c of contracts) {
    if (names.has(c.packageName)) {
      errors.push(`Duplicate package: ${c.packageName}`);
    }
    names.add(c.packageName);

    if (c.publicApi.length === 0) {
      errors.push(`${c.packageName} has no public API defined`);
    }

    if (c.upgradeGuarantees.length === 0) {
      errors.push(`${c.packageName} has no upgrade guarantees`);
    }

    if (c.versionPolicy.deprecationNoticeDays < 30) {
      errors.push(`${c.packageName} deprecation notice too short: ${c.versionPolicy.deprecationNoticeDays} days`);
    }

    const ver = parseVersion(c.versionPolicy.currentVersion);
    if (!ver) {
      errors.push(`${c.packageName} has invalid version: ${c.versionPolicy.currentVersion}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return { major: parseInt(m[1]!, 10), minor: parseInt(m[2]!, 10), patch: parseInt(m[3]!, 10) };
}

function compareParts(
  a: { major: number; minor: number; patch: number },
  b: { major: number; minor: number; patch: number },
): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
