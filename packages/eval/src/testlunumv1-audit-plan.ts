import { readFile } from 'node:fs/promises';
import { TESTLUNUMV1_LANGUAGE_INVENTORY, TESTLUNUMV1_REPEAT_LABELS } from './testlunumv1-bundle.js';
import type { DatasetItem } from './types.js';

export type TestLunumV1AuditSuiteId =
  | 'canonical'
  | 'mutation'
  | 'robustness'
  | 'cross-lingual'
  | 'reproducibility';

export interface TestLunumV1AuditModelSlot {
  id: string;
  profileId: string;
  profileSha256: string;
}

export interface TestLunumV1AuditSuiteItem {
  id: string;
  sourceLanguage: DatasetItem['sourceLanguage'];
}

export interface TestLunumV1AuditSuiteInventory {
  id: TestLunumV1AuditSuiteId;
  items: readonly TestLunumV1AuditSuiteItem[];
  languages: readonly DatasetItem['sourceLanguage'][];
  stages: readonly number[];
  repeatLabels: readonly string[];
  callBudget: {
    itemCount: number;
    modelSlotCount: number;
    stageCount: number;
    total: number;
  };
}

export interface TestLunumV1PlannedExecution {
  id: string;
  suiteId: TestLunumV1AuditSuiteId;
  itemId: string;
  sourceLanguage: DatasetItem['sourceLanguage'];
  modelSlotId: string;
  stage: number;
  repeatLabel: string;
  callBudget: 1;
}

export interface TestLunumV1AuditPlan {
  datasetPath: string;
  canonicalDataset: readonly DatasetItem[];
  modelMatrix: readonly TestLunumV1AuditModelSlot[];
  suites: readonly TestLunumV1AuditSuiteInventory[];
  executions: readonly TestLunumV1PlannedExecution[];
  declaredExecutionCount: number;
  callBudget: {
    itemCount: number;
    modelSlotCount: number;
    stageCount: number;
    total: number;
  };
}

const TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY = TESTLUNUMV1_LANGUAGE_INVENTORY;
type TestLunumV1AuditLanguage = (typeof TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY)[number];

export const TESTLUNUMV1_CANONICAL_DATASET_PATH = 'packages/eval/test-fixtures/testlunumv1/canonical-dataset.json';

export const TESTLUNUMV1_MUTATION_FAMILY_INVENTORY = freezeDeep([
  { id: 'negation', sourceLanguage: 'en' as const },
  { id: 'modality', sourceLanguage: 'el' as const },
  { id: 'added-removed-reversed-conditions', sourceLanguage: 'es' as const },
  { id: 'extra-clauses', sourceLanguage: 'id' as const },
  { id: 'role-swaps', sourceLanguage: 'en' as const },
  { id: 'literal-changes', sourceLanguage: 'el' as const },
  { id: 'scope-changes', sourceLanguage: 'es' as const },
  { id: 'temporal-changes', sourceLanguage: 'id' as const },
  { id: 'permission-polarity', sourceLanguage: 'en' as const },
  { id: 'and-or-changes', sourceLanguage: 'el' as const }
] as const);

export const TESTLUNUMV1_ROBUSTNESS_CASE_INVENTORY = freezeDeep([
  { id: 'fenced-json', sourceLanguage: 'en' as const },
  { id: 'preamble-trailing-text', sourceLanguage: 'el' as const },
  { id: 'reasoning-tags', sourceLanguage: 'es' as const },
  { id: 'truncation', sourceLanguage: 'id' as const },
  { id: 'malformed-output', sourceLanguage: 'en' as const },
  { id: 'empty-output', sourceLanguage: 'el' as const },
  { id: 'http-errors', sourceLanguage: 'es' as const },
  { id: 'timeout', sourceLanguage: 'id' as const },
  { id: 'endpoint-loss', sourceLanguage: 'en' as const },
  { id: 'long-inputs', sourceLanguage: 'el' as const },
  { id: 'multi-clause-inputs', sourceLanguage: 'es' as const },
  { id: 'ambiguity', sourceLanguage: 'id' as const },
  { id: 'conflicting-instructions', sourceLanguage: 'en' as const },
  { id: 'mixed-language-input', sourceLanguage: 'el' as const },
  { id: 'unicode-normalization', sourceLanguage: 'es' as const },
  { id: 'repeated-literals', sourceLanguage: 'id' as const },
  { id: 'concurrency-1', sourceLanguage: 'en' as const },
  { id: 'concurrency-2', sourceLanguage: 'el' as const },
  { id: 'concurrency-3', sourceLanguage: 'es' as const },
  { id: 'cold-start', sourceLanguage: 'id' as const },
  { id: 'warm-start', sourceLanguage: 'en' as const }
] as const);

export const TESTLUNUMV1_CROSS_LINGUAL_SUITE = freezeDeep({
  id: 'cross-lingual' as const,
  items: [
    { id: 'cross-en-el', sourceLanguage: 'en' as const },
    { id: 'cross-el-es', sourceLanguage: 'el' as const },
    { id: 'cross-es-id', sourceLanguage: 'es' as const },
    { id: 'cross-id-en', sourceLanguage: 'id' as const }
  ],
  languages: TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY,
  stages: [1] as const,
  repeatLabels: ['official'] as const
});

export const TESTLUNUMV1_REPRODUCIBILITY_SUITE = freezeDeep({
  id: 'reproducibility' as const,
  items: [
    { id: 'repro-en', sourceLanguage: 'en' as const },
    { id: 'repro-el', sourceLanguage: 'el' as const },
    { id: 'repro-es', sourceLanguage: 'es' as const },
    { id: 'repro-id', sourceLanguage: 'id' as const }
  ],
  languages: TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY,
  stages: [1, 2, 3] as const,
  repeatLabels: TESTLUNUMV1_REPEAT_LABELS
});

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) freezeDeep(entry);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) freezeDeep(nested);
    return Object.freeze(value);
  }
  return value;
}

function assertNonEmptyTrimmedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertUniqueStrings(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = assertNonEmptyTrimmedString(value, `${label} entry`);
    if (seen.has(normalized)) {
      throw new Error(`${label} contains duplicate entries: ${normalized}`);
    }
    seen.add(normalized);
  }
  if (values.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toDatasetItem(value: unknown, index: number): DatasetItem {
  if (!isRecord(value)) {
    throw new Error(`canonical dataset item ${index + 1} must be an object`);
  }
  const id = assertNonEmptyTrimmedString(value.id, `canonical dataset item ${index + 1}.id`);
  const sourceLanguage = assertNonEmptyTrimmedString(value.sourceLanguage, `canonical dataset item ${id}.sourceLanguage`);
  const language = sourceLanguage as TestLunumV1AuditLanguage;
  if (!TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY.includes(language)) {
    throw new Error(`canonical dataset item ${id} has unsupported source language ${sourceLanguage}`);
  }
  const sourceText = assertNonEmptyTrimmedString(value.sourceText, `canonical dataset item ${id}.sourceText`);
  if (!isRecord(value.goldSem)) {
    throw new Error(`canonical dataset item ${id}.goldSem must be an object`);
  }
  return {
    id,
    sourceLanguage: sourceLanguage as DatasetItem['sourceLanguage'],
    sourceText,
    goldSem: value.goldSem as unknown as DatasetItem['goldSem'],
    ...(value.targetLanguage !== undefined ? { targetLanguage: assertNonEmptyTrimmedString(value.targetLanguage, `canonical dataset item ${id}.targetLanguage`) } : {}),
    ...(value.semanticGroup !== undefined ? { semanticGroup: assertNonEmptyTrimmedString(value.semanticGroup, `canonical dataset item ${id}.semanticGroup`) } : {}),
    ...(Array.isArray(value.protectedLiterals) ? { protectedLiterals: value.protectedLiterals.map((entry, literalIndex) => assertNonEmptyTrimmedString(entry, `canonical dataset item ${id}.protectedLiterals[${literalIndex}]`)) } : {}),
    ...(Array.isArray(value.tags) ? { tags: value.tags.map((entry, tagIndex) => assertNonEmptyTrimmedString(entry, `canonical dataset item ${id}.tags[${tagIndex}]`)) } : {})
  };
}

function validateLanguageCoverage(items: readonly DatasetItem[], label: string, exactCountPerLanguage = false): void {
  const counts: Record<DatasetItem['sourceLanguage'], number> = { en: 0, el: 0, es: 0, id: 0 };
  for (const item of items) {
    const language = item.sourceLanguage;
    counts[language] = (counts[language] ?? 0) + 1;
  }
  for (const language of TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY) {
    if (exactCountPerLanguage) {
      if (counts[language] !== 4) {
        throw new Error(`${label} must contain exactly 4 items for ${language}`);
      }
    } else if (counts[language] === 0) {
      throw new Error(`${label} must include at least one item for ${language}`);
    }
  }
}

function validateStageList(stages: readonly number[], label: string): readonly number[] {
  const seen = new Set<number>();
  for (const stage of stages) {
    if (!Number.isSafeInteger(stage) || stage < 1) {
      throw new Error(`invalid stage ${stage}`);
    }
    if (seen.has(stage)) {
      throw new Error(`${label} stages contains duplicate entries: ${stage}`);
    }
    seen.add(stage);
  }
  if (stages.length === 0) {
    throw new Error(`${label} stages must not be empty`);
  }
  return stages;
}

function createSuiteInventory(
  id: TestLunumV1AuditSuiteId,
  items: readonly TestLunumV1AuditSuiteItem[],
  stages: readonly number[],
  repeatLabels: readonly string[]
): TestLunumV1AuditSuiteInventory {
  const normalizedItems = freezeDeep(items.map((item, index) => {
    const itemId = assertNonEmptyTrimmedString(item.id, `${id} item ${index + 1}.id`);
    const sourceLanguage = assertNonEmptyTrimmedString(item.sourceLanguage, `${id} item ${itemId}.sourceLanguage`);
    const language = sourceLanguage as TestLunumV1AuditLanguage;
    if (!TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY.includes(language)) {
      throw new Error(`${id} item ${itemId} has unsupported source language ${sourceLanguage}`);
    }
    return { id: itemId, sourceLanguage: language };
  }));
  assertUniqueStrings(normalizedItems.map((item) => item.id), `${id} item ids`);
  const normalizedStages = validateStageList(stages, `${id}`);
  assertUniqueStrings(repeatLabels, `${id} repeat labels`);
  if (normalizedStages.length !== repeatLabels.length) {
    throw new Error(`${id} has ${normalizedStages.length} stages but ${repeatLabels.length} repeat labels`);
  }
  const languages = freezeDeep([...TESTLUNUMV1_AUDIT_LANGUAGE_INVENTORY]);
  const budget = {
    itemCount: normalizedItems.length,
    modelSlotCount: 2,
    stageCount: normalizedStages.length,
    total: normalizedItems.length * 2 * normalizedStages.length
  };
  return freezeDeep({
    id,
    items: normalizedItems,
    languages,
    stages: normalizedStages,
    repeatLabels,
    callBudget: budget
  });
}

export async function loadTestLunumV1CanonicalDataset(datasetPath: string): Promise<readonly DatasetItem[]> {
  const raw = await readFile(datasetPath, 'utf8');
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error('canonical dataset must not be empty');
  }
  let parsed: unknown;
  if (trimmed.startsWith('[')) {
    parsed = JSON.parse(trimmed);
  } else {
    parsed = trimmed.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid canonical dataset JSONL at ${datasetPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  if (!Array.isArray(parsed)) {
    throw new Error('canonical dataset must be a JSON array or JSONL records');
  }
  return validateTestLunumV1CanonicalDataset(parsed);
}

export function validateTestLunumV1CanonicalDataset(items: readonly unknown[]): readonly DatasetItem[] {
  if (items.length !== 16) {
    throw new Error(`canonical dataset must contain exactly 16 items, got ${items.length}`);
  }
  const normalized = freezeDeep(items.map((item, index) => toDatasetItem(item, index)));
  assertUniqueStrings(normalized.map((item) => item.id), 'canonical dataset item ids');
  validateLanguageCoverage(normalized, 'canonical dataset', true);
  return normalized;
}

export function createTestLunumV1AuditPlan(input: {
  datasetPath: string;
  canonicalDataset: readonly unknown[];
  modelMatrix: readonly TestLunumV1AuditModelSlot[];
  declaredExecutionCount: number;
}): TestLunumV1AuditPlan {
  const canonicalDataset = validateTestLunumV1CanonicalDataset(input.canonicalDataset);
  return validateTestLunumV1AuditPlan({
    datasetPath: input.datasetPath,
    canonicalDataset,
    modelMatrix: input.modelMatrix,
    suites: [
      createSuiteInventory(
        'canonical',
        canonicalDataset.map((item) => ({ id: item.id, sourceLanguage: item.sourceLanguage })),
        [1],
        ['official']
      ),
      createSuiteInventory('mutation', TESTLUNUMV1_MUTATION_FAMILY_INVENTORY, [1], ['official']),
      createSuiteInventory('robustness', TESTLUNUMV1_ROBUSTNESS_CASE_INVENTORY, [1], ['official']),
      createSuiteInventory('cross-lingual', TESTLUNUMV1_CROSS_LINGUAL_SUITE.items, TESTLUNUMV1_CROSS_LINGUAL_SUITE.stages, TESTLUNUMV1_CROSS_LINGUAL_SUITE.repeatLabels),
      createSuiteInventory('reproducibility', TESTLUNUMV1_REPRODUCIBILITY_SUITE.items, TESTLUNUMV1_REPRODUCIBILITY_SUITE.stages, TESTLUNUMV1_REPRODUCIBILITY_SUITE.repeatLabels)
    ],
    declaredExecutionCount: input.declaredExecutionCount
  });
}

export function validateTestLunumV1AuditPlan(plan: Pick<TestLunumV1AuditPlan, 'datasetPath' | 'canonicalDataset' | 'modelMatrix' | 'suites' | 'declaredExecutionCount'>): TestLunumV1AuditPlan {
  const datasetPath = assertNonEmptyTrimmedString(plan.datasetPath, 'datasetPath');
  const canonicalDataset = validateTestLunumV1CanonicalDataset(plan.canonicalDataset);
  const modelMatrix = freezeDeep(plan.modelMatrix.map((slot, index) => {
    const id = assertNonEmptyTrimmedString(slot.id, `model matrix slot ${index + 1}.id`);
    const profileId = assertNonEmptyTrimmedString(slot.profileId, `model matrix slot ${id}.profileId`);
    const profileSha256 = assertNonEmptyTrimmedString(slot.profileSha256, `model matrix slot ${id}.profileSha256`);
    return { id, profileId, profileSha256 };
  }));
  assertUniqueStrings(modelMatrix.map((slot) => slot.id), 'model matrix slot ids');
  if (modelMatrix.length !== 2) {
    throw new Error(`model matrix must contain exactly 2 slots, got ${modelMatrix.length}`);
  }

  const suites = freezeDeep(plan.suites.map((suite) => createSuiteInventory(suite.id, suite.items, suite.stages, suite.repeatLabels)));
  assertUniqueStrings(suites.map((suite) => suite.id), 'suite ids');

  const executions: TestLunumV1PlannedExecution[] = [];
  const seenExecutionIds = new Set<string>();
  for (const suite of suites) {
    validateLanguageCoverage(
      suite.items.map((item) => ({ id: item.id, sourceLanguage: item.sourceLanguage, sourceText: '', goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [] } })),
      `${suite.id} suite`
    );
    for (const item of suite.items) {
      for (const slot of modelMatrix) {
        for (let index = 0; index < suite.stages.length; index += 1) {
          const stage = suite.stages[index]!;
          const repeatLabel = suite.repeatLabels[index]!;
          if (!Number.isSafeInteger(stage) || stage < 1) {
            throw new Error(`${suite.id} has invalid stage ${stage}`);
          }
          const id = `${suite.id}:${item.id}:${slot.id}:stage-${stage}:repeat-${repeatLabel}`;
          if (seenExecutionIds.has(id)) {
            throw new Error(`duplicate planned execution id: ${id}`);
          }
          seenExecutionIds.add(id);
          executions.push({
            id,
            suiteId: suite.id,
            itemId: item.id,
            sourceLanguage: item.sourceLanguage,
            modelSlotId: slot.id,
            stage,
            repeatLabel,
            callBudget: 1
          });
        }
      }
    }
  }

  const callBudget = {
    itemCount: suites.reduce((sum, suite) => sum + suite.callBudget.itemCount, 0),
    modelSlotCount: modelMatrix.length,
    stageCount: suites.reduce((sum, suite) => sum + suite.callBudget.stageCount, 0),
    total: executions.length
  };

  if (executions.length !== plan.declaredExecutionCount) {
    throw new Error(`declared execution count mismatch: ${plan.declaredExecutionCount} !== ${executions.length}`);
  }

  return freezeDeep({
    datasetPath,
    canonicalDataset,
    modelMatrix,
    suites,
    executions: freezeDeep(executions),
    declaredExecutionCount: plan.declaredExecutionCount,
    callBudget
  });
}
