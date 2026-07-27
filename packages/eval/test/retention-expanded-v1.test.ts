import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { validateSem } from '@corpunum/lunum';
import { loadDataset, readJson, sha256File } from '../src/io.js';
import type { DatasetItem } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const DATASET_PATH = path.join(WORKSPACE_ROOT, 'datasets', 'retention-expanded-v1.jsonl');
const MANIFEST_PATH = path.join(WORKSPACE_ROOT, 'datasets', 'manifests', 'retention-expanded-v1.json');

const EXPECTED_CATEGORIES = [
  'belief', 'conditional', 'hypothetical', 'identifier', 'modal',
  'multi-clause', 'multi-role', 'negated', 'nested-conditional',
  'plan', 'preference', 'quantified', 'safety-constraint', 'simple',
  'temporal', 'tool-event',
] as const;

const MIN_ITEMS = 200;

interface RetentionManifest {
  id: string;
  path: string;
  sha256: string;
  items: number;
  categories: string[];
  structures: string[];
  sourceLanguage: string;
  status: string;
  description: string;
}

test('#383: retention-expanded-v1.jsonl loads via loadDataset with 200+ items', async () => {
  const items = await loadDataset(DATASET_PATH);
  assert.ok(items.length >= MIN_ITEMS, `expected at least ${MIN_ITEMS} items, got ${items.length}`);
});

test('#383: every item has a schema-valid goldSem per validateSem', async () => {
  const items = await loadDataset(DATASET_PATH);
  for (const item of items) {
    const result = validateSem(item.goldSem);
    assert.ok(result.ok, `item ${item.id} failed validateSem: ${result.errors.join('; ')}`);
  }
});

test('#383: all item IDs are unique', async () => {
  const items = await loadDataset(DATASET_PATH);
  const ids = items.map((i) => i.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate item IDs found');
});

test('#383: all sourceTexts are unique', async () => {
  const items = await loadDataset(DATASET_PATH);
  const texts = items.map((i) => i.sourceText);
  assert.strictEqual(new Set(texts).size, texts.length, 'duplicate sourceTexts found');
});

test('#383: every item has required fields (id, semanticGroup, sourceLanguage, sourceText, goldSem)', async () => {
  const items = await loadDataset(DATASET_PATH);
  for (const item of items) {
    assert.ok(item.id, `item missing id`);
    assert.ok(item.semanticGroup, `item ${item.id} missing semanticGroup`);
    assert.ok(item.sourceLanguage, `item ${item.id} missing sourceLanguage`);
    assert.ok(item.sourceText, `item ${item.id} missing sourceText`);
    assert.ok(item.goldSem, `item ${item.id} missing goldSem`);
  }
});

test('#383: dataset covers all 16 expected semantic categories', async () => {
  const items = await loadDataset(DATASET_PATH);
  const seenCategories = new Set(items.map((i) => i.semanticGroup));
  for (const cat of EXPECTED_CATEGORIES) {
    assert.ok(seenCategories.has(cat), `missing category: ${cat}`);
  }
  assert.strictEqual(seenCategories.size, EXPECTED_CATEGORIES.length);
});

test('#383: every category has at least 10 items', async () => {
  const items = await loadDataset(DATASET_PATH);
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.semanticGroup!, (counts.get(item.semanticGroup!) ?? 0) + 1);
  }
  for (const [cat, count] of counts) {
    assert.ok(count >= 10, `category ${cat} has only ${count} items (minimum 10)`);
  }
});

test('#383: items with protectedLiterals have non-empty arrays', async () => {
  const items = await loadDataset(DATASET_PATH);
  const withLiterals = items.filter((i) => i.protectedLiterals && i.protectedLiterals.length > 0);
  assert.ok(withLiterals.length >= 30, `expected at least 30 items with protected literals, got ${withLiterals.length}`);
  for (const item of withLiterals) {
    for (const lit of item.protectedLiterals!) {
      assert.ok(typeof lit === 'string' && lit.length > 0, `item ${item.id} has empty protected literal`);
    }
  }
});

test('#383: conditional and nested-conditional items have conditions in their clauses', async () => {
  const items = await loadDataset(DATASET_PATH);
  const condItems = items.filter((i) => i.semanticGroup === 'conditional' || i.semanticGroup === 'nested-conditional');
  assert.ok(condItems.length >= 30, `expected at least 30 conditional items`);
  for (const item of condItems) {
    const clauses = item.goldSem.clauses;
    const hasConditions = clauses.some((c: any) => c.conditions && c.conditions.length > 0);
    assert.ok(hasConditions, `item ${item.id} in ${item.semanticGroup} has no conditions`);
  }
});

test('#383: negated and safety-constraint items have negated clauses', async () => {
  const items = await loadDataset(DATASET_PATH);
  const negItems = items.filter((i) => i.semanticGroup === 'negated' || i.semanticGroup === 'safety-constraint');
  assert.ok(negItems.length >= 20);
  for (const item of negItems) {
    const hasNegated = item.goldSem.clauses.some((c: any) => c.negated === true);
    assert.ok(hasNegated, `item ${item.id} in ${item.semanticGroup} has no negated clause`);
  }
});

test('#383: modal items have modality set', async () => {
  const items = await loadDataset(DATASET_PATH);
  const modalItems = items.filter((i) => i.semanticGroup === 'modal');
  assert.ok(modalItems.length >= 10);
  for (const item of modalItems) {
    const hasModality = item.goldSem.clauses.some((c: any) => c.modality && c.modality.length > 0);
    assert.ok(hasModality, `item ${item.id} has no modality`);
  }
});

test('#383: temporal items have time fields in their clauses', async () => {
  const items = await loadDataset(DATASET_PATH);
  const tempItems = items.filter((i) => i.semanticGroup === 'temporal');
  assert.ok(tempItems.length >= 10);
  for (const item of tempItems) {
    const hasTime = item.goldSem.clauses.some((c: any) => c.time != null);
    assert.ok(hasTime, `item ${item.id} has no time field`);
  }
});

test('#383: multi-clause items have 2+ clauses', async () => {
  const items = await loadDataset(DATASET_PATH);
  const mcItems = items.filter((i) => i.semanticGroup === 'multi-clause');
  assert.ok(mcItems.length >= 10);
  for (const item of mcItems) {
    assert.ok(item.goldSem.clauses.length >= 2, `item ${item.id} has only ${item.goldSem.clauses.length} clause(s)`);
  }
});

test('#383: manifest matches the dataset file (SHA-256, item count, categories)', async () => {
  const manifest = await readJson<RetentionManifest>(MANIFEST_PATH);
  assert.strictEqual(manifest.id, 'retention-expanded-v1');
  assert.strictEqual(manifest.path, 'datasets/retention-expanded-v1.jsonl');

  const actualHash = await sha256File(DATASET_PATH);
  assert.strictEqual(actualHash, manifest.sha256, 'manifest SHA-256 does not match actual file hash');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);

  const items = await loadDataset(DATASET_PATH);
  assert.strictEqual(manifest.items, items.length);

  const actualCats = [...new Set(items.map((i) => i.semanticGroup))].sort();
  assert.deepStrictEqual(manifest.categories, actualCats);
});
