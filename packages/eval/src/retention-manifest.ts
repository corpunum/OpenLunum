import type { ExperimentItem } from './types.js';

export interface RetentionCoverageManifest {
  schema: 'openlunum-retention-manifest/0.1';
  id: string;
  baselineCommit: string;
  dataset: {
    path: string;
    sha256: string;
  };
  expectedItemIds: string[];
  limits: {
    maxItems: number;
    maxAttemptsPerItem: number;
    maxModelCalls: number;
  };
}

export interface RetentionExecutionPlan {
  manifestId: string;
  expectedItemIds: string[];
  datasetItemIds: string[];
  plannedItemIds: string[];
  maxItems: number;
  maxAttemptsPerItem: number;
  realizationCalls: number;
  parseBackCalls: number;
  totalModelCalls: number;
}

function assertNonEmptyTrimmedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertPositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function normalizeIds(ids: unknown, label: string): string[] {
  if (!Array.isArray(ids)) {
    throw new Error(`${label} must be an array`);
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const value = assertNonEmptyTrimmedString(id, `${label} entry`);
    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate item IDs: ${value}`);
    }
    seen.add(value);
    normalized.push(value);
  }

  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`);
  }

  return normalized;
}

export function validateRetentionManifest(manifest: RetentionCoverageManifest): RetentionCoverageManifest {
  if (manifest.schema !== 'openlunum-retention-manifest/0.1') {
    throw new Error('Unsupported retention manifest schema');
  }

  assertNonEmptyTrimmedString(manifest.id, 'id');
  assertNonEmptyTrimmedString(manifest.baselineCommit, 'baselineCommit');
  assertNonEmptyTrimmedString(manifest.dataset?.path, 'dataset.path');
  assertNonEmptyTrimmedString(manifest.dataset?.sha256, 'dataset.sha256');
  if (!/^[a-f0-9]{64}$/iu.test(manifest.dataset.sha256)) {
    throw new Error('dataset.sha256 must be a 64-character hex digest');
  }

  const expectedItemIds = normalizeIds(manifest.expectedItemIds, 'expectedItemIds');
  const maxItems = assertPositiveSafeInteger(manifest.limits?.maxItems, 'limits.maxItems');
  const maxAttemptsPerItem = assertPositiveSafeInteger(manifest.limits?.maxAttemptsPerItem, 'limits.maxAttemptsPerItem');
  const maxModelCalls = assertPositiveSafeInteger(manifest.limits?.maxModelCalls, 'limits.maxModelCalls');

  if (maxItems < expectedItemIds.length) {
    throw new Error(`limits.maxItems would truncate expected retention coverage: ${maxItems} < ${expectedItemIds.length}`);
  }

  const declaredModelCalls = expectedItemIds.length * maxAttemptsPerItem * 2;
  if (maxModelCalls < declaredModelCalls) {
    throw new Error(`limits.maxModelCalls is insufficient for the declared retention plan: ${maxModelCalls} < ${declaredModelCalls}`);
  }

  return {
    ...manifest,
    expectedItemIds,
    limits: { maxItems, maxAttemptsPerItem, maxModelCalls }
  };
}

function readDatasetItemIds(dataset: ExperimentItem[]): string[] {
  if (!Array.isArray(dataset)) {
    throw new Error('dataset must be an array');
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of dataset) {
    const id = assertNonEmptyTrimmedString(item?.id, 'dataset item id');
    if (seen.has(id)) {
      throw new Error(`dataset contains duplicate item IDs: ${id}`);
    }
    seen.add(id);
    ids.push(id);
  }

  if (ids.length === 0) {
    throw new Error('dataset must not be empty');
  }

  return ids;
}

export function planRetentionExecution(
  manifest: RetentionCoverageManifest,
  dataset: ExperimentItem[]
): RetentionExecutionPlan {
  const validatedManifest = validateRetentionManifest(manifest);
  const datasetItemIds = readDatasetItemIds(dataset);

  const expectedSet = new Set(validatedManifest.expectedItemIds);
  const datasetSet = new Set(datasetItemIds);

  const missing = validatedManifest.expectedItemIds.filter((id) => !datasetSet.has(id));
  if (missing.length > 0) {
    throw new Error(`dataset is missing expected item IDs: ${missing.join(', ')}`);
  }

  const unexpected = datasetItemIds.filter((id) => !expectedSet.has(id));
  if (unexpected.length > 0) {
    throw new Error(`dataset contains unexpected item IDs: ${unexpected.join(', ')}`);
  }

  if (datasetItemIds.length !== validatedManifest.expectedItemIds.length) {
    throw new Error('dataset item IDs must exactly match expectedItemIds');
  }

  const plannedItemIds = validatedManifest.expectedItemIds.slice();
  const realizationCalls = plannedItemIds.length * validatedManifest.limits.maxAttemptsPerItem;
  const parseBackCalls = plannedItemIds.length * validatedManifest.limits.maxAttemptsPerItem;
  const totalModelCalls = realizationCalls + parseBackCalls;

  if (totalModelCalls > validatedManifest.limits.maxModelCalls) {
    throw new Error(`retention plan exceeds maxModelCalls: ${totalModelCalls} > ${validatedManifest.limits.maxModelCalls}`);
  }

  return {
    manifestId: validatedManifest.id,
    expectedItemIds: validatedManifest.expectedItemIds,
    datasetItemIds,
    plannedItemIds,
    maxItems: validatedManifest.limits.maxItems,
    maxAttemptsPerItem: validatedManifest.limits.maxAttemptsPerItem,
    realizationCalls,
    parseBackCalls,
    totalModelCalls
  };
}
