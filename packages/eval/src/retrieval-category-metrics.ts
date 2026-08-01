/**
 * Retrieval category metrics (R9.4 — Issue #550).
 *
 * Measures precision, recall, ranking quality and false equivalence
 * by language pair and semantic category.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LanguagePair {
  source: string;
  target: string;
}

export type SemanticCategory =
  | 'permission'
  | 'obligation'
  | 'preference'
  | 'constraint'
  | 'belief'
  | 'reminder'
  | 'plan'
  | 'consent';

export interface CategoryMetrics {
  category: SemanticCategory;
  precision: number;
  recall: number;
  f1: number;
  falseEquivalenceRate: number;
  sampleCount: number;
}

export interface LanguageMetrics {
  pair: LanguagePair;
  precision: number;
  recall: number;
  f1: number;
  falseEquivalenceRate: number;
  sampleCount: number;
}

export interface RetrievalJudgment {
  queryId: string;
  documentId: string;
  relevant: boolean;
  retrieved: boolean;
  languagePair: LanguagePair;
  category: SemanticCategory;
}

export interface RankingQualityMetrics {
  ndcg: number;
  mrr: number;
  mapScore: number;
}

export interface RetrievalCategoryReport {
  timestamp: string;
  categoryMetrics: CategoryMetrics[];
  languageMetrics: LanguageMetrics[];
  overallPrecision: number;
  overallRecall: number;
  overallF1: number;
  weakestCategory: SemanticCategory;
  weakestLanguagePair: LanguagePair;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function computePRF1(judgments: RetrievalJudgment[]): {
  precision: number;
  recall: number;
  f1: number;
  falseEquivalenceRate: number;
} {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let totalRetrieved = 0;

  for (const j of judgments) {
    if (j.retrieved) {
      totalRetrieved++;
      if (j.relevant) {
        tp++;
      } else {
        fp++;
      }
    } else if (j.relevant) {
      fn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const falseEquivalenceRate = totalRetrieved > 0 ? fp / totalRetrieved : 0;

  return { precision, recall, f1, falseEquivalenceRate };
}

function languagePairKey(pair: LanguagePair): string {
  return `${pair.source}:${pair.target}`;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Group judgments by semantic category and compute P/R/F1 and false
 * equivalence rate per category.
 */
export function computeCategoryMetrics(judgments: RetrievalJudgment[]): CategoryMetrics[] {
  const groups = new Map<SemanticCategory, RetrievalJudgment[]>();

  for (const j of judgments) {
    let arr = groups.get(j.category);
    if (!arr) {
      arr = [];
      groups.set(j.category, arr);
    }
    arr.push(j);
  }

  const results: CategoryMetrics[] = [];
  for (const [category, items] of groups) {
    const { precision, recall, f1, falseEquivalenceRate } = computePRF1(items);
    results.push({ category, precision, recall, f1, falseEquivalenceRate, sampleCount: items.length });
  }

  return results;
}

/**
 * Group judgments by language pair and compute P/R/F1 and false
 * equivalence rate per pair.
 */
export function computeLanguageMetrics(judgments: RetrievalJudgment[]): LanguageMetrics[] {
  const groups = new Map<string, { pair: LanguagePair; items: RetrievalJudgment[] }>();

  for (const j of judgments) {
    const key = languagePairKey(j.languagePair);
    let entry = groups.get(key);
    if (!entry) {
      entry = { pair: j.languagePair, items: [] };
      groups.set(key, entry);
    }
    entry.items.push(j);
  }

  const results: LanguageMetrics[] = [];
  for (const { pair, items } of groups.values()) {
    const { precision, recall, f1, falseEquivalenceRate } = computePRF1(items);
    results.push({ pair, precision, recall, f1, falseEquivalenceRate, sampleCount: items.length });
  }

  return results;
}

/**
 * Compute NDCG@10, MRR (reciprocal rank of first relevant result),
 * and MAP (mean average precision) over a ranked result list.
 */
export function computeRankingQuality(
  rankedResults: Array<{ relevant: boolean }>,
): RankingQualityMetrics {
  const k = 10;
  const topK = rankedResults.slice(0, k);

  // --- NDCG@10 ---
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    if (topK[i]!.relevant) {
      dcg += 1 / Math.log2(i + 2); // i+2 because rank is 1-indexed
    }
  }

  // Ideal DCG: all relevant items at the top
  const totalRelevant = rankedResults.filter(r => r.relevant).length;
  const idealK = Math.min(totalRelevant, k);
  let idcg = 0;
  for (let i = 0; i < idealK; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  const ndcg = idcg > 0 ? dcg / idcg : 0;

  // --- MRR ---
  let mrr = 0;
  for (let i = 0; i < rankedResults.length; i++) {
    if (rankedResults[i]!.relevant) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // --- MAP ---
  let cumulativeRelevant = 0;
  let sumPrecision = 0;
  for (let i = 0; i < rankedResults.length; i++) {
    if (rankedResults[i]!.relevant) {
      cumulativeRelevant++;
      sumPrecision += cumulativeRelevant / (i + 1);
    }
  }
  const mapScore = totalRelevant > 0 ? sumPrecision / totalRelevant : 0;

  return { ndcg, mrr, mapScore };
}

/**
 * Aggregate all category and language metrics into a single report,
 * identifying the weakest category and language pair by F1.
 */
export function generateRetrievalCategoryReport(
  judgments: RetrievalJudgment[],
): RetrievalCategoryReport {
  const categoryMetrics = computeCategoryMetrics(judgments);
  const languageMetrics = computeLanguageMetrics(judgments);
  const { precision, recall, f1 } = computePRF1(judgments);

  // Find weakest category (lowest F1)
  let weakestCategory: SemanticCategory = 'permission';
  if (categoryMetrics.length > 0) {
    let minF1 = Infinity;
    for (const cm of categoryMetrics) {
      if (cm.f1 < minF1) {
        minF1 = cm.f1;
        weakestCategory = cm.category;
      }
    }
  }

  // Find weakest language pair (lowest F1)
  let weakestLanguagePair: LanguagePair = { source: 'en', target: 'en' };
  if (languageMetrics.length > 0) {
    let minF1 = Infinity;
    for (const lm of languageMetrics) {
      if (lm.f1 < minF1) {
        minF1 = lm.f1;
        weakestLanguagePair = lm.pair;
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    categoryMetrics,
    languageMetrics,
    overallPrecision: precision,
    overallRecall: recall,
    overallF1: f1,
    weakestCategory,
    weakestLanguagePair,
  };
}
