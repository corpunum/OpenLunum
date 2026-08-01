import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCategoryMetrics,
  computeLanguageMetrics,
  computeRankingQuality,
  generateRetrievalCategoryReport,
  type RetrievalJudgment,
  type LanguagePair,
  type SemanticCategory,
} from '../src/retrieval-category-metrics.js';

function makeJudgment(
  overrides: Partial<RetrievalJudgment> & { relevant: boolean; retrieved: boolean },
): RetrievalJudgment {
  return {
    queryId: 'q1',
    documentId: 'd1',
    languagePair: { source: 'en', target: 'el' },
    category: 'permission',
    ...overrides,
  };
}

describe('computeCategoryMetrics', () => {
  it('correctly groups and computes P/R/F1', () => {
    const judgments: RetrievalJudgment[] = [
      // permission: 1 TP, 1 FP => P=0.5, R=1, F1=2/3
      makeJudgment({ queryId: 'q1', documentId: 'd1', relevant: true, retrieved: true, category: 'permission' }),
      makeJudgment({ queryId: 'q1', documentId: 'd2', relevant: false, retrieved: true, category: 'permission' }),
      // obligation: 2 TP => P=1, R=1, F1=1
      makeJudgment({ queryId: 'q2', documentId: 'd3', relevant: true, retrieved: true, category: 'obligation' }),
      makeJudgment({ queryId: 'q2', documentId: 'd4', relevant: true, retrieved: true, category: 'obligation' }),
    ];

    const metrics = computeCategoryMetrics(judgments);
    assert.equal(metrics.length, 2);

    const perm = metrics.find(m => m.category === 'permission')!;
    assert.ok(perm);
    assert.equal(perm.precision, 0.5);
    assert.equal(perm.recall, 1);
    assert.ok(Math.abs(perm.f1 - 2 / 3) < 1e-9);
    assert.equal(perm.sampleCount, 2);

    const oblig = metrics.find(m => m.category === 'obligation')!;
    assert.ok(oblig);
    assert.equal(oblig.precision, 1);
    assert.equal(oblig.recall, 1);
    assert.equal(oblig.f1, 1);
    assert.equal(oblig.sampleCount, 2);
  });

  it('computes false equivalence rate', () => {
    const judgments: RetrievalJudgment[] = [
      // 1 TP, 3 FP => falseEquivalenceRate = 3/4 = 0.75
      makeJudgment({ documentId: 'd1', relevant: true, retrieved: true, category: 'belief' }),
      makeJudgment({ documentId: 'd2', relevant: false, retrieved: true, category: 'belief' }),
      makeJudgment({ documentId: 'd3', relevant: false, retrieved: true, category: 'belief' }),
      makeJudgment({ documentId: 'd4', relevant: false, retrieved: true, category: 'belief' }),
    ];

    const metrics = computeCategoryMetrics(judgments);
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0]!.falseEquivalenceRate, 0.75);
  });
});

describe('computeLanguageMetrics', () => {
  it('groups by language pair', () => {
    const judgments: RetrievalJudgment[] = [
      makeJudgment({ relevant: true, retrieved: true, languagePair: { source: 'en', target: 'el' } }),
      makeJudgment({ relevant: true, retrieved: true, languagePair: { source: 'en', target: 'el' } }),
      makeJudgment({ relevant: true, retrieved: true, languagePair: { source: 'en', target: 'fr' } }),
      makeJudgment({ relevant: false, retrieved: true, languagePair: { source: 'en', target: 'fr' } }),
    ];

    const metrics = computeLanguageMetrics(judgments);
    assert.equal(metrics.length, 2);

    const enEl = metrics.find(m => m.pair.source === 'en' && m.pair.target === 'el')!;
    assert.ok(enEl);
    assert.equal(enEl.precision, 1);
    assert.equal(enEl.sampleCount, 2);

    const enFr = metrics.find(m => m.pair.source === 'en' && m.pair.target === 'fr')!;
    assert.ok(enFr);
    assert.equal(enFr.precision, 0.5);
    assert.equal(enFr.sampleCount, 2);
  });
});

describe('computeRankingQuality', () => {
  it('perfect ranking gives NDCG=1 and MRR=1', () => {
    // All relevant items first
    const ranked = [
      { relevant: true },
      { relevant: true },
      { relevant: true },
      { relevant: false },
      { relevant: false },
    ];

    const quality = computeRankingQuality(ranked);
    assert.ok(Math.abs(quality.ndcg - 1) < 1e-9, `NDCG should be 1, got ${quality.ndcg}`);
    assert.equal(quality.mrr, 1);
    assert.equal(quality.mapScore, 1);
  });

  it('worst ranking gives low scores', () => {
    // All irrelevant first, single relevant last
    const ranked = [
      { relevant: false },
      { relevant: false },
      { relevant: false },
      { relevant: false },
      { relevant: true },
    ];

    const quality = computeRankingQuality(ranked);
    assert.ok(quality.ndcg < 0.5, `NDCG should be low, got ${quality.ndcg}`);
    assert.equal(quality.mrr, 0.2);
    assert.equal(quality.mapScore, 0.2);
  });
});

describe('generateRetrievalCategoryReport', () => {
  it('identifies weakest category and pair', () => {
    const judgments: RetrievalJudgment[] = [
      // permission: perfect (F1=1)
      makeJudgment({ queryId: 'q1', documentId: 'd1', relevant: true, retrieved: true, category: 'permission', languagePair: { source: 'en', target: 'el' } }),
      // constraint: bad (F1=0 — relevant but not retrieved)
      makeJudgment({ queryId: 'q2', documentId: 'd2', relevant: true, retrieved: false, category: 'constraint', languagePair: { source: 'en', target: 'fr' } }),
    ];

    const report = generateRetrievalCategoryReport(judgments);
    assert.equal(report.weakestCategory, 'constraint');
    assert.equal(report.weakestLanguagePair.source, 'en');
    assert.equal(report.weakestLanguagePair.target, 'fr');
    assert.ok(report.timestamp.length > 0);
    assert.equal(report.categoryMetrics.length, 2);
    assert.equal(report.languageMetrics.length, 2);
  });

  it('empty judgments produce empty report', () => {
    const report = generateRetrievalCategoryReport([]);
    assert.equal(report.categoryMetrics.length, 0);
    assert.equal(report.languageMetrics.length, 0);
    assert.equal(report.overallPrecision, 0);
    assert.equal(report.overallRecall, 0);
    assert.equal(report.overallF1, 0);
    // Defaults for weakest when no data
    assert.equal(report.weakestCategory, 'permission');
    assert.deepEqual(report.weakestLanguagePair, { source: 'en', target: 'en' });
  });
});
