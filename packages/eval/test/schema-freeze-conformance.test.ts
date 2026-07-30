import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFORMANCE_VERSION,
  buildConformanceCorpus,
  runConformanceTests,
} from '../src/schema-freeze-conformance.js';
import type { ConformanceReport } from '../src/schema-freeze-conformance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('schema-freeze-conformance constants', () => {
  it('version is semver', () => {
    assert.match(CONFORMANCE_VERSION, /^\d+\.\d+\.\d+$/u);
  });
});

describe('conformance corpus', () => {
  it('has at least 25 vectors', () => {
    const corpus = buildConformanceCorpus();
    assert.ok(corpus.length >= 25, `expected >= 25 vectors, got ${corpus.length}`);
  });

  it('covers all categories', () => {
    const corpus = buildConformanceCorpus();
    const categories = new Set(corpus.map(v => v.category));
    for (const cat of ['migration', 'ambiguity', 'canonicalization', 'fingerprint', 'roundtrip', 'boundary'] as const) {
      assert.ok(categories.has(cat as typeof cat), `missing category: ${cat}`);
    }
  });

  it('has unique IDs', () => {
    const corpus = buildConformanceCorpus();
    const ids = corpus.map(v => v.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });
});

describe('conformance tests', () => {
  let report: ConformanceReport;

  it('runs all vectors', () => {
    const corpus = buildConformanceCorpus();
    report = runConformanceTests(corpus);
    assert.ok(report.results.length >= 25);
  });

  it('all vectors pass', () => {
    const failed = report.results.filter(r => !r.passed);
    assert.strictEqual(
      failed.length,
      0,
      `Failed vectors:\n${failed.map(f => `  ${f.vectorId}: ${JSON.stringify(f.details)}`).join('\n')}`,
    );
  });

  it('verdict is PASS', () => {
    assert.strictEqual(report.summary.verdict, 'PASS');
  });

  it('all categories have results', () => {
    const cats = Object.keys(report.summary.byCategory);
    assert.ok(cats.length >= 6, `expected >= 6 categories, got ${cats.length}`);
    for (const [cat, stats] of Object.entries(report.summary.byCategory)) {
      assert.strictEqual(stats.passed, stats.total, `category ${cat} has failures: ${stats.passed}/${stats.total}`);
    }
  });

  it('migration vectors all round-trip successfully', () => {
    const migrationResults = report.results.filter(r => r.vectorId.startsWith('migration-'));
    assert.ok(migrationResults.length >= 6);
    for (const r of migrationResults) {
      assert.ok(r.passed, `migration vector ${r.vectorId} failed`);
    }
  });

  it('ambiguity vectors confirm prohibited behaviors are resolved', () => {
    const ambiguityResults = report.results.filter(r => r.vectorId.startsWith('ambiguity-'));
    assert.ok(ambiguityResults.length >= 7);
    for (const r of ambiguityResults) {
      assert.ok(r.passed, `ambiguity vector ${r.vectorId} failed — prohibited behavior not resolved`);
    }
  });

  it('writes report to eval-results', async () => {
    const outDir = path.join(WORKSPACE_ROOT, 'eval-results', 'schema-freeze');
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, 'conformance-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      'utf-8',
    );
    const raw = await readFile(path.join(outDir, 'conformance-report.json'), 'utf-8');
    const parsed = JSON.parse(raw) as ConformanceReport;
    assert.strictEqual(parsed.summary.verdict, 'PASS');
  });
});
