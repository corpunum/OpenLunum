/**
 * Lunum-Sem to natural language realization engine
 * 
 * This module provides functionality for realizing Lunum-Semantic content
 * to natural language in English and Greek while preserving protected literals
 * and semantic identity.
 */

import type { LunumRecord, LunumSem, LunumClause, Risk } from '@corpunum/lunum';

// ── Language Support ────────────────────────────────────────────────

export type RealizationLanguage = 'en' | 'el';

export const SUPPORTED_REALIZATION_LANGUAGES: Set<RealizationLanguage> = new Set(['en', 'el']);

// ── Protected Literals ──────────────────────────────────────────────

export interface ProtectedLiteral {
  /** Original text */
  text: string;
  /** Language */
  language: string;
  /** Type of literal */
  type: 'name' | 'term' | 'phrase' | 'entity';
}

// ── Realization Result ──────────────────────────────────────────────

export interface RealizationResult {
  /** Realized text */
  text: string;
  /** Language of realization */
  language: RealizationLanguage;
  /** Protected literals that were preserved */
  protectedLiterals: ProtectedLiteral[];
  /** Semantic identity verification */
  semanticIdentity: {
    /** Original fingerprint */
    originalFingerprint: string;
    /** Realization fingerprint */
    realizationFingerprint: string;
    /** Match confidence */
    matchConfidence: number;
  };
  /** Realization metadata */
  metadata: {
    clausesProcessed: number;
    protectedLiteralsPreserved: number;
    warnings?: string[] | undefined;
  };
}

// ── Realization Engine ──────────────────────────────────────────────

export class RealizationEngine {
  private protectedLiterals: Map<string, ProtectedLiteral[]>;
  private realizationRules: Map<RealizationLanguage, RealizationRule[]>;

  constructor() {
    this.protectedLiterals = new Map();
    this.realizationRules = new Map();
    this.initializeRules();
  }

  /**
   * Initialize language-specific realization rules
   */
  private initializeRules(): void {
    // English rules
    const enRules: RealizationRule[] = [
      {
        predicate: 'greeting',
        template: 'Greetings{subject}',
        language: 'en'
      },
      {
        predicate: 'statement',
        template: '{subject} {verb} {object}',
        language: 'en'
      },
      {
        predicate: 'question',
        template: 'Is {subject} {predicate}?',
        language: 'en'
      },
      {
        predicate: 'location',
        template: '{subject} is located at {location}',
        language: 'en'
      },
      {
        predicate: 'action',
        template: '{subject} {verb}s {object}',
        language: 'en'
      }
    ];

    // Greek rules
    const elRules: RealizationRule[] = [
      {
        predicate: 'greeting',
        template: 'Γειά σου{subject}',
        language: 'el'
      },
      {
        predicate: 'statement',
        template: '{subject} {verb} {object}',
        language: 'el'
      },
      {
        predicate: 'question',
        template: 'Είναι {subject} {predicate};',
        language: 'el'
      },
      {
        predicate: 'location',
        template: '{subject} βρίσκεται στο {location}',
        language: 'el'
      },
      {
        predicate: 'action',
        template: '{subject} {verb} {object}',
        language: 'el'
      }
    ];

    this.realizationRules.set('en', enRules);
    this.realizationRules.set('el', elRules);
  }

  /**
   * Register protected literals for a record
   */
  registerProtectedLiterals(fingerprint: string, literals: ProtectedLiteral[]): void {
    this.protectedLiterals.set(fingerprint, literals);
  }

  /**
   * Realize a semantic record to natural language
   */
  realize(record: LunumRecord, language: RealizationLanguage = 'en'): RealizationResult {
    const sem = record.sem as unknown as LunumSem;
    const clauses = sem.clauses ?? [];
    
    let realizedText = '';
    const protectedLiterals: ProtectedLiteral[] = [];
    const warnings: string[] = [];
    let clausesProcessed = 0;

    // Get rules for the target language
    const rules = this.realizationRules.get(language);
    if (!rules) {
      throw new Error(`Realization not supported for language: ${language}`);
    }

    // Realize each clause
    for (const clause of clauses) {
      const clauseText = this.realizeClause(clause, rules, language);
      if (clauseText) {
        realizedText += (realizedText ? ' ' : '') + clauseText;
        clausesProcessed++;
      }

      // Check for protected literals in this clause
      const clauseProtected = this.extractProtectedLiterals(clause, language);
      protectedLiterals.push(...clauseProtected);
    }

    // Calculate semantic identity verification
    const realizationFingerprint = this.calculateRealizationFingerprint(realizedText);
    const matchConfidence = this.verifySemanticIdentity(record.fingerprint, realizationFingerprint);

    // Generate warnings if any rules were not matched
    if (clausesProcessed < clauses.length) {
      warnings.push(`${clauses.length - clausesProcessed} clauses could not be realized`);
    }

    return {
      text: realizedText,
      language,
      protectedLiterals,
      semanticIdentity: {
        originalFingerprint: record.fingerprint,
        realizationFingerprint,
        matchConfidence
      },
      metadata: {
        clausesProcessed,
        protectedLiteralsPreserved: protectedLiterals.length,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    } as RealizationResult;
  }

  /**
   * Realize a single clause
   */
  private realizeClause(clause: LunumClause, rules: RealizationRule[], language: RealizationLanguage): string | null {
    // Find matching rule
    const rule = rules.find(r => r.predicate === clause.predicate);
    if (!rule) {
      return null;
    }

    // Fill template with roles
    let text = rule.template;
    const roles = clause.roles ?? {};

    for (const [key, value] of Object.entries(roles)) {
      const placeholder = `{${key}}`;
      const replacement = typeof value === 'string' ? value : JSON.stringify(value);
      text = text.replace(placeholder, replacement);
    }

    return text;
  }

  /**
   * Extract protected literals from a clause
   */
  private extractProtectedLiterals(clause: LunumClause, language: RealizationLanguage): ProtectedLiteral[] {
    const literals: ProtectedLiteral[] = [];
    const roles = clause.roles ?? {};

    for (const [key, value] of Object.entries(roles)) {
      if (typeof value === 'string') {
        // Check if this looks like a protected literal (proper noun, technical term, etc.)
        if (this.isProtectedLiteral(value, language)) {
          literals.push({
            text: value,
            language,
            type: this.classifyLiteralType(value)
          });
        }
      }
    }

    return literals;
  }

  /**
   * Check if text appears to be a protected literal
   */
  private isProtectedLiteral(text: string, language: RealizationLanguage): boolean {
    // Simple heuristics for demonstration
    // In production, would use NER or other techniques
    
    if (text.length <= 2) return false;
    
    // Capitalized words might be proper nouns
    if (language === 'en' && text[0] && text[0] === text[0].toUpperCase() && text.length > 2) {
      return true;
    }
    
    // Greek capital letters
    if (language === 'el' && /[Α-ΩΪΫ]/.test(text[0] ?? '') && text.length > 2) {
      return true;
    }

    // Contains numbers (might be versions, IDs, etc.)
    if (/\d/.test(text)) {
      return true;
    }

    return false;
  }

  /**
   * Classify the type of protected literal
   */
  private classifyLiteralType(text: string): ProtectedLiteral['type'] {
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) {
      return 'name'; // Looks like a person or place name
    }
    if (/^[A-Z][a-z]+$/.test(text)) {
      return 'name'; // Single capitalized word, likely a name
    }
    if (/^v\d/.test(text)) {
      return 'term'; // Looks like a version number
    }
    if (/[A-Z]{2,}/.test(text)) {
      return 'entity'; // Looks like an acronym
    }
    return 'phrase';
  }

  /**
   * Calculate fingerprint for realized text
   */
  private calculateRealizationFingerprint(text: string): string {
    // Simple hash for demonstration
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `rfp:${Math.abs(hash).toString(16)}`;
  }

  /**
   * Verify semantic identity between original and realization
   */
  private verifySemanticIdentity(originalFingerprint: string, realizationFingerprint: string): number {
    // Simple heuristic: if fingerprints share common pattern, high confidence
    if (originalFingerprint && realizationFingerprint) {
      // In production, would use proper semantic comparison
      return 0.85; // Default confidence
    }
    return 0.5;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): RealizationLanguage[] {
    return Array.from(this.realizationRules.keys()) as RealizationLanguage[];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalProtectedLiterals: number;
    supportedLanguages: string[];
  } {
    let totalProtectedLiterals = 0;
    for (const literals of this.protectedLiterals.values()) {
      totalProtectedLiterals += literals.length;
    }

    return {
      totalProtectedLiterals,
      supportedLanguages: Array.from(this.realizationRules.keys())
    };
  }
}

// ── Interface for Realization Rule ──────────────────────────────────

export interface RealizationRule {
  /** Predicate to match */
  predicate: string;
  /** Text template with placeholders */
  template: string;
  /** Target language */
  language: RealizationLanguage;
}

// ── Export ──────────────────────────────────────────────────────────

export const realizationExports = [
  RealizationEngine,
  SUPPORTED_REALIZATION_LANGUAGES
] as const;