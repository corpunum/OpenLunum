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
const TASKS = ['parse', 'retention'] as const;
const ITEM_GROUPS = ['preference', 'delete', 'battery', 'deadline'] as const;

type Task = (typeof TASKS)[number];
type ModelSlug = (typeof MODEL_SLUGS)[number];
type Language = (typeof LANGUAGES)[number];

interface MatrixEntry {
  task: Task;
  modelSlug: ModelSlug;
  language: Language;
  file: string;
}

function parseFileName(file: string): MatrixEntry | null {
  const base = file.replace(/\.json$/u, '');
  for (const task of TASKS) {
    const prefix = `${task}-`;
    if (!base.startsWith(prefix)) continue;
    const rest = base.slice(prefix.length);
    for (const modelSlug of MODEL_SLUGS) {
      const modelPrefix = `${modelSlug}-`;
      if (!rest.startsWith(modelPrefix)) continue;
      const language = rest.slice(modelPrefix.length);
      if ((LANGUAGES as readonly string[]).includes(language)) {
        return { task, modelSlug, language: language as Language, file };
      }
    }
  }
  return null;
}

async function listMatrixFiles(): Promise<string[]> {
  const entries = await readdir(MATRIX_DIR);
  return entries.filter((entry) => entry.endsWith('.json')).sort();
}

test('audit-321-freeze matrix directory contains exactly the expected 16 files', async () => {
  const files = await listMatrixFiles();
  assert.strictEqual(files.length, MODEL_SLUGS.length * LANGUAGES.length * TASKS.length);

  const parsed = files.map(parseFileName);
  for (const [index, entry] of parsed.entries()) {
    assert.ok(entry, `file ${files[index]} does not match the deterministic <task>-<model>-<lang>.json naming scheme`);
  }
});

test('audit-321-freeze matrix has no missing or duplicate model-language-task combination', async () => {
  const files = await listMatrixFiles();
  const parsed = files.map(parseFileName).filter((entry): entry is MatrixEntry => entry !== null);

  const seen = new Set<string>();
  for (const entry of parsed) {
    const key = `${entry.task}|${entry.modelSlug}|${entry.language}`;
    assert.strictEqual(seen.has(key), false, `duplicate combination: ${key}`);
    seen.add(key);
  }

  const expectedKeys = new Set<string>();
  for (const task of TASKS) {
    for (const modelSlug of MODEL_SLUGS) {
      for (const language of LANGUAGES) {
        expectedKeys.add(`${task}|${modelSlug}|${language}`);
      }
    }
  }

  assert.deepStrictEqual(seen, expectedKeys);
});

test('every parse manifest in the audit-321-freeze matrix loads through the real experiment validator', async () => {
  const files = await listMatrixFiles();
  const parseFiles = files.filter((file) => file.startsWith('parse-'));
  assert.strictEqual(parseFiles.length, MODEL_SLUGS.length * LANGUAGES.length);

  for (const file of parseFiles) {
    const entry = parseFileName(file);
    assert.ok(entry);
    const manifest = await readJson<ExperimentManifest>(path.join(MATRIX_DIR, file));

    // Real validator, unmodified.
    assert.doesNotThrow(() => validateManifest(manifest));

    assert.strictEqual(manifest.deterministic, false);
    assert.ok(manifest.limits && manifest.limits.maxItems > 0 && manifest.limits.maxAttemptsPerItem > 0 && manifest.limits.maxModelCalls > 0);
    assert.ok(manifest.outputDirectory.includes(entry!.modelSlug));
    assert.ok(manifest.outputDirectory.includes(entry!.language));
    assert.strictEqual(manifest.targetLanguage, entry!.language);

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

test('every retention manifest in the audit-321-freeze matrix loads through the real retention validator and plans cleanly', async () => {
  const files = await listMatrixFiles();
  const retentionFiles = files.filter((file) => file.startsWith('retention-'));
  assert.strictEqual(retentionFiles.length, MODEL_SLUGS.length * LANGUAGES.length);

  const fullDataset = await loadDataset(path.join(WORKSPACE_ROOT, 'datasets', 'dev', 'multilingual-core-v1.jsonl'));

  for (const file of retentionFiles) {
    const entry = parseFileName(file);
    assert.ok(entry);
    const manifest = await readJson<RetentionCoverageManifest>(path.join(MATRIX_DIR, file));

    // Real validator, unmodified. No retention gate thresholds are touched here.
    const validated = validateRetentionManifest(manifest);

    const expectedIds = ITEM_GROUPS.map((group) => `${group}-${entry!.language}`);
    assert.deepStrictEqual(validated.expectedItemIds, expectedIds);

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
