/**
 * Coverage test for #356's held-out scorer eval set (readiness R5.3):
 * `datasets/dev/scorer-eval-heldout-v1.jsonl`.
 *
 * This is an independent positive/negative pair set for measuring the
 * near-semantic scorer's GENERAL behavior -- NOT derived from #346's
 * role-binding fix. Every pair carries its own gold LunumSem structures
 * (semA/semB) and an expectedSimilar label; this test checks the dataset's
 * structural integrity AND -- the whole point of a held-out eval set --
 * that every gold label actually matches what the real, unmodified
 * `NearSemanticFingerprintGenerator` at the frozen 0.8 threshold produces.
 * If this test ever fails, either the dataset's labels are wrong or the
 * scorer changed; either way it needs eyes, not a silent skip.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { NearSemanticFingerprintGenerator } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File } from '../src/io.js';

const DATASET_PATH = 'datasets/dev/scorer-eval-heldout-v1.jsonl';
const MANIFEST_PATH = 'datasets/manifests/scorer-eval-heldout-v1.json';
const LANGUAGES = ['en', 'el', 'es', 'id'];

interface HeldoutPairItem {
  id: string;
  label: 'positive' | 'negative';
  sourceLanguage: string;
  textA: string;
  textB: string;
  semA: LunumSem;
  semB: LunumSem;
  expectedSimilar: boolean;
  rationale: string;
}

test('scorer-eval heldout: manifest hash matches the committed file content', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const manifest = await readJson<{ path: string; sha256: string; items: number; positiveItems: number; negativeItems: number }>(path.join(workspaceRoot, MANIFEST_PATH));
  assert.equal(manifest.path, DATASET_PATH);
  const actualHash = await sha256File(path.join(workspaceRoot, DATASET_PATH));
  assert.equal(actualHash, manifest.sha256);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);
});

test('scorer-eval heldout: loads cleanly, item count and positive/negative split match manifest', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = (await loadDataset(path.join(workspaceRoot, DATASET_PATH))) as unknown as HeldoutPairItem[];
  const manifest = await readJson<{ items: number; positiveItems: number; negativeItems: number }>(path.join(workspaceRoot, MANIFEST_PATH));
  assert.equal(items.length, manifest.items);
  assert.equal(items.filter((item) => item.label === 'positive').length, manifest.positiveItems);
  assert.equal(items.filter((item) => item.label === 'negative').length, manifest.negativeItems);
});

test('scorer-eval heldout: every item has required fields and consistent label/expectedSimilar', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = (await loadDataset(path.join(workspaceRoot, DATASET_PATH))) as unknown as HeldoutPairItem[];
  assert.ok(items.length > 0);
  const seen = new Set<string>();
  for (const item of items) {
    assert.ok(item.id, `every item must have an id`);
    assert.ok(!seen.has(item.id), `duplicate item id: ${item.id}`);
    seen.add(item.id);
    assert.ok(['positive', 'negative'].includes(item.label), `${item.id}: unexpected label '${item.label}'`);
    assert.ok(LANGUAGES.includes(item.sourceLanguage), `${item.id}: unexpected sourceLanguage '${item.sourceLanguage}'`);
    assert.ok(item.textA?.trim().length, `${item.id}: textA is required`);
    assert.ok(item.textB?.trim().length, `${item.id}: textB is required`);
    assert.ok(item.semA?.clauses?.length, `${item.id}: semA.clauses is required`);
    assert.ok(item.semB?.clauses?.length, `${item.id}: semB.clauses is required`);
    assert.ok(item.rationale?.trim().length, `${item.id}: rationale must explain the expected label`);
    assert.equal(item.expectedSimilar, item.label === 'positive', `${item.id}: expectedSimilar must agree with label`);
  }
});

test('scorer-eval heldout: no item references another dataset file (genuinely independent of the mutation corpus)', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = (await loadDataset(path.join(workspaceRoot, DATASET_PATH))) as unknown as HeldoutPairItem[];
  for (const item of items) {
    assert.ok(!('sourceItemId' in item), `${item.id}: held-out items must not reference another corpus item (sourceItemId found) -- they must be self-contained`);
  }
});

test('scorer-eval heldout: every gold label matches the real, unmodified near-semantic scorer at the frozen 0.8 threshold', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const items = (await loadDataset(path.join(workspaceRoot, DATASET_PATH))) as unknown as HeldoutPairItem[];
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const mismatches: string[] = [];
  for (const item of items) {
    const result = generator.compareSem(item.semA, item.semB, {});
    if (result.similar !== item.expectedSimilar) {
      mismatches.push(`${item.id}: expected similar=${item.expectedSimilar}, scorer produced similar=${result.similar} (score=${result.similarity.toFixed(3)})`);
    }
  }
  assert.deepEqual(mismatches, [], `held-out gold labels disagree with the live scorer:\n${mismatches.join('\n')}`);
});
