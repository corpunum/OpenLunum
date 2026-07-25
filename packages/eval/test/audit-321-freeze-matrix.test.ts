import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { readJson, sha256File, loadDataset, validateManifest, validateProfile } from '../src/io.js';
import { validateRetentionManifest, planRetentionExecution, type RetentionCoverageManifest } from '../src/retention-manifest.js';
import type { ExperimentManifest, ModelProfile } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MATRIX_DIR = path.join(WORKSPACE_ROOT, 'experiments', 'audit-321-freeze');

const MODEL_SLUGS = ['qwen36-35b', 'qwen3-coder-30b'] as const;
const LANGUAGES = ['en', 'el', 'es', 'id'] as const;
const ITEM_GROUPS = ['preference', 'delete', 'battery', 'deadline'] as const;

type ModelSlug = (typeof MODEL_SLUGS)[number];
type Language = (typeof LANGUAGES)[number];

// Matrix shape (post-review): parse-experiment.ts (packages/eval/src/parse-experiment.ts,
// ~lines 115-130 and ~204-235) buckets the loaded dataset by sourceLanguage natively and
// emits report-{lang}.md / parse-results-{lang}.jsonl for every language present in a single
// run. It has no per-language dataset filter. One parse manifest per model (covering the full
// 16-item dataset) therefore already yields all 4 per-language parse reports per model -- 4
// per-language parse manifests would only multiply model calls 4x for identical evidence, so
// there are 2 parse manifests total (one per model), not 8.
//
// Retention manifests are ALSO one per model, for a different but equally hard reason (#325):
// planRetentionExecution (packages/eval/src/retention-manifest.ts, ~lines 138-149) requires
// expectedItemIds to match the loaded dataset EXACTLY -- it rejects any dataset item not listed
// and asserts equal lengths. The retention CLI loads the full 16-item dataset, so a 4-item
// per-language manifest can never execute; the original 8 per-language manifests all failed at
// validation with "dataset contains unexpected item IDs". Per-language retention evidence is
// therefore derived at aggregation time from the language suffix on each item id.
//
// The test that previously guarded these manifests passed a PRE-FILTERED dataset to
// planRetentionExecution, which is not the call the CLI makes -- so it went green on manifests
// that could not run. The retention test below deliberately passes the FULL dataset, exactly as
// packages/eval/src/retention-cli.ts does. Do not reintroduce filtering here: that filtering is
// precisely what concealed the defect.
const EXPECTED_PARSE_FILE_COUNT = MODEL_SLUGS.length; // 2
const EXPECTED_RETENTION_FILE_COUNT = MODEL_SLUGS.length; // 2
const EXPECTED_TOTAL_FILE_COUNT = EXPECTED_PARSE_FILE_COUNT + EXPECTED_RETENTION_FILE_COUNT; // 4

function parseParseFileName(file: string): { modelSlug: ModelSlug } | null {
  const base = file.replace(/\.json$/u, '');
  if (!base.startsWith('parse-')) return null;
  const modelSlug = base.slice('parse-'.length);
  if ((MODEL_SLUGS as readonly string[]).includes(modelSlug)) {
    return { modelSlug: modelSlug as ModelSlug };
  }
  return null;
}

function parseRetentionFileName(file: string): { modelSlug: ModelSlug } | null {
  const base = file.replace(/\.json$/u, '');
  if (!base.startsWith('retention-')) return null;
  const modelSlug = base.slice('retention-'.length);
  if ((MODEL_SLUGS as readonly string[]).includes(modelSlug)) {
    return { modelSlug: modelSlug as ModelSlug };
  }
  return null;
}

async function listMatrixFiles(): Promise<string[]> {
  const entries = await readdir(MATRIX_DIR);
  return entries.filter((entry) => entry.endsWith('.json')).sort();
}

test('audit-321-freeze matrix directory contains exactly the expected 4 files (2 parse + 2 retention)', async () => {
  const files = await listMatrixFiles();
  assert.strictEqual(files.length, EXPECTED_TOTAL_FILE_COUNT);

  const parseFiles = files.filter((file) => file.startsWith('parse-'));
  const retentionFiles = files.filter((file) => file.startsWith('retention-'));
  assert.strictEqual(parseFiles.length, EXPECTED_PARSE_FILE_COUNT);
  assert.strictEqual(retentionFiles.length, EXPECTED_RETENTION_FILE_COUNT);
  assert.strictEqual(parseFiles.length + retentionFiles.length, files.length);

  for (const file of parseFiles) {
    assert.ok(parseParseFileName(file), `parse file ${file} does not match the <task>-<model>.json naming scheme`);
  }
  for (const file of retentionFiles) {
    assert.ok(parseRetentionFileName(file), `retention file ${file} does not match the <task>-<model>.json naming scheme`);
  }
});

test('audit-321-freeze matrix has no missing or duplicate model combination for either task', async () => {
  const files = await listMatrixFiles();

  const parseSeen = new Set<string>();
  for (const file of files.filter((file) => file.startsWith('parse-'))) {
    const entry = parseParseFileName(file);
    assert.ok(entry);
    const key = entry!.modelSlug;
    assert.strictEqual(parseSeen.has(key), false, `duplicate parse combination: ${key}`);
    parseSeen.add(key);
  }
  assert.deepStrictEqual(parseSeen, new Set(MODEL_SLUGS));

  const retentionSeen = new Set<string>();
  for (const file of files.filter((file) => file.startsWith('retention-'))) {
    const entry = parseRetentionFileName(file);
    assert.ok(entry);
    const key = entry!.modelSlug;
    assert.strictEqual(retentionSeen.has(key), false, `duplicate retention combination: ${key}`);
    retentionSeen.add(key);
  }
  assert.deepStrictEqual(retentionSeen, new Set(MODEL_SLUGS));
});

test('every parse manifest in the audit-321-freeze matrix loads through the real experiment validator', async () => {
  const files = await listMatrixFiles();
  const parseFiles = files.filter((file) => file.startsWith('parse-'));
  assert.strictEqual(parseFiles.length, EXPECTED_PARSE_FILE_COUNT);

  for (const file of parseFiles) {
    const entry = parseParseFileName(file);
    assert.ok(entry);
    const manifest = await readJson<ExperimentManifest>(path.join(MATRIX_DIR, file));

    // Real validator, unmodified.
    assert.doesNotThrow(() => validateManifest(manifest));

    assert.strictEqual(manifest.deterministic, false);
    assert.strictEqual(manifest.limits.maxItems, 16);
    assert.strictEqual(manifest.limits.maxAttemptsPerItem, 1);
    assert.strictEqual(manifest.limits.maxModelCalls, 16);
    assert.ok(manifest.outputDirectory.includes(entry!.modelSlug));
    // One manifest covers all 4 languages natively (parse-experiment.ts buckets by
    // sourceLanguage); there is no single targetLanguage to freeze here.
    assert.strictEqual(manifest.targetLanguage, undefined);

    // Dataset hash actually matches the committed dataset file on disk (not just regex-shaped).
    assert.ok(manifest.dataset);
    const datasetPath = path.join(WORKSPACE_ROOT, manifest.dataset!.path);
    const actualHash = await sha256File(datasetPath);
    assert.strictEqual(actualHash, manifest.dataset!.sha256);

    // Model profile referenced by the manifest is itself real, loadable, and passes the real profile validator.
    assert.ok(manifest.modelProfile);
    const profilePath = path.join(WORKSPACE_ROOT, manifest.modelProfile!);
    const profile = await readJson<ModelProfile>(profilePath);
    assert.doesNotThrow(() => validateProfile(profile));
    assert.strictEqual(profile.baseUrl, 'http://127.0.0.1:8080/v1');
    assert.strictEqual(profile.maxTokens, 4096);
  }
});

test('every retention manifest in the audit-321-freeze matrix loads through the real retention validator, plans cleanly, and allows no retries', async () => {
  const files = await listMatrixFiles();
  const retentionFiles = files.filter((file) => file.startsWith('retention-'));
  assert.strictEqual(retentionFiles.length, EXPECTED_RETENTION_FILE_COUNT);

  const fullDataset = await loadDataset(path.join(WORKSPACE_ROOT, 'datasets', 'dev', 'multilingual-core-v1.jsonl'));

  for (const file of retentionFiles) {
    const entry = parseRetentionFileName(file);
    assert.ok(entry);
    const manifest = await readJson<RetentionCoverageManifest>(path.join(MATRIX_DIR, file));

    // Real validator, unmodified. No retention gate thresholds are touched here.
    const validated = validateRetentionManifest(manifest);

    // expectedItemIds must cover the ENTIRE dataset, in dataset order. Anything narrower is
    // rejected by planRetentionExecution below, which is the defect #325 fixes.
    const datasetIds = fullDataset.map((item) => item.id);
    assert.deepStrictEqual(validated.expectedItemIds, datasetIds);
    assert.strictEqual(validated.expectedItemIds.length, 16);

    // All four languages are covered by this single manifest, so per-language retention
    // evidence remains derivable from the item-id suffix at aggregation time.
    for (const language of LANGUAGES) {
      for (const group of ITEM_GROUPS) {
        assert.ok(
          validated.expectedItemIds.includes(`${group}-${language}`),
          `retention manifest ${file} is missing dataset item ${group}-${language}`
        );
      }
    }

    // No silent retry/exclusion of failed items: exactly one attempt per item, one realization
    // call and one parse-back call each (16 items x 1 attempt x 2 stages = 32).
    assert.strictEqual(validated.limits.maxItems, 16);
    assert.strictEqual(validated.limits.maxAttemptsPerItem, 1);
    assert.strictEqual(validated.limits.maxModelCalls, 32);

    // Dataset hash actually matches the committed dataset file on disk.
    const datasetPath = path.join(WORKSPACE_ROOT, manifest.dataset.path);
    const actualHash = await sha256File(datasetPath);
    assert.strictEqual(actualHash, manifest.dataset.sha256);

    // Plan against the FULL dataset, exactly as packages/eval/src/retention-cli.ts does.
    // The previous version of this test pre-filtered the dataset to the manifest's own
    // expectedItemIds, which is not a call the CLI ever makes -- that filtering is what let
    // eight unrunnable per-language manifests pass review and reach a live audit run (#325).
    const plan = planRetentionExecution(validated, fullDataset as any);
    assert.deepStrictEqual(plan.plannedItemIds, datasetIds);
    assert.strictEqual(plan.totalModelCalls, validated.limits.maxModelCalls);
    assert.strictEqual(plan.totalModelCalls, 32);

    // Audit-tracking-only fields (not part of the openlunum-retention-manifest/0.1 schema).
    assert.strictEqual((manifest as any).deterministic, false);
    assert.ok(String((manifest as any).outputDirectory ?? '').includes(entry!.modelSlug));
    assert.ok(String((manifest as any).intendedModelProfile ?? '').length > 0);
    // One manifest per model covers every language; no single targetLanguage to freeze.
    assert.strictEqual((manifest as any).targetLanguage, undefined);
  }
});

test('every item id referenced anywhere in the audit-321-freeze matrix exists in the committed dataset', async () => {
  const fullDataset = await loadDataset(path.join(WORKSPACE_ROOT, 'datasets', 'dev', 'multilingual-core-v1.jsonl'));
  const datasetIds = new Set(fullDataset.map((item) => item.id));

  const files = await listMatrixFiles();
  const retentionFiles = files.filter((file) => file.startsWith('retention-'));

  for (const file of retentionFiles) {
    const manifest = await readJson<RetentionCoverageManifest>(path.join(MATRIX_DIR, file));
    for (const id of manifest.expectedItemIds) {
      assert.ok(datasetIds.has(id), `expectedItemIds references non-existent dataset item: ${id}`);
    }
  }
});
