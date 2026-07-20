import { ProfileGenerator, type ProfileResult, type ProfileType } from './profiles.js';
import type { MeasurementResult } from './tokenizer-measurement.js';
import type { LunumRecord } from './types.js';

export interface ProfileSelectionResult {
  modelId: string;
  recommendedProfile: ProfileType;
  confidence: number;
  tokenCounts: Record<ProfileType, number>;
  /** Token reduction relative to the safe renderer output. */
  reduction: Record<ProfileType, number>;
  preservation: Record<ProfileType, number>;
  rationale: string;
  warnings: string[];
}

export interface ModelProfileRecommendation {
  modelId: string;
  bestProfile: ProfileType;
  bestTokenCount: number;
  safeTokenCount: number;
  reductionRatio: number;
  preservationScore: number;
  notes: string;
}

export class ProfileSelector {
  private readonly profileGenerator = new ProfileGenerator();
  private readonly measurements = new Map<string, MeasurementResult[]>();
  private readonly recommendations = new Map<string, ProfileSelectionResult>();

  selectProfile(record: LunumRecord, modelId?: string): ProfileSelectionResult {
    const safeResult = this.profileGenerator.profileSafe(record);
    const shortResult = this.profileGenerator.profileShort(record);
    const tightResult = this.profileGenerator.profileTight(record);

    const tokenCounts: Record<ProfileType, number> = {
      safe: safeResult.profiledTokens,
      short: shortResult.profiledTokens,
      tight: tightResult.profiledTokens,
    };
    const safeTokens = tokenCounts.safe;
    const reduction: Record<ProfileType, number> = {
      safe: 0,
      short: safeTokens > 0 ? (safeTokens - tokenCounts.short) / safeTokens : 0,
      tight: safeTokens > 0 ? (safeTokens - tokenCounts.tight) / safeTokens : 0,
    };
    const preservation: Record<ProfileType, number> = {
      safe: safeResult.preservation,
      short: shortResult.preservation,
      tight: tightResult.preservation,
    };

    const recommendedProfile = this.determineBestProfile(
      safeResult,
      shortResult,
      tightResult,
      reduction,
      modelId,
    );
    const result: ProfileSelectionResult = {
      modelId: modelId ?? 'generic',
      recommendedProfile,
      confidence: this.calculateConfidence(preservation, recommendedProfile),
      tokenCounts,
      reduction,
      preservation,
      rationale: this.buildRationale(recommendedProfile, tokenCounts, reduction, preservation, modelId),
      warnings: this.collectWarnings(safeResult, shortResult, tightResult),
    };

    if (modelId) {
      this.recommendations.set(modelId, result);
      const existing = this.measurements.get(modelId) ?? [];
      existing.push({
        record,
        results: [
          { tokenizer: 'safe', tokens: tokenCounts.safe },
          { tokenizer: 'short', tokens: tokenCounts.short },
          { tokenizer: 'tight', tokens: tokenCounts.tight },
        ],
        averageTokens: (tokenCounts.safe + tokenCounts.short + tokenCounts.tight) / 3,
        minTokens: Math.min(tokenCounts.safe, tokenCounts.short, tokenCounts.tight),
        maxTokens: Math.max(tokenCounts.safe, tokenCounts.short, tokenCounts.tight),
        timestamp: Date.now(),
      });
      this.measurements.set(modelId, existing);
    }

    return result;
  }

  getRecommendation(modelId: string): ProfileSelectionResult | undefined {
    return this.recommendations.get(modelId);
  }

  getMeasurements(modelId: string): MeasurementResult[] {
    return this.measurements.get(modelId) ?? [];
  }

  getAggregateStats(): {
    totalModels: number;
    totalMeasurements: number;
    profileDistribution: Record<ProfileType, number>;
    averageTokenCount: number;
  } {
    const profileDistribution: Record<ProfileType, number> = { safe: 0, short: 0, tight: 0 };
    let totalTokenCount = 0;

    for (const recommendation of this.recommendations.values()) {
      profileDistribution[recommendation.recommendedProfile] += 1;
      totalTokenCount += recommendation.tokenCounts[recommendation.recommendedProfile];
    }

    return {
      totalModels: this.recommendations.size,
      totalMeasurements: [...this.measurements.values()].reduce((sum, values) => sum + values.length, 0),
      profileDistribution,
      averageTokenCount: this.recommendations.size > 0 ? totalTokenCount / this.recommendations.size : 0,
    };
  }

  private determineBestProfile(
    safe: ProfileResult,
    short: ProfileResult,
    tight: ProfileResult,
    reduction: Record<ProfileType, number>,
    modelId?: string,
  ): ProfileType {
    if (modelId && this.isSmallModel(modelId)) {
      if (short.preservation >= 0.8) return 'short';
      if (tight.preservation >= 0.7) return 'tight';
      return 'safe';
    }

    if (modelId && this.isLargeModel(modelId)) {
      if (safe.preservation >= 0.95) return 'safe';
      if (short.preservation >= 0.9) return 'short';
      return 'safe';
    }

    if (short.preservation >= 0.9 && reduction.short >= 0.2) return 'short';
    if (safe.preservation >= 0.95) return 'safe';
    if (tight.preservation >= 0.9 && reduction.tight > reduction.short) return 'tight';
    return 'short';
  }

  private calculateConfidence(
    preservation: Record<ProfileType, number>,
    recommendedProfile: ProfileType,
  ): number {
    const recommended = preservation[recommendedProfile];
    const alternatives = Object.entries(preservation)
      .filter(([profile]) => profile !== recommendedProfile)
      .map(([, value]) => value);
    const weakestAlternative = alternatives.length > 0 ? Math.min(...alternatives) : 0;
    return Math.min(1, Math.max(0.5, ((recommended - weakestAlternative) * 2 + recommended) / 2));
  }

  private buildRationale(
    profile: ProfileType,
    tokenCounts: Record<ProfileType, number>,
    reduction: Record<ProfileType, number>,
    preservation: Record<ProfileType, number>,
    modelId?: string,
  ): string {
    const parts: string[] = [];
    if (modelId) parts.push(`Model: ${modelId}`);
    parts.push(`Profile: ${profile}`);
    parts.push(`Tokens: ${tokenCounts[profile]}`);
    parts.push(`Preservation: ${preservation[profile].toFixed(2)}`);
    if (reduction.short > 0) parts.push(`Short reduction: ${(reduction.short * 100).toFixed(0)}%`);
    if (reduction.tight > 0) parts.push(`Tight reduction: ${(reduction.tight * 100).toFixed(0)}%`);
    return parts.join(' | ');
  }

  private collectWarnings(safe: ProfileResult, short: ProfileResult, tight: ProfileResult): string[] {
    return [...new Set([
      ...(safe.warnings ?? []),
      ...(short.warnings ?? []),
      ...(tight.warnings ?? []),
    ])];
  }

  private isSmallModel(modelId: string): boolean {
    const patterns = ['8b', '7b', '3b', '1.5b', '1b', 'small', 'mini'];
    return patterns.some((pattern) => modelId.toLowerCase().includes(pattern));
  }

  private isLargeModel(modelId: string): boolean {
    const patterns = ['70b', '65b', '40b', '34b', 'large', 'xl', 'max'];
    return patterns.some((pattern) => modelId.toLowerCase().includes(pattern));
  }
}

export const profileSelectorExports = [ProfileSelector] as const;
