import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { findWorkspaceRoot, readJson } from './io.js';
import type { ExperimentManifest } from './types.js';

export interface ProtectedDataset {
  path: string;
  sha256: string;
  license: string;
  envVar?: string;
}

export interface ProtectedEvalManifest {
  schema: 'openlunum-protected-eval/0.1';
  id: string;
  version: string;
  datasetId: string;
  dataset: ProtectedDataset;
  instructions: string;
  coverage: {
    tasks: string[];
    languages: string[];
    categories: string[];
  };
}

export interface RedactedReport {
  experimentId: string;
  version: string;
  datasetId: string;
  items: number;
  passed: number;
  failed: number;
  exactRate: number;
  featureRecall: number;
  aggregateMetrics: Record<string, number>;
  integrityHash: string;
}

// Resolve dataset path from manifest
export async function resolveDatasetPath(
  dataset: ProtectedDataset,
  root: string
): Promise<string> {
  let resolvedPath: string;

  if (dataset.path.startsWith('$')) {
    // Resolve from environment variable
    const envVar = dataset.envVar ?? dataset.path.substring(1);
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
    resolvedPath = envValue;
  } else {
    // Use absolute path or resolve relative to root
    resolvedPath = path.isAbsolute(dataset.path)
      ? dataset.path
      : path.join(root, dataset.path);
  }

  return resolvedPath;
}

// Validate dataset integrity
export async function validateDataset(
  datasetPath: string,
  expectedSha256: string
): Promise<void> {
  try {
    await access(datasetPath);
  } catch {
    throw new Error(`Protected dataset not found: ${datasetPath}`);
  }

  const content = await readFile(datasetPath);
  const actualSha256 = createHash('sha256').update(content).digest('hex');

  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Dataset hash mismatch: expected ${expectedSha256.substring(0, 16)}..., got ${actualSha256.substring(0, 16)}...`
    );
  }
}

// Validate manifest
export function validateProtectedManifest(manifest: ProtectedEvalManifest): void {
  if (manifest.schema !== 'openlunum-protected-eval/0.1') {
    throw new Error('Unsupported protected-eval schema');
  }
  if (!manifest.id || !/^[a-z0-9][a-z0-9-]+$/.test(manifest.id)) {
    throw new Error('Invalid manifest id');
  }
  if (!manifest.version || !/^v\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('Invalid version format');
  }
  if (!manifest.datasetId) {
    throw new Error('datasetId is required');
  }
  if (!manifest.dataset.path) {
    throw new Error('Dataset path is required');
  }
  if (!manifest.dataset.sha256 || !/^[a-f0-9]{64}$/.test(manifest.dataset.sha256)) {
    throw new Error('Dataset SHA-256 is required and must be 64 hex chars');
  }
  if (!manifest.dataset.license) {
    throw new Error('Dataset license is required');
  }
  if (!manifest.instructions || manifest.instructions.length < 10) {
    throw new Error('Instructions must be at least 10 characters');
  }
  if (!manifest.coverage ||
      !manifest.coverage.tasks || manifest.coverage.tasks.length === 0 ||
      !manifest.coverage.languages || manifest.coverage.languages.length === 0 ||
      !manifest.coverage.categories || manifest.coverage.categories.length === 0) {
    throw new Error('Coverage must include tasks, languages, and categories');
  }
}

// Load and validate manifest
export async function loadProtectedManifest(
  manifestPath: string,
  root: string
): Promise<ProtectedEvalManifest> {
  const manifest = await readJson<ProtectedEvalManifest>(manifestPath);
  validateProtectedManifest(manifest);
  return manifest;
}

// Compute integrity hash for report
function computeIntegrityHash(report: Omit<RedactedReport, 'integrityHash'>): string {
  const integrityData = JSON.stringify({
    experimentId: report.experimentId,
    version: report.version,
    datasetId: report.datasetId,
    items: report.items,
    passed: report.passed,
    failed: report.failed,
    exactRate: report.exactRate,
    featureRecall: report.featureRecall
  });
  return createHash('sha256').update(integrityData).digest('hex');
}

// Create redacted report (aggregate evidence without protected data)
export function createRedactedReport(
  manifest: ProtectedEvalManifest,
  results: Array<{
    status: 'passed' | 'failed' | 'error';
    exact?: boolean;
    featureRecall?: number;
    [key: string]: unknown;
  }>
): RedactedReport {
  const total = results.length;
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status !== 'passed').length;
  const exactCount = results.filter(r => r.exact === true).length;
  const exactRate = total > 0 ? exactCount / total : 0;
  const avgRecall = total > 0
    ? results.reduce((sum, r) => sum + (r.featureRecall ?? 0), 0) / total
    : 0;

  const baseReport = {
    experimentId: manifest.id,
    version: manifest.version,
    datasetId: manifest.datasetId,
    items: total,
    passed,
    failed,
    exactRate,
    featureRecall: avgRecall,
    aggregateMetrics: {}
  };

  const integrityHash = computeIntegrityHash(baseReport);

  return { ...baseReport, integrityHash };
}

// Check that worker role is distinguishable from evaluator
export function isWorkerRole(role: string): boolean {
  return role !== 'evaluator' && role !== 'protected-evaluator';
}

// Verify protected data doesn't leak into manifest
export function verifyNoProtectedLeakage(manifest: ExperimentManifest): void {
  // Check that the manifest doesn't contain any raw protected data
  const jsonStr = JSON.stringify(manifest);
  // Protected examples would be large JSON structures
  // This is a heuristic check - real protected data would have specific markers
  if (jsonStr.length > 10000) {
    // Could contain inline protected data
    console.warn('Warning: Manifest is unusually large, may contain inline protected data');
  }
}

// Resolve protected dataset for an experiment
export async function resolveProtectedDataset(
  manifestPath: string,
  root: string
): Promise<ProtectedDataset> {
  const manifest = await loadProtectedManifest(manifestPath, root);
  const datasetPath = await resolveDatasetPath(manifest.dataset, root);
  await validateDataset(datasetPath, manifest.dataset.sha256);
  return { ...manifest.dataset, path: datasetPath };
}
