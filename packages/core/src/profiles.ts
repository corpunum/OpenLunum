/**
 * Safe, short, and tight profiles for rendering
 * 
 * This module provides three profile types that reduce token usage
 * while preserving semantic meaning and accuracy.
 */

import type { LunumSem, LunumRecord, LunumClause, LunumRendering } from './types.js';

// ── Profile Type ───────────────────────────────────────────────────

export type ProfileType = 'safe' | 'short' | 'tight';

// ── Profile Configuration ──────────────────────────────────────────

export interface ProfileConfig {
  /** Profile type */
  type: ProfileType;
  /** Whether to preserve all annotations */
  preserveAnnotations?: boolean;
  /** Whether to preserve provenance */
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
        preserveAnnotations: true,
        preserveProvenance: true,
        maxTokenReduction: 0.3
      }],
      ['short', {
        type: 'short',
        preserveAnnotations: false,
        preserveProvenance: true,
        maxTokenReduction: 0.5
      }],
      ['tight', {
        type: 'tight',
        preserveAnnotations: false,
        preserveProvenance: false,
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

    // Preserve or remove annotations based on config
    if (!config.preserveAnnotations) {
      profiled.sem = {
        ...record.sem,
        annotations: {}
      };
    }

    // Preserve or remove provenance based on config
    if (!config.preserveProvenance) {
      profiled.sem = {
        ...record.sem,
        provenance: {}
      };
    }

    // Shorten clauses for short and tight profiles
    if (config.type === 'short' || config.type === 'tight') {
      profiled.sem = {
        ...profiled.sem,
        clauses: this.shortenClauses(profiled.sem.clauses, config)
      };
    }

    // Remove renderings for tight profile
    if (config.type === 'tight') {
      profiled.renderings = {};
    }

    return profiled;
  }

  /**
   * Shorten clauses
   */
  private shortenClauses(clauses: LunumClause[], config: Required<ProfileConfig>): LunumClause[] {
    return clauses.map(clause => {
      const shortened = {
        predicate: clause.predicate,
        roles: {},
        negated: clause.negated,
        conditions: clause.conditions,
        consequences: clause.consequences
      } as LunumClause;

      // Shorten roles based on profile type
      for (const [role, value] of Object.entries(clause.roles ?? {})) {
        if (typeof value === 'string' && (config.type === 'tight' || (config.type === 'short' && value.length > 50))) {
          shortened.roles[role] = value.substring(0, 50) + (value.length > 50 ? '...' : '');
        } else {
          shortened.roles[role] = value;
        }
      }

      return shortened;
    });
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

    // Check if annotations are preserved
    if (!this.configs.get('safe')!.preserveAnnotations && original.sem.annotations && Object.keys(original.sem.annotations).length > 0) {
      if (!profiled.sem.annotations || Object.keys(profiled.sem.annotations).length === 0) {
        score -= 0.1;
      }
    }

    // Check if provenance is preserved
    if (!this.configs.get('safe')!.preserveProvenance && original.sem.provenance && Object.keys(original.sem.provenance).length > 0) {
      if (!profiled.sem.provenance || Object.keys(profiled.sem.provenance).length === 0) {
        score -= 0.1;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Generate warnings
   */
  private generateWarnings(original: LunumRecord, profiled: LunumRecord, config: Required<ProfileConfig>): string[] {
    const warnings: string[] = [];

    if (!config.preserveAnnotations && original.sem.annotations && Object.keys(original.sem.annotations).length > 0) {
      warnings.push('Annotations removed');
    }

    if (!config.preserveProvenance && original.sem.provenance && Object.keys(original.sem.provenance).length > 0) {
      warnings.push('Provenance removed');
    }

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
    this.configs.set(type, { ...existing, ...config } as Required<ProfileConfig>);
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const profileExports = [
  ProfileGenerator
] as const;