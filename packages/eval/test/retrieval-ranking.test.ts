import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFreshnessDecay,
  computeRankedScore,
  rankResults,
  DEFAULT_RANKING_WEIGHTS,
  type RankingWeights,
} from '../src/retrieval-ranking.js';

describe('retrieval ranking', () => {
  describe('computeFreshnessDecay', () => {
    it('returns 1 for current timestamp', () => {
      const now = Date.now();
      assert.equal(computeFreshnessDecay(now, now), 1);
    });

    it('returns 0.5 at exactly one half-life', () => {
      const halfLife = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const score = computeFreshnessDecay(now - halfLife, now, halfLife);
      assert.ok(Math.abs(score - 0.5) < 1e-10);
    });

    it('returns ~0.25 at two half-lives', () => {
      const halfLife = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const score = computeFreshnessDecay(now - 2 * halfLife, now, halfLife);
      assert.ok(Math.abs(score - 0.25) < 1e-10);
    });

    it('future timestamps clamp to 1', () => {
      const now = Date.now();
      assert.equal(computeFreshnessDecay(now + 100000, now), 1);
    });
  });

  describe('computeRankedScore', () => {
    it('returns semantic score when signals are neutral', () => {
      const score = computeRankedScore(0.9, { freshness: 1, importance: 0.5, provenance: 0.5 });
      assert.ok(score > 0);
      assert.ok(score <= 1);
    });

    it('higher importance boosts score', () => {
      const low = computeRankedScore(0.8, { importance: 0.2 });
      const high = computeRankedScore(0.8, { importance: 0.9 });
      assert.ok(high > low);
    });

    it('higher provenance boosts score', () => {
      const low = computeRankedScore(0.8, { provenance: 0.1 });
      const high = computeRankedScore(0.8, { provenance: 0.9 });
      assert.ok(high > low);
    });

    it('stale freshness reduces score', () => {
      const fresh = computeRankedScore(0.8, { freshness: 1.0 });
      const stale = computeRankedScore(0.8, { freshness: 0.1 });
      assert.ok(fresh > stale);
    });

    it('returns 0 when all weights are 0', () => {
      const weights: RankingWeights = { semantic: 0, freshness: 0, importance: 0, provenance: 0 };
      assert.equal(computeRankedScore(0.9, {}, weights), 0);
    });

    it('uses default signals when not provided', () => {
      const score = computeRankedScore(0.9, {});
      assert.ok(score > 0);
    });
  });

  describe('rankResults', () => {
    it('sorts by composite score descending', () => {
      const results = [
        { id: 'low', semanticScore: 0.5, signals: { importance: 0.1 } },
        { id: 'high', semanticScore: 0.9, signals: { importance: 0.9 } },
        { id: 'mid', semanticScore: 0.7, signals: { importance: 0.5 } },
      ];
      const ranked = rankResults(results);
      assert.equal(ranked[0]!.id, 'high');
      assert.equal(ranked[2]!.id, 'low');
    });

    it('preserves all result fields', () => {
      const results = [
        { id: 'a', semanticScore: 0.8, signals: { freshness: 0.9, importance: 0.7, provenance: 0.6 } },
      ];
      const ranked = rankResults(results);
      assert.equal(ranked[0]!.id, 'a');
      assert.equal(ranked[0]!.semanticScore, 0.8);
      assert.deepStrictEqual(ranked[0]!.signals, { freshness: 0.9, importance: 0.7, provenance: 0.6 });
      assert.ok(typeof ranked[0]!.compositeScore === 'number');
    });

    it('ranking is stable for equal scores', () => {
      const results = [
        { id: 'a', semanticScore: 0.8, signals: { importance: 0.5 } },
        { id: 'b', semanticScore: 0.8, signals: { importance: 0.5 } },
      ];
      const r1 = rankResults(results);
      const r2 = rankResults(results);
      assert.equal(r1[0]!.id, r2[0]!.id);
    });

    it('custom weights change ranking order', () => {
      const results = [
        { id: 'sem-heavy', semanticScore: 0.9, signals: { importance: 0.1 } },
        { id: 'imp-heavy', semanticScore: 0.5, signals: { importance: 0.95 } },
      ];
      const semWeights: RankingWeights = { semantic: 0.9, freshness: 0, importance: 0.1, provenance: 0 };
      const impWeights: RankingWeights = { semantic: 0.1, freshness: 0, importance: 0.9, provenance: 0 };

      const semRanked = rankResults(results, semWeights);
      assert.equal(semRanked[0]!.id, 'sem-heavy');

      const impRanked = rankResults(results, impWeights);
      assert.equal(impRanked[0]!.id, 'imp-heavy');
    });

    it('empty input returns empty array', () => {
      assert.deepStrictEqual(rankResults([]), []);
    });
  });

  describe('DEFAULT_RANKING_WEIGHTS', () => {
    it('weights sum to 1', () => {
      const sum = DEFAULT_RANKING_WEIGHTS.semantic + DEFAULT_RANKING_WEIGHTS.freshness +
        DEFAULT_RANKING_WEIGHTS.importance + DEFAULT_RANKING_WEIGHTS.provenance;
      assert.ok(Math.abs(sum - 1) < 1e-10);
    });

    it('semantic weight is dominant', () => {
      assert.ok(DEFAULT_RANKING_WEIGHTS.semantic > DEFAULT_RANKING_WEIGHTS.freshness);
      assert.ok(DEFAULT_RANKING_WEIGHTS.semantic > DEFAULT_RANKING_WEIGHTS.importance);
      assert.ok(DEFAULT_RANKING_WEIGHTS.semantic > DEFAULT_RANKING_WEIGHTS.provenance);
    });
  });
});
