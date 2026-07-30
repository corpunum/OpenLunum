import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import {
  measureRetrievalQuality,
  RETRIEVAL_MEASUREMENT_VERSION,
  type RetrievalPairItem
} from '../src/retrieval-measurement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('Cross-language retrieval measurement infrastructure (#381)', () => {
  const datasetPath = path.join(
    WORKSPACE_ROOT,
    'datasets',
    'dev',
    'cross-language-retrieval-v1.jsonl'
  );

  it('verifies dataset requirements: >= 60 pairs, >= 6 language pairs, >= 20 negatives', () => {
    assert.ok(existsSync(datasetPath), `Dataset file must exist at ${datasetPath}`);

    const content = readFileSync(datasetPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const items: RetrievalPairItem[] = lines.map((line) => JSON.parse(line));

    assert.ok(
      items.length >= 60,
      `Expected at least 60 retrieval test pairs, got ${items.length}`
    );

    const negatives = items.filter((item) => item.expectedMatch === false);
    assert.ok(
      negatives.length >= 20,
      `Expected at least 20 negative pairs (false equivalence traps), got ${negatives.length}`
    );

    const languagePairs = new Set(
      items.map(
        (item) => `${item.queryLanguage.toUpperCase()}-${item.targetLanguage.toUpperCase()}`
      )
    );
    assert.ok(
      languagePairs.size >= 6,
      `Expected at least 6 language pairs, got ${languagePairs.size} (${Array.from(languagePairs).join(', ')})`
    );

    // Verify required 6 language pairs are present
    const requiredPairs = ['EN-EL', 'EN-ES', 'EN-JA', 'ES-EL', 'EN-ZH', 'EN-FR'];
    for (const reqPair of requiredPairs) {
      assert.ok(
        languagePairs.has(reqPair),
        `Required language pair ${reqPair} must be present in dataset`
      );
    }
  });

  it('measures retrieval quality, produces valid precision/recall/F1, and writes report', () => {
    const report = measureRetrievalQuality(datasetPath);

    assert.equal(report.version, RETRIEVAL_MEASUREMENT_VERSION);
    assert.ok(report.totalPairs >= 60);
    assert.ok(report.negativePairs >= 20);

    // Metric bounds checks
    assert.ok(report.precision >= 0 && report.precision <= 1.0);
    assert.ok(report.recall >= 0 && report.recall <= 1.0);
    assert.ok(report.f1 >= 0 && report.f1 <= 1.0);
    assert.ok(report.falsePositiveRate >= 0 && report.falsePositiveRate <= 1.0);

    // Language pair breakdown check
    const pairsCount = Object.keys(report.byLanguagePair).length;
    assert.ok(pairsCount >= 6, `Expected breakdown for >= 6 language pairs, got ${pairsCount}`);

    for (const [pairKey, metrics] of Object.entries(report.byLanguagePair)) {
      assert.ok(metrics.totalPairs > 0, `Pair ${pairKey} must have totalPairs > 0`);
      assert.ok(metrics.precision >= 0 && metrics.precision <= 1.0);
      assert.ok(metrics.recall >= 0 && metrics.recall <= 1.0);
      assert.ok(metrics.f1 >= 0 && metrics.f1 <= 1.0);
    }

    // Write report to eval-results/retrieval/retrieval-measurement-report.json
    const reportDir = path.join(WORKSPACE_ROOT, 'eval-results', 'retrieval');
    mkdirSync(reportDir, { recursive: true });
    const reportFilePath = path.join(reportDir, 'retrieval-measurement-report.json');
    writeFileSync(reportFilePath, JSON.stringify(report, null, 2), 'utf-8');

    assert.ok(
      existsSync(reportFilePath),
      `Report file should be written to ${reportFilePath}`
    );
  });
});
