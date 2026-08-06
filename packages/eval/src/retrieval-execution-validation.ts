export type RetrievalStrategyName =
  | 'semantic-fingerprint'
  | 'keyword-bm25'
  | 'hybrid-weighted'
  | 'cross-lingual'
  | 'temporal-decay'
  | 'category-filtered';

export type RetrievalCorpusSize = 'small' | 'medium' | 'large' | 'xlarge';

export type RetrievalQueryComplexity = 'simple' | 'compound' | 'negated' | 'multilingual';

export interface RetrievalStrategyProfile {
  name: RetrievalStrategyName;
  description: string;
  supportsCrossLingual: boolean;
}

export interface RetrievalCorpusProfile {
  size: RetrievalCorpusSize;
  documentCount: number;
  avgTokensPerDoc: number;
}

export interface RetrievalQueryProfile {
  complexity: RetrievalQueryComplexity;
  difficultyMultiplier: number;
}

export interface RetrievalExecutionMetrics {
  strategy: RetrievalStrategyName;
  corpusSize: RetrievalCorpusSize;
  queryComplexity: RetrievalQueryComplexity;
  precision: number;
  recall: number;
  f1: number;
  mrr: number;
  latencyMs: number;
}

export interface RetrievalStrategySummary {
  strategy: RetrievalStrategyName;
  meanPrecision: number;
  meanRecall: number;
  meanF1: number;
  meanMrr: number;
  meanLatencyMs: number;
}

export interface RetrievalCorpusSummary {
  corpusSize: RetrievalCorpusSize;
  meanF1: number;
  meanLatencyMs: number;
}

export interface RetrievalExecutionReport {
  results: readonly RetrievalExecutionMetrics[];
  strategySummaries: readonly RetrievalStrategySummary[];
  corpusSummaries: readonly RetrievalCorpusSummary[];
  totalTests: number;
  overallMeanF1: number;
  verdict: 'excellent' | 'acceptable' | 'degraded';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const RETRIEVAL_STRATEGIES: readonly RetrievalStrategyProfile[] = Object.freeze([
  Object.freeze({ name: 'semantic-fingerprint' as RetrievalStrategyName, description: 'Fingerprint-based semantic similarity', supportsCrossLingual: true }),
  Object.freeze({ name: 'keyword-bm25' as RetrievalStrategyName, description: 'BM25 keyword matching', supportsCrossLingual: false }),
  Object.freeze({ name: 'hybrid-weighted' as RetrievalStrategyName, description: 'Weighted hybrid of semantic + keyword', supportsCrossLingual: true }),
  Object.freeze({ name: 'cross-lingual' as RetrievalStrategyName, description: 'Cross-lingual retrieval', supportsCrossLingual: true }),
  Object.freeze({ name: 'temporal-decay' as RetrievalStrategyName, description: 'Time-decay weighted retrieval', supportsCrossLingual: false }),
  Object.freeze({ name: 'category-filtered' as RetrievalStrategyName, description: 'Category-filtered retrieval', supportsCrossLingual: false }),
]);

export const CORPUS_SIZES: readonly RetrievalCorpusProfile[] = Object.freeze([
  Object.freeze({ size: 'small' as RetrievalCorpusSize, documentCount: 100, avgTokensPerDoc: 200 }),
  Object.freeze({ size: 'medium' as RetrievalCorpusSize, documentCount: 1000, avgTokensPerDoc: 500 }),
  Object.freeze({ size: 'large' as RetrievalCorpusSize, documentCount: 10000, avgTokensPerDoc: 800 }),
  Object.freeze({ size: 'xlarge' as RetrievalCorpusSize, documentCount: 100000, avgTokensPerDoc: 1200 }),
]);

export const QUERY_COMPLEXITIES: readonly RetrievalQueryProfile[] = Object.freeze([
  Object.freeze({ complexity: 'simple' as RetrievalQueryComplexity, difficultyMultiplier: 1.0 }),
  Object.freeze({ complexity: 'compound' as RetrievalQueryComplexity, difficultyMultiplier: 0.85 }),
  Object.freeze({ complexity: 'negated' as RetrievalQueryComplexity, difficultyMultiplier: 0.7 }),
  Object.freeze({ complexity: 'multilingual' as RetrievalQueryComplexity, difficultyMultiplier: 0.75 }),
]);

export function simulateRetrievalExecution(
  strategy: RetrievalStrategyProfile,
  corpus: RetrievalCorpusProfile,
  query: RetrievalQueryProfile,
): RetrievalExecutionMetrics {
  const seed = hashSeed(`${strategy.name}:${corpus.size}:${query.complexity}`);

  const strategyBase =
    strategy.name === 'hybrid-weighted' ? 0.88 :
    strategy.name === 'semantic-fingerprint' ? 0.85 :
    strategy.name === 'cross-lingual' ? 0.78 :
    strategy.name === 'category-filtered' ? 0.82 :
    strategy.name === 'temporal-decay' ? 0.80 :
    0.75;

  const corpusPenalty =
    corpus.size === 'small' ? 0 :
    corpus.size === 'medium' ? 0.02 :
    corpus.size === 'large' ? 0.05 :
    0.08;

  const crossLingualPenalty =
    query.complexity === 'multilingual' && !strategy.supportsCrossLingual ? 0.15 : 0;

  const basePrecision = Math.min(1, strategyBase + seed * 0.08 - corpusPenalty - crossLingualPenalty);
  const baseRecall = Math.min(1, (strategyBase - 0.05) * query.difficultyMultiplier + seed * 0.06);
  const precision = Math.round(Math.max(0, basePrecision) * 1000) / 1000;
  const recall = Math.round(Math.max(0, baseRecall) * 1000) / 1000;
  const f1 = precision + recall > 0
    ? Math.round((2 * precision * recall) / (precision + recall) * 1000) / 1000
    : 0;
  const mrr = Math.round(Math.min(1, precision * 0.9 + seed * 0.1) * 1000) / 1000;

  const baseLatency =
    corpus.size === 'small' ? 5 :
    corpus.size === 'medium' ? 25 :
    corpus.size === 'large' ? 120 :
    450;
  const strategyLatencyFactor =
    strategy.name === 'hybrid-weighted' ? 1.5 :
    strategy.name === 'cross-lingual' ? 1.8 :
    1.0;
  const latencyMs = Math.round(baseLatency * strategyLatencyFactor * (1 + seed * 0.3));

  return {
    strategy: strategy.name,
    corpusSize: corpus.size,
    queryComplexity: query.complexity,
    precision,
    recall,
    f1,
    mrr,
    latencyMs,
  };
}

export function runRetrievalExecutionSuite(
  strategies: readonly RetrievalStrategyProfile[] = RETRIEVAL_STRATEGIES,
  corpusSizes: readonly RetrievalCorpusProfile[] = CORPUS_SIZES,
  queries: readonly RetrievalQueryProfile[] = QUERY_COMPLEXITIES,
): RetrievalExecutionReport {
  const results: RetrievalExecutionMetrics[] = [];

  for (const strategy of strategies) {
    for (const corpus of corpusSizes) {
      for (const query of queries) {
        results.push(simulateRetrievalExecution(strategy, corpus, query));
      }
    }
  }

  const strategySummaries: RetrievalStrategySummary[] = [];
  for (const strategy of strategies) {
    const sr = results.filter(r => r.strategy === strategy.name);
    strategySummaries.push({
      strategy: strategy.name,
      meanPrecision: Math.round(sr.reduce((s, r) => s + r.precision, 0) / sr.length * 1000) / 1000,
      meanRecall: Math.round(sr.reduce((s, r) => s + r.recall, 0) / sr.length * 1000) / 1000,
      meanF1: Math.round(sr.reduce((s, r) => s + r.f1, 0) / sr.length * 1000) / 1000,
      meanMrr: Math.round(sr.reduce((s, r) => s + r.mrr, 0) / sr.length * 1000) / 1000,
      meanLatencyMs: Math.round(sr.reduce((s, r) => s + r.latencyMs, 0) / sr.length),
    });
  }

  const corpusSummaries: RetrievalCorpusSummary[] = [];
  for (const corpus of corpusSizes) {
    const cr = results.filter(r => r.corpusSize === corpus.size);
    corpusSummaries.push({
      corpusSize: corpus.size,
      meanF1: Math.round(cr.reduce((s, r) => s + r.f1, 0) / cr.length * 1000) / 1000,
      meanLatencyMs: Math.round(cr.reduce((s, r) => s + r.latencyMs, 0) / cr.length),
    });
  }

  const overallMeanF1 = Math.round(results.reduce((s, r) => s + r.f1, 0) / results.length * 1000) / 1000;

  let verdict: 'excellent' | 'acceptable' | 'degraded';
  if (overallMeanF1 >= 0.75) {
    verdict = 'excellent';
  } else if (overallMeanF1 >= 0.6) {
    verdict = 'acceptable';
  } else {
    verdict = 'degraded';
  }

  return {
    results,
    strategySummaries,
    corpusSummaries,
    totalTests: results.length,
    overallMeanF1,
    verdict,
  };
}
