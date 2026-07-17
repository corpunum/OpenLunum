/**
 * Abstention and clarification outputs for low-confidence parses
 * 
 * This module provides functionality for detecting low-confidence parses
 * and either abstaining (withholding output) or requesting clarification
 * when the parser is uncertain.
 */

import type { LunumRecord, LunumSem, LunumClause } from '@corpunum/lunum';

// ── Confidence Levels ───────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'abstain';

export interface ConfidenceThresholds {
  /** Minimum confidence for high confidence (0-1) */
  high: number;
  /** Minimum confidence for medium confidence (0-1) */
  medium: number;
  /** Minimum confidence for low confidence (0-1) */
  low: number;
}

// ── Abstention Result ───────────────────────────────────────────────

export interface AbstentionResult {
  /** Whether to abstain from output */
  shouldAbstain: boolean;
  /** Confidence level */
  confidenceLevel: ConfidenceLevel;
  /** Overall confidence score (0-1) */
  confidenceScore: number;
  /** Reason for abstention if applicable */
  abstentionReason?: string | undefined;
  /** Clarification request if applicable */
  clarification?: ClarificationRequest | undefined;
  /** Metadata */
  metadata: {
    clausesEvaluated: number;
    lowConfidenceClauses: number;
    ambiguousClauses: number;
  };
}

// ── Clarification Request ───────────────────────────────────────────

export interface ClarificationRequest {
  /** Type of clarification needed */
  type: 'ambiguity' | 'missing_info' | 'conflicting' | 'unclear';
  /** Question or request for clarification */
  question: string;
  /** Options if applicable */
  options?: string[] | undefined;
  /** Context for the clarification */
  context: string;
}

// ── Parse Result ────────────────────────────────────────────────────

export interface ParseResult {
  /** The parsed semantic representation */
  sem: LunumSem | null;
  /** Confidence information */
  confidence: {
    level: ConfidenceLevel;
    score: number;
    shouldAbstain: boolean;
    abstentionReason?: string | undefined;
    clarification?: ClarificationRequest | undefined;
  };
  /** Warnings */
  warnings: string[];
  /** Metadata */
  metadata: {
    clausesParsed: number;
    clausesAbstained: number;
    clarificationsRequested: number;
  };
}

// ── Abstention and Clarification Engine ─────────────────────────────

export class AbstentionClarificationEngine {
  private thresholds: Required<ConfidenceThresholds>;
  private defaultClarificationContext: string;

  constructor(options: {
    thresholds?: Partial<ConfidenceThresholds>;
    defaultClarificationContext?: string;
  } = {}) {
    this.thresholds = {
      high: options.thresholds?.high ?? 0.9,
      medium: options.thresholds?.medium ?? 0.7,
      low: options.thresholds?.low ?? 0.5
    };
    this.defaultClarificationContext = options.defaultClarificationContext ?? 'Parse confidence';
  }

  /**
   * Evaluate parse confidence and determine if abstention is needed
   */
  evaluateConfidence(
    record: LunumRecord,
    clauses: LunumClause[],
    parseConfidence: number
  ): AbstentionResult {
    let lowConfidenceClauses = 0;
    let ambiguousClauses = 0;
    const warnings: string[] = [];

    // Evaluate each clause
    for (const clause of clauses) {
      const clauseConfidence = this.evaluateClauseConfidence(clause);
      
      if (clauseConfidence < this.thresholds.low) {
        lowConfidenceClauses++;
      }
      
      if (this.isAmbiguous(clause)) {
        ambiguousClauses++;
      }
    }

    // Calculate overall confidence (weighted average)
    const clauseCount = clauses.length || 1;
    const weightedConfidence = (
      parseConfidence * 0.5 +
      ((clauseCount - lowConfidenceClauses) / clauseCount) * 0.3 +
      ((clauseCount - ambiguousClauses) / clauseCount) * 0.2
    );

    // Determine confidence level
    const confidenceLevel = this.getConfidenceLevel(weightedConfidence);

    // Check if we should abstain
    const shouldAbstain = confidenceLevel === 'abstain' || 
                          (confidenceLevel === 'low' && ambiguousClauses > clauses.length * 0.5);

    // Generate abstention reason if needed
    const abstentionReason = shouldAbstain ? this.generateAbstentionReason(
      confidenceLevel,
      lowConfidenceClauses,
      ambiguousClauses,
      clauses.length
    ) : undefined;

    // Generate clarification if needed
    const clarification = !shouldAbstain && ambiguousClauses > 0 
      ? this.generateClarificationRequest(clauses, ambiguousClauses)
      : undefined;

    // Generate warnings
    if (lowConfidenceClauses > 0) {
      warnings.push(`${lowConfidenceClauses} clauses with low confidence`);
    }
    if (ambiguousClauses > 0) {
      warnings.push(`${ambiguousClauses} ambiguous clauses detected`);
    }

    return {
      shouldAbstain,
      confidenceLevel,
      confidenceScore: weightedConfidence,
      abstentionReason,
      clarification,
      metadata: {
        clausesEvaluated: clauses.length,
        lowConfidenceClauses,
        ambiguousClauses
      }
    };
  }

  /**
   * Evaluate confidence for a single clause
   */
  private evaluateClauseConfidence(clause: LunumClause): number {
    let score = 1.0;

    // Check predicate clarity
    if (!clause.predicate || clause.predicate.length === 0) {
      score -= 0.3;
    }

    // Check role coverage
    const roleCount = Object.keys(clause.roles ?? {}).length;
    if (roleCount < 2) {
      score -= 0.2;
    }

    // Check for negation complexity
    if (clause.negated && clause.conditions?.length) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if a clause is ambiguous
   */
  private isAmbiguous(clause: LunumClause): boolean {
    // Multiple conditions can indicate ambiguity
    if (clause.conditions && clause.conditions.length > 2) {
      return true;
    }

    // Complex modality can indicate ambiguity
    if (clause.modality && typeof clause.modality === 'object') {
      const modality = clause.modality as Record<string, unknown>;
      if (modality.strength && ['possible', 'uncertain'].includes(String(modality.strength))) {
        return true;
      }
    }

    // Check for uncertainty indicators in roles
    const roles = clause.roles ?? {};
    for (const [key, value] of Object.entries(roles)) {
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        if (/perhaps|maybe|possibly|uncertain|ambiguous/.test(lowerValue)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get confidence level from score
   */
  private getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= this.thresholds.high) return 'high';
    if (score >= this.thresholds.medium) return 'medium';
    if (score >= this.thresholds.low) return 'low';
    return 'abstain';
  }

  /**
   * Generate abstention reason
   */
  private generateAbstentionReason(
    level: ConfidenceLevel,
    lowConfidenceClauses: number,
    ambiguousClauses: number,
    totalClauses: number
  ): string {
    if (level === 'abstain') {
      return `Confidence too low (${(this.thresholds.low * 100).toFixed(0)}% threshold)`;
    }
    
    if (ambiguousClauses > totalClauses * 0.5) {
      return `Too many ambiguous clauses (${ambiguousClauses}/${totalClauses})`;
    }
    
    if (lowConfidenceClauses > totalClauses * 0.5) {
      return `Too many low-confidence clauses (${lowConfidenceClauses}/${totalClauses})`;
    }
    
    return 'Combined low confidence and ambiguity';
  }

  /**
   * Generate clarification request
   */
  private generateClarificationRequest(
    clauses: LunumClause[],
    ambiguousCount: number
  ): ClarificationRequest | undefined {
    // Find the most ambiguous clause
    let mostAmbiguous: LunumClause | undefined;
    let maxAmbiguity = 1.0;

    for (const clause of clauses) {
      if (this.isAmbiguous(clause)) {
        const ambiguityScore = this.evaluateClauseConfidence(clause);
        if (ambiguityScore < maxAmbiguity) {
          maxAmbiguity = ambiguityScore;
          mostAmbiguous = clause;
        }
      }
    }

    if (!mostAmbiguous) return undefined;

    return {
      type: 'ambiguity',
      question: `The clause "${mostAmbiguous.predicate}" is ambiguous. Please clarify.`,
      context: this.defaultClarificationContext,
      options: this.generateClarificationOptions(mostAmbiguous)
    };
  }

  /**
   * Generate clarification options
   */
  private generateClarificationOptions(clause: LunumClause): string[] | undefined {
    const options: string[] = [];
    
    if (clause.conditions && clause.conditions.length > 0) {
      options.push('Reduce conditions');
      options.push('Clarify condition relationships');
    }
    
    if (clause.negated) {
      options.push('Confirm negation');
    }
    
    return options.length > 0 ? options : undefined;
  }

  /**
   * Create a parse result with confidence information
   */
  createParseResult(
    sem: LunumSem | null,
    clauses: LunumClause[],
    parseConfidence: number
  ): ParseResult {
    const abstention = this.evaluateConfidence(
      {
        recordVersion: 'lunum-record/0.1-draft',
        fingerprint: 'temp',
        source: { text: '', language: '', role: null, ref: null },
        sem: { schema: '', world: '', kind: '', clauses: [] },
        renderings: {},
        policy: { eligible: true, category: '', risk: 'low' as const, confidence: 0, reasons: [] },
        meta: {}
      } as unknown as LunumRecord,
      clauses,
      parseConfidence
    );

    return {
      sem,
      confidence: {
        level: abstention.confidenceLevel,
        score: abstention.confidenceScore,
        shouldAbstain: abstention.shouldAbstain,
        abstentionReason: abstention.abstentionReason,
        clarification: abstention.clarification
      },
      warnings: [],
      metadata: {
        clausesParsed: clauses.length,
        clausesAbstained: abstention.shouldAbstain ? clauses.length : 0,
        clarificationsRequested: abstention.clarification ? 1 : 0
      }
    };
  }

  /**
   * Get confidence thresholds
   */
  getThresholds(): Required<ConfidenceThresholds> {
    return { ...this.thresholds };
  }

  /**
   * Set confidence thresholds
   */
  setThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    if (thresholds.high !== undefined) this.thresholds.high = thresholds.high;
    if (thresholds.medium !== undefined) this.thresholds.medium = thresholds.medium;
    if (thresholds.low !== undefined) this.thresholds.low = thresholds.low;
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const abstentionClarificationExports = [
  AbstentionClarificationEngine
] as const;