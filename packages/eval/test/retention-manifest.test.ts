import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readJson } from '../src/io.js';
import { planRetentionExecution, validateRetentionManifest, type RetentionCoverageManifest } from '../src/retention-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');

function makeManifest(overrides: Partial<RetentionCoverageManifest> = {}): RetentionCoverageManifest {
  return {
    schema: 'openlunum-retention-manifest/0.1',
    id: 'retention-coverage-contract',
    baselineCommit: '833b883b2fb0ff7f9d5ef1b4cfd8ed8ac1f18f5e',
    dataset: {
      path: 'packages/eval/test-fixtures/retention/coverage-dataset.json',
      sha256: 'dc91c3f48449bb8d8236af9dbe52970e5886fe44bd91fb3e1e0387c5a02a5b57'
    },
    expectedItemIds: ['retention-item-a', 'retention-item-b', 'retention-item-c'],
    limits: { maxItems: 3, maxAttemptsPerItem: 2, maxModelCalls: 12 },
    ...overrides
  };
}

test('retention manifest fixture validates and yields a deterministic plan', async () => {
  const manifest = await readJson<RetentionCoverageManifest>(path.join(FIXTURE_ROOT, 'coverage-manifest.json'));
  const dataset = await readJson<Array<{ id: string }>>(path.join(FIXTURE_ROOT, 'coverage-dataset.json'));

  const validated = validateRetentionManifest(manifest);
  const plan = planRetentionExecution(validated, dataset as any);

  assert.deepStrictEqual(validated.expectedItemIds, ['retention-item-a', 'retention-item-b', 'retention-item-c']);
  assert.deepStrictEqual(plan.plannedItemIds, ['retention-item-a', 'retention-item-b', 'retention-item-c']);
  assert.strictEqual(plan.realizationCalls, 6);
  assert.strictEqual(plan.parseBackCalls, 6);
  assert.strictEqual(plan.totalModelCalls, 12);
});

test('retention manifest rejects duplicate expected item IDs', () => {
  const manifest = makeManifest({ expectedItemIds: ['retention-item-a', 'retention-item-a'] });
  assert.throws(() => validateRetentionManifest(manifest), { message: /duplicate item IDs/ });
});

test('retention manifest rejects truncating maxItems', () => {
  const manifest = makeManifest({ limits: { maxItems: 2, maxAttemptsPerItem: 2, maxModelCalls: 12 } });
  assert.throws(() => validateRetentionManifest(manifest), { message: /would truncate expected retention coverage/ });
});

test('retention manifest rejects insufficient model-call budget', () => {
  const manifest = makeManifest({ limits: { maxItems: 3, maxAttemptsPerItem: 2, maxModelCalls: 11 } });
  assert.throws(() => validateRetentionManifest(manifest), { message: /insufficient for the declared retention plan/ });
});

test('retention plan rejects missing expected item IDs', async () => {
  const manifest = makeManifest();
  const dataset = [
    { id: 'retention-item-a' },
    { id: 'retention-item-b' }
  ];

  assert.throws(() => planRetentionExecution(manifest, dataset as any), { message: /missing expected item IDs/ });
});

test('retention plan rejects unexpected item IDs', async () => {
  const manifest = makeManifest();
  const dataset = [
    { id: 'retention-item-a' },
    { id: 'retention-item-b' },
    { id: 'retention-item-c' },
    { id: 'retention-item-d' }
  ];

  assert.throws(() => planRetentionExecution(manifest, dataset as any), { message: /unexpected item IDs/ });
});

test('retention plan rejects empty matrices', async () => {
  const manifest = makeManifest({ expectedItemIds: [], limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 } as any });
  const dataset: Array<{ id: string }> = [];

  assert.throws(() => validateRetentionManifest(manifest), { message: /must not be empty/ });
  assert.throws(() => planRetentionExecution(manifest as any, dataset as any), { message: /must not be empty/ });
});

test('retention plan rejects duplicate dataset IDs', () => {
  const manifest = makeManifest();
  const dataset = [
    { id: 'retention-item-a' },
    { id: 'retention-item-b' },
    { id: 'retention-item-b' }
  ];

  assert.throws(() => planRetentionExecution(manifest, dataset as any), { message: /duplicate item IDs/ });
});
