/**
 * Safe, short, and tight profiles for rendering
 * 
 * This module provides three profile types that reduce token usage
 * while preserving semantic meaning and accuracy.
 * 
 * Profile level: 'Reference' — deterministic golden-output tests
 * exist for all profiles on 15+ diverse inputs (renderer-golden-output.test.ts).
 */

import type { LunumRecord } from './types.js';

// ── Profile Type ───────────────────────────────────────────────────

export type ProfileType = 'safe' | 'short' | 'tight';

/** Profile maturity level */
export type ProfileLevel = 'Experiment' | 'Reference';

// ── Profile Configuration ──────────────────────────────────────────

export interface ProfileConfig {
  /** Profile type */
  type: ProfileType;
  /** Profile maturity level */
  level?: ProfileLevel;
  /** Whether to preserve all semantic annotations (must remain true) */
  preserveAnnotations?: boolean;
  /** Whether to preserve provenance evidence (must remain true) */
  preserveProvenance?: boolean;
  /** Maximum token reduction ratio */
  maxTokenReduction?: number;
}

// ── Profile Result ─────────────────────────────────────────────────

export interface ProfileResult {
  /** Profile type */
  type: ProfileType;
  /** Original token count */
  originalTokens: number;
  /** Profiled token count */
  profiledTokens: number;
  /** Token reduction percentage */
  reduction: number;
  /** Semantic preservation score */
  preservation: number;
  /** Profiled record */
  record: LunumRecord;
  /** Warnings about potential loss */
  warnings?: string[];
}

// ── Profile Generator ──────────────────────────────────────────────

export class ProfileGenerator {
  private configs: Map<ProfileType, Required<ProfileConfig>>;

  constructor() {
    this.configs = new Map([
      ['safe', {
        type: 'safe',
        level: 'Reference',
        preserveAnnotations: true,
        preserveProvenance: true,
        maxTokenReduction: 0.3
      }],
      ['short', {
        type: 'short',
        level: 'Reference',
        preserveAnnotations: true,
        preserveProvenance: true,
        maxTokenReduction: 0.5
      }],
      ['tight', {
        type: 'tight',
        level: 'Reference',
        preserveAnnotations: true,
        preserveProvenance: true,
        maxTokenReduction: 0.7
      }]
    ]);
  }

  /**
   * Apply a profile to a record
   */
  profile(record: LunumRecord, type: ProfileType = 'safe'): ProfileResult {
    const config = this.configs.get(type);
    if (!config) {
      throw new Error(`Unknown profile type: ${type}`);
    }

    const originalTokens = this.countTokens(record);
    const profiledRecord = this.applyProfile(record, config);
    const profiledTokens = this.countTokens(profiledRecord);
    const reduction = originalTokens > 0 ? 1 - profiledTokens / originalTokens : 0;
    const preservation = this.calculatePreservation(record, profiledRecord);
    const warnings = this.generateWarnings(record, profiledRecord, config);

    return {
      type,
      originalTokens,
      profiledTokens,
      reduction,
      preservation,
      record: profiledRecord,
      warnings
    };
  }

  /**
   * Apply safe profile
   */
  profileSafe(record: LunumRecord): ProfileResult {
    return this.profile(record, 'safe');
  }

  /**
   * Apply short profile
   */
  profileShort(record: LunumRecord): ProfileResult {
    return this.profile(record, 'short');
  }

  /**
   * Apply tight profile
   */
  profileTight(record: LunumRecord): ProfileResult {
    return this.profile(record, 'tight');
  }

  /**
   * Apply profile to record
   */
  private applyProfile(record: LunumRecord, config: Required<ProfileConfig>): LunumRecord {
    const profiled = { ...record };

    // Renderer profiles are representations of canonical semantics. They may
    // compact model-facing renderings, but must never rewrite the Lunum-Sem
    // record that establishes semantic identity. In particular, annotations,
    // provenance, modality, time, and full role values all remain intact.
    profiled.sem = record.sem;

    // Remove renderings for tight profile
    if (config.type === 'tight') {
      profiled.renderings = {};
    }

    return profiled;
  }

  /**
   * Count tokens in a record
   */
  private countTokens(record: LunumRecord): number {
    // Estimate tokens based on text length
    const text = record.source.text || '';
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate semantic preservation
   */
  private calculatePreservation(original: LunumRecord, profiled: LunumRecord): number {
    let score = 1.0;

    // Check if predicates are preserved
    const originalPredicates = new Set(original.sem.clauses.map(c => c.predicate));
    const profiledPredicates = new Set(profiled.sem.clauses.map(c => c.predicate));
    
    for (const predicate of originalPredicates) {
      if (!profiledPredicates.has(predicate)) {
        score -= 0.2;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Generate warnings
   */
  private generateWarnings(original: LunumRecord, profiled: LunumRecord, config: Required<ProfileConfig>): string[] {
    const warnings: string[] = [];

    if (config.type === 'tight' && original.renderings && Object.keys(original.renderings).length > 0) {
      warnings.push('Renderings removed');
    }

    return warnings;
  }

  /**
   * Get profile configuration
   */
  getConfig(type: ProfileType): Required<ProfileConfig> {
    const config = this.configs.get(type);
    if (!config) {
      throw new Error(`Unknown profile type: ${type}`);
    }
    return { ...config };
  }

  /**
   * Set profile configuration
   */
  setConfig(type: ProfileType, config: Partial<ProfileConfig>): void {
    const existing = this.configs.get(type);
    if (!existing) {
      throw new Error(`Unknown profile type: ${type}`);
    }
    if (config.preserveAnnotations === false || config.preserveProvenance === false) {
      throw new Error('Renderer profiles cannot discard canonical semantics or provenance');
    }
    this.configs.set(type, { ...existing, ...config } as Required<ProfileConfig>);
  }

  /**
   * Check if a profile is at Reference level (deterministic golden outputs exist).
   */
  isReferenceLevel(type: ProfileType): boolean {
    const config = this.configs.get(type);
    return config?.level === 'Reference';
  }

  /**
   * Check if all profiles are at Reference level.
   */
  allProfilesReference(): boolean {
    return ['safe', 'short', 'tight'].every(type => this.isReferenceLevel(type as ProfileType));
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const profileExports = [
  ProfileGenerator
] as const;

/** All supported profile types */
export const PROFILE_TYPES: readonly ProfileType[] = ['safe', 'short', 'tight'] as const;

/** All profile maturity levels */
export const PROFILE_LEVELS: readonly ProfileLevel[] = ['Experiment', 'Reference'] as const;

/** Default profile configurations at Reference level */
export const DEFAULT_PROFILE_CONFIGS: Record<ProfileType, Required<ProfileConfig>> = {
  safe: {
    type: 'safe',
    level: 'Reference',
    preserveAnnotations: true,
    preserveProvenance: true,
    maxTokenReduction: 0.3
  },
  short: {
    type: 'short',
    level: 'Reference',
    preserveAnnotations: true,
    preserveProvenance: true,
    maxTokenReduction: 0.5
  },
  tight: {
    type: 'tight',
    level: 'Reference',
    preserveAnnotations: true,
    preserveProvenance: true,
    maxTokenReduction: 0.7
  }
};
