/**
 * Protected Literal Registry (R6.2 readiness: expanded literal categories).
 *
 * Manages detection and preservation of protected literal categories:
 * - Units (5kg, $100, 3L, 20mph)
 * - Dates (ISO 8601: 2026-07-31, 2026-07-31T12:30:00Z)
 * - Identifiers (UUIDs, account numbers, ticket IDs)
 * - Ranges (1-10, 50-100%, 5-20kg)
 * - Paths (/usr/bin, C:\Windows\System32)
 * - URLs (https://example.com)
 * - Structured refs (§3.2, v2.1.0)
 */

import type { LunumTerm } from './types.js';

export type ProtectedLiteralCategory = 'quantity' | 'date' | 'identifier' | 'range' | 'url' | 'path' | 'structured-ref';

export interface DetectedLiteral {
  type: ProtectedLiteralCategory;
  token: string; // JSON-serialized canonical form for comparison
  raw: unknown; // Original value for logging/debugging
}

export interface LiteralCategorySpec {
  name: ProtectedLiteralCategory;
  description: string;
  patterns?: RegExp[];
  detector: (term: LunumTerm) => DetectedLiteral | undefined;
}

function isTermObject(term: unknown): term is Record<string, unknown> {
  return term !== null && term !== undefined && typeof term === 'object' && !Array.isArray(term);
}

/**
 * Detector for quantity literals (5kg, $100, 3L, 20mph).
 * Stored as: { type: 'quantity', value: number, unit: string }
 */
function detectQuantity(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'quantity') return undefined;

  const value = obj.value;
  const unit = obj.unit;
  if (value === null || value === undefined) return undefined;

  const token = JSON.stringify({ value, unit: unit ?? null });
  return { type: 'quantity', token, raw: { value, unit } };
}

/**
 * Detector for date literals (ISO 8601: 2026-07-31, 2026-07-31T12:30:00Z).
 * Stored as: { type: 'date', value: '2026-07-31' | '2026-07-31T12:30:00Z', ... }
 */
function detectDate(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'date') return undefined;

  const value = obj.value;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;

  const token = JSON.stringify({ value });
  return { type: 'date', token, raw: { value } };
}

/**
 * Detector for identifier literals (UUIDs, account numbers, ticket IDs).
 * Stored as: { type: 'identifier', id?: string, value?: string }
 */
function detectIdentifier(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'identifier') return undefined;

  const id = obj.id;
  const value = obj.value;
  if ((id === null || id === undefined) && (value === null || value === undefined)) return undefined;
  if (typeof id !== 'string' && typeof id !== 'undefined' && id !== null) return undefined;
  if (typeof value !== 'string' && typeof value !== 'undefined' && value !== null) return undefined;

  const token = JSON.stringify({ id: id ?? null, value: value ?? null });
  return { type: 'identifier', token, raw: { id, value } };
}

/**
 * Detector for range literals (1-10, 50-100%, 5-20kg).
 * Stored as: { type: 'range', min: number, max: number, unit?: string }
 */
function detectRange(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'range') return undefined;

  const min = obj.min ?? obj.value;
  const max = obj.max;
  const unit = obj.unit;

  if (min === null || min === undefined || max === null || max === undefined) return undefined;

  const token = JSON.stringify({ min, max, unit: unit ?? null });
  return { type: 'range', token, raw: { min, max, unit } };
}

/**
 * Detector for URL literals (https://example.com, ftp://files.example.org).
 * Stored as: { type: 'url', value?: string, ref?: string }
 */
function detectUrl(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'url') return undefined;

  const value = obj.value ?? obj.ref;
  if (typeof value !== 'string' && value !== null && value !== undefined) return undefined;

  const token = JSON.stringify({ value: value ?? null });
  return { type: 'url', token, raw: { value } };
}

/**
 * Detector for path literals (/usr/bin, C:\Windows\System32).
 * Stored as: { type: 'path', value?: string, ref?: string }
 */
function detectPath(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'path') return undefined;

  const value = obj.value ?? obj.ref;
  if (typeof value !== 'string' && value !== null && value !== undefined) return undefined;

  const token = JSON.stringify({ value: value ?? null });
  return { type: 'path', token, raw: { value } };
}

/**
 * Detector for structured reference literals (§3.2, v2.1.0).
 * Stored as: { type: 'structured-ref', value: string, format?: 'section'|'version' }
 */
function detectStructuredRef(term: LunumTerm): DetectedLiteral | undefined {
  if (!isTermObject(term)) return undefined;
  const obj = term as Record<string, unknown>;
  if (obj.type !== 'structured-ref') return undefined;

  const value = obj.value;
  const format = obj.format;

  if (typeof value !== 'string' && value !== null && value !== undefined) return undefined;

  const token = JSON.stringify({ value: value ?? null, format: format ?? null });
  return { type: 'structured-ref', token, raw: { value, format } };
}

/**
 * Registry of all protected literal categories.
 * Order matters: detector functions are called in order.
 */
const LITERAL_CATEGORIES: LiteralCategorySpec[] = [
  {
    name: 'quantity',
    description: 'Physical quantities with units (5kg, $100, 3L, 20mph)',
    patterns: [/^\d+\s*(kg|g|lb|oz|L|ml|ml|m|km|mi|ft|mph|km\/h|°C|°F|$|USD|EUR|GBP)$/u],
    detector: detectQuantity
  },
  {
    name: 'date',
    description: 'ISO 8601 dates and timestamps (2026-07-31, 2026-07-31T12:30:00Z)',
    patterns: [/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/u],
    detector: detectDate
  },
  {
    name: 'identifier',
    description: 'Identifiers like UUIDs, account numbers, ticket IDs',
    patterns: [/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u, /^[A-Z]{2,}-\d+$/u],
    detector: detectIdentifier
  },
  {
    name: 'range',
    description: 'Numeric ranges (1-10, 50-100%, 5-20kg)',
    patterns: [/^\d+-\d+(%)?$/u],
    detector: detectRange
  },
  {
    name: 'url',
    description: 'URLs (https://example.com, ftp://files.example.org)',
    patterns: [/^(https?|ftp):\/\/.+$/u],
    detector: detectUrl
  },
  {
    name: 'path',
    description: 'File system paths (/usr/bin, C:\\Windows\\System32)',
    patterns: [/^\/[^\s]+$/u, /^[A-Z]:\\[^\s]+$/u],
    detector: detectPath
  },
  {
    name: 'structured-ref',
    description: 'Structured references (§3.2 for section, v2.1.0 for version)',
    patterns: [/^§\d+(\.\d+)*$/u, /^v\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/u],
    detector: detectStructuredRef
  }
];

/**
 * ProtectedLiteralRegistry: central management of protected literal categories.
 * Provides detection, categorization, and canonical token generation for all protected literal types.
 */
export class ProtectedLiteralRegistry {
  private categories: Map<ProtectedLiteralCategory, LiteralCategorySpec>;

  constructor() {
    this.categories = new Map(LITERAL_CATEGORIES.map((spec) => [spec.name, spec]));
  }

  /**
   * Get all category specs in definition order.
   */
  getCategories(): LiteralCategorySpec[] {
    return Array.from(this.categories.values());
  }

  /**
   * Get a specific category spec by name.
   */
  getCategory(name: ProtectedLiteralCategory): LiteralCategorySpec | undefined {
    return this.categories.get(name);
  }

  /**
   * Detect if a term is a protected literal and extract its category and canonical token.
   * Returns undefined if the term is not a protected literal.
   */
  detect(term: LunumTerm): DetectedLiteral | undefined {
    for (const spec of this.getCategories()) {
      const detected = spec.detector(term);
      if (detected) return detected;
    }
    return undefined;
  }

  /**
   * Check if two detected literals are equivalent (same type and canonical token).
   */
  isEquivalent(a: DetectedLiteral, b: DetectedLiteral): boolean {
    return a.type === b.type && a.token === b.token;
  }

  /**
   * Get a human-readable description of a literal category.
   */
  getDescription(category: ProtectedLiteralCategory): string {
    const spec = this.getCategory(category);
    return spec?.description ?? `Unknown category: ${category}`;
  }
}

// Export a singleton registry instance for convenience
export const defaultRegistry = new ProtectedLiteralRegistry();
