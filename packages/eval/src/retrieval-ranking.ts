/**
 * Retrieval ranking signals (R9.6 — Issue #514).
 *
 * Adds ranking dimensions beyond semantic similarity: freshness (recency),
 * importance (user-annotated weight), and provenance (source trustworthiness).
 */

export interface RankingSignal {
  freshness?: number;
  importance?: number;
  provenance?: number;
}

export interface RankingWeights {
  semantic: number;
  freshness: number;
  importance: number;
  provenance: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  semantic: 0.6,
  freshness: 0.15,
  importance: 0.15,
  provenance: 0.1,
};

export interface RankedResult {
  id: string;
  semanticScore: number;
  signals: RankingSignal;
  compositeScore: number;
}

export function computeFreshnessDecay(
  timestampMs: number,
  nowMs: number = Date.now(),
  halfLifeMs: number = 7 * 24 * 60 * 60 * 1000,
): number {
  const ageMs = Math.max(0, nowMs - timestampMs);
  return Math.pow(0.5, ageMs / halfLifeMs);
}

export function computeRankedScore(
  semanticScore: number,
  signals: RankingSignal,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  const fresh = signals.freshness ?? 1;
  const imp = signals.importance ?? 0.5;
  const prov = signals.provenance ?? 0.5;

  const totalWeight = weights.semantic + weights.freshness + weights.importance + weights.provenance;
  if (totalWeight === 0) return 0;

  const raw =
    weights.semantic * semanticScore +
    weights.freshness * fresh +
    weights.importance * imp +
    weights.provenance * prov;

  return raw / totalWeight;
}

export function rankResults(
  results: Array<{ id: string; semanticScore: number; signals: RankingSignal }>,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): RankedResult[] {
  return results
    .map(r => ({
      id: r.id,
      semanticScore: r.semanticScore,
      signals: r.signals,
      compositeScore: computeRankedScore(r.semanticScore, r.signals, weights),
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);
}
