/**
 * English and Greek parse baselines
 * 
 * This module provides baseline parsing rules and features for English
 * and Greek languages, enabling consistent semantic parsing across
 * these languages.
 */

import type { LunumClause } from '@corpunum/lunum';

// ── Language Support ────────────────────────────────────────────────

export type ParseLanguage = 'en' | 'el';

export const SUPPORTED_PARSE_LANGUAGES: Set<ParseLanguage> = new Set(['en', 'el']);

// ── Parse Baseline ──────────────────────────────────────────────────

export interface ParseBaseline {
  /** Language code */
  language: ParseLanguage;
  /** Version */
  version: string;
  /** Description */
  description: string;
  /** Features supported */
  features: string[];
  /** Known limitations */
  limitations: string[];
}

// ── English Baseline ────────────────────────────────────────────────

export const englishBaseline: ParseBaseline = {
  language: 'en',
  version: '1.0.0',
  description: 'English parse baseline for semantic parsing',
  features: [
    'Predicate detection',
    'Role extraction',
    'Negation handling',
    'Temporal expressions',
    'Named entity recognition',
    'Question detection'
  ],
  limitations: [
    'Complex nested conditions not fully supported',
    'Domain-specific terminology may need tuning'
  ]
};

// ── Greek Baseline ──────────────────────────────────────────────────

export const greekBaseline: ParseBaseline = {
  language: 'el',
  version: '1.0.0',
  description: 'Greek parse baseline for semantic parsing',
  features: [
    'Predicate detection',
    'Role extraction',
    'Negation handling',
    'Temporal expressions',
    'Named entity recognition',
    'Question detection'
  ],
  limitations: [
    'Complex nested conditions not fully supported',
    'Domain-specific terminology may need tuning'
  ]
};

// ── English Parse Rules ─────────────────────────────────────────────

export interface EnglishParseRule {
  /** Pattern to match */
  pattern: RegExp;
  /** Predicate to extract */
  predicate: string;
  /** Role mapping */
  roleMap: Record<string, RegExp>;
  /** Confidence */
  confidence: number;
}

export const englishParseRules: EnglishParseRule[] = [
  {
    pattern: /\b(?:is|are|was|were|be|been|being)\b/i,
    predicate: 'statement',
    roleMap: {
      subject: /^(?:\s*)([A-Z][a-z]+)(?:\s+(?:is|are|was|were|be|been|being))/,
      object: /^(?:is|are|was|were|be|been|being)\s+(.+)$/
    },
    confidence: 0.85
  },
  {
    pattern: /\b(?:what|where|when|who|why|how)\b/i,
    predicate: 'question',
    roleMap: {
      questionWord: /((?:what|where|when|who|why|how))/i,
      subject: /^(?:what|where|when|who|why|how)\s+(.+)$/i
    },
    confidence: 0.9
  },
  {
    pattern: /\b(?:in|on|at|to|from|by|with)\b/i,
    predicate: 'location',
    roleMap: {
      location: /(?:in|on|at|to|from|by|with)\s+(.+)$/
    },
    confidence: 0.8
  },
  {
    pattern: /\b(?:not|no|never|neither|nobody|nothing)\b/i,
    predicate: 'negation',
    roleMap: {
      negation: /\b(?:not|no|never|neither|nobody|nothing)\b/i
    },
    confidence: 0.85
  }
];

// ── Greek Parse Rules ───────────────────────────────────────────────

export interface GreekParseRule {
  /** Pattern to match */
  pattern: RegExp;
  /** Predicate to extract */
  predicate: string;
  /** Role mapping */
  roleMap: Record<string, RegExp>;
  /** Confidence */
  confidence: number;
}

export const greekParseRules: GreekParseRule[] = [
  {
    pattern: /\b(?:είναι|είναι|είμαι|είσαι|είναι|είμαστε|είστε|ήσαν|ήσουν|ήταν|ήμαστε|ήσασταν)\b/i,
    predicate: 'statement',
    roleMap: {
      subject: /^(?:\s*)([A-ZΑ-Ω][α-ω]+)(?:\s+(?:είναι|είμαι|είσαι|ήταν))/,
      object: /^(?:είναι|είμαι|είσαι|ήταν)\s+(.+)$/
    },
    confidence: 0.85
  },
  {
    pattern: /\b(?:τι|πού|πότε|ποιος|γιατί|πώς)\b/i,
    predicate: 'question',
    roleMap: {
      questionWord: /((?:τι|πού|πότε|ποιος|γιατί|πώς))/i,
      subject: /^(?:τι|πού|πότε|ποιος|γιατί|πώς)\s+(.+)$/i
    },
    confidence: 0.9
  },
  {
    pattern: /\b(?:σε|σε|από|με|για|χωρίς|πάνω)\b/i,
    predicate: 'location',
    roleMap: {
      location: /(?:σε|από|με|για|χωρίς|πάνω)\s+(.+)$/
    },
    confidence: 0.8
  },
  {
    pattern: /\b(?:όχι|δεν|κανένας|κανένα|ποτέ|τίποτα)\b/i,
    predicate: 'negation',
    roleMap: {
      negation: /\b(?:όχι|δεν|κανένας|κανένα|ποτέ|τίποτα)\b/i
    },
    confidence: 0.85
  }
];

// ── BaselineParser Class ────────────────────────────────────────────

export class BaselineParser {
  /**
   * Get supported languages
   */
  getSupportedLanguages(): ParseLanguage[] {
    return Array.from(SUPPORTED_PARSE_LANGUAGES);
  }

  /**
   * Get English parse rules
   */
  getEnglishRules(): EnglishParseRule[] {
    return [...englishParseRules];
  }

  /**
   * Get Greek parse rules
   */
  getGreekRules(): GreekParseRule[] {
    return [...greekParseRules];
  }

  /**
   * Parse English text
   */
  parseEnglish(text: string): LunumClause[] {
    return this.parseWithRules(text, englishParseRules);
  }

  /**
   * Parse Greek text
   */
  parseGreek(text: string): LunumClause[] {
    return this.parseWithRules(text, greekParseRules);
  }

  /**
   * Generic parser with rules
   */
  private parseWithRules(text: string, rules: Array<{
    pattern: RegExp;
    predicate: string;
    roleMap: Record<string, RegExp>;
    confidence: number;
  }>): LunumClause[] {
    const clauses: LunumClause[] = [];
    
    for (const rule of rules) {
      const match = text.match(rule.pattern);
      if (match) {
        const roles: Record<string, unknown> = {};
        
        for (const [roleName, pattern] of Object.entries(rule.roleMap)) {
          const roleMatch = text.match(pattern);
          if (roleMatch && roleMatch[1]) {
            roles[roleName] = roleMatch[1].trim();
          }
        }
        
        clauses.push({
          predicate: rule.predicate,
          roles: roles,
          negated: rule.predicate === 'negation'
        } as LunumClause);
      }
    }
    
    return clauses;
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const englishGreekBaselineExports = [
  SUPPORTED_PARSE_LANGUAGES,
  englishBaseline,
  greekBaseline,
  englishParseRules,
  greekParseRules,
  BaselineParser
] as const;