import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  MODEL_FAMILY_EVAL_VERSION,
  REQUIRED_FAMILIES,
  validateModelFamilyResult,
  validateModelFamilyBundle,
  buildBundle,
  computeMedian,
  summarizeSamples,
} from '../src/model-family-eval.js';
import type { ModelFamilyResult, ParseSample, ModelFamilyBundle } from '../src/model-family-eval.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BUNDLE_PATH = path.join(WORKSPACE_ROOT, 'eval-results', 'model-family', 'model-family-bundle.json');

describe('model-family-eval constants', () => {
  it('version is semver', () => {
    assert.match(MODEL_FAMILY_EVAL_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('requires exactly 3 families', () => {
    assert.strictEqual(REQUIRED_FAMILIES.length, 3);
    assert.deepStrictEqual([...REQUIRED_FAMILIES].sort(), ['gemma', 'llama', 'qwen']);
  });
});

describe('computeMedian', () => {
  it('handles empty array', () => {
    assert.strictEqual(computeMedian([]), 0);
  });

  it('handles single element', () => {
    assert.strictEqual(computeMedian([42]), 42);
  });

  it('handles odd count', () => {
    assert.strictEqual(computeMedian([1, 3, 5]), 3);
  });

  it('handles even count', () => {
    assert.strictEqual(computeMedian([1, 2, 3, 4]), 2.5);
  });
});

describe('summarizeSamples', () => {
  it('computes correct summary from samples', () => {
    const samples: ParseSample[] = [
      { itemId: 'a', sourceText: 't1', sourceLanguage: 'en', rawOutput: '{}', parsedSuccessfully: true, hasValidSchema: true, latencyMs: 100 },
      { itemId: 'b', sourceText: 't2', sourceLanguage: 'en', rawOutput: '', parsedSuccessfully: false, hasValidSchema: false, latencyMs: 200 },
      { itemId: 'c', sourceText: 't3', sourceLanguage: 'en', rawOutput: '{}', parsedSuccessfully: true, hasValidSchema: false, latencyMs: 300 },
    ];
    const summary = summarizeSamples(samples);
    assert.strictEqual(summary.totalItems, 3);
    assert.strictEqual(summary.parsedCount, 2);
    assert.strictEqual(summary.validSchemaCount, 1);
    assert.ok(Math.abs(summary.parseRate - 2 / 3) < 0.001);
    assert.ok(Math.abs(summary.validSchemaRate - 1 / 3) < 0.001);
    assert.strictEqual(summary.medianLatencyMs, 200);
  });
});

describe('validateModelFamilyResult', () => {
  function makeResult(overrides: Partial<ModelFamilyResult> = {}): ModelFamilyResult {
    return {
      schema: 'openlunum-model-family-eval/0.1',
      version: MODEL_FAMILY_EVAL_VERSION,
      runId: 'test-run-1',
      runTimestamp: '2026-07-28T00:00:00Z',
      model: {
        profileId: 'test-profile',
        family: 'qwen',
        displayName: 'Test Qwen',
        architecture: 'qwen2',
        quantization: 'Q6_K',
        parameterCount: '30B',
        profilePath: 'profiles/models/test.json',
        profileSha256: 'a'.repeat(64),
      },
      dataset: { path: 'datasets/test.jsonl', sha256: 'b'.repeat(64), itemCount: 1 },
      samples: [{ itemId: 'x', sourceText: 'hi', sourceLanguage: 'en', rawOutput: '{}', parsedSuccessfully: true, hasValidSchema: true, latencyMs: 100 }],
      summary: { totalItems: 1, parsedCount: 1, validSchemaCount: 1, parseRate: 1, validSchemaRate: 1, meanLatencyMs: 100, medianLatencyMs: 100 },
      ...overrides,
    };
  }

  it('accepts a valid result', () => {
    assert.ok(validateModelFamilyResult(makeResult()).ok);
  });

  it('rejects wrong schema', () => {
    const r = validateModelFamilyResult(makeResult({ schema: 'wrong' as 'openlunum-model-family-eval/0.1' }));
    assert.strictEqual(r.ok, false);
  });

  it('rejects empty samples', () => {
    const r = validateModelFamilyResult(makeResult({ samples: [], summary: { totalItems: 0, parsedCount: 0, validSchemaCount: 0, parseRate: 0, validSchemaRate: 0, meanLatencyMs: 0, medianLatencyMs: 0 } }));
    assert.strictEqual(r.ok, false);
  });

  it('rejects mismatched totalItems', () => {
    const r = validateModelFamilyResult(makeResult({ summary: { totalItems: 99, parsedCount: 1, validSchemaCount: 1, parseRate: 1, validSchemaRate: 1, meanLatencyMs: 100, medianLatencyMs: 100 } }));
    assert.strictEqual(r.ok, false);
  });
});

describe('buildBundle', () => {
  function makeResult(family: 'qwen' | 'gemma' | 'llama', quant: string): ModelFamilyResult {
    return {
      schema: 'openlunum-model-family-eval/0.1',
      version: MODEL_FAMILY_EVAL_VERSION,
      runId: `run-${family}-${quant}`,
      runTimestamp: '2026-07-28T00:00:00Z',
      model: {
        profileId: `${family}-${quant}`,
        family,
        displayName: `Test ${family}`,
        architecture: family,
        quantization: quant,
        parameterCount: '30B',
        profilePath: `profiles/models/${family}.json`,
        profileSha256: 'a'.repeat(64),
      },
      dataset: { path: 'datasets/test.jsonl', sha256: 'b'.repeat(64), itemCount: 1 },
      samples: [{ itemId: 'x', sourceText: 'hi', sourceLanguage: 'en', rawOutput: '{}', parsedSuccessfully: true, hasValidSchema: true, latencyMs: 100 }],
      summary: { totalItems: 1, parsedCount: 1, validSchemaCount: 1, parseRate: 1, validSchemaRate: 1, meanLatencyMs: 100, medianLatencyMs: 100 },
    };
  }

  it('builds a valid bundle from 3 families', () => {
    const bundle = buildBundle([makeResult('qwen', 'Q6_K'), makeResult('gemma', 'Q4_K_M'), makeResult('llama', 'fp8')]);
    assert.strictEqual(bundle.coverage.familiesTested, 3);
    assert.strictEqual(bundle.coverage.allFamiliesCovered, true);
  });

  it('detects multiple quantizations', () => {
    const bundle = buildBundle([makeResult('qwen', 'Q6_K'), makeResult('qwen', 'Q4_K_M'), makeResult('gemma', 'Q4_K_M'), makeResult('llama', 'fp8')]);
    assert.strictEqual(bundle.coverage.multipleQuantizations, true);
    assert.strictEqual(bundle.coverage.quantizationsPerFamily.qwen, 2);
  });

  it('reports missing families', () => {
    const bundle = buildBundle([makeResult('qwen', 'Q6_K'), makeResult('gemma', 'Q4_K_M')]);
    assert.strictEqual(bundle.coverage.allFamiliesCovered, false);
    assert.strictEqual(bundle.coverage.quantizationsPerFamily.llama, 0);
  });
});

describe('committed model-family bundle', () => {
  let bundle: ModelFamilyBundle;

  it('bundle file exists and is valid JSON', async () => {
    const raw = await readFile(BUNDLE_PATH, 'utf8');
    bundle = JSON.parse(raw) as ModelFamilyBundle;
    assert.ok(bundle);
  });

  it('bundle passes validation', () => {
    const v = validateModelFamilyBundle(bundle);
    assert.ok(v.ok, `bundle validation failed: ${v.errors.join(', ')}`);
  });

  it('covers all 3 required families', () => {
    assert.strictEqual(bundle.coverage.allFamiliesCovered, true);
    assert.strictEqual(bundle.coverage.familiesTested, 3);
  });

  it('has at least 4 result entries (multiple models per family)', () => {
    assert.ok(bundle.results.length >= 4, `expected >=4 results, got ${bundle.results.length}`);
  });

  it('qwen family has multiple quantizations or sizes', () => {
    const qwenResults = bundle.results.filter(r => r.model.family === 'qwen');
    assert.ok(qwenResults.length >= 2, `expected >=2 qwen results, got ${qwenResults.length}`);
    const uniqueModels = new Set(qwenResults.map(r => r.model.profileId));
    assert.ok(uniqueModels.size >= 2);
  });

  it('each result has >=10 samples', () => {
    for (const r of bundle.results) {
      assert.ok(r.samples.length >= 10, `${r.model.profileId} has only ${r.samples.length} samples`);
    }
  });

  it('each result has valid profile SHA-256', () => {
    for (const r of bundle.results) {
      assert.match(r.model.profileSha256, /^[a-f0-9]{64}$/u, `${r.model.profileId} missing valid profileSha256`);
    }
  });

  it('each result has valid dataset SHA-256', () => {
    for (const r of bundle.results) {
      assert.match(r.dataset.sha256, /^[a-f0-9]{64}$/u, `${r.model.profileId} missing valid dataset sha256`);
    }
  });

  it('all results reference the same dataset', () => {
    const hashes = new Set(bundle.results.map(r => r.dataset.sha256));
    assert.strictEqual(hashes.size, 1, 'all results should use the same dataset');
  });

  it('profile paths point to committed files', async () => {
    for (const r of bundle.results) {
      const fullPath = path.join(WORKSPACE_ROOT, r.model.profilePath);
      const content = await readFile(fullPath, 'utf8');
      const profile = JSON.parse(content);
      assert.strictEqual(profile.schema, 'openlunum-model-profile/0.1');
    }
  });

  it('summary statistics are consistent with samples', () => {
    for (const r of bundle.results) {
      assert.strictEqual(r.summary.totalItems, r.samples.length);
      assert.strictEqual(r.summary.parsedCount, r.samples.filter(s => s.parsedSuccessfully).length);
      assert.strictEqual(r.summary.validSchemaCount, r.samples.filter(s => s.hasValidSchema).length);
    }
  });
});
