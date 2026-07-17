/**
 * Protected literal detection and independent semantic scoring
 * 
 * This module provides functionality for detecting protected literals in semantic
 * content and scoring semantic quality independently from realization.
 */

import type { LunumRecord, LunumSem, LunumClause } from '@corpunum/lunum';

// ── Protected Literal ───────────────────────────────────────────────

export interface ProtectedLiteral {
  /** The literal text */
  text: string;
  /** Language code */
  language: string;
  /** Type classification */
  type: LiteralType;
  /** Confidence in classification (0-1) */
  confidence: number;
  /** Source clause ID (if available) */
  sourceClause?: string;
}

export type LiteralType = 'name' | 'term' | 'phrase' | 'entity' | 'number' | 'date' | 'url' | 'path';

// ── Semantic Score ──────────────────────────────────────────────────

export interface SemanticScore {
  /** Overall semantic quality score (0-1) */
  overall: number;
  /** Component scores */
  components: {
    /** Completeness of semantic representation */
    completeness: number;
    /** Consistency across clauses */
    consistency: number;
    /** Clarity of predicates */
    predicateClarity: number;
    /** Role coverage */
    roleCoverage: number;
    /** Protected literal preservation */
    protectedLiteralPreservation: number;
  };
  /** Warnings or issues detected */
  warnings: string[];
  /** Score metadata */
  metadata: {
    clausesEvaluated: number;
    protectedLiteralsFound: number;
    scoringVersion: string;
  };
}

// ── Protected Literal Detector ──────────────────────────────────────

export class ProtectedLiteralDetector {
  private rules: ProtectedLiteralRule[];
  private registeredLiterals: Map<string, ProtectedLiteral[]>;

  constructor() {
    this.rules = [];
    this.registeredLiterals = new Map();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default protected literal rules
   */
  private initializeDefaultRules(): void {
    this.rules = [
      // Person names (capitalized words in English)
      {
        pattern: /^[A-Z][a-z]+$/,
        type: 'name',
        confidence: 0.7,
        language: 'en'
      },
      {
        pattern: /^[A-Z][a-z]+ [A-Z][a-z]+$/,
        type: 'name',
        confidence: 0.9,
        language: 'en'
      },
      // Greek names
      {
        pattern: /^[Α-ΩΪΫ][α-ωϊυ]+$/,
        type: 'name',
        confidence: 0.6,
        language: 'el'
      },
      // Technical terms (version numbers, codes)
      {
        pattern: /^v\d+\.\d+/,
        type: 'term',
        confidence: 0.95,
        language: 'en'
      },
      {
        pattern: /^\d+\.\d+\.\d+/,
        type: 'term',
        confidence: 0.85,
        language: 'en'
      },
      // URLs
      {
        pattern: /^https?:\/\/[^\s]+$/,
        type: 'url',
        confidence: 0.99,
        language: 'en'
      },
      // File paths
      {
        pattern: /^\/[a-zA-Z0-9_/.-]+$/,
        type: 'path',
        confidence: 0.8,
        language: 'en'
      },
      // Dates (ISO format)
      {
        pattern: /^\d{4}-\d{2}-\d{2}/,
        type: 'date',
        confidence: 0.95,
        language: 'en'
      },
      // Acronyms
      {
        pattern: /^[A-Z]{2,}$/,
        type: 'entity',
        confidence: 0.75,
        language: 'en'
      }
    ];
  }

  /**
   * Register a protected literal manually
   */
  register(fingerprint: string, literal: ProtectedLiteral): void {
    if (!this.registeredLiterals.has(fingerprint)) {
      this.registeredLiterals.set(fingerprint, []);
    }
    this.registeredLiterals.get(fingerprint)!.push(literal);
  }

  /**
   * Detect protected literals in a semantic record
   */
  detect(record: LunumRecord): ProtectedLiteral[] {
    const sem = record.sem as unknown as LunumSem;
    const clauses = sem.clauses ?? [];
    const language = record.source.language || 'en';
    const literals: ProtectedLiteral[] = [];

    // Check registered literals first
    const registered = this.registeredLiterals.get(record.fingerprint) || [];
    literals.push(...registered);

    // Detect from content
    for (const clause of clauses) {
      const clauseLiterals = this.detectInClause(clause, language);
      literals.push(...clauseLiterals);
    }

    return literals;
  }

  /**
   * Detect protected literals in a clause
   */
  private detectInClause(clause: LunumClause, language: string): ProtectedLiteral[] {
    const literals: ProtectedLiteral[] = [];
    const roles = clause.roles ?? {};

    for (const [key, value] of Object.entries(roles)) {
      if (typeof value === 'string') {
        const detected = this.detectLiteral(value, language, key);
        if (detected) {
          literals.push(detected);
        }
      }
    }

    return literals;
  }

  /**
   * Detect a single literal
   */
  private detectLiteral(text: string, language: string, sourceKey: string): ProtectedLiteral | null {
    for (const rule of this.rules) {
      if (rule.language === language || rule.language === 'any') {
        if (rule.pattern.test(text)) {
          return {
            text,
            language,
            type: rule.type,
            confidence: rule.confidence,
            sourceClause: sourceKey
          };
        }
      }
    }

    // Default: check if it looks like a proper noun
    if (text[0] && text[0] === text[0].toUpperCase() && text.length > 2) {
      return {
        text,
        language,
        type: 'name',
        confidence: 0.5,
        sourceClause: sourceKey
      };
    }

    return null;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRegistered: number;
    ruleCount: number;
  } {
    let totalRegistered = 0;
    for (const literals of this.registeredLiterals.values()) {
      totalRegistered += literals.length;
    }

    return {
      totalRegistered,
      ruleCount: this.rules.length
    };
  }

  /**
   * Clear registered literals
   */
  clearRegistered(): void {
    this.registeredLiterals.clear();
  }
}

// ── Semantic Scorer ─────────────────────────────────────────────────

export interface ScorerOptions {
  /** Minimum completeness score threshold */
  minCompleteness?: number;
  /** Minimum consistency score threshold */
  minConsistency?: number;
  /** Weight for protected literal preservation */
  protectedLiteralWeight?: number;
}

export class SemanticScorer {
  private options: Required<ScorerOptions>;

  constructor(options: ScorerOptions = {}) {
    this.options = {
      minCompleteness: options.minCompleteness ?? 0.7,
      minConsistency: options.minConsistency ?? 0.6,
      protectedLiteralWeight: options.protectedLiteralWeight ?? 0.2
    };
  }

  /**
   * Score a semantic record
   */
  score(record: LunumRecord, protectedLiterals: ProtectedLiteral[] = []): SemanticScore {
    const sem = record.sem as unknown as LunumSem;
    const clauses = sem.clauses ?? [];

    const completeness = this.scoreCompleteness(clauses);
    const consistency = this.scoreConsistency(clauses);
    const predicateClarity = this.scorePredicateClarity(clauses);
    const roleCoverage = this.scoreRoleCoverage(clauses);
    const protectedLiteralPreservation = this.scoreProtectedLiteralPreservation(protectedLiterals, record);

    // Calculate overall score (weighted average)
    const overall = 
      completeness * 0.3 +
      consistency * 0.25 +
      predicateClarity * 0.2 +
      roleCoverage * 0.15 +
      protectedLiteralPreservation * this.options.protectedLiteralWeight;

    // Generate warnings
    const warnings: string[] = [];
    if (completeness < this.options.minCompleteness) {
      warnings.push(`Low completeness score: ${completeness.toFixed(2)}`);
    }
    if (consistency < this.options.minConsistency) {
      warnings.push(`Low consistency score: ${consistency.toFixed(2)}`);
    }
    if (protectedLiterals.length === 0 && record.source.text.length > 50) {
      warnings.push('No protected literals detected in long text');
    }

    return {
      overall: Math.min(1, Math.max(0, overall)),
      components: {
        completeness,
        consistency,
        predicateClarity,
        roleCoverage,
        protectedLiteralPreservation
      },
      warnings,
      metadata: {
        clausesEvaluated: clauses.length,
        protectedLiteralsFound: protectedLiterals.length,
        scoringVersion: '1.0.0'
      }
    };
  }

  /**
   * Score completeness of semantic representation
   */
  private scoreCompleteness(clauses: LunumClause[]): number {
    if (clauses.length === 0) return 0;

    let completeCount = 0;
    for (const clause of clauses) {
      // A clause is complete if it has a predicate and at least one role
      if (clause.predicate && Object.keys(clause.roles ?? {}).length > 0) {
        completeCount++;
      }
    }

    return completeCount / clauses.length;
  }

  /**
   * Score consistency across clauses
   */
  private scoreConsistency(clauses: LunumClause[]): number {
    if (clauses.length <= 1) return 1;

    // Check for consistent predicate patterns
    const predicates = clauses.map(c => c.predicate).filter(Boolean);
    const uniquePredicates = new Set(predicates);
    
    // If too many unique predicates, might be inconsistent
    if (uniquePredicates.size > predicates.length * 0.7) {
      return 0.5;
    }

    return 0.9;
  }

  /**
   * Score predicate clarity
   */
  private scorePredicateClarity(clauses: LunumClause[]): number {
    if (clauses.length === 0) return 0;

    let clearCount = 0;
    for (const clause of clauses) {
      // A predicate is clear if it's a non-empty string
      if (clause.predicate && clause.predicate.length > 0) {
        clearCount++;
      }
    }

    return clearCount / clauses.length;
  }

  /**
   * Score role coverage
   */
  private scoreRoleCoverage(clauses: LunumClause[]): number {
    if (clauses.length === 0) return 0;

    let coveredCount = 0;
    for (const clause of clauses) {
      const roles = clause.roles ?? {};
      const roleCount = Object.keys(roles).length;
      
      // Consider well-covered if has at least 2 roles
      if (roleCount >= 2) {
        coveredCount++;
      }
    }

    return coveredCount / clauses.length;
  }

  /**
   * Score protected literal preservation
   */
  private scoreProtectedLiteralPreservation(literals: ProtectedLiteral[], record: LunumRecord): number {
    if (literals.length === 0) return 1; // No literals to preserve

    // If we have literals, check they're in the source text
    const sourceText = record.source.text.toLowerCase();
    let preservedCount = 0;

    for (const literal of literals) {
      if (sourceText.includes(literal.text.toLowerCase())) {
        preservedCount++;
      }
    }

    return literals.length > 0 ? preservedCount / literals.length : 1;
  }

  /**
   * Get scoring options
   */
  getOptions(): Required<ScorerOptions> {
    return { ...this.options };
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const protectedLiteralScoringExports = [
  ProtectedLiteralDetector,
  SemanticScorer
] as const;