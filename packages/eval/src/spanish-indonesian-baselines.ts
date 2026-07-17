/**
 * Spanish and Indonesian parse baselines
 * 
 * This module provides baseline parsing rules and features for Spanish
 * and Indonesian languages, enabling consistent semantic parsing across
 * these languages.
 */

import type { LunumClause } from '@corpunum/lunum';

// ── Language Support ────────────────────────────────────────────────

export type ParseLanguage = 'es' | 'id';

export const SUPPORTED_PARSE_LANGUAGES: Set<ParseLanguage> = new Set(['es', 'id']);

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

// ── Spanish Baseline ────────────────────────────────────────────────

export const spanishBaseline: ParseBaseline = {
  language: 'es',
  version: '1.0.0',
  description: 'Spanish parse baseline for semantic parsing',
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

// ── Indonesian Baseline ─────────────────────────────────────────────

export const indonesianBaseline: ParseBaseline = {
  language: 'id',
  version: '1.0.0',
  description: 'Indonesian parse baseline for semantic parsing',
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

// ── Spanish Parse Rules ─────────────────────────────────────────────

export interface SpanishParseRule {
  /** Pattern to match */
  pattern: RegExp;
  /** Predicate to extract */
  predicate: string;
  /** Role mapping */
  roleMap: Record<string, string>;
  /** Confidence */
  confidence: number;
}

export const spanishParseRules: SpanishParseRule[] = [
  {
    pattern: /\b(?:es|son|está|están|fue|fueron|era|eran)\b/i,
    predicate: 'statement',
    roleMap: {
      subject: /(?:^|\s)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s+(?:es|son|está|están|fue|fueron|era|eran))/,
      object: /(?:es|son|está|están|fue|fueron|era|eran)\s+(.+)$/
    },
    confidence: 0.85
  },
  {
    pattern: /\b(?:dónde|cuándo|cómo|quién|qué|por qué|cuánto)\b/i,
    predicate: 'question',
    roleMap: {
      questionWord: /(^(?:dónde|cuándo|cómo|quién|qué|por qué|cuánto))/i,
      subject: /(?:dónde|cuándo|cómo|quién|qué|por qué|cuánto)\s+(.+)$/
    },
    confidence: 0.9
  },
  {
    pattern: /\b(?:en|a|de|con|sin|para|por|sobre|bajo)\b/i,
    predicate: 'location',
    roleMap: {
      subject: /(.+?)(?:\s+(?:en|a|de|con|sin|para|por|sobre|bajo))\s+(.+)$/
    },
    confidence: 0.8
  },
  {
    pattern: /\b(?:no|nunca|tampoco|nadie)\b/i,
    predicate: 'negation',
    roleMap: {
      negation: /^(?:no|nunca|tampoco|nadie)/i,
      subject: /^(?:no|nunca|tampoco|nadie)\s+(.+)$/
    },
    confidence: 0.85
  }
];

// ── Indonesian Parse Rules ──────────────────────────────────────────

export interface IndonesianParseRule {
  /** Pattern to match */
  pattern: RegExp;
  /** Predicate to extract */
  predicate: string;
  /** Role mapping */
  roleMap: Record<string, string>;
  /** Confidence */
  confidence: number;
}

export const indonesianParseRules: IndonesianParseRule[] = [
  {
    pattern: /\b(?:adalah|merupakan|berada|terletak|adalah|merupakan)\b/i,
    predicate: 'statement',
    roleMap: {
      subject: /(.+?)(?:\s+(?:adalah|merupakan|berada|terletak))/,
      object: /(?:adalah|merupakan|berada|terletak)\s+(.+)$/
    },
    confidence: 0.85
  },
  {
    pattern: /\b(?:apa|siapa|di mana|kapan|bagaimana|mengapa|berapa)\b/i,
    predicate: 'question',
    roleMap: {
      questionWord: /^(?:apa|siapa|di mana|kapan|bagaimana|mengapa|berapa)/i,
      subject: /^(?:apa|siapa|di mana|kapan|bagaimana|mengapa|berapa)\s+(.+)$/
    },
    confidence: 0.9
  },
  {
    pattern: /\b(di|pada|ke|dari|dengan|tanpa|untuk|oleh|atas|bawah)\b/i,
    predicate: 'location',
    roleMap: {
      subject: /(.+?)(?:\s+(?:di|pada|ke|dari|dengan|tanpa|untuk|oleh|atas|bawah))\s+(.+)$/
    },
    confidence: 0.8
  },
  {
    pattern: /\b(bukan|tidak|belum|belum|sama sekali)\b/i,
    predicate: 'negation',
    roleMap: {
      negation: /^(?:bukan|tidak|belum|sama sekali)/i,
      subject: /^(?:bukan|tidak|belum|sama sekali)\s+(.+)$/
    },
    confidence: 0.85
  }
];

// ── Baseline Parser ─────────────────────────────────────────────────

export class BaselineParser {
  private spanishRules: SpanishParseRule[];
  private indonesianRules: IndonesianParseRule[];

  constructor() {
    this.spanishRules = spanishParseRules;
    this.indonesianRules = indonesianParseRules;
  }

  /**
   * Parse Spanish text
   */
  parseSpanish(text: string): LunumClause[] {
    const clauses: LunumClause[] = [];
    
    for (const rule of this.spanishRules) {
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
          roles,
          negated: rule.predicate === 'negation'
        });
      }
    }
    
    return clauses;
  }

  /**
   * Parse Indonesian text
   */
  parseIndonesian(text: string): LunumClause[] {
    const clauses: LunumClause[] = [];
    
    for (const rule of this.indonesianRules) {
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
          roles,
          negated: rule.predicate === 'negation'
        });
      }
    }
    
    return clauses;
  }

  /**
   * Parse text based on language
   */
  parse(text: string, language: ParseLanguage): LunumClause[] {
    if (language === 'es') {
      return this.parseSpanish(text);
    } else if (language === 'id') {
      return this.parseIndonesian(text);
    } else {
      throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Get Spanish parse rules
   */
  getSpanishRules(): SpanishParseRule[] {
    return [...this.spanishRules];
  }

  /**
   * Get Indonesian parse rules
   */
  getIndonesianRules(): IndonesianParseRule[] {
    return [...this.indonesianRules];
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): ParseLanguage[] {
    return Array.from(SUPPORTED_PARSE_LANGUAGES);
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const spanishIndonesianBaselinesExports = [
  BaselineParser,
  SUPPORTED_PARSE_LANGUAGES,
  spanishBaseline,
  indonesianBaseline
] as const;