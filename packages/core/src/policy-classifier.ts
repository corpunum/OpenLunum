/**
 * Policy classification utilities for semantic content
 * 
 * This module provides functions for classifying semantic content according to
 * category, risk, and confidence criteria defined in the policy taxonomy.
 */

import type { Risk, EligibilityDecision } from './types.js';

// ── Category Definitions ────────────────────────────────────────────

/** Eligible categories that can be processed directly */
export const ELIGIBLE_CATEGORIES = new Set([
  'preference',
  'simple_fact',
  'tool_event',
  'project_state',
  'retrieval_rule',
  'system_fact',
  'benchmark_result'
] as const);

/** Natural-only categories that require special handling */
export const NATURAL_ONLY_CATEGORIES = new Set([
  'conditional_instruction',
  'safety_constraint',
  'safety_event',
  'exact_quote',
  'code',
  'command',
  'file_path',
  'url',
  'legal_text',
  'medical_text',
  'social_nuance',
  'ambiguous',
  'complex_modality'
] as const);

/** All known categories */
export const ALL_CATEGORIES = new Set([
  ...ELIGIBLE_CATEGORIES,
  ...NATURAL_ONLY_CATEGORIES
] as const);

// ── Risk Level Definitions ──────────────────────────────────────────

export const RISK_LEVELS = ['low', 'medium', 'high', 'unknown'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

// ── Confidence Thresholds ───────────────────────────────────────────

/** Minimum confidence for automatic inclusion */
export const MIN_AUTO_CONFIDENCE = 0.90;

/** Minimum confidence for conditional inclusion */
export const MIN_CONDITIONAL_CONFIDENCE = 0.70;

// ── Category Metadata ───────────────────────────────────────────────

export interface CategoryMetadata {
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Typical risk level */
  typicalRisk: RiskLevel;
  /** Whether category is eligible or natural-only */
  categoryType: 'eligible' | 'natural_only';
  /** Example texts */
  examples: string[];
}

export const CATEGORY_METADATA: Record<string, CategoryMetadata> = {
  preference: {
    name: 'Preference',
    description: 'User preferences and choices that influence behavior',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['I prefer English over French', 'Show results sorted by relevance']
  },
  simple_fact: {
    name: 'Simple Fact',
    description: 'Verifiable, objective statements about the world',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['Paris is the capital of France', 'Water boils at 100°C']
  },
  tool_event: {
    name: 'Tool Event',
    description: 'Events triggered by or related to tool usage',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['File created by editor', 'Command executed: git commit']
  },
  project_state: {
    name: 'Project State',
    description: 'Information about the current state of a project',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['Build passed', '3 failing tests']
  },
  retrieval_rule: {
    name: 'Retrieval Rule',
    description: 'Rules governing information retrieval and access',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['Return results sorted by relevance', 'Limit to first 10 results']
  },
  system_fact: {
    name: 'System Fact',
    description: 'Facts about the system itself or its operation',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['Lunum version 0.2.0', 'Token count: 150']
  },
  benchmark_result: {
    name: 'Benchmark Result',
    description: 'Results from testing or evaluation',
    typicalRisk: 'low',
    categoryType: 'eligible',
    examples: ['Accuracy: 95%', 'Latency: 50ms']
  },
  conditional_instruction: {
    name: 'Conditional Instruction',
    description: 'Instructions that depend on certain conditions',
    typicalRisk: 'medium',
    categoryType: 'natural_only',
    examples: ['If the user asks, show them X', 'When deployed, enable Y']
  },
  safety_constraint: {
    name: 'Safety Constraint',
    description: 'Constraints related to safety or security',
    typicalRisk: 'high',
    categoryType: 'natural_only',
    examples: ['Do not expose private keys', 'Limit data retention to 30 days']
  },
  safety_event: {
    name: 'Safety Event',
    description: 'Events related to safety or security incidents',
    typicalRisk: 'high',
    categoryType: 'natural_only',
    examples: ['Authentication failed', 'Rate limit exceeded']
  },
  exact_quote: {
    name: 'Exact Quote',
    description: 'Direct quotes from sources',
    typicalRisk: 'low',
    categoryType: 'natural_only',
    examples: ['To be or not to be', 'Hello World']
  },
  code: {
    name: 'Code',
    description: 'Program code or code-like content',
    typicalRisk: 'medium',
    categoryType: 'natural_only',
    examples: ['function hello() {}', 'SELECT * FROM users']
  },
  command: {
    name: 'Command',
    description: 'Executable commands',
    typicalRisk: 'medium',
    categoryType: 'natural_only',
    examples: ['sudo rm -rf /tmp/data', 'git push origin main']
  },
  file_path: {
    name: 'File Path',
    description: 'Paths to files or directories',
    typicalRisk: 'low',
    categoryType: 'natural_only',
    examples: ['/home/user/file.txt', './src/components/Button.tsx']
  },
  url: {
    name: 'URL',
    description: 'Uniform Resource Locators',
    typicalRisk: 'low',
    categoryType: 'natural_only',
    examples: ['https://example.com', 'http://localhost:3000']
  },
  legal_text: {
    name: 'Legal Text',
    description: 'Legal language and documentation',
    typicalRisk: 'high',
    categoryType: 'natural_only',
    examples: ['Contract terms', 'Terms of service']
  },
  medical_text: {
    name: 'Medical Text',
    description: 'Medical terminology and documentation',
    typicalRisk: 'high',
    categoryType: 'natural_only',
    examples: ['Diagnosis descriptions', 'Treatment plans']
  },
  social_nuance: {
    name: 'Social Nuance',
    description: 'Cultural or social contextual information',
    typicalRisk: 'medium',
    categoryType: 'natural_only',
    examples: ['This is informal', 'Culturally sensitive topic']
  },
  ambiguous: {
    name: 'Ambiguous',
    description: 'Content with unclear or multiple interpretations',
    typicalRisk: 'medium',
    categoryType: 'natural_only',
    examples: ['The bank (river or financial?)', 'Time flies like an arrow']
  },
  complex_modality: {
    name: 'Complex Modality',
    description: 'Content with nuanced modal expressions',
    typicalRisk: 'medium',
    categoryType: 'natural_only',
    examples: ['It\'s possible but unlikely', 'She might have done it']
  }
};

// ── Classification Functions ────────────────────────────────────────

export interface PolicyClassificationInput {
  /** Content category */
  category: string;
  /** Risk level */
  risk: RiskLevel;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source text (optional) */
  sourceText?: string;
  /** Whether content has validated semantics */
  semantic?: boolean;
}

/**
 * Classify content according to policy rules
 * 
 * @param input - Classification input with category, risk, confidence
 * @returns Eligibility decision with reasons
 */
export function classifyContent(input: PolicyClassificationInput): EligibilityDecision {
  const { category, risk, confidence, sourceText, semantic } = input;
  const reasons: string[] = [];

  // Check semantic validation
  if (semantic !== true) {
    reasons.push('no_validated_semantics');
  }

  // Check confidence threshold
  if (confidence < MIN_AUTO_CONFIDENCE) {
    reasons.push(`confidence_below_${(MIN_AUTO_CONFIDENCE * 100).toFixed(0).replace(/\.0+$/, '')}`);
  }

  // Check risk level
  if (risk !== 'low') {
    reasons.push(`risk_${risk}`);
  }

  // Check category eligibility
  if (!ALL_CATEGORIES.has(category)) {
    if (NATURAL_ONLY_CATEGORIES.has(category)) {
      reasons.push(`natural_only_category_${category}`);
    } else {
      reasons.push(`category_not_in_taxonomy_${category}`);
    }
  } else if (!ELIGIBLE_CATEGORIES.has(category)) {
    reasons.push(`natural_only_category_${category}`);
  }

  // Check for exact text patterns
  if (sourceText) {
    const exactPatterns = /```|https?:\/\/|(?:^|\s)(?:[A-Za-z]:\\|\/)[^\s]+|\b(?:rm|sudo|curl|wget|git|npm|pnpm|python|node)\s+-?[^\n]*/u;
    if (exactPatterns.test(sourceText)) {
      reasons.push('exact_or_executable_text_detected');
    }
  }

  return {
    eligible: reasons.length === 0,
    category,
    risk,
    confidence,
    reasons
  };
}

/**
 * Classify content using typical risk and category type
 * 
 * @param category - Content category
 * @param confidence - Confidence score (0-1)
 * @param sourceText - Source text (optional)
 * @param semantic - Whether content has validated semantics
 * @returns Eligibility decision with typical risk level
 */
export function classifyByCategory(
  category: string,
  confidence: number,
  sourceText?: string,
  semantic?: boolean
): EligibilityDecision {
  const metadata = CATEGORY_METADATA[category];
  const risk: RiskLevel = metadata?.typicalRisk ?? 'unknown';
  const source = sourceText !== undefined ? sourceText : undefined;
  const sem = semantic !== undefined ? semantic : undefined;

  return classifyContent({
    category,
    risk,
    confidence,
    sourceText: source,
    semantic: sem
  });
}

/**
 * Get all categories for a given category type
 * 
 * @param type - 'eligible' or 'natural_only'
 * @returns Array of category names
 */
export function getCategoriesByType(type: 'eligible' | 'natural_only'): string[] {
  if (type === 'eligible') {
    return Array.from(ELIGIBLE_CATEGORIES);
  }
  return Array.from(NATURAL_ONLY_CATEGORIES);
}

/**
 * Get metadata for a category
 * 
 * @param category - Category name
 * @returns Category metadata or undefined
 */
export function getCategoryMetadata(category: string): CategoryMetadata | undefined {
  return CATEGORY_METADATA[category as keyof typeof CATEGORY_METADATA];
}

/**
 * Validate a category is in the taxonomy
 * 
 * @param category - Category to validate
 * @returns True if category is valid
 */
export function isValidCategory(category: string): boolean {
  return ALL_CATEGORIES.has(category as string);
}

/**
 * Generate policy statistics for a dataset
 * 
 * @param classifications - Array of classifications
 * @returns Statistics summary
 */
export function generatePolicyStats(
  classifications: EligibilityDecision[]
): {
  total: number;
  eligible: number;
  naturalOnly: number;
  riskDistribution: Record<RiskLevel, number>;
  categoryDistribution: Record<string, number>;
  avgConfidence: number;
} {
  if (classifications.length === 0) {
    return {
      total: 0,
      eligible: 0,
      naturalOnly: 0,
      riskDistribution: { low: 0, medium: 0, high: 0, unknown: 0 },
      categoryDistribution: {},
      avgConfidence: 0
    };
  }

  const eligible = classifications.filter(c => c.eligible).length;
  const naturalOnly = classifications.filter(c => !c.eligible && NATURAL_ONLY_CATEGORIES.has(c.category)).length;

  const riskDistribution: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
  const categoryDistribution: Record<string, number> = {};

  for (const c of classifications) {
    riskDistribution[c.risk] = (riskDistribution[c.risk] || 0) + 1;
    categoryDistribution[c.category] = (categoryDistribution[c.category] || 0) + 1;
  }

  const avgConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0) / classifications.length;

  return {
    total: classifications.length,
    eligible,
    naturalOnly,
    riskDistribution,
    categoryDistribution,
    avgConfidence
  };
}

// ── Export to prevent tree-shaking ──────────────────────────────────

export const policyClassificationExports = [
  classifyContent,
  classifyByCategory,
  getCategoriesByType,
  getCategoryMetadata,
  isValidCategory,
  generatePolicyStats
] as const;