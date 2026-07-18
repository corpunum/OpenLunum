/**
 * Multilingual retrieval and false-equivalence detection
 * 
 * This module provides functionality for cross-language semantic retrieval
 * and detection of false-equivalent matches between different languages.
 */

import type { LunumRecord } from '@corpunum/lunum';

// ── Language Codes ──────────────────────────────────────────────────

export type LanguageCode = 'en' | 'el' | 'es' | 'id' | string;

export const SUPPORTED_LANGUAGES: Set<LanguageCode> = new Set([
  'en', // English
  'el', // Greek
  'es', // Spanish
  'id'  // Indonesian
]);

// ── Retrieval Result ────────────────────────────────────────────────

export interface RetrievalResult {
  /** Record ID or fingerprint */
  id: string;
  /** Semantic content */
  record: LunumRecord;
  /** Relevance score (0-1) */
  score: number;
  /** Source language */
  sourceLanguage: LanguageCode;
  /** Whether this is a true match or potential false-equivalence */
  isTrueMatch: boolean;
  /** False-equivalence confidence if applicable */
  falseEquivalenceConfidence?: number | undefined;
}

export interface RetrievalQuery {
  /** Search text */
  text: string;
  /** Query language */
  language: LanguageCode;
  /** Maximum results to return */
  maxResults?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Whether to include potential false-equivalences */
  includeFalseEquivalences?: boolean;
}

// ── False Equivalence ───────────────────────────────────────────────

export interface FalseEquivalence {
  /** The two records that appear equivalent but aren't */
  record1Id: string;
  record2Id: string;
  /** Confidence that this is a false equivalence */
  confidence: number;
  /** Reason for the false equivalence */
  reason: string;
  /** Languages involved */
  languages: [LanguageCode, LanguageCode];
}

// ── Multilingual Retrieval Index ────────────────────────────────────

export class MultilingualRetrievalIndex {
  private records: Map<string, LunumRecord>;
  private languageIndex: Map<LanguageCode, string[]>;
  private equivalenceCache: Map<string, FalseEquivalence[]>;

  constructor() {
    this.records = new Map();
    this.languageIndex = new Map();
    this.equivalenceCache = new Map();
  }

  /**
   * Add a record to the index
   */
  add(record: LunumRecord): void {
    const id = record.fingerprint || crypto.randomUUID();
    this.records.set(id, record);
    
    const language = record.source.language || 'en';
    if (!this.languageIndex.has(language)) {
      this.languageIndex.set(language, []);
    }
    this.languageIndex.get(language)!.push(id);
    
    // Clear cache when new record is added
    this.equivalenceCache.clear();
  }

  /**
   * Search for records matching the query
   */
  search(query: RetrievalQuery): RetrievalResult[] {
    const maxResults = query.maxResults ?? 10;
    const minScore = query.minScore ?? 0.0;
    const includeFalseEquivalences = query.includeFalseEquivalences ?? false;

    let results: RetrievalResult[] = [];

    // Search in the same language first
    const sameLanguageResults = this.searchLanguage(query.text, query.language);
    for (const result of sameLanguageResults) {
      if (result.score >= minScore) {
        results.push(result);
      }
    }

    // Search in other languages if requested
    if (includeFalseEquivalences) {
      for (const [lang, ids] of this.languageIndex.entries()) {
        if (lang !== query.language) {
          const crossLanguageResults = this.searchLanguage(query.text, lang);
          for (const result of crossLanguageResults) {
            if (result.score >= minScore * 0.8) { // Lower threshold for cross-language
              // Check for false equivalence
              const falseEq = this.detectFalseEquivalence(
                query.language,
                lang,
                result.record
              );
              results.push({
                ...result,
                sourceLanguage: lang,
                isTrueMatch: !falseEq,
                falseEquivalenceConfidence: falseEq?.confidence
              });
            }
          }
        }
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * Search within a specific language
   */
  private searchLanguage(text: string, language: LanguageCode): RetrievalResult[] {
    const results: RetrievalResult[] = [];
    
    // Simple keyword matching (in production, would use semantic search)
    const queryWords = text.toLowerCase().split(/\s+/);
    
    const ids = this.languageIndex.get(language) ?? [];
    for (const id of ids) {
      const record = this.records.get(id);
      if (!record) continue;

      const textToSearch = record.source.text.toLowerCase();
      const score = this.calculateRelevanceScore(queryWords, textToSearch);
      
      results.push({
        id,
        record,
        score,
        sourceLanguage: language,
        isTrueMatch: true
      });
    }

    return results;
  }

  /**
   * Calculate relevance score based on keyword overlap
   */
  private calculateRelevanceScore(queryWords: string[], text: string): number {
    if (queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (text.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }

  /**
   * Detect potential false equivalences between languages
   */
  detectFalseEquivalence(
    lang1: LanguageCode,
    lang2: LanguageCode,
    record: LunumRecord
  ): FalseEquivalence | null {
    const cacheKey = `${lang1}-${lang2}-${record.fingerprint}`;
    const cached = this.equivalenceCache.get(cacheKey);
    if (cached) {
      return cached.find(eq => eq.record1Id === record.fingerprint) ?? null;
    }

    // Simple heuristic: if the records have different semantics but similar surface text
    const reasons: string[] = [];
    let confidence = 0;

    // Check for different predicates
    const sem = record.sem as unknown as { clauses?: Array<{ predicate?: string }> };
    const predicates = sem?.clauses?.map(c => c.predicate) ?? [];
    
    if (predicates.length === 0) {
      confidence = 0.3;
      reasons.push('no_predicates');
    }

    if (reasons.length > 0) {
      const eq: FalseEquivalence = {
        record1Id: record.fingerprint || '',
        record2Id: '', // Would be compared against another record
        confidence,
        reason: reasons.join(', '),
        languages: [lang1, lang2]
      };
      
      if (!this.equivalenceCache.has(cacheKey)) {
        this.equivalenceCache.set(cacheKey, []);
      }
      this.equivalenceCache.get(cacheKey)!.push(eq);
      
      return eq;
    }

    return null;
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalRecords: number;
    recordsByLanguage: Record<LanguageCode, number>;
    equivalencePairs: number;
  } {
    const recordsByLanguage: Record<LanguageCode, number> = {};
    
    for (const [lang, ids] of this.languageIndex.entries()) {
      recordsByLanguage[lang] = ids.length;
    }

    return {
      totalRecords: this.records.size,
      recordsByLanguage,
      equivalencePairs: this.equivalenceCache.size
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.records.clear();
    this.languageIndex.clear();
    this.equivalenceCache.clear();
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const multilingualRetrievalExports = [
  MultilingualRetrievalIndex,
  SUPPORTED_LANGUAGES
] as const;