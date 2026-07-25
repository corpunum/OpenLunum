/**
 * False-positive review manifest (#332).
 *
 * The false-positive review is the missing scorer for the #328 mutation
 * corpus (`datasets/adversarial/mutation-false-positive-v1.jsonl`) that
 * #253's acceptance checklist requires: each mutation item is a minimally
 * changed variant of a `sourceItemId` item in `multilingual-core-v1.jsonl`,
 * with its own `goldSem` reflecting the CHANGED meaning. A near-semantic
 * match against the SOURCE item's `goldSem` is a false positive -- the
 * scorer accepted a variant whose meaning genuinely differs.
 *
 * This manifest binds together, and freezes at authoring time, both frozen
 * datasets by content hash (mirroring `RetentionCoverageManifest`'s
 * single-dataset binding in `./retention-manifest.ts`) plus the exact set
 * of mutation item IDs expected to be reviewed, so a manifest tampered with
 * after authoring (wrong dataset, dropped items, added items) is rejected
 * before any model call happens.
 */

export interface FalsePositiveReviewManifest {
  schema: 'openlunum-false-positive-review-manifest/0.1';
  id: string;
  baselineCommit: string;
  mutationDataset: {
    path: string;
    sha256: string;
  };
  sourceDataset: {
    path: string;
    sha256: string;
  };
  expectedItemIds: string[];
  limits: {
    maxItems: number;
    maxAttemptsPerItem: number;
    maxModelCalls: number;
  };
  deterministic?: boolean;
  intendedModelProfile?: string;
  intendedModelId?: string;
  outputDirectory?: string;
}

export interface FalsePositiveReviewExecutionPlan {
  manifestId: string;
  expectedItemIds: string[];
  mutationDatasetItemIds: string[];
  plannedItemIds: string[];
  /** mutation item id -> its declared sourceItemId, resolved against the source dataset. */
  sourceItemIdByItemId: ReadonlyMap<string, string>;
  maxItems: number;
  maxAttemptsPerItem: number;
  parseCalls: number;
  totalModelCalls: number;
}

/**
 * Structural, minimal shapes -- deliberately not `DatasetItem`/`ExperimentItem`
 * -- so this module has zero dependency on the full item schema (goldSem
 * shape, protectedLiterals, etc). It only needs item identity and, for the
 * mutation dataset, the `sourceItemId` cross-reference.
 */
export interface FalsePositiveReviewDatasetItemLike {
  id: string;
}

export interface FalsePositiveReviewMutationDatasetItemLike extends FalsePositiveReviewDatasetItemLike {
  sourceItemId?: unknown;
}

function assertNonEmptyTrimmedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertSha256(value: unknown, label: string): string {
  const trimmed = assertNonEmptyTrimmedString(value, label);
  if (!/^[a-f0-9]{64}$/iu.test(trimmed)) {
    throw new Error(`${label} must be a 64-character hex digest`);
  }
  return trimmed;
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

export function validateFalsePositiveReviewManifest(
  manifest: FalsePositiveReviewManifest
): FalsePositiveReviewManifest {
  if (manifest.schema !== 'openlunum-false-positive-review-manifest/0.1') {
    throw new Error('Unsupported false-positive review manifest schema');
  }

  assertNonEmptyTrimmedString(manifest.id, 'id');
  assertNonEmptyTrimmedString(manifest.baselineCommit, 'baselineCommit');
  assertNonEmptyTrimmedString(manifest.mutationDataset?.path, 'mutationDataset.path');
  assertSha256(manifest.mutationDataset?.sha256, 'mutationDataset.sha256');
  assertNonEmptyTrimmedString(manifest.sourceDataset?.path, 'sourceDataset.path');
  assertSha256(manifest.sourceDataset?.sha256, 'sourceDataset.sha256');

  const expectedItemIds = normalizeIds(manifest.expectedItemIds, 'expectedItemIds');
  const maxItems = assertPositiveSafeInteger(manifest.limits?.maxItems, 'limits.maxItems');
  const maxAttemptsPerItem = assertPositiveSafeInteger(manifest.limits?.maxAttemptsPerItem, 'limits.maxAttemptsPerItem');
  const maxModelCalls = assertPositiveSafeInteger(manifest.limits?.maxModelCalls, 'limits.maxModelCalls');

  if (maxItems < expectedItemIds.length) {
    throw new Error(`limits.maxItems would truncate expected false-positive review coverage: ${maxItems} < ${expectedItemIds.length}`);
  }

  // One parse call per item per attempt: the review parses the mutated
  // text once and scores the single resulting Sem against both golds
  // in-process (no extra model call for the "own gold" comparison).
  const declaredModelCalls = expectedItemIds.length * maxAttemptsPerItem;
  if (maxModelCalls < declaredModelCalls) {
    throw new Error(`limits.maxModelCalls is insufficient for the declared false-positive review plan: ${maxModelCalls} < ${declaredModelCalls}`);
  }

  return {
    ...manifest,
    expectedItemIds,
    limits: { maxItems, maxAttemptsPerItem, maxModelCalls }
  };
}

function readDatasetItemIds(dataset: FalsePositiveReviewDatasetItemLike[], label: string): string[] {
  if (!Array.isArray(dataset)) {
    throw new Error(`${label} must be an array`);
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of dataset) {
    const id = assertNonEmptyTrimmedString(item?.id, `${label} item id`);
    if (seen.has(id)) {
      throw new Error(`${label} contains duplicate item IDs: ${id}`);
    }
    seen.add(id);
    ids.push(id);
  }

  if (ids.length === 0) {
    throw new Error(`${label} must not be empty`);
  }

  return ids;
}

/**
 * Builds the deterministic execution plan: verifies the mutation dataset
 * exactly matches `expectedItemIds` (no missing, no extra, no duplicate --
 * same fail-closed accounting as `planRetentionExecution`), then resolves
 * every mutation item's `sourceItemId` against the source dataset. A
 * mutation item whose `sourceItemId` does not exist in the source dataset
 * is a hard error: the review cannot score against a source gold that
 * does not exist.
 */
export function planFalsePositiveReviewExecution(
  manifest: FalsePositiveReviewManifest,
  mutationDataset: FalsePositiveReviewMutationDatasetItemLike[],
  sourceDataset: FalsePositiveReviewDatasetItemLike[]
): FalsePositiveReviewExecutionPlan {
  const validatedManifest = validateFalsePositiveReviewManifest(manifest);
  const mutationDatasetItemIds = readDatasetItemIds(mutationDataset, 'mutationDataset');
  const sourceDatasetItemIds = new Set(readDatasetItemIds(sourceDataset, 'sourceDataset'));

  const expectedSet = new Set(validatedManifest.expectedItemIds);
  const mutationSet = new Set(mutationDatasetItemIds);

  const missing = validatedManifest.expectedItemIds.filter((id) => !mutationSet.has(id));
  if (missing.length > 0) {
    throw new Error(`mutationDataset is missing expected item IDs: ${missing.join(', ')}`);
  }

  const unexpected = mutationDatasetItemIds.filter((id) => !expectedSet.has(id));
  if (unexpected.length > 0) {
    throw new Error(`mutationDataset contains unexpected item IDs: ${unexpected.join(', ')}`);
  }

  if (mutationDatasetItemIds.length !== validatedManifest.expectedItemIds.length) {
    throw new Error('mutationDataset item IDs must exactly match expectedItemIds');
  }

  const sourceItemIdByItemId = new Map<string, string>();
  for (const item of mutationDataset) {
    const sourceItemId = assertNonEmptyTrimmedString(item.sourceItemId, `mutationDataset item ${item.id}: sourceItemId`);
    if (!sourceDatasetItemIds.has(sourceItemId)) {
      throw new Error(`mutationDataset item ${item.id} references sourceItemId "${sourceItemId}", which does not exist in sourceDataset`);
    }
    sourceItemIdByItemId.set(String(item.id), sourceItemId);
  }

  const plannedItemIds = validatedManifest.expectedItemIds.slice();
  const parseCalls = plannedItemIds.length * validatedManifest.limits.maxAttemptsPerItem;
  const totalModelCalls = parseCalls;

  if (totalModelCalls > validatedManifest.limits.maxModelCalls) {
    throw new Error(`false-positive review plan exceeds maxModelCalls: ${totalModelCalls} > ${validatedManifest.limits.maxModelCalls}`);
  }

  return {
    manifestId: validatedManifest.id,
    expectedItemIds: validatedManifest.expectedItemIds,
    mutationDatasetItemIds,
    plannedItemIds,
    sourceItemIdByItemId,
    maxItems: validatedManifest.limits.maxItems,
    maxAttemptsPerItem: validatedManifest.limits.maxAttemptsPerItem,
    parseCalls,
    totalModelCalls
  };
}
