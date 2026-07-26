/**
 * Coverage test for the #356 (readiness R5.2) mutation-corpus expansion:
 * `datasets/adversarial/mutation-false-positive-v2.jsonl` and its source
 * dataset `datasets/dev/synthetic-mutation-sources-v1.jsonl`.
 *
 * Mirrors `mutation-false-positive-coverage.test.ts` (the #328 v1 corpus
 * test) but asserts the v2-specific requirements: v2's own sourceItemId
 * values must resolve against the NEW synthetic sources (not the frozen
 * #253 `multilingual-core-v1.jsonl`), v2 must cover more than the original
 * four predicates (prefer/delete/enable/deadline), and v1+v2 COMBINED must
 * deliver at least 10 items per mutation category (#356's explicit target).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { findWorkspaceRoot, loadDataset, readJson, sha256File } from '../src/io.js';
import type { DatasetItem } from '../src/types.js';

const LANGUAGES = ['en', 'el', 'es', 'id'] as const;
const MUTATION_TYPES = ['negation', 'modality', 'extra-clause', 'literal', 'role'] as const;

interface MutationDatasetItem extends DatasetItem {
  mutationType: string;
  sourceItemId: string;
  semanticDifference: string;
}

const V1_DATASET_PATH = 'datasets/adversarial/mutation-false-positive-v1.jsonl';
const V2_DATASET_PATH = 'datasets/adversarial/mutation-false-positive-v2.jsonl';
const V2_MANIFEST_PATH = 'datasets/manifests/mutation-false-positive-v2.json';
const SOURCES_DATASET_PATH = 'datasets/dev/synthetic-mutation-sources-v1.jsonl';
const SOURCES_MANIFEST_PATH = 'datasets/manifests/synthetic-mutation-sources-v1.json';

test('v2 mutation corpus: manifest hash matches the committed file content', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const manifest = await readJson<{ path: string; sha256: string; items: number }>(path.join(workspaceRoot, V2_MANIFEST_PATH));
  assert.equal(manifest.path, V2_DATASET_PATH);
  const actualHash = await sha256File(path.join(workspaceRoot, V2_DATASET_PATH));
  assert.equal(actualHash, manifest.sha256, 'manifest sha256 must match the actual committed dataset file content');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);
});

test('synthetic mutation sources: manifest hash matches the committed file content', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const manifest = await readJson<{ path: string; sha256: string; items: number }>(path.join(workspaceRoot, SOURCES_MANIFEST_PATH));
  assert.equal(manifest.path, SOURCES_DATASET_PATH);
  const actualHash = await sha256File(path.join(workspaceRoot, SOURCES_DATASET_PATH));
  assert.equal(actualHash, manifest.sha256, 'manifest sha256 must match the actual committed dataset file content');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);
});

test('v2 mutation corpus: loads cleanly, item count matches manifest, every item has required fields', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = (await loadDataset(path.join(workspaceRoot, V2_DATASET_PATH))) as MutationDatasetItem[];
  assert.ok(items.length > 0);
  const manifest = await readJson<{ items: number }>(path.join(workspaceRoot, V2_MANIFEST_PATH));
  assert.equal(items.length, manifest.items);
  for (const item of items) {
    assert.ok(item.id, `every item must have an id (offending item: ${JSON.stringify(item)})`);
    assert.ok(item.sourceText, `${item.id}: sourceText is required`);
    assert.ok(item.goldSem, `${item.id}: goldSem is required`);
    assert.ok(item.sourceLanguage, `${item.id}: sourceLanguage is required`);
    assert.ok(item.mutationType, `${item.id}: mutationType tag is required`);
    assert.ok(item.sourceItemId, `${item.id}: sourceItemId is required`);
    assert.ok(item.semanticDifference?.trim().length, `${item.id}: semanticDifference must state what makes the meaning genuinely different from the source item`);
  }
});

test('v2 mutation corpus: every item id is unique and no id collides with v1', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const v1Items = (await loadDataset(path.join(workspaceRoot, V1_DATASET_PATH))) as MutationDatasetItem[];
  const v2Items = (await loadDataset(path.join(workspaceRoot, V2_DATASET_PATH))) as MutationDatasetItem[];
  const seen = new Set<string>();
  for (const item of v1Items) seen.add(item.id);
  for (const item of v2Items) {
    assert.ok(!seen.has(item.id), `duplicate item id across v1/v2: ${item.id}`);
    seen.add(item.id);
  }
});

test('v2 mutation corpus: every sourceItemId resolves against the NEW synthetic sources, not the frozen #253 dataset', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const sourceItems = await loadDataset(path.join(workspaceRoot, SOURCES_DATASET_PATH));
  const sourceIds = new Set(sourceItems.map((item) => item.id));
  const v2Items = (await loadDataset(path.join(workspaceRoot, V2_DATASET_PATH))) as MutationDatasetItem[];
  for (const item of v2Items) {
    assert.ok(sourceIds.has(item.sourceItemId), `${item.id}: sourceItemId '${item.sourceItemId}' does not exist in ${SOURCES_DATASET_PATH}`);
  }
});

test('v2 mutation corpus: covers more predicates than the original four (prefer/delete/enable/deadline)', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const v2Items = (await loadDataset(path.join(workspaceRoot, V2_DATASET_PATH))) as MutationDatasetItem[];
  const predicates = new Set<string>();
  for (const item of v2Items) {
    const clauses = (item.goldSem as { clauses: { predicate: string }[] }).clauses;
    for (const clause of clauses) predicates.add(clause.predicate);
  }
  const original = new Set(['prefer', 'delete', 'enable', 'deadline']);
  const newPredicates = [...predicates].filter((predicate) => !original.has(predicate));
  assert.ok(newPredicates.length > 0, 'v2 corpus must introduce root predicates beyond the original four');
  // Root predicates specifically (the mutated clause's own action), not nested condition predicates.
  const rootPredicates = new Set(v2Items.map((item) => (item.goldSem as { clauses: { predicate: string }[] }).clauses[0]!.predicate));
  assert.ok(rootPredicates.size >= 4, `expected at least 4 distinct root predicates in v2, found: ${[...rootPredicates].join(', ')}`);
});

test('v2 mutation corpus: combined with v1, every mutation category has at least 10 items (#356 R5.2 target)', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const v1Items = (await loadDataset(path.join(workspaceRoot, V1_DATASET_PATH))) as MutationDatasetItem[];
  const v2Items = (await loadDataset(path.join(workspaceRoot, V2_DATASET_PATH))) as MutationDatasetItem[];
  const counts = new Map<string, number>();
  for (const item of [...v1Items, ...v2Items]) {
    assert.ok((MUTATION_TYPES as readonly string[]).includes(item.mutationType), `${item.id}: unexpected mutationType '${item.mutationType}'`);
    counts.set(item.mutationType, (counts.get(item.mutationType) ?? 0) + 1);
  }
  for (const mutationType of MUTATION_TYPES) {
    const count = counts.get(mutationType) ?? 0;
    assert.ok(count >= 10, `combined v1+v2 category '${mutationType}' has only ${count} items, expected >= 10`);
  }
});

test('v2 mutation corpus: full category x language matrix has no missing combination', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = (await loadDataset(path.join(workspaceRoot, V2_DATASET_PATH))) as MutationDatasetItem[];
  const counts = new Map<string, number>();
  for (const item of items) {
    assert.ok((LANGUAGES as readonly string[]).includes(item.sourceLanguage as (typeof LANGUAGES)[number]), `${item.id}: unexpected sourceLanguage '${item.sourceLanguage}'`);
    const key = `${item.mutationType}:${item.sourceLanguage}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const missing: string[] = [];
  for (const mutationType of MUTATION_TYPES) {
    for (const lang of LANGUAGES) {
      if (!counts.has(`${mutationType}:${lang}`)) missing.push(`${mutationType}:${lang}`);
    }
  }
  assert.deepEqual(missing, [], `missing mutation-type x language combinations in v2: ${missing.join(', ')}`);
});

test('synthetic mutation sources: loads cleanly and every item has a two-level-nested condition (deeper than #253 core)', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = await loadDataset(path.join(workspaceRoot, SOURCES_DATASET_PATH));
  assert.ok(items.length > 0);
  for (const item of items) {
    const clauses = (item.goldSem as { clauses: { conditions?: { conditions?: unknown[] }[] }[] }).clauses;
    const clause = clauses[0]!;
    assert.ok(clause.conditions?.length, `${item.id}: expected a root-level condition`);
    const nested = clause.conditions![0]!.conditions;
    assert.ok(nested && nested.length > 0, `${item.id}: expected a nested condition inside the root condition (2-level nesting)`);
  }
});
