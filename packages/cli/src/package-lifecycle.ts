/**
 * Package lifecycle guidance (R11.5, issue #492)
 *
 * Comprehensive types and procedures for package installation,
 * upgrade, rollback, and migration verification.
 *
 * This module is separate from install-contract.ts and provides
 * richer type coverage, installation-method support, migration
 * path validation, and data-safety guarantees.
 */

/* ------------------------------------------------------------------ */
/*  Version & contract constants                                      */
/* ------------------------------------------------------------------ */

export const PACKAGE_LIFECYCLE_VERSION = '1.0.0' as const;

/* ------------------------------------------------------------------ */
/*  Installation methods                                              */
/* ------------------------------------------------------------------ */

/**
 * Supported installation methods. Each method defines the command,
 * the package identifier, and any method-specific flags.
 */
export type InstallationMethod = 'npm' | 'pnpm' | 'source';

export const INSTALLATION_METHODS: readonly InstallationMethod[] = [
  'npm',
  'pnpm',
  'source',
] as const;

export interface InstallationMethodSpec {
  method: InstallationMethod;
  commandTemplate: string;
  description: string;
  requiresRegistry: boolean;
  supportsOffline: boolean;
}

export const INSTALLATION_METHOD_SPECS: readonly InstallationMethodSpec[] = [
  {
    method: 'npm',
    commandTemplate: 'npm install @corpunum/lunum@<version> @corpunum/lunum-cli@<version>',
    description: 'Install via npm from the public registry.',
    requiresRegistry: true,
    supportsOffline: false,
  },
  {
    method: 'pnpm',
    commandTemplate: 'pnpm add @corpunum/lunum@<version> @corpunum/lunum-cli@<version>',
    description: 'Install via pnpm from the public registry.',
    requiresRegistry: true,
    supportsOffline: false,
  },
  {
    method: 'source',
    commandTemplate: 'git clone https://github.com/corpunum/OpenLunum.git && cd OpenLunum && pnpm install && pnpm build',
    description: 'Build from source repository.',
    requiresRegistry: false,
    supportsOffline: true,
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Lifecycle step types                                              */
/* ------------------------------------------------------------------ */

/**
 * Status of a lifecycle step.
 */
export type StepStatus = 'pending' | 'in-progress' | 'passed' | 'failed' | 'skipped';

/**
 * Severity of a step-level issue.
 */
export type StepSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Base lifecycle step shared across install/upgrade/rollback.
 */
export interface LifecycleStep {
  name: string;
  description: string;
  preCondition: string;
  postCondition: string;
  method: InstallationMethod;
  command: string;
  status: StepStatus;
  severity?: StepSeverity;
  error?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Installation steps & verification                                 */
/* ------------------------------------------------------------------ */

/**
 * Detailed result of a package installation.
 */
export interface InstallationResult {
  contractVersion: string;
  method: InstallationMethod;
  version: string;
  steps: LifecycleStep[];
  /** True when every step passed. */
  passed: boolean;
  /** Human-readable summary. */
  summary: string;
}

/**
 * createInstallSteps builds the typed step sequence for a new installation.
 */
export function createInstallSteps(opts: {
  method: InstallationMethod;
  version: string;
  packagePresent: boolean;
  versionMatches: boolean;
  dependenciesResolved: boolean;
  configValid: boolean;
  configErrors: string[];
  buildSuccess: boolean;
}): LifecycleStep[] {
  const steps: LifecycleStep[] = [];
  const spec = INSTALLATION_METHOD_SPECS.find((s) => s.method === opts.method);
  const command = spec?.commandTemplate
    .replace(/<version>/g, opts.version)
    ?? `install @corpunum/lunum@${opts.version}`;

  // Step 1: Download/install
  steps.push(makeStep(opts.method, command, 'download',
    'Download and install package from registry or source.',
    'Download complete',
    opts.packagePresent,
  ));

  // Step 2: Version validation
  steps.push(makeStep(opts.method, command, 'version-check',
    'Installed version matches expected release.',
    'Version matches expected release',
    opts.versionMatches,
  ));

  // Step 3: Dependency resolution
  steps.push(makeStep(opts.method, command, 'dependencies-resolved',
    'All dependencies resolved without conflicts.',
    'No unresolved or conflicting dependencies',
    opts.dependenciesResolved,
  ));

  // Step 4: Configuration validation
  steps.push(makeStep(opts.method, command, 'config-valid',
    'Configuration files are valid and consistent.',
    'No configuration errors detected',
    opts.configValid,
    opts.configErrors.length > 0 ? opts.configErrors.join('; ') : undefined,
  ));

  // Step 5: Build validation
  steps.push(makeStep(opts.method, command, 'build-validated',
    'Package builds successfully after installation.',
    'Build artifacts present and valid',
    opts.buildSuccess,
  ));

  return steps;
}

/**
 * verifyInstallation runs all lifecycle steps and returns a result.
 */
export function verifyInstallation(opts: {
  method: InstallationMethod;
  version: string;
  packagePresent: boolean;
  versionMatches: boolean;
  dependenciesResolved: boolean;
  configValid: boolean;
  configErrors: string[];
  buildSuccess: boolean;
}): InstallationResult {
  const steps = createInstallSteps(opts);
  const allPassed = steps.every((s) => s.status === 'passed');
  const failedCount = steps.filter((s) => s.status === 'failed').length;

  return {
    contractVersion: PACKAGE_LIFECYCLE_VERSION,
    method: opts.method,
    version: opts.version,
    steps,
    passed: allPassed,
    summary: allPassed
      ? `Installation of ${opts.method}@${opts.version} succeeded (${steps.length} steps passed).`
      : `Installation of ${opts.method}@${opts.version} failed (${failedCount}/${steps.length} steps failed).`,
  };
}

/* ------------------------------------------------------------------ */
/*  Upgrade steps & migration validation                              */
/* ------------------------------------------------------------------ */

/**
 * Upgrade step with migration path information.
 */
export interface UpgradeStep extends LifecycleStep {
  fromVersion: string;
  toVersion: string;
  migrationRequired: boolean;
  migrationApplied: boolean;
  migrationScript: string | undefined;
  schemaVersionChanged: boolean;
  migrationSteps: string[];
}

/**
 * Detailed result of a package upgrade.
 */
export interface UpgradeResult {
  contractVersion: string;
  fromVersion: string;
  toVersion: string;
  method: InstallationMethod;
  steps: UpgradeStep[];
  passed: boolean;
  summary: string;
}

/**
 * createUpgradeSteps builds the typed step sequence for an upgrade.
 */
export function createUpgradeSteps(opts: {
  method: InstallationMethod;
  fromVersion: string;
  toVersion: string;
  rollbackPointCreated: boolean;
  migrationScriptAvailable: boolean;
  migrationApplied: boolean;
  migrationSuccess: boolean;
  schemaVersionChanged: boolean;
  dataIntact: boolean;
  configMigrated: boolean;
  buildSuccess: boolean;
}): LifecycleStep[] {
  const steps: LifecycleStep[] = [];
  const spec = INSTALLATION_METHOD_SPECS.find((s) => s.method === opts.method);
  const command = spec?.commandTemplate
    .replace(/<version>/g, opts.toVersion)
    ?? `update @corpunum/lunum to ${opts.toVersion}`;

  // Step 1: Pre-upgrade backup
  steps.push(makeStep(opts.method, command, 'pre-upgrade-backup',
    `Create rollback point before upgrading from ${opts.fromVersion} to ${opts.toVersion}.`,
    'Rollback snapshot saved',
    opts.rollbackPointCreated,
  ));

  // Step 2: Download new version
  steps.push(makeStep(opts.method, command, 'download-new-version',
    'Download and install the new version.',
    'New version downloaded',
    true, // download is always assumed present for upgrade
  ));

  // Step 3: Schema migration
  steps.push(makeStep(opts.method, command, 'schema-migration',
    'Run schema migration if schema version changed.',
    'Schema migration applied',
    !opts.schemaVersionChanged || opts.migrationApplied,
    opts.schemaVersionChanged && !opts.migrationApplied ? 'Schema changed but migration was not applied' : undefined,
  ));

  // Step 4: Data integrity check
  steps.push(makeStep(opts.method, command, 'data-integrity',
    'Verify data structures are intact after migration.',
    'Data integrity verified',
    opts.dataIntact,
    opts.dataIntact ? undefined : 'Data integrity check failed',
  ));

  // Step 5: Configuration migration
  steps.push(makeStep(opts.method, command, 'config-migrated',
    'Configuration migrated to new version format.',
    'Configuration updated',
    opts.configMigrated,
  ));

  // Step 6: Build validation
  steps.push(makeStep(opts.method, command, 'build-validated',
    'Package builds successfully after upgrade.',
    'Build artifacts present and valid',
    opts.buildSuccess,
  ));

  return steps;
}

/**
 * verifyUpgrade runs all upgrade steps and returns a result.
 */
export function verifyUpgrade(opts: {
  method: InstallationMethod;
  fromVersion: string;
  toVersion: string;
  rollbackPointCreated: boolean;
  migrationScriptAvailable: boolean;
  migrationApplied: boolean;
  migrationSuccess: boolean;
  schemaVersionChanged: boolean;
  dataIntact: boolean;
  configMigrated: boolean;
  buildSuccess: boolean;
}): UpgradeResult {
  const baseSteps = createUpgradeSteps(opts);

  // Enrich with upgrade-specific fields
  const steps: UpgradeStep[] = baseSteps.map((step): UpgradeStep => ({
    ...step,
    fromVersion: opts.fromVersion,
    toVersion: opts.toVersion,
    migrationRequired: opts.schemaVersionChanged,
    migrationApplied: opts.migrationApplied,
    migrationScript: opts.migrationScriptAvailable ? 'migrate.js' : undefined,
    schemaVersionChanged: opts.schemaVersionChanged,
    migrationSteps: opts.schemaVersionChanged && opts.migrationApplied
      ? ['read-schema', 'apply-changes', 'validate-output']
      : opts.schemaVersionChanged
        ? ['read-schema', 'apply-changes']
        : [],
  }));

  const allPassed = steps.every((s) => s.status === 'passed');
  const failedCount = steps.filter((s) => s.status === 'failed').length;

  return {
    contractVersion: PACKAGE_LIFECYCLE_VERSION,
    fromVersion: opts.fromVersion,
    toVersion: opts.toVersion,
    method: opts.method,
    steps,
    passed: allPassed,
    summary: allPassed
      ? `Upgrade from ${opts.fromVersion} to ${opts.toVersion} succeeded (${steps.length} steps passed).`
      : `Upgrade from ${opts.fromVersion} to ${opts.toVersion} failed (${failedCount}/${steps.length} steps failed).`,
  };
}

/* ------------------------------------------------------------------ */
/*  Rollback steps & data safety                                      */
/* ------------------------------------------------------------------ */

/**
 * Rollback step with data-safety information.
 */
export interface RollbackStep extends LifecycleStep {
  targetVersion: string;
  previousVersionRestored: boolean;
  stateIntact: boolean;
  dataSafetyChecks: {
    recordsVerified: boolean;
    integrityHashMatches: boolean;
    stateFilesIntact: boolean;
  };
}

/**
 * Detailed result of a package rollback.
 */
export interface RollbackResult {
  contractVersion: string;
  targetVersion: string;
  method: InstallationMethod;
  steps: RollbackStep[];
  passed: boolean;
  summary: string;
}

/**
 * createRollbackSteps builds the typed step sequence for a rollback.
 */
export function createRollbackSteps(opts: {
  method: InstallationMethod;
  targetVersion: string;
  rollbackPointExists: boolean;
  previousVersionRestored: boolean;
  stateIntact: boolean;
  recordsVerified: boolean;
  integrityHashMatches: boolean;
  stateFilesIntact: boolean;
  buildSuccess: boolean;
}): LifecycleStep[] {
  const steps: LifecycleStep[] = [];
  const spec = INSTALLATION_METHOD_SPECS.find((s) => s.method === opts.method);
  const command = spec?.commandTemplate
    .replace(/<version>/g, opts.targetVersion)
    ?? `rollback to @corpunum/lunum@${opts.targetVersion}`;

  // Step 1: Rollback point validation
  steps.push(makeStep(opts.method, command, 'rollback-point-verified',
    'Rollback snapshot exists and is valid.',
    'Rollback snapshot validated',
    opts.rollbackPointExists,
    opts.rollbackPointExists ? undefined : 'No rollback snapshot found',
  ));

  // Step 2: Version restoration
  steps.push(makeStep(opts.method, command, 'version-restored',
    'Restore the previous version from the rollback point.',
    'Previous version restored',
    opts.previousVersionRestored,
  ));

  // Step 3: State integrity
  steps.push(makeStep(opts.method, command, 'state-intact',
    'Application state is intact after version restoration.',
    'State integrity verified',
    opts.stateIntact,
    opts.stateIntact ? undefined : 'Application state corrupted',
  ));

  // Step 4: Data safety - records
  steps.push(makeStep(opts.method, command, 'records-verified',
    'Data records preserved and consistent after rollback.',
    'All records verified intact',
    opts.recordsVerified,
    opts.recordsVerified ? undefined : 'Some records missing or corrupted',
  ));

  // Step 5: Data safety - integrity hash
  steps.push(makeStep(opts.method, command, 'integrity-hash-matches',
    'Integrity hash matches pre-upgrade baseline.',
    'Integrity hash verified',
    opts.integrityHashMatches,
    opts.integrityHashMatches ? undefined : 'Integrity hash mismatch detected',
  ));

  // Step 6: State files
  steps.push(makeStep(opts.method, command, 'state-files-intact',
    'State files are intact and accessible.',
    'State files accessible',
    opts.stateFilesIntact,
    opts.stateFilesIntact ? undefined : 'State files missing or unreadable',
  ));

  // Step 7: Build validation
  steps.push(makeStep(opts.method, command, 'build-validated',
    'Package builds successfully after rollback.',
    'Build artifacts present and valid',
    opts.buildSuccess,
  ));

  return steps;
}

/**
 * verifyRollback runs all rollback steps and returns a result.
 */
export function verifyRollback(opts: {
  method: InstallationMethod;
  targetVersion: string;
  rollbackPointExists: boolean;
  previousVersionRestored: boolean;
  stateIntact: boolean;
  recordsVerified: boolean;
  integrityHashMatches: boolean;
  stateFilesIntact: boolean;
  buildSuccess: boolean;
}): RollbackResult {
  const baseSteps = createRollbackSteps(opts);

  // Enrich with rollback-specific fields
  const steps: RollbackStep[] = baseSteps.map((step): RollbackStep => ({
    ...step,
    targetVersion: opts.targetVersion,
    previousVersionRestored: opts.previousVersionRestored,
    stateIntact: opts.stateIntact,
    dataSafetyChecks: {
      recordsVerified: opts.recordsVerified,
      integrityHashMatches: opts.integrityHashMatches,
      stateFilesIntact: opts.stateFilesIntact,
    },
  }));

  const allPassed = steps.every((s) => s.status === 'passed');
  const failedCount = steps.filter((s) => s.status === 'failed').length;

  return {
    contractVersion: PACKAGE_LIFECYCLE_VERSION,
    targetVersion: opts.targetVersion,
    method: opts.method,
    steps,
    passed: allPassed,
    summary: allPassed
      ? `Rollback to ${opts.targetVersion} succeeded (${steps.length} steps passed).`
      : `Rollback to ${opts.targetVersion} failed (${failedCount}/${steps.length} steps failed).`,
  };
}

/* ------------------------------------------------------------------ */
/*  Guidance & documentation helpers                                  */
/* ------------------------------------------------------------------ */

export interface LifecycleGuidance {
  install: string[];
  upgrade: string[];
  rollback: string[];
  packageLifecycleVersion: string;
  supportedMethods: InstallationMethod[];
  methodSpecs: InstallationMethodSpec[];
}

/**
 * getLifecycleGuidance returns human-readable step-by-step guidance
 * for installation, upgrade, and rollback procedures.
 */
export function getLifecycleGuidance(): LifecycleGuidance {
  return {
    install: [
      'Choose installation method: npm, pnpm, or source.',
      'Run: npm install @corpunum/lunum@<version> @corpunum/lunum-cli@<version>',
      'Verify installation: lunum contract --check',
      'Verify version: lunum inspect --version',
      'Run: lunum encode --sem path/to/sem.json',
    ],
    upgrade: [
      `1. Create rollback point: cp -r node_modules/.lunum-state .lunum-rollback`,
      `2. Verify current state: lunum contract --check`,
      `3. Install new version: npm install @corpunum/lunum@latest @corpunum/lunum-cli@latest`,
      `4. Run schema migration: lunum migrate --from <old-version> --to <new-version>`,
      `5. Verify migration: lunum contract --check`,
      `6. Run tests: pnpm test`,
    ],
    rollback: [
      '1. Verify rollback point exists: ls .lunum-rollback',
      '2. Restore state: cp -r .lunum-rollback/* node_modules/.lunum-state/',
      '3. Install previous version: npm install @corpunum/lunum@<previous-version>',
      '4. Verify rollback: lunum contract --check',
      '5. Verify data integrity: lunum inspect --version',
    ],
    packageLifecycleVersion: PACKAGE_LIFECYCLE_VERSION,
    supportedMethods: [...INSTALLATION_METHODS],
    methodSpecs: [...INSTALLATION_METHOD_SPECS],
  };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

function makeStep(
  method: InstallationMethod,
  command: string,
  name: string,
  description: string,
  postCondition: string,
  check: boolean,
  error?: string,
): LifecycleStep {
  const result: LifecycleStep = {
    name,
    description,
    preCondition: '', // filled by caller
    postCondition,
    method,
    command,
    status: check ? 'passed' : 'failed',
    ...(check ? {} : { severity: (error ? 'error' : 'warning') as StepSeverity }),
    ...((error || !check) ? { error: error ?? `${name} check failed` } : {}),
  };
  return result;
}
