import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';

import {
  buildTestLunumV1SemanticKindInventory,
  computeTestLunumV1CallBudget,
  createSyntheticTestLunumV1BundleInput,
  generateTestLunumV1Bundle,
  TESTLUNUMV1_LANGUAGE_INVENTORY,
  TESTLUNUMV1_REPEAT_LABELS,
  TESTLUNUMV1_SEMANTIC_KIND_INVENTORY,
  TESTLUNUMV1_SUITE_MANIFESTS,
  validateTestLunumV1RawRecords,
  validateTestLunumV1SuiteManifests
} from '../src/testlunumv1-bundle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readJson<T>(file: string): Promise<T> {
  return readFile(file, 'utf8').then((content) => JSON.parse(content) as T);
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(resolved));
    } else {
      files.push(resolved);
    }
  }
  return files;
}

async function flattenRawFiles(recordsRoot: string): Promise<Array<Record<string, unknown>>> {
  const files = (await collectFiles(recordsRoot)).filter((file) => file.endsWith('.jsonl'));
  const rows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const line of content.split(/\r?\n/u).filter((value) => value.trim())) {
      rows.push(JSON.parse(line) as Record<string, unknown>);
    }
  }
  return rows;
}

test('testLunumv1 manifests are immutable and the semantic-kind inventory is explicit', () => {
  assert.ok(Object.isFrozen(TESTLUNUMV1_SUITE_MANIFESTS), 'suite manifest list must be frozen');
  assert.ok(Object.isFrozen(TESTLUNUMV1_SUITE_MANIFESTS[0]), 'suite manifests must be frozen');
  assert.ok(Object.isFrozen(TESTLUNUMV1_SEMANTIC_KIND_INVENTORY), 'semantic-kind inventory must be frozen');

  validateTestLunumV1SuiteManifests(TESTLUNUMV1_SUITE_MANIFESTS);
  assert.deepStrictEqual(TESTLUNUMV1_LANGUAGE_INVENTORY, ['en', 'el', 'es', 'id']);
  assert.ok(TESTLUNUMV1_SEMANTIC_KIND_INVENTORY.includes('preference'));
  assert.ok(TESTLUNUMV1_SEMANTIC_KIND_INVENTORY.includes('safety_constraint'));
});

test('testLunumv1 call budget is deterministic and fail-closed', () => {
  const budget = computeTestLunumV1CallBudget(TESTLUNUMV1_SUITE_MANIFESTS);
  assert.equal(budget.total, 76);
  assert.equal(budget.itemCount, 26);
  assert.equal(budget.modelSlotCount, 12);
  assert.equal(budget.repeatLabelCount, 8);
  assert.equal(budget.stageCount, 7);

  const mutated = TESTLUNUMV1_SUITE_MANIFESTS.map((manifest, index) =>
    index === 0
      ? {
          ...manifest,
          callBudget: { ...manifest.callBudget, total: manifest.callBudget.total + 1 }
        }
      : manifest
  );

  assert.throws(() => validateTestLunumV1SuiteManifests(mutated), /call budget mismatch/);
});

test('testLunumv1 raw records validate against the frozen suite manifests', () => {
  const input = createSyntheticTestLunumV1BundleInput();
  validateTestLunumV1RawRecords(input.rawRecords, TESTLUNUMV1_SUITE_MANIFESTS);

  const inventory = buildTestLunumV1SemanticKindInventory(TESTLUNUMV1_SUITE_MANIFESTS, input.rawRecords);
  assert.ok(inventory.preference > 0);
  assert.ok(inventory.test > 0);

  const mutated = input.rawRecords.map((record, index) =>
    index === 0
      ? { ...record, semanticKind: 'claim' as const }
      : record
  );
  assert.throws(() => validateTestLunumV1RawRecords(mutated, TESTLUNUMV1_SUITE_MANIFESTS), /not declared by suite/);

  const bad = input.rawRecords.map((record, index) =>
    index === 0
      ? { ...record, semanticKind: 'claim' as const, itemId: 'unknown-item' }
      : record
  );
  assert.throws(() => validateTestLunumV1RawRecords(bad, TESTLUNUMV1_SUITE_MANIFESTS), /not declared by suite/);
});

test('testLunumv1 bundle generator writes the complete bundle and recomputes from raw JSONL', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-testlunumv1-'));
  const outputRoot = path.join(temp, 'reports', 'evaluations', 'testLunumv1');
  try {
    const input = createSyntheticTestLunumV1BundleInput();
    const result = await generateTestLunumV1Bundle({
      ...input,
      outputRoot
    });

    assert.equal(result.summary.totalRecords, 76);
    assert.equal(result.summary.totalCallBudget, 76);
    assert.equal(result.summary.passedRecords + result.summary.failedRecords + result.summary.errorRecords, 76);

    const bundleRoot = path.join(outputRoot, input.runId);
    const requiredTopLevel = [
      'README.md',
      'run-manifest.json',
      'environment.md',
      'repository-state.md',
      'dataset-inventory.json',
      'dataset-hashes.txt',
      'prompt-schema-hashes.txt',
      'semantic-kind-inventory.json',
      'summary.json',
      'overall-scorecard.md',
      'focus-recommendations.md',
      'independent-evaluator-verdict.md'
    ];
    for (const file of requiredTopLevel) {
      await assertFileExists(path.join(bundleRoot, file));
    }

    for (const model of input.targetModelProfiles) {
      await assertFileExists(path.join(bundleRoot, 'endpoint-probes', `${model.id}.jsonl`));
      await assertFileExists(path.join(bundleRoot, 'models', `${model.id}.md`));
      await assertFileExists(path.join(bundleRoot, 'model-worker-matrix', `${input.piWorkerId}__${model.id}.md`));
      for (const language of TESTLUNUMV1_LANGUAGE_INVENTORY) {
        await assertFileExists(path.join(bundleRoot, 'raw', 'parse', model.id, `${model.id}__${language}.jsonl`));
        await assertFileExists(path.join(bundleRoot, 'raw', 'retention', model.id, `${model.id}__${language}.jsonl`));
        await assertFileExists(path.join(bundleRoot, 'raw', 'mutation', model.id, `${model.id}__${language}.jsonl`));
      }
      for (const repeatLabel of TESTLUNUMV1_REPEAT_LABELS) {
        await assertFileExists(path.join(bundleRoot, 'raw', 'reproducibility', model.id, `${model.id}__${repeatLabel}.jsonl`));
      }
      await assertFileExists(path.join(bundleRoot, 'raw', 'robustness', model.id, `${model.id}.jsonl`));
    }

    for (const file of [
      'tables/overall.csv',
      'tables/by-model.csv',
      'tables/by-worker.csv',
      'tables/by-model-worker.csv',
      'tables/by-language.csv',
      'tables/by-semantic-kind.csv',
      'tables/by-mutation-family.csv',
      'tables/latency.csv',
      'tables/tokens.csv',
      'tables/errors.csv'
    ]) {
      await assertFileExists(path.join(bundleRoot, file));
    }

    const rawRecords = await flattenRawFiles(path.join(bundleRoot, 'raw'));
    assert.equal(rawRecords.length, 76);

    const recomputedTotal = rawRecords.length;
    const recomputedPassed = rawRecords.filter((record) => record.status === 'passed').length;
    const recomputedFailed = rawRecords.filter((record) => record.status === 'failed').length;
    const recomputedErrors = rawRecords.filter((record) => record.status === 'error').length;
    const summary = await readJson<{ totalRecords: number; passedRecords: number; failedRecords: number; errorRecords: number; totalCallBudget: number; }>(path.join(bundleRoot, 'summary.json'));

    assert.equal(summary.totalRecords, recomputedTotal);
    assert.equal(summary.passedRecords, recomputedPassed);
    assert.equal(summary.failedRecords, recomputedFailed);
    assert.equal(summary.errorRecords, recomputedErrors);
    assert.equal(summary.totalCallBudget, recomputedTotal);

    const semanticKindInventory = await readJson<{ counts: Record<string, number> }>(path.join(bundleRoot, 'semantic-kind-inventory.json'));
    assert.ok((semanticKindInventory.counts.preference ?? 0) > 0);
    assert.ok((semanticKindInventory.counts.test ?? 0) > 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

async function assertFileExists(file: string): Promise<void> {
  const content = await readFile(file, 'utf8');
  assert.ok(content.length > 0, `${file} should not be empty`);
}
