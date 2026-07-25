import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readJson } from '../src/io.js';
import {
  planFalsePositiveReviewExecution,
  validateFalsePositiveReviewManifest,
  type FalsePositiveReviewManifest
} from '../src/false-positive-review-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'false-positive-review');

function makeManifest(overrides: Partial<FalsePositiveReviewManifest> = {}): FalsePositiveReviewManifest {
  return {
    schema: 'openlunum-false-positive-review-manifest/0.1',
    id: 'false-positive-review-fixture',
    baselineCommit: '833b883b2fb0ff7f9d5ef1b4cfd8ed8ac1f18f5e',
    mutationDataset: {
      path: 'packages/eval/test-fixtures/false-positive-review/mutation-dataset.jsonl',
      sha256: 'a05dca14b0bdd196e21da32acdfe6cd51b479700a702f4ef72b83f29bb35ad9c'
    },
    sourceDataset: {
      path: 'packages/eval/test-fixtures/false-positive-review/source-dataset.jsonl',
      sha256: '30ff6ecdd1e5254f2b7b28f54af048f62eabae637589874a5b1f794ac6fee21c'
    },
    expectedItemIds: ['fp-correct-en', 'fp-false-positive-en', 'fp-role-both-en', 'fp-invalid-output-en'],
    limits: { maxItems: 4, maxAttemptsPerItem: 1, maxModelCalls: 4 },
    ...overrides
  };
}

function loadJsonl<T>(file: string): Promise<T[]> {
  return import('node:fs/promises').then(({ readFile }) =>
    readFile(file, 'utf8').then((content) => content.trim().split(/\r?\n/u).map((line) => JSON.parse(line) as T))
  );
}

test('false-positive review manifest fixture validates and yields a deterministic plan', async () => {
  const manifest = await readJson<FalsePositiveReviewManifest>(path.join(FIXTURE_ROOT, 'review-manifest.json'));
  const mutationDataset = await loadJsonl<{ id: string; sourceItemId: string }>(path.join(FIXTURE_ROOT, 'mutation-dataset.jsonl'));
  const sourceDataset = await loadJsonl<{ id: string }>(path.join(FIXTURE_ROOT, 'source-dataset.jsonl'));

  const validated = validateFalsePositiveReviewManifest(manifest);
  const plan = planFalsePositiveReviewExecution(validated, mutationDataset, sourceDataset);

  assert.deepStrictEqual(plan.plannedItemIds, ['fp-correct-en', 'fp-false-positive-en', 'fp-role-both-en', 'fp-invalid-output-en']);
  assert.strictEqual(plan.parseCalls, 4);
  assert.strictEqual(plan.totalModelCalls, 4);
  assert.strictEqual(plan.sourceItemIdByItemId.get('fp-correct-en'), 'preference-en');
  assert.strictEqual(plan.sourceItemIdByItemId.get('fp-role-both-en'), 'delete-en');
});

test('false-positive review manifest rejects duplicate expected item IDs', () => {
  const manifest = makeManifest({ expectedItemIds: ['fp-correct-en', 'fp-correct-en'] });
  assert.throws(() => validateFalsePositiveReviewManifest(manifest), { message: /duplicate item IDs/ });
});

test('false-positive review manifest rejects truncating maxItems', () => {
  const manifest = makeManifest({ limits: { maxItems: 2, maxAttemptsPerItem: 1, maxModelCalls: 4 } });
  assert.throws(() => validateFalsePositiveReviewManifest(manifest), { message: /would truncate expected false-positive review coverage/ });
});

test('false-positive review manifest rejects insufficient model-call budget', () => {
  const manifest = makeManifest({ limits: { maxItems: 4, maxAttemptsPerItem: 1, maxModelCalls: 3 } });
  assert.throws(() => validateFalsePositiveReviewManifest(manifest), { message: /insufficient for the declared false-positive review plan/ });
});

test('false-positive review manifest rejects a malformed dataset sha256', () => {
  const manifest = makeManifest({ mutationDataset: { path: 'x', sha256: 'not-a-hash' } });
  assert.throws(() => validateFalsePositiveReviewManifest(manifest), { message: /64-character hex digest/ });
});

test('false-positive review plan rejects missing expected item IDs from the mutation dataset', async () => {
  const manifest = makeManifest();
  const mutationDataset = [
    { id: 'fp-correct-en', sourceItemId: 'preference-en' },
    { id: 'fp-false-positive-en', sourceItemId: 'battery-en' }
  ];
  const sourceDataset = [{ id: 'preference-en' }, { id: 'battery-en' }];

  assert.throws(() => planFalsePositiveReviewExecution(manifest, mutationDataset, sourceDataset), { message: /missing expected item IDs/ });
});

test('false-positive review plan rejects unexpected item IDs in the mutation dataset', async () => {
  const manifest = makeManifest();
  const mutationDataset = [
    { id: 'fp-correct-en', sourceItemId: 'preference-en' },
    { id: 'fp-false-positive-en', sourceItemId: 'battery-en' },
    { id: 'fp-role-both-en', sourceItemId: 'delete-en' },
    { id: 'fp-invalid-output-en', sourceItemId: 'deadline-en' },
    { id: 'fp-extra-en', sourceItemId: 'preference-en' }
  ];
  const sourceDataset = [{ id: 'preference-en' }, { id: 'battery-en' }, { id: 'delete-en' }, { id: 'deadline-en' }];

  assert.throws(() => planFalsePositiveReviewExecution(manifest, mutationDataset, sourceDataset), { message: /unexpected item IDs/ });
});

test('false-positive review plan rejects a sourceItemId that does not exist in the source dataset', async () => {
  const manifest = makeManifest();
  const mutationDataset = [
    { id: 'fp-correct-en', sourceItemId: 'does-not-exist' },
    { id: 'fp-false-positive-en', sourceItemId: 'battery-en' },
    { id: 'fp-role-both-en', sourceItemId: 'delete-en' },
    { id: 'fp-invalid-output-en', sourceItemId: 'deadline-en' }
  ];
  const sourceDataset = [{ id: 'preference-en' }, { id: 'battery-en' }, { id: 'delete-en' }, { id: 'deadline-en' }];

  assert.throws(
    () => planFalsePositiveReviewExecution(manifest, mutationDataset, sourceDataset),
    { message: /does not exist in sourceDataset/ }
  );
});

test('false-positive review plan rejects empty matrices', () => {
  const manifest = makeManifest({ expectedItemIds: [], limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 } as never });
  assert.throws(() => validateFalsePositiveReviewManifest(manifest), { message: /must not be empty/ });
});
