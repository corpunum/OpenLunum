/**
 * Coverage test for the #328 mutation-tagged false-positive corpus
 * (datasets/adversarial/mutation-false-positive-v1.jsonl).
 *
 * #253's acceptance checklist requires false-positive review samples covering
 * negation, modality, extra-clause, literal, and role mutations. This test
 * asserts the corpus actually delivers that: every one of the five mutation
 * categories is present in every one of the four core languages, with no
 * missing and no duplicate category x language combination, and the file
 * loads cleanly through the real, unmodified loadDataset used everywhere
 * else in the eval pipeline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { findWorkspaceRoot, loadDataset, readJson, sha256File } from '../src/io.js';
import type { DatasetItem } from '../src/types.js';

const LANGUAGES = ['en', 'el', 'es', 'id'] as const;
const MUTATION_TYPES = ['negation', 'modality', 'extra-clause', 'literal', 'role'] as const;
type Language = (typeof LANGUAGES)[number];
type MutationType = (typeof MUTATION_TYPES)[number];

// Items in this corpus carry mutation-specific fields beyond the base
// DatasetItem shape: mutationType, sourceItemId, semanticDifference.
// DatasetItem is loaded via a type assertion (JSON.parse(...) as DatasetItem)
// in loadDataset, so these extra fields survive untouched; we re-assert
// their presence and shape explicitly here rather than relying on the cast.
interface MutationDatasetItem extends DatasetItem {
  mutationType: string;
  sourceItemId: string;
  semanticDifference: string;
}

const DATASET_RELATIVE_PATH = 'datasets/adversarial/mutation-false-positive-v1.jsonl';
const MANIFEST_RELATIVE_PATH = 'datasets/manifests/mutation-false-positive-v1.json';

test('mutation false-positive corpus: manifest hash matches the committed file content', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasetPath = path.join(workspaceRoot, DATASET_RELATIVE_PATH);
  const manifestPath = path.join(workspaceRoot, MANIFEST_RELATIVE_PATH);

  const manifest = await readJson<{ id: string; path: string; sha256: string; items: number; languages: string[] }>(manifestPath);
  assert.equal(manifest.path, DATASET_RELATIVE_PATH);

  const actualHash = await sha256File(datasetPath);
  assert.equal(actualHash, manifest.sha256, 'manifest sha256 must match the actual committed dataset file content');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u, 'manifest sha256 must be a lowercase 64-hex-char SHA-256');
});

test('mutation false-positive corpus: loads through the real loadDataset without error', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasetPath = path.join(workspaceRoot, DATASET_RELATIVE_PATH);

  const items = (await loadDataset(datasetPath)) as MutationDatasetItem[];
  assert.ok(items.length > 0, 'dataset must not be empty');

  const manifest = await readJson<{ items: number }>(path.join(workspaceRoot, MANIFEST_RELATIVE_PATH));
  assert.equal(items.length, manifest.items, 'manifest item count must match the actual number of loaded items');

  for (const item of items) {
    assert.ok(item.id, `every item must have an id (offending item: ${JSON.stringify(item)})`);
    assert.ok(item.sourceText, `${item.id}: sourceText is required`);
    assert.ok(item.goldSem, `${item.id}: goldSem is required`);
    assert.ok(item.sourceLanguage, `${item.id}: sourceLanguage is required`);
    assert.ok(item.mutationType, `${item.id}: mutationType tag is required`);
    assert.ok(item.sourceItemId, `${item.id}: sourceItemId (the mutated source item's id) is required`);
    assert.ok(
      item.semanticDifference && item.semanticDifference.trim().length > 0,
      `${item.id}: semanticDifference must state what makes the meaning genuinely different from the source item`
    );
  }
});

test('mutation false-positive corpus: every item id is unique', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasetPath = path.join(workspaceRoot, DATASET_RELATIVE_PATH);
  const items = (await loadDataset(datasetPath)) as MutationDatasetItem[];

  const seen = new Set<string>();
  for (const item of items) {
    assert.ok(!seen.has(item.id), `duplicate item id: ${item.id}`);
    seen.add(item.id);
  }
});

test('mutation false-positive corpus: full category x language matrix is covered, no missing or duplicate combination', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasetPath = path.join(workspaceRoot, DATASET_RELATIVE_PATH);
  const items = (await loadDataset(datasetPath)) as MutationDatasetItem[];

  const counts = new Map<string, number>();
  for (const item of items) {
    const lang = item.sourceLanguage;
    const mutationType = item.mutationType;
    assert.ok(
      (LANGUAGES as readonly string[]).includes(lang),
      `${item.id}: sourceLanguage '${lang}' is not one of the four core languages ${LANGUAGES.join(', ')}`
    );
    assert.ok(
      (MUTATION_TYPES as readonly string[]).includes(mutationType),
      `${item.id}: mutationType '${mutationType}' is not one of the five required categories ${MUTATION_TYPES.join(', ')}`
    );
    const key = `${mutationType}:${lang}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const missing: string[] = [];
  const duplicated: string[] = [];
  for (const mutationType of MUTATION_TYPES) {
    for (const lang of LANGUAGES) {
      const key = `${mutationType}:${lang}`;
      const count = counts.get(key) ?? 0;
      if (count === 0) missing.push(key);
      if (count > 1) duplicated.push(`${key} (x${count})`);
    }
  }

  assert.deepEqual(missing, [], `missing mutation-type x language combinations: ${missing.join(', ')}`);
  assert.deepEqual(duplicated, [], `duplicated mutation-type x language combinations: ${duplicated.join(', ')}`);

  const expectedCombinations = MUTATION_TYPES.length * LANGUAGES.length;
  assert.equal(counts.size, expectedCombinations, `expected exactly ${expectedCombinations} distinct category x language combinations`);
});

test('mutation false-positive corpus: every item references a real source item id from the frozen #253 dataset', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const coreDatasetPath = path.join(workspaceRoot, 'datasets/dev/multilingual-core-v1.jsonl');
  const mutationDatasetPath = path.join(workspaceRoot, DATASET_RELATIVE_PATH);

  const coreItems = await loadDataset(coreDatasetPath);
  const coreIds = new Set(coreItems.map((item) => item.id));

  const mutationItems = (await loadDataset(mutationDatasetPath)) as MutationDatasetItem[];
  for (const item of mutationItems) {
    assert.ok(
      coreIds.has(item.sourceItemId),
      `${item.id}: sourceItemId '${item.sourceItemId}' does not exist in multilingual-core-v1.jsonl`
    );
  }
});
