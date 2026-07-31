/**
 * Package installation, upgrade, and rollback contract (R11.5).
 */

import { CLI_CONTRACT_VERSION } from './cli-contract.js';

export const INSTALL_CONTRACT_VERSION = '1.0.0' as const;

export type StepStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface InstallStep {
  name: string;
  description: string;
  preCondition: string;
  postCondition: string;
  status: StepStatus;
  error?: string | undefined;
}

export interface UpgradeStep {
  name: string;
  description: string;
  fromVersion: string;
  toVersion: string;
  preCondition: string;
  postCondition: string;
  migrationRequired: boolean;
  status: StepStatus;
  error?: string | undefined;
}

export interface RollbackStep {
  name: string;
  description: string;
  targetVersion: string;
  preCondition: string;
  postCondition: string;
  status: StepStatus;
  error?: string | undefined;
}

export interface InstallVerification {
  contractVersion: string;
  packagePresent: boolean;
  versionCorrect: boolean;
  expectedVersion: string;
  actualVersion: string;
  dependenciesResolved: boolean;
  unresolvedDependencies: string[];
  configValid: boolean;
  configErrors: string[];
  steps: InstallStep[];
  passed: boolean;
}

export interface UpgradeVerification {
  contractVersion: string;
  fromVersion: string;
  toVersion: string;
  migrationApplied: boolean;
  dataIntact: boolean;
  rollbackPointCreated: boolean;
  steps: UpgradeStep[];
  passed: boolean;
}

export interface RollbackVerification {
  contractVersion: string;
  targetVersion: string;
  previousVersionRestored: boolean;
  stateIntact: boolean;
  steps: RollbackStep[];
  passed: boolean;
}

function makeStep<T extends InstallStep | UpgradeStep | RollbackStep>(
  base: Omit<T, 'status' | 'error'>,
  check: () => boolean,
  errorMsg: string,
): T {
  try {
    const ok = check();
    return { ...base, status: ok ? 'passed' : 'failed', ...(ok ? {} : { error: errorMsg }) } as T;
  } catch (e) {
    return { ...base, status: 'failed', error: String(e) } as T;
  }
}

export function verifyInstallation(opts: {
  packagePresent: boolean;
  expectedVersion: string;
  actualVersion: string;
  dependencies: Map<string, boolean>;
  configErrors: string[];
}): InstallVerification {
  const steps: InstallStep[] = [];

  steps.push(makeStep<InstallStep>(
    { name: 'package-present', description: 'Package is installed', preCondition: 'npm registry accessible', postCondition: 'Package directory exists' },
    () => opts.packagePresent,
    'Package not found in node_modules',
  ));

  steps.push(makeStep<InstallStep>(
    { name: 'version-match', description: 'Installed version matches expected', preCondition: 'Package present', postCondition: 'Version string matches' },
    () => opts.actualVersion === opts.expectedVersion,
    `Expected ${opts.expectedVersion}, got ${opts.actualVersion}`,
  ));

  const unresolvedDeps: string[] = [];
  for (const [dep, resolved] of opts.dependencies) {
    if (!resolved) unresolvedDeps.push(dep);
  }
  steps.push(makeStep<InstallStep>(
    { name: 'dependencies-resolved', description: 'All dependencies resolved', preCondition: 'Package present', postCondition: 'No missing dependencies' },
    () => unresolvedDeps.length === 0,
    `Unresolved: ${unresolvedDeps.join(', ')}`,
  ));

  steps.push(makeStep<InstallStep>(
    { name: 'config-valid', description: 'Configuration is valid', preCondition: 'Package present', postCondition: 'No config errors' },
    () => opts.configErrors.length === 0,
    opts.configErrors.join('; '),
  ));

  return {
    contractVersion: INSTALL_CONTRACT_VERSION,
    packagePresent: opts.packagePresent,
    versionCorrect: opts.actualVersion === opts.expectedVersion,
    expectedVersion: opts.expectedVersion,
    actualVersion: opts.actualVersion,
    dependenciesResolved: unresolvedDeps.length === 0,
    unresolvedDependencies: unresolvedDeps,
    configValid: opts.configErrors.length === 0,
    configErrors: [...opts.configErrors],
    steps,
    passed: steps.every(s => s.status === 'passed'),
  };
}

export function verifyUpgrade(opts: {
  fromVersion: string;
  toVersion: string;
  migrationApplied: boolean;
  dataIntact: boolean;
  rollbackPointCreated: boolean;
}): UpgradeVerification {
  const steps: UpgradeStep[] = [];

  steps.push(makeStep<UpgradeStep>(
    { name: 'migration-applied', description: 'Schema migration applied', fromVersion: opts.fromVersion, toVersion: opts.toVersion, preCondition: 'Old version present', postCondition: 'Migration script ran', migrationRequired: true },
    () => opts.migrationApplied,
    'Migration was not applied',
  ));

  steps.push(makeStep<UpgradeStep>(
    { name: 'data-intact', description: 'No data loss after upgrade', fromVersion: opts.fromVersion, toVersion: opts.toVersion, preCondition: 'Migration applied', postCondition: 'All records accessible', migrationRequired: false },
    () => opts.dataIntact,
    'Data integrity check failed',
  ));

  steps.push(makeStep<UpgradeStep>(
    { name: 'rollback-point', description: 'Rollback point created', fromVersion: opts.fromVersion, toVersion: opts.toVersion, preCondition: 'Old version present', postCondition: 'Snapshot saved', migrationRequired: false },
    () => opts.rollbackPointCreated,
    'No rollback point was created before upgrade',
  ));

  return {
    contractVersion: INSTALL_CONTRACT_VERSION,
    fromVersion: opts.fromVersion,
    toVersion: opts.toVersion,
    migrationApplied: opts.migrationApplied,
    dataIntact: opts.dataIntact,
    rollbackPointCreated: opts.rollbackPointCreated,
    steps,
    passed: steps.every(s => s.status === 'passed'),
  };
}

export function verifyRollback(opts: {
  targetVersion: string;
  previousVersionRestored: boolean;
  stateIntact: boolean;
}): RollbackVerification {
  const steps: RollbackStep[] = [];

  steps.push(makeStep<RollbackStep>(
    { name: 'version-restored', description: 'Previous version restored', targetVersion: opts.targetVersion, preCondition: 'Rollback point exists', postCondition: 'Version matches target' },
    () => opts.previousVersionRestored,
    `Failed to restore version ${opts.targetVersion}`,
  ));

  steps.push(makeStep<RollbackStep>(
    { name: 'state-intact', description: 'Application state intact after rollback', targetVersion: opts.targetVersion, preCondition: 'Version restored', postCondition: 'State passes integrity check' },
    () => opts.stateIntact,
    'State integrity check failed after rollback',
  ));

  return {
    contractVersion: INSTALL_CONTRACT_VERSION,
    targetVersion: opts.targetVersion,
    previousVersionRestored: opts.previousVersionRestored,
    stateIntact: opts.stateIntact,
    steps,
    passed: steps.every(s => s.status === 'passed'),
  };
}

export function getInstallGuidance(): {
  install: string[];
  upgrade: string[];
  rollback: string[];
  cliContractVersion: string;
  installContractVersion: string;
} {
  return {
    install: [
      'npm install @corpunum/lunum @corpunum/lunum-cli',
      'Verify: lunum contract --check',
      'Run: lunum encode --sem path/to/sem.json',
    ],
    upgrade: [
      'Create rollback point: cp -r node_modules/.lunum-state .lunum-rollback',
      'npm install @corpunum/lunum@latest @corpunum/lunum-cli@latest',
      'Run migration: lunum migrate --from <old> --to <new>',
      'Verify: lunum contract --check',
    ],
    rollback: [
      'Restore snapshot: cp -r .lunum-rollback node_modules/.lunum-state',
      'npm install @corpunum/lunum@<previous-version>',
      'Verify: lunum contract --check',
    ],
    cliContractVersion: CLI_CONTRACT_VERSION,
    installContractVersion: INSTALL_CONTRACT_VERSION,
  };
}
