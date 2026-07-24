import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import {
  TESTLUNUMV1_CANONICAL_DATASET_PATH,
  TESTLUNUMV1_CROSS_LINGUAL_SUITE,
  TESTLUNUMV1_MUTATION_FAMILY_INVENTORY,
  TESTLUNUMV1_REPRODUCIBILITY_SUITE,
  TESTLUNUMV1_ROBUSTNESS_CASE_INVENTORY,
  createTestLunumV1AuditPlan,
  loadTestLunumV1CanonicalDataset,
  validateTestLunumV1AuditPlan,
  validateTestLunumV1CanonicalDataset
} from '../src/testlunumv1-audit-plan.js';
import type { TestLunumV1AuditPlan } from '../src/testlunumv1-audit-plan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

test('audit-plan inventories are explicit and stable', () => {
  assert.ok(Object.isFrozen(TESTLUNUMV1_MUTATION_FAMILY_INVENTORY));
  assert.ok(Object.isFrozen(TESTLUNUMV1_ROBUSTNESS_CASE_INVENTORY));
  assert.ok(Object.isFrozen(TESTLUNUMV1_CROSS_LINGUAL_SUITE));
  assert.ok(Object.isFrozen(TESTLUNUMV1_REPRODUCIBILITY_SUITE));

  assert.equal(TESTLUNUMV1_MUTATION_FAMILY_INVENTORY.length, 10);
  assert.equal(TESTLUNUMV1_ROBUSTNESS_CASE_INVENTORY.length, 21);
  assert.deepStrictEqual(TESTLUNUMV1_CROSS_LINGUAL_SUITE.languages, ['en', 'el', 'es', 'id']);
  assert.deepStrictEqual(TESTLUNUMV1_REPRODUCIBILITY_SUITE.repeatLabels, ['official', 'repeat-1', 'repeat-2']);
  assert.deepStrictEqual(TESTLUNUMV1_REPRODUCIBILITY_SUITE.stages, [1, 2, 3]);
});

test('canonical dataset loads with exact four-item coverage for each language', async () => {
  const datasetPath = path.join(WORKSPACE_ROOT, TESTLUNUMV1_CANONICAL_DATASET_PATH);
  const dataset = await loadTestLunumV1CanonicalDataset(datasetPath);

  assert.equal(dataset.length, 16);
  assert.equal(new Set(dataset.map((item) => item.id)).size, 16);
  assert.deepStrictEqual(countLanguages(dataset), { en: 4, el: 4, es: 4, id: 4 });

  const validated = validateTestLunumV1CanonicalDataset(dataset);
  assert.equal(validated.length, 16);
});

test('audit plan expands a two-slot matrix to unique execution ids with exact budget', async () => {
  const datasetPath = path.join(WORKSPACE_ROOT, TESTLUNUMV1_CANONICAL_DATASET_PATH);
  const dataset = await loadTestLunumV1CanonicalDataset(datasetPath);
  const plan = createTestLunumV1AuditPlan({
    datasetPath,
    canonicalDataset: dataset,
    modelMatrix: [
      { id: 'slot-a', profileId: 'model-a', profileSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { id: 'slot-b', profileId: 'model-b', profileSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    ],
    declaredExecutionCount: 126
  });

  assert.equal(plan.executions.length, 126);
  assert.equal(plan.callBudget.total, 126);
  assert.equal(plan.callBudget.modelSlotCount, 2);
  assert.equal(plan.suites.length, 5);
  assert.equal(new Set(plan.executions.map((execution) => execution.id)).size, 126);

  const reproducibility = plan.suites.find((suite) => suite.id === 'reproducibility');
  assert.ok(reproducibility);
  assert.deepStrictEqual(reproducibility?.stages, [1, 2, 3]);
  assert.deepStrictEqual(reproducibility?.repeatLabels, ['official', 'repeat-1', 'repeat-2']);
});

test('audit plan rejects duplicate dataset ids, missing language coverage, duplicate model slots, invalid stages, and mismatched counts', async () => {
  const datasetPath = path.join(WORKSPACE_ROOT, TESTLUNUMV1_CANONICAL_DATASET_PATH);
  const dataset = await loadTestLunumV1CanonicalDataset(datasetPath);

  const duplicateDataset = dataset.map((item, index) => index === 1 ? { ...item, id: dataset[0]!.id } : item);
  assert.throws(() => validateTestLunumV1CanonicalDataset(duplicateDataset), /duplicate entries: /);

  const missingLanguage = dataset.map((item) =>
    item.sourceLanguage === 'id' ? { ...item, sourceLanguage: 'en' as const } : item
  );
  assert.throws(() => validateTestLunumV1CanonicalDataset(missingLanguage), /must contain exactly 4 items for (?:en|el|es|id)/);

  const basePlan = createTestLunumV1AuditPlan({
    datasetPath,
    canonicalDataset: dataset,
    modelMatrix: [
      { id: 'slot-a', profileId: 'model-a', profileSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { id: 'slot-b', profileId: 'model-b', profileSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    ],
    declaredExecutionCount: 126
  });

  const duplicateSlots = mutatePlan(basePlan, {
    modelMatrix: [
      { id: 'slot-a', profileId: 'model-a', profileSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { id: 'slot-a', profileId: 'model-b', profileSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    ]
  });
  assert.throws(() => validateTestLunumV1AuditPlan(duplicateSlots), /duplicate entries: slot-a/);

  const invalidStage = mutatePlan(basePlan, {
    suites: basePlan.suites.map((suite) =>
      suite.id === 'reproducibility'
        ? { ...suite, stages: [0, 2, 3], repeatLabels: ['official', 'repeat-1', 'repeat-2'] }
        : suite
    )
  });
  assert.throws(() => validateTestLunumV1AuditPlan(invalidStage), /invalid stage 0/);

  const mismatchedCount = mutatePlan(basePlan, { declaredExecutionCount: 125 });
  assert.throws(() => validateTestLunumV1AuditPlan(mismatchedCount), /declared execution count mismatch/);
});

test('canonical dataset fixture is valid json and can be reloaded from a jsonl temp file', async () => {
  const datasetPath = path.join(WORKSPACE_ROOT, TESTLUNUMV1_CANONICAL_DATASET_PATH);
  const dataset = await loadTestLunumV1CanonicalDataset(datasetPath);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-testlunumv1-audit-'));
  const jsonlPath = path.join(temp, 'canonical.jsonl');

  try {
    await writeFile(jsonlPath, `${dataset.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
    const reloaded = await loadTestLunumV1CanonicalDataset(jsonlPath);
    assert.equal(reloaded.length, 16);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function countLanguages(items: readonly { sourceLanguage: string }[]): Record<'en' | 'el' | 'es' | 'id', number> {
  return items.reduce((counts, item) => {
    counts[item.sourceLanguage as 'en' | 'el' | 'es' | 'id'] += 1;
    return counts;
  }, { en: 0, el: 0, es: 0, id: 0 });
}

function mutatePlan(plan: TestLunumV1AuditPlan, patch: Partial<TestLunumV1AuditPlan>): TestLunumV1AuditPlan {
  return {
    ...plan,
    ...patch,
    suites: patch.suites ?? plan.suites,
    modelMatrix: patch.modelMatrix ?? plan.modelMatrix,
    canonicalDataset: patch.canonicalDataset ?? plan.canonicalDataset,
    executions: patch.executions ?? plan.executions,
    callBudget: patch.callBudget ?? plan.callBudget
  };
}
