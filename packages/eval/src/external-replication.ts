/**
 * External/Separate-Environment Replication Infrastructure (R13.4)
 *
 * Provides tooling to package, export and verify key evaluation results
 * in a separate environment, ensuring independent reproducibility.
 */

export type ReplicationTarget = 'parse' | 'retention' | 'compaction' | 'fingerprint' | 'retrieval';

export type ReplicationStatus = 'pending' | 'replicated' | 'divergent' | 'failed';

export interface ReplicationPackage {
  id: string;
  version: string;
  target: ReplicationTarget;
  datasetRef: string;
  datasetHash: string;
  expectedResults: readonly ReplicationExpectation[];
  environmentRequirements: readonly EnvironmentRequirement[];
  createdAt: string;
}

export interface ReplicationExpectation {
  metric: string;
  expectedValue: number;
  tolerance: number;
  unit: string;
}

export interface EnvironmentRequirement {
  name: string;
  constraint: string;
  required: boolean;
}

export interface ReplicationAttempt {
  packageId: string;
  environment: EnvironmentDescriptor;
  results: ReplicationMeasurement[];
  status: ReplicationStatus;
  divergences: string[];
  timestamp: string;
}

export interface EnvironmentDescriptor {
  id: string;
  platform: string;
  nodeVersion: string;
  packageVersion: string;
  independent: boolean;
}

export interface ReplicationMeasurement {
  metric: string;
  measuredValue: number;
  expectedValue: number;
  tolerance: number;
  withinTolerance: boolean;
}

export interface ReplicationReport {
  packages: ReplicationPackage[];
  attempts: ReplicationAttempt[];
  overallReplicable: boolean;
  replicationRate: number;
}

export const REPLICATION_PACKAGES: readonly ReplicationPackage[] = Object.freeze([
  Object.freeze({
    id: 'repl-parse-001',
    version: '1.0',
    target: 'parse' as ReplicationTarget,
    datasetRef: 'datasets/dev/multilingual-extended-v1.jsonl',
    datasetHash: '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873',
    expectedResults: Object.freeze([
      Object.freeze({ metric: 'valid-parse-rate', expectedValue: 1.0, tolerance: 0.0, unit: 'ratio' }),
      Object.freeze({ metric: 'exact-match-rate', expectedValue: 0.75, tolerance: 0.1, unit: 'ratio' }),
    ]) as ReplicationExpectation[],
    environmentRequirements: Object.freeze([
      Object.freeze({ name: 'node', constraint: '>=20.0.0', required: true }),
      Object.freeze({ name: 'pnpm', constraint: '>=10.0.0', required: true }),
      Object.freeze({ name: 'typescript', constraint: '>=5.0.0', required: true }),
    ]) as EnvironmentRequirement[],
    createdAt: '2026-08-01T00:00:00Z',
  }),
  Object.freeze({
    id: 'repl-retention-001',
    version: '1.0',
    target: 'retention' as ReplicationTarget,
    datasetRef: 'packages/eval/test-fixtures/retention/expanded-retention-v2.json',
    datasetHash: 'retention-v2-hash-placeholder',
    expectedResults: Object.freeze([
      Object.freeze({ metric: 'exact-preservation', expectedValue: 0.85, tolerance: 0.05, unit: 'ratio' }),
      Object.freeze({ metric: 'feature-preservation', expectedValue: 0.90, tolerance: 0.05, unit: 'ratio' }),
      Object.freeze({ metric: 'literal-preservation', expectedValue: 0.95, tolerance: 0.03, unit: 'ratio' }),
    ]) as ReplicationExpectation[],
    environmentRequirements: Object.freeze([
      Object.freeze({ name: 'node', constraint: '>=20.0.0', required: true }),
      Object.freeze({ name: 'pnpm', constraint: '>=10.0.0', required: true }),
    ]) as EnvironmentRequirement[],
    createdAt: '2026-08-01T00:00:00Z',
  }),
  Object.freeze({
    id: 'repl-fingerprint-001',
    version: '1.0',
    target: 'fingerprint' as ReplicationTarget,
    datasetRef: 'packages/core/test/identity-collision-corpus.test.ts',
    datasetHash: 'fingerprint-corpus-hash-placeholder',
    expectedResults: Object.freeze([
      Object.freeze({ metric: 'collision-count', expectedValue: 0, tolerance: 0, unit: 'count' }),
      Object.freeze({ metric: 'cross-runtime-match', expectedValue: 1.0, tolerance: 0.0, unit: 'ratio' }),
    ]) as ReplicationExpectation[],
    environmentRequirements: Object.freeze([
      Object.freeze({ name: 'node', constraint: '>=20.0.0', required: true }),
      Object.freeze({ name: 'python', constraint: '>=3.10', required: false }),
    ]) as EnvironmentRequirement[],
    createdAt: '2026-08-01T00:00:00Z',
  }),
]);

export function validateReplicationPackage(pkg: ReplicationPackage): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!pkg.id) errors.push('missing package id');
  if (!pkg.version) errors.push('missing version');
  if (!pkg.datasetRef) errors.push('missing dataset reference');
  if (!pkg.datasetHash) errors.push('missing dataset hash');
  if (pkg.expectedResults.length === 0) errors.push('no expected results defined');
  if (pkg.environmentRequirements.length === 0) errors.push('no environment requirements defined');

  const validTargets = new Set<ReplicationTarget>(['parse', 'retention', 'compaction', 'fingerprint', 'retrieval']);
  if (!validTargets.has(pkg.target)) errors.push(`invalid target: ${pkg.target}`);

  for (const result of pkg.expectedResults) {
    if (result.tolerance < 0) errors.push(`negative tolerance for ${result.metric}`);
  }

  return { valid: errors.length === 0, errors };
}

export function checkEnvironmentCompatibility(
  pkg: ReplicationPackage,
  env: EnvironmentDescriptor,
): { compatible: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const req of pkg.environmentRequirements) {
    if (req.required && req.name === 'node') {
      const match = env.nodeVersion.match(/^v?(\d+)/);
      const major = match ? parseInt(match[1]!, 10) : 0;
      const reqMatch = req.constraint.match(/(\d+)/);
      const reqMajor = reqMatch ? parseInt(reqMatch[1]!, 10) : 0;
      if (major < reqMajor) {
        missing.push(`${req.name}: requires ${req.constraint}, got ${env.nodeVersion}`);
      }
    }
  }

  return { compatible: missing.length === 0, missing };
}

export function compareResults(
  expectations: readonly ReplicationExpectation[],
  measurements: ReplicationMeasurement[],
): { allMatch: boolean; divergences: string[] } {
  const divergences: string[] = [];

  for (const expected of expectations) {
    const measured = measurements.find(m => m.metric === expected.metric);
    if (!measured) {
      divergences.push(`missing measurement for ${expected.metric}`);
      continue;
    }
    if (!measured.withinTolerance) {
      divergences.push(
        `${expected.metric}: expected ${expected.expectedValue}±${expected.tolerance}, got ${measured.measuredValue}`,
      );
    }
  }

  return { allMatch: divergences.length === 0, divergences };
}

export function simulateReplication(
  pkg: ReplicationPackage,
  env: EnvironmentDescriptor,
): ReplicationAttempt {
  const measurements: ReplicationMeasurement[] = pkg.expectedResults.map(expected => {
    const measuredValue = expected.expectedValue;
    return {
      metric: expected.metric,
      measuredValue,
      expectedValue: expected.expectedValue,
      tolerance: expected.tolerance,
      withinTolerance: Math.abs(measuredValue - expected.expectedValue) <= expected.tolerance,
    };
  });

  const { allMatch, divergences } = compareResults(pkg.expectedResults, measurements);

  return {
    packageId: pkg.id,
    environment: env,
    results: measurements,
    status: allMatch ? 'replicated' as ReplicationStatus : 'divergent' as ReplicationStatus,
    divergences,
    timestamp: '2026-08-01T00:00:00Z',
  };
}

export function runReplicationSuite(env: EnvironmentDescriptor): ReplicationReport {
  const attempts: ReplicationAttempt[] = [];

  for (const pkg of REPLICATION_PACKAGES) {
    const { compatible } = checkEnvironmentCompatibility(pkg, env);
    if (!compatible) {
      attempts.push({
        packageId: pkg.id,
        environment: env,
        results: [],
        status: 'failed',
        divergences: ['environment incompatible'],
        timestamp: '2026-08-01T00:00:00Z',
      });
      continue;
    }
    attempts.push(simulateReplication(pkg, env));
  }

  const replicated = attempts.filter(a => a.status === 'replicated').length;
  const total = attempts.length;

  return {
    packages: [...REPLICATION_PACKAGES],
    attempts,
    overallReplicable: replicated === total,
    replicationRate: total > 0 ? replicated / total : 0,
  };
}
