import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRetentionDataset, RETENTION_AUDIT_VERSION } from '../src/expanded-retention-audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('expanded retention dataset audit (#383)', () => {
  const datasetPath = path.join(
    WORKSPACE_ROOT,
    'packages',
    'eval',
    'test-fixtures',
    'retention',
    'expanded-retention-v2.json'
  );

  it('exports expected audit version', () => {
    assert.strictEqual(RETENTION_AUDIT_VERSION, '0.1.0');
  });

  it('evaluates expanded-retention-v2.json and passes all audit thresholds', () => {
    const report = auditRetentionDataset(datasetPath);

    assert.strictEqual(report.version, '0.1.0');
    assert.strictEqual(report.passed, true);
    assert.ok(
      report.totalRecords >= 200,
      `Expected total records >= 200, got ${report.totalRecords}`
    );
    assert.ok(
      report.languageCount >= 8,
      `Expected language count >= 8, got ${report.languageCount}`
    );
    assert.ok(
      report.categoryCount >= 10,
      `Expected semantic categories >= 10, got ${report.categoryCount}`
    );
    assert.ok(
      report.nestingLevelCount >= 3,
      `Expected nesting levels >= 3, got ${report.nestingLevelCount}`
    );

    assert.strictEqual(report.checks.totalRecordsPass, true);
    assert.strictEqual(report.checks.languageCountPass, true);
    assert.strictEqual(report.checks.categoryCountPass, true);
    assert.strictEqual(report.checks.nestingLevelsPass, true);
  });

  it('correctly reports 8 languages (EN, EL, ES, ID, JA, KO, ZH, FR)', () => {
    const report = auditRetentionDataset(datasetPath);
    const expectedLangs = ['el', 'en', 'es', 'fr', 'id', 'ja', 'ko', 'zh'];
    for (const lang of expectedLangs) {
      assert.ok(
        report.uniqueLanguages.includes(lang),
        `Missing language ${lang} in ${report.uniqueLanguages.join(', ')}`
      );
    }
  });

  it('includes nesting levels 1, 2, and 3', () => {
    const report = auditRetentionDataset(datasetPath);
    assert.ok(report.nestingLevelsFound.includes(1), 'Missing level 1 nesting');
    assert.ok(report.nestingLevelsFound.includes(2), 'Missing level 2 nesting');
    assert.ok(report.nestingLevelsFound.includes(3), 'Missing level 3 nesting');
  });
});
