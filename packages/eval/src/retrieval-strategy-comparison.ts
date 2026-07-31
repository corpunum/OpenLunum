/**
 * Retrieval strategy comparison (R9.3 — Issue #512).
 *
 * Compares fingerprint, semantic-group, lexical, and hybrid retrieval
 * strategies on a cross-language corpus. Computes precision, recall,
 * and F1 per strategy.
 */

import {
  fingerprintSem,
  NearSemanticFingerprintGenerator,
  type LunumSem,
} from '@corpunum/lunum';

export type StrategyName = 'fingerprint' | 'semantic-group' | 'lexical' | 'hybrid';

export interface RetrievalDocument {
  id: string;
  sem: LunumSem;
  text: string;
  language: string;
  relevantTo: string[];
}

export interface StrategyMetrics {
  strategy: StrategyName;
  precision: number;
  recall: number;
  f1: number;
  retrievedCount: number;
  relevantCount: number;
}

export interface StrategyComparisonReport {
  strategies: StrategyMetrics[];
  bestStrategy: StrategyName;
  corpusSize: number;
  queryCount: number;
}

export interface HybridWeights {
  fingerprint: number;
  semantic: number;
  lexical: number;
}

export const DEFAULT_HYBRID_WEIGHTS: HybridWeights = {
  fingerprint: 0.4,
  semantic: 0.4,
  lexical: 0.2,
};

function fingerprintRetrieve(
  query: LunumSem,
  corpus: RetrievalDocument[],
): string[] {
  const queryFp = fingerprintSem(query);
  return corpus
    .filter(doc => fingerprintSem(doc.sem) === queryFp)
    .map(doc => doc.id);
}

function semanticGroupRetrieve(
  query: LunumSem,
  corpus: RetrievalDocument[],
  threshold: number = 0.7,
): string[] {
  const gen = new NearSemanticFingerprintGenerator(threshold);
  const queryFp = gen.generate(query);
  return corpus
    .filter(doc => gen.compare(queryFp, gen.generate(doc.sem)).similar)
    .map(doc => doc.id);
}

function normalizeText(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(w => w.length > 2);
}

function lexicalRetrieve(
  queryText: string,
  corpus: RetrievalDocument[],
  threshold: number = 0.3,
): string[] {
  const queryTokens = new Set(normalizeText(queryText));
  if (queryTokens.size === 0) return [];

  return corpus
    .filter(doc => {
      const docTokens = normalizeText(doc.text);
      const overlap = docTokens.filter(t => queryTokens.has(t)).length;
      return overlap / queryTokens.size >= threshold;
    })
    .map(doc => doc.id);
}

function hybridRetrieve(
  query: LunumSem,
  queryText: string,
  corpus: RetrievalDocument[],
  weights: HybridWeights = DEFAULT_HYBRID_WEIGHTS,
  threshold: number = 0.4,
): string[] {
  const gen = new NearSemanticFingerprintGenerator(0.7);
  const queryFp = fingerprintSem(query);
  const nearFp = gen.generate(query);
  const queryTokens = new Set(normalizeText(queryText));

  return corpus
    .filter(doc => {
      let score = 0;
      if (fingerprintSem(doc.sem) === queryFp) score += weights.fingerprint;
      const semResult = gen.compare(nearFp, gen.generate(doc.sem));
      score += weights.semantic * semResult.similarity;
      if (queryTokens.size > 0) {
        const docTokens = normalizeText(doc.text);
        const overlap = docTokens.filter(t => queryTokens.has(t)).length;
        score += weights.lexical * (overlap / queryTokens.size);
      }
      return score >= threshold;
    })
    .map(doc => doc.id);
}

function computeMetrics(
  retrieved: string[],
  relevant: string[],
  strategy: StrategyName,
): StrategyMetrics {
  const relevantSet = new Set(relevant);
  const retrievedSet = new Set(retrieved);
  const truePositives = retrieved.filter(id => relevantSet.has(id)).length;
  const precision = retrievedSet.size > 0 ? truePositives / retrievedSet.size : 0;
  const recall = relevantSet.size > 0 ? truePositives / relevantSet.size : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  return {
    strategy,
    precision,
    recall,
    f1,
    retrievedCount: retrievedSet.size,
    relevantCount: relevantSet.size,
  };
}

export interface RetrievalQuery {
  sem: LunumSem;
  text: string;
  relevantDocIds: string[];
}

export function compareStrategies(
  queries: RetrievalQuery[],
  corpus: RetrievalDocument[],
  hybridWeights: HybridWeights = DEFAULT_HYBRID_WEIGHTS,
): StrategyComparisonReport {
  const strategyTotals = new Map<StrategyName, { precision: number; recall: number; f1: number; retrieved: number; relevant: number }>();
  const strategies: StrategyName[] = ['fingerprint', 'semantic-group', 'lexical', 'hybrid'];

  for (const s of strategies) {
    strategyTotals.set(s, { precision: 0, recall: 0, f1: 0, retrieved: 0, relevant: 0 });
  }

  for (const query of queries) {
    const results: Record<StrategyName, string[]> = {
      'fingerprint': fingerprintRetrieve(query.sem, corpus),
      'semantic-group': semanticGroupRetrieve(query.sem, corpus),
      'lexical': lexicalRetrieve(query.text, corpus),
      'hybrid': hybridRetrieve(query.sem, query.text, corpus, hybridWeights),
    };

    for (const s of strategies) {
      const m = computeMetrics(results[s], query.relevantDocIds, s);
      const t = strategyTotals.get(s)!;
      t.precision += m.precision;
      t.recall += m.recall;
      t.f1 += m.f1;
      t.retrieved += m.retrievedCount;
      t.relevant += m.relevantCount;
    }
  }

  const n = Math.max(queries.length, 1);
  const metricsArr: StrategyMetrics[] = strategies.map(s => {
    const t = strategyTotals.get(s)!;
    return {
      strategy: s,
      precision: t.precision / n,
      recall: t.recall / n,
      f1: t.f1 / n,
      retrievedCount: t.retrieved,
      relevantCount: t.relevant,
    };
  });

  metricsArr.sort((a, b) => b.f1 - a.f1);

  return {
    strategies: metricsArr,
    bestStrategy: metricsArr[0]!.strategy,
    corpusSize: corpus.length,
    queryCount: queries.length,
  };
}
