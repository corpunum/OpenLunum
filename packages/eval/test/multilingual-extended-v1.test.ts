/**
 * Tests for the #353 held-out corpus extension and repeated-run parse manifests.
 *
 * Part 1 (R2.1): datasets/dev/multilingual-extended-v1.jsonl adds 4 new semantic
 * groups (reminder, consent, belief, plan) x 4 languages (en/el/es/id), disjoint
 * from the frozen multilingual-core-v1 groups (preference, delete, battery,
 * deadline). This file asserts the new dataset loads through the real
 * `loadDataset`, every item validates through the real `validateSem`, there are
 * no id collisions with the core dataset, and language x group coverage for the
 * new groups has no gaps or duplicates. It also re-verifies (without modifying)
 * that the frozen core dataset's hash is untouched.
 *
 * Part 2 (R2.6): experiments/audit-353-repeated/parse-<model>-x3-run{1,2,3}.json
 * are 3 independent single-attempt manifests per model over the SAME frozen
 * multilingual-core-v1 dataset. This file asserts each loads through the real
 * `validateManifest`, references the untouched core dataset hash and an
 * unmodified #321 model profile, uses maxAttemptsPerItem=1 (an honest single
 * sample, not a masked retry), and that the 2-model x 3-run matrix has no
 * missing or duplicate combination.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { validateSem } from '@corpunum/lunum';
import { loadDataset, readJson, sha256File, validateManifest, validateProfile } from '../src/io.js';
import type { DatasetItem, ExperimentManifest, ModelProfile } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const CORE_DATASET_PATH = path.join(WORKSPACE_ROOT, 'datasets', 'dev', 'multilingual-core-v1.jsonl');
const CORE_DATASET_SHA256 = '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873';
const CORE_GROUPS = ['preference', 'delete', 'battery', 'deadline'] as const;

const EXTENDED_DATASET_PATH = path.join(WORKSPACE_ROOT, 'datasets', 'dev', 'multilingual-extended-v1.jsonl');
const EXTENDED_MANIFEST_PATH = path.join(WORKSPACE_ROOT, 'datasets', 'manifests', 'multilingual-extended-v1.json');
const EXTENDED_GROUPS = ['reminder', 'consent', 'belief', 'plan'] as const;
const LANGUAGES = ['en', 'el', 'es', 'id'] as const;

interface DatasetManifest {
  id: string;
  path: string;
  sha256: string;
  items: number;
  languages: string[];
  status: string;
  warning: string;
}

test('#353 part 1: the frozen core dataset hash is untouched', async () => {
  const actualHash = await sha256File(CORE_DATASET_PATH);
  assert.strictEqual(actualHash, CORE_DATASET_SHA256, 'multilingual-core-v1.jsonl must not be modified by #353');
});

test('#353 part 1: multilingual-extended-v1.jsonl loads via the real loadDataset', async () => {
  const items = await loadDataset(EXTENDED_DATASET_PATH);
  assert.strictEqual(items.length, 16, 'expected 4 new groups x 4 languages = 16 items');
});

test('#353 part 1: every extended-dataset item has a schema-valid goldSem per the real validateSem', async () => {
  const items = await loadDataset(EXTENDED_DATASET_PATH);
  assert.ok(items.length > 0);
  for (const item of items) {
    const result = validateSem(item.goldSem);
    assert.ok(result.ok, `item ${item.id} failed validateSem: ${result.errors.join('; ')}`);
  }
});

test('#353 part 1: extended dataset uses only NEW semantic groups, disjoint from the frozen core groups', async () => {
  const items = await loadDataset(EXTENDED_DATASET_PATH);
  const seenGroups = new Set<string>();
  for (const item of items) {
    assert.ok(item.semanticGroup, `item ${item.id} is missing semanticGroup`);
    assert.ok(
      !(CORE_GROUPS as readonly string[]).includes(item.semanticGroup!),
      `item ${item.id} reuses an existing core semantic group (${item.semanticGroup}); #353 requires genuinely new groups`
    );
    seenGroups.add(item.semanticGroup!);
  }
  assert.deepStrictEqual(seenGroups, new Set(EXTENDED_GROUPS));
});

test('#353 part 1: extended dataset has full language x new-group coverage with no gaps or duplicates', async () => {
  const items = await loadDataset(EXTENDED_DATASET_PATH);
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = `${item.semanticGroup}-${item.sourceLanguage}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  for (const group of EXTENDED_GROUPS) {
    for (const language of LANGUAGES) {
      const key = `${group}-${language}`;
      assert.strictEqual(seen.get(key), 1, `expected exactly one item for ${key}, found ${seen.get(key) ?? 0}`);
    }
  }
  // No coverage cells beyond the expected 4 groups x 4 languages = 16.
  assert.strictEqual(seen.size, EXTENDED_GROUPS.length * LANGUAGES.length);
});

test('#353 part 1: extended-dataset item ids collide with neither each other nor the frozen core dataset', async () => {
  const extendedItems = await loadDataset(EXTENDED_DATASET_PATH);
  const coreItems = await loadDataset(CORE_DATASET_PATH);

  const extendedIds = extendedItems.map((item) => item.id);
  assert.strictEqual(new Set(extendedIds).size, extendedIds.length, 'duplicate ids within multilingual-extended-v1.jsonl');

  const coreIds = new Set(coreItems.map((item) => item.id));
  for (const id of extendedIds) {
    assert.ok(!coreIds.has(id), `extended-dataset id ${id} collides with a core-dataset id`);
  }

  // Every extended id follows the same <group>-<language> convention as the core dataset,
  // and the expected id for every coverage cell is actually present.
  for (const group of EXTENDED_GROUPS) {
    for (const language of LANGUAGES) {
      const expectedId = `${group}-${language}`;
      assert.ok(extendedIds.includes(expectedId), `missing expected item id ${expectedId}`);
    }
  }
});

test('#353 part 1: extended-dataset manifest matches the committed conventions and a real computed SHA-256', async () => {
  const manifest = await readJson<DatasetManifest>(EXTENDED_MANIFEST_PATH);
  assert.strictEqual(manifest.id, 'multilingual-extended-v1');
  assert.strictEqual(manifest.path, 'datasets/dev/multilingual-extended-v1.jsonl');
  assert.strictEqual(manifest.items, 16);
  assert.deepStrictEqual(manifest.languages, ['en', 'el', 'es', 'id']);
  assert.strictEqual(manifest.status, 'development');
  assert.ok(manifest.warning.length > 0);

  const actualHash = await sha256File(EXTENDED_DATASET_PATH);
  assert.strictEqual(actualHash, manifest.sha256, 'manifest sha256 must equal the real computed hash of the dataset file');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);
});

test('#353 part 1: every extended-dataset item is unique across id, sourceText and semanticGroup+language pairing', async () => {
  const items = await loadDataset(EXTENDED_DATASET_PATH);
  const sourceTexts = items.map((item) => item.sourceText);
  assert.strictEqual(new Set(sourceTexts).size, sourceTexts.length, 'duplicate sourceText across extended-dataset items');
});

// ── Part 2: repeated-run manifests (R2.6) ──────────────────────────────────

const REPEATED_DIR = path.join(WORKSPACE_ROOT, 'experiments', 'audit-353-repeated');
const MODEL_SLUGS = ['qwen36-35b', 'qwen3-coder-30b'] as const;
const RUNS = [1, 2, 3] as const;

function parseRepeatedFileName(file: string): { modelSlug: (typeof MODEL_SLUGS)[number]; run: number } | null {
  const match = /^parse-(.+)-x3-run(\d+)\.json$/u.exec(file);
  if (!match) return null;
  const [, modelSlug, runStr] = match;
  if (!(MODEL_SLUGS as readonly string[]).includes(modelSlug!)) return null;
  return { modelSlug: modelSlug as (typeof MODEL_SLUGS)[number], run: Number(runStr) };
}

async function listRepeatedFiles(): Promise<string[]> {
  const entries = await readdir(REPEATED_DIR);
  return entries.filter((entry) => entry.endsWith('.json')).sort();
}

test('#353 part 2: audit-353-repeated directory contains exactly the expected 6 files (2 models x 3 runs)', async () => {
  const files = await listRepeatedFiles();
  assert.strictEqual(files.length, MODEL_SLUGS.length * RUNS.length);
  for (const file of files) {
    assert.ok(parseRepeatedFileName(file), `${file} does not match the parse-<model>-x3-run<N>.json naming scheme`);
  }
});

test('#353 part 2: repeated-run matrix has no missing or duplicate model x run combination', async () => {
  const files = await listRepeatedFiles();
  const seen = new Set<string>();
  for (const file of files) {
    const entry = parseRepeatedFileName(file);
    assert.ok(entry);
    const key = `${entry!.modelSlug}-run${entry!.run}`;
    assert.strictEqual(seen.has(key), false, `duplicate combination: ${key}`);
    seen.add(key);
  }
  const expected = new Set<string>();
  for (const slug of MODEL_SLUGS) for (const run of RUNS) expected.add(`${slug}-run${run}`);
  assert.deepStrictEqual(seen, expected);
});

test('#353 part 2: every repeated-run manifest loads through the real experiment validator, targets the frozen core dataset unmodified, and takes exactly one honest sample per item', async () => {
  const files = await listRepeatedFiles();
  assert.strictEqual(files.length, 6);

  for (const file of files) {
    const entry = parseRepeatedFileName(file);
    assert.ok(entry);
    const manifest = await readJson<ExperimentManifest>(path.join(REPEATED_DIR, file));

    // Real validator, unmodified.
    assert.doesNotThrow(() => validateManifest(manifest));

    assert.strictEqual(manifest.deterministic, false);
    assert.strictEqual(manifest.limits.maxItems, 16);
    // maxAttemptsPerItem=1 is deliberate: parse-experiment.ts's retry loop breaks on the first
    // passing attempt and discards prior attempts, so N>1 here would NOT collect independent
    // samples -- it would mask sampling variance behind retry-until-pass behavior. One honest
    // sample per manifest, repeated across 3 separate manifests (run1/run2/run3), is the
    // manifest-level mechanism for repeated measurement without touching the runner.
    assert.strictEqual(manifest.limits.maxAttemptsPerItem, 1);
    assert.strictEqual(manifest.limits.maxModelCalls, 16);

    // Same gates as the frozen #321 baselines -- this issue does not touch thresholds.
    assert.strictEqual(manifest.gates.minimumFeatureRecall, 0.95);
    assert.strictEqual(manifest.gates.minimumExactRate, 0.75);
    assert.strictEqual(manifest.gates.requireProtectedLiteralCoverage, false);

    // Targets the SAME frozen core dataset used by #321/#339/#344, not the new #353 extended one --
    // repeated-run variance must be measured on already-characterized items.
    assert.ok(manifest.dataset);
    assert.strictEqual(manifest.dataset!.path, 'datasets/dev/multilingual-core-v1.jsonl');
    assert.strictEqual(manifest.dataset!.sha256, CORE_DATASET_SHA256);
    const datasetPath = path.join(WORKSPACE_ROOT, manifest.dataset!.path);
    const actualHash = await sha256File(datasetPath);
    assert.strictEqual(actualHash, manifest.dataset!.sha256);

    // Model profile is the SAME unmodified profile used by the #321 single-run baseline for
    // this model slug -- repeated measurement varies the run, not the model configuration.
    assert.ok(manifest.modelProfile);
    assert.strictEqual(manifest.modelProfile, `profiles/models/${entry!.modelSlug}-live.json`);
    const profilePath = path.join(WORKSPACE_ROOT, manifest.modelProfile!);
    const profile = await readJson<ModelProfile>(profilePath);
    assert.doesNotThrow(() => validateProfile(profile));

    // Each run writes to its own directory, so 3 runs never clobber each other's output.
    assert.ok(manifest.outputDirectory.includes(entry!.modelSlug));
    assert.ok(manifest.outputDirectory.endsWith(`run${entry!.run}`));
  }
});

test('#353 part 2: each repeated-run manifest id is unique and encodes both model and run number', async () => {
  const files = await listRepeatedFiles();
  const ids = new Set<string>();
  for (const file of files) {
    const entry = parseRepeatedFileName(file);
    assert.ok(entry);
    const manifest = await readJson<ExperimentManifest>(path.join(REPEATED_DIR, file));
    assert.ok(manifest.id.includes(entry!.modelSlug));
    assert.ok(manifest.id.includes(`run${entry!.run}`));
    assert.strictEqual(ids.has(manifest.id), false, `duplicate manifest id: ${manifest.id}`);
    ids.add(manifest.id);
  }
  assert.strictEqual(ids.size, 6);
});
