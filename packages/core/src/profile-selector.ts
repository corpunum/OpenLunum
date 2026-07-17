/**
 * Renderer profile selector driven by Token Atlas measurements
 *
 * Analyzes token usage across safe/short/tight profiles for different
 * model types and recommends the optimal profile per model.
 */

import type { ProfileType } from './profiles.js';
import type { LunumRecord } from './types.js';
import { ProfileGenerator, type ProfileResult } from './profiles.js';
import { TokenizerMeasurementFramework, type MeasurementResult } from './tokenizer-measurement.js';

// ── Profile Selection Result ───────────────────────────────────────

export interface ProfileSelectionResult {
  /** Model identifier */
  modelId: string;
  /** Recommended profile type */
  recommendedProfile: ProfileType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Token counts per profile */
  tokenCounts: Record<ProfileType, number>;
  /** Token reduction vs safe */
  reduction: Record<ProfileType, number>;
  /** Preservation scores per profile */
  preservation: Record<ProfileType, number>;
  /** Selection rationale */
  rationale: string;
  /** Warnings */
  warnings: string[];
}

// ── Model Profile Recommendation ───────────────────────────────────

export interface ModelProfileRecommendation {
  /** Model identifier */
  modelId: string;
  /** Best profile type */
  bestProfile: ProfileType;
  /** Token count for best profile */
  bestTokenCount: number;
  /** Token count for safe profile */
  safeTokenCount: number;
  /** Reduction ratio */
  reductionRatio: number;
  /** Preservation score */
  preservationScore: number;
  /** Recommendation notes */
  notes: string;
}

// ── Profile Selector ───────────────────────────────────────────────

export class ProfileSelector {
  private profileGenerator: ProfileGenerator;
  private measurements: Map<string, MeasurementResult[]>;
  private recommendations: Map<string, ProfileSelectionResult>;

  constructor() {
    this.profileGenerator = new ProfileGenerator();
    this.measurements = new Map();
    this.recommendations = new Map();
  }

  /**
   * Measure a record across all profiles and return selection results
   */
  selectProfile(record: LunumRecord, modelId?: string): ProfileSelectionResult {
    // Measure across all profiles
    const safeResult = this.profileGenerator.profileSafe(record);
    const shortResult = this.profileGenerator.profileShort(record);
    const tightResult = this.profileGenerator.profileTight(record);

    const tokenCounts: Record<ProfileType, number> = {
      safe: safeResult.originalTokens,
      short: shortResult.originalTokens,
      tight: tightResult.originalTokens
    };

    const reduction: Record<ProfileType, number> = {
      safe: 0,
      short: safeResult.originalTokens > 0 ? (safeResult.originalTokens - shortResult.profiledTokens) / safeResult.originalTokens : 0,
      tight: safeResult.originalTokens > 0 ? (safeResult.originalTokens - tightResult.profiledTokens) / safeResult.originalTokens : 0
    };

    const preservation: Record<ProfileType, number> = {
      safe: safeResult.preservation,
      short: shortResult.preservation,
      tight: tightResult.preservation
    };

    // Determine best profile based on model type
    const recommendedProfile = this.determineBestProfile(safeResult, shortResult, tightResult, modelId);
    const confidence = this.calculateConfidence(safeResult, shortResult, tightResult, recommendedProfile);

    // Build rationale
    const rationale = this.buildRationale(recommendedProfile, tokenCounts, reduction, preservation, modelId);
    const warnings = this.collectWarnings(safeResult, shortResult, tightResult);

    const result: ProfileSelectionResult = {
      modelId: modelId ?? 'generic',
      recommendedProfile,
      confidence,
      tokenCounts,
      reduction,
      preservation,
      rationale,
      warnings
    };

    // Cache recommendation if modelId provided
    if (modelId) {
      this.recommendations.set(modelId, result);
      // Store measurements
      const key = modelId;
      const existing = this.measurements.get(key) ?? [];
      const tc = tokenCounts as Record<string, number>;
      existing.push({
        record,
        results: [
          { tokenizer: 'safe', tokens: tc.safe ?? 0 },
          { tokenizer: 'short', tokens: tc.short ?? 0 },
          { tokenizer: 'tight', tokens: tc.tight ?? 0 }
        ],
        averageTokens: ((tc.safe ?? 0) + (tc.short ?? 0) + (tc.tight ?? 0)) / 3,
        minTokens: Math.min(...Object.values(tc)),
        maxTokens: Math.max(...Object.values(tc)),
        timestamp: Date.now()
      });
      this.measurements.set(key, existing);
    }

    return result;
  }

  /**
   * Get recommendation for a previously measured model
   */
  getRecommendation(modelId: string): ProfileSelectionResult | undefined {
    return this.recommendations.get(modelId);
  }

  /**
   * Get all measurements for a model
   */
  getMeasurements(modelId: string): MeasurementResult[] {
    return this.measurements.get(modelId) ?? [];
  }

  /**
   * Get aggregate statistics across all models
   */
  getAggregateStats(): {
    totalModels: number;
    totalMeasurements: number;
    profileDistribution: Record<ProfileType, number>;
    averageTokenCount: number;
  } {
    const profileDistribution: Record<ProfileType, number> = { safe: 0, short: 0, tight: 0 };
    let totalTokenCount = 0;
    let totalCount = 0;

    for (const rec of this.recommendations.values()) {
      const profile = rec.recommendedProfile;
      profileDistribution[profile]++;
      const tc = rec.tokenCounts as Record<string, number>;
      totalTokenCount += tc[profile] ?? 0;
      totalCount++;
    }

    return {
      totalModels: this.recommendations.size,
      totalMeasurements: this.measurements.size,
      profileDistribution,
      averageTokenCount: totalCount > 0 ? totalTokenCount / totalCount : 0
    };
  }

  /**
   * Determine the best profile based on model characteristics
   */
  private determineBestProfile(
    safe: ProfileResult,
    short: ProfileResult,
    tight: ProfileResult,
    modelId?: string
  ): ProfileType {
    // Model-specific heuristics
    const isSmallModel = modelId ? this.isSmallModel(modelId) : false;
    const isLargeModel = modelId ? this.isLargeModel(modelId) : false;

    // For small models (limited context), prefer short or tight
    if (isSmallModel) {
      if (short.preservation >= 0.8) return 'short';
      if (tight.preservation >= 0.7) return 'tight';
      return 'short';
    }

    // For large models, prefer safe unless tokens are excessive
    if (isLargeModel) {
      if (safe.originalTokens < 500) return 'safe';
      if (short.preservation >= 0.9) return 'short';
      return 'safe';
    }

    // Default: prefer preservation over token reduction
    if (short.preservation >= 0.9 && short.reduction >= 0.3) return 'short';
    if (safe.preservation >= 0.95) return 'safe';
    return 'short';
  }

  /**
   * Calculate confidence score for the recommendation
   */
  private calculateConfidence(
    safe: ProfileResult,
    short: ProfileResult,
    tight: ProfileResult,
    recommendedProfile: ProfileType
  ): number {
    // Base confidence on preservation score and clear differentiation
    const preservation = {
      safe: safe.preservation,
      short: short.preservation,
      tight: tight.preservation
    } as Record<ProfileType, number>;

    const pr = preservation as Record<string, number>;
    const recommendedPreservation = pr[recommendedProfile] ?? 0;
    const otherPreservation = Object.entries(preservation)
      .filter(([k]) => k !== recommendedProfile)
      .map(([, v]) => v);

    const minOtherPreservation = otherPreservation.length > 0 ? Math.min(...otherPreservation) : 0;
    const diff = recommendedPreservation - minOtherPreservation;

    // Higher diff = more confidence (clear winner)
    // Also factor in preservation score itself
    return Math.min(1, Math.max(0.5, (diff * 2 + recommendedPreservation) / 2));
  }

  /**
   * Build selection rationale string
   */
  private buildRationale(
    profile: ProfileType,
    tokenCounts: Record<ProfileType, number>,
    reduction: Record<ProfileType, number>,
    preservation: Record<ProfileType, number>,
    modelId?: string
  ): string {
    const parts: string[] = [];

    if (modelId) parts.push(`Model: ${modelId}`);
    parts.push(`Profile: ${profile}`);
    const tc = tokenCounts as Record<string, number>;
    const pv = preservation as Record<string, number>;
    parts.push(`Tokens: ${tc[profile] ?? 0}`);
    parts.push(`Preservation: ${(pv[profile] ?? 0).toFixed(2)}`);

    const red = reduction as Record<string, number>;
    if ((red.short as number) > 0) parts.push(`Short reduction: ${((red.short as number) * 100).toFixed(0)}%`);
    if ((red.tight as number) > 0) parts.push(`Tight reduction: ${((red.tight as number) * 100).toFixed(0)}%`);

    return parts.join(' | ');
  }

  /**
   * Collect warnings from all profiles
   */
  private collectWarnings(safe: ProfileResult, short: ProfileResult, tight: ProfileResult): string[] {
    const warnings = new Set<string>();

    for (const w of safe.warnings ?? []) warnings.add(w);
    for (const w of short.warnings ?? []) warnings.add(w);
    for (const w of tight.warnings ?? []) warnings.add(w);

    return Array.from(warnings);
  }

  /**
   * Check if model is small (limited context window)
   */
  private isSmallModel(modelId: string): boolean {
    const smallPatterns = ['8b', '7b', '3b', '1.5b', '1b', 'small', 'mini'];
    return smallPatterns.some(p => modelId.toLowerCase().includes(p));
  }

  /**
   * Check if model is large (generous context window)
   */
  private isLargeModel(modelId: string): boolean {
    const largePatterns = ['70b', '65b', '40b', '34b', 'large', 'xl', 'max'];
    return largePatterns.some(p => modelId.toLowerCase().includes(p));
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const profileSelectorExports = [
  ProfileSelector
] as const;
