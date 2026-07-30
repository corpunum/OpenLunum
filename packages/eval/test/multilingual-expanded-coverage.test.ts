import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sha256File } from '../src/io.js';
import {
  COVERAGE_VERSION,
  auditLanguageCoverage,
} from '../src/multilingual-expanded-coverage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const DATASET_PATH = path.join(
  WORKSPACE_ROOT,
  'datasets',
  'dev',
  'multilingual-expanded-v2.jsonl'
);
const MANIFEST_PATH = path.join(
  WORKSPACE_ROOT,
  'datasets',
  'manifests',
  'multilingual-expanded-v2.json'
);

describe('multilingual expanded coverage v2 (#382)', () => {
  it('exports COVERAGE_VERSION = "0.1.0"', () => {
    assert.strictEqual(COVERAGE_VERSION, '0.1.0');
  });

  it('verifies manifest sha256 matches actual file content', async () => {
    const manifest = await readJson<{ path: string; sha256: string; items: number }>(MANIFEST_PATH);
    const actualHash = await sha256File(DATASET_PATH);
    assert.strictEqual(manifest.sha256, actualHash, 'manifest sha256 must match dataset file content');
    assert.strictEqual(manifest.items, 96, 'manifest item count must be 96');
  });

  it('audits language coverage: dataset has >= 96 items, >= 12 languages, and each has >= 8 items', () => {
    const report = auditLanguageCoverage(DATASET_PATH);

    assert.strictEqual(report.verdict, 'pass');
    assert.ok(report.totalItems >= 96, `Expected >= 96 items, got ${report.totalItems}`);

    const languageCount = Object.keys(report.languageCounts).length;
    assert.ok(languageCount >= 12, `Expected >= 12 languages, got ${languageCount}`);

    const expectedLangs = [
      'en',
      'el',
      'es',
      'id',
      'ja',
      'ko',
      'zh',
      'ar',
      'pt',
      'fr',
      'de',
      'ru',
    ];

    for (const lang of expectedLangs) {
      const count = report.languageCounts[lang] ?? 0;
      assert.ok(
        count >= 8,
        `Expected language '${lang}' to have >= 8 items, got ${count}`
      );
    }

    assert.strictEqual(report.missingLanguages.length, 0);
  });
});
