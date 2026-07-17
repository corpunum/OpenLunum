/**
 * Full-prompt quality gates for local models
 * 
 * This module provides quality gate functionality for validating
 * prompts before sending to local models.
 */

import type { LunumRecord } from './types.js';

// ── Quality Gate Configuration ─────────────────────────────────────

export interface PromptGateConfig {
  /** Maximum tokens allowed */
  maxTokens?: number;
  /** Minimum semantic preservation score */
  minSemanticPreservation?: number;
  /** Whether to enforce token limits */
  enforceTokenLimit?: boolean;
  /** Whether to check semantic preservation */
  checkSemanticPreservation?: boolean;
}

// ── Quality Gate Result ────────────────────────────────────────────

export interface PromptGateResult {
  /** Whether the prompt passes all gates */
  passed: boolean;
  /** Token count */
  tokens: number;
  /** Semantic preservation score */
  semanticPreservation?: number;
  /** Errors if any gate failed */
  errors?: string[];
  /** Warnings if any */
  warnings?: string[];
}

// ── Prompt Quality Gates ───────────────────────────────────────────

export class PromptQualityGates {
  private config: Required<PromptGateConfig>;

  constructor(config: PromptGateConfig = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 4096,
      minSemanticPreservation: config.minSemanticPreservation ?? 0.8,
      enforceTokenLimit: config.enforceTokenLimit ?? true,
      checkSemanticPreservation: config.checkSemanticPreservation ?? true
    };
  }

  /**
   * Validate a prompt against quality gates
   */
  validate(record: LunumRecord, tokenCount?: number, semanticScore?: number): PromptGateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get token count if not provided
    const tokens = tokenCount ?? this.estimateTokens(record);

    // Check token limit
    if (this.config.enforceTokenLimit) {
      if (tokens > this.config.maxTokens) {
        errors.push(`Token count ${tokens} exceeds maximum ${this.config.maxTokens}`);
      } else if (tokens > this.config.maxTokens * 0.8) {
        warnings.push(`Token count ${tokens} approaching limit ${this.config.maxTokens}`);
      }
    }

    // Check semantic preservation
    let semanticPreservation = semanticScore;
    if (this.config.checkSemanticPreservation && semanticPreservation === undefined) {
      semanticPreservation = this.estimateSemanticPreservation(record);
    }

    if (this.config.checkSemanticPreservation && semanticPreservation !== undefined) {
      if (semanticPreservation < this.config.minSemanticPreservation) {
        errors.push(`Semantic preservation ${semanticPreservation} below minimum ${this.config.minSemanticPreservation}`);
      }
    }

    return {
      passed: errors.length === 0,
      tokens,
      semanticPreservation,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate multiple prompts
   */
  validateBatch(records: LunumRecord[], tokenCounts?: number[], semanticScores?: number[]): PromptGateResult[] {
    return records.map((record, i) => {
      const tokenCount = tokenCounts?.[i];
      const semanticScore = semanticScores?.[i];
      return this.validate(record, tokenCount, semanticScore);
    });
  }

  /**
   * Estimate token count from record
   */
  private estimateTokens(record: LunumRecord): number {
    // Priority: source text > Lunum code > rendered text
    const text = record.source.text || '';
    if (text) {
      // Rough estimate: ~4 characters per token for English
      return Math.ceil(text.length / 4);
    }

    // Check renderings
    const renderings = Object.values(record.renderings);
    if (renderings.length > 0) {
      const code = (renderings[0] as any).code || '';
      return Math.ceil(code.length / 4);
    }

    return 0;
  }

  /**
   * Estimate semantic preservation score
   */
  private estimateSemanticPreservation(record: LunumRecord): number {
    let score = 1.0;

    // Check for missing required fields
    if (!record.source.text) {
      score -= 0.2;
    }

    if (!record.sem || !record.sem.clauses || record.sem.clauses.length === 0) {
      score -= 0.3;
    }

    if (!record.fingerprint) {
      score -= 0.1;
    }

    // Check policy
    if (!record.policy || !record.policy.eligible) {
      score -= 0.2;
    }

    return Math.max(0, score);
  }

  /**
   * Get configuration
   */
  getConfig(): Required<PromptGateConfig> {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<PromptGateConfig>): void {
    if (config.maxTokens !== undefined) this.config.maxTokens = config.maxTokens;
    if (config.minSemanticPreservation !== undefined) this.config.minSemanticPreservation = config.minSemanticPreservation;
    if (config.enforceTokenLimit !== undefined) this.config.enforceTokenLimit = config.enforceTokenLimit;
    if (config.checkSemanticPreservation !== undefined) this.config.checkSemanticPreservation = config.checkSemanticPreservation;
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const promptGatesExports = [
  PromptQualityGates
] as const;