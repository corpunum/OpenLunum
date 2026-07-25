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
// Retention manifests use `expectedItemIds` for genuine per-language isolation via
// planRetentionExecution, so the 2 models x 4 languages = 8 retention manifests remain
// per-language, one file per model-language pair.
const EXPECTED_PARSE_FILE_COUNT = MODEL_SLUGS.length; // 2
const EXPECTED_RETENTION_FILE_COUNT = MODEL_SLUGS.length * LANGUAGES.length; // 8
const EXPECTED_TOTAL_FILE_COUNT = EXPECTED_PARSE_FILE_COUNT + EXPECTED_RETENTION_FILE_COUNT; // 10

function parseParseFileName(file: string): { modelSlug: ModelSlug } | null {
  const base = file.replace(/\.json$/u, '');
  if (!base.startsWith('parse-')) return null;
  const modelSlug = base.slice('parse-'.length);
  if ((MODEL_SLUGS as readonly string[]).includes(modelSlug)) {
    return { modelSlug: modelSlug as ModelSlug };
  }
  return null;
}

function parseRetentionFileName(file: string): { modelSlug: ModelSlug; language: Language } | null {
  const base = file.replace(/\.json$/u, '');
  if (!base.startsWith('retention-')) return null;
  const rest = base.slice('retention-'.length);
  for (const modelSlug of MODEL_SLUGS) {
    const prefix = `${modelSlug}-`;
    if (!rest.startsWith(prefix)) continue;
    const language = rest.slice(prefix.length);
    if ((LANGUAGES as readonly string[]).includes(language)) {
      return { modelSlug, language: language as Language };
    }
  }
  return null;
}

async function listMatrixFiles(): Promise<string[]> {
  const entries = await readdir(MATRIX_DIR);
  return entries.filter((entry) => entry.endsWith('.json')).sort();
}

test('audit-321-freeze matrix directory contains exactly the expected 10 files (2 parse + 8 retention)', async () => {
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
    assert.ok(parseRetentionFileName(file), `retention file ${file} does not match the <task>-<model>-<lang>.json naming scheme`);
  }
});

test('audit-321-freeze matrix has no missing or duplicate model (parse) or model-language (retention) combination', async () => {
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
    const key = `${entry!.modelSlug}|${entry!.language}`;
    assert.strictEqual(retentionSeen.has(key), false, `duplicate retention combination: ${key}`);
    retentionSeen.add(key);
  }
  const expectedRetentionKeys = new Set<string>();
  for (const modelSlug of MODEL_SLUGS) {
    for (const language of LANGUAGES) {
      expectedRetentionKeys.add(`${modelSlug}|${language}`);
    }
  }
  assert.deepStrictEqual(retentionSeen, expectedRetentionKeys);
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

    const expectedIds = ITEM_GROUPS.map((group) => `${group}-${entry!.language}`);
    assert.deepStrictEqual(validated.expectedItemIds, expectedIds);

    // No silent retry/exclusion of failed items: exactly one attempt per item, one realization
    // call and one parse-back call each (4 items x 1 attempt x 2 stages = 8).
    assert.strictEqual(validated.limits.maxItems, 4);
    assert.strictEqual(validated.limits.maxAttemptsPerItem, 1);
    assert.strictEqual(validated.limits.maxModelCalls, 8);

    // Dataset hash actually matches the committed dataset file on disk.
    const datasetPath = path.join(WORKSPACE_ROOT, manifest.dataset.path);
    const actualHash = await sha256File(datasetPath);
    assert.strictEqual(actualHash, manifest.dataset.sha256);

    // The plan is computable against the real, full multilingual dataset restricted to this
    // manifest's expectedItemIds -- proving every referenced item id genuinely exists in the
    // committed dataset (nothing hardcoded/invented).
    const scopedDataset = fullDataset.filter((item) => expectedIds.includes(item.id));
    assert.strictEqual(scopedDataset.length, expectedIds.length);
    const plan = planRetentionExecution(validated, scopedDataset as any);
    assert.deepStrictEqual(plan.plannedItemIds, expectedIds);
    assert.strictEqual(plan.totalModelCalls, validated.limits.maxModelCalls);
    assert.strictEqual(plan.totalModelCalls, 8);

    // Audit-tracking-only fields (not part of the openlunum-retention-manifest/0.1 schema).
    assert.strictEqual((manifest as any).targetLanguage, entry!.language);
    assert.strictEqual((manifest as any).deterministic, false);
    assert.ok(String((manifest as any).outputDirectory ?? '').includes(entry!.modelSlug));
    assert.ok(String((manifest as any).outputDirectory ?? '').includes(entry!.language));
    assert.ok(String((manifest as any).intendedModelProfile ?? '').length > 0);
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
