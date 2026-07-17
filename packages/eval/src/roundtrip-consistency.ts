/**
 * Round-trip self-consistency checking for realization
 * 
 * This module provides functionality for validating realization quality
 * by checking that realizing Lunum-Sem to text and parsing back preserves
 * semantic identity.
 */

import type { LunumRecord, LunumSem, LunumClause } from '@corpunum/lunum';

// ── Round-Trip Result ───────────────────────────────────────────────

export interface RoundTripResult {
  /** Original record fingerprint */
  originalFingerprint: string;
  /** Realized text */
  realizedText: string;
  /** Parsed back fingerprint */
  parsedFingerprint: string;
  /** Consistency score (0-1) */
  consistencyScore: number;
  /** Components of consistency */
  components: {
    /** Predicate match rate */
    predicateMatch: number;
    /** Role match rate */
    roleMatch: number;
    /** Protected literal preservation */
    protectedLiteralPreservation: number;
  };
  /** Warnings about consistency issues */
  warnings: string[];
  /** Metadata */
  metadata: {
    originalClauses: number;
    parsedClauses: number;
    protectedLiteralsFound: number;
  };
}

// ── Round-Trip Checker ──────────────────────────────────────────────

export class RoundTripChecker {
  private minConsistencyScore: number;

  constructor(options: { minConsistencyScore?: number } = {}) {
    this.minConsistencyScore = options.minConsistencyScore ?? 0.7;
  }

  /**
   * Perform round-trip consistency check
   * 
   * This simulates the round-trip:
   * 1. Original Lunum-Sem -> Realized Text (done by realization engine)
   * 2. Realized Text -> Parsed Lunum-Sem (simulated here)
   * 3. Compare original and parsed for consistency
   */
  checkConsistency(
    originalRecord: LunumRecord,
    realizedText: string,
    originalProtectedLiterals: Array<{ text: string; type: string }> = []
  ): RoundTripResult {
    const originalSem = originalRecord.sem as unknown as LunumSem;
    const originalClauses = originalSem.clauses ?? [];

    // Simulate parsing back from realized text
    const parsedClauses = this.simulateParseBack(realizedText, originalRecord.source.language || 'en');
    
    // Calculate consistency components
    const predicateMatch = this.calculatePredicateMatch(originalClauses, parsedClauses);
    const roleMatch = this.calculateRoleMatch(originalClauses, parsedClauses);
    const protectedLiteralPreservation = this.calculateProtectedLiteralPreservation(
      realizedText,
      originalProtectedLiterals
    );

    // Calculate overall consistency score
    const consistencyScore = 
      predicateMatch * 0.4 +
      roleMatch * 0.3 +
      protectedLiteralPreservation * 0.3;

    // Generate warnings
    const warnings: string[] = [];
    if (predicateMatch < this.minConsistencyScore) {
      warnings.push(`Low predicate match: ${predicateMatch.toFixed(2)}`);
    }
    if (roleMatch < this.minConsistencyScore) {
      warnings.push(`Low role match: ${roleMatch.toFixed(2)}`);
    }
    if (protectedLiteralPreservation < this.minConsistencyScore) {
      warnings.push(`Low protected literal preservation: ${protectedLiteralPreservation.toFixed(2)}`);
    }

    // Calculate parsed fingerprint (simplified)
    const parsedFingerprint = this.calculateFingerprint(parsedClauses);

    return {
      originalFingerprint: originalRecord.fingerprint,
      realizedText,
      parsedFingerprint,
      consistencyScore: Math.min(1, Math.max(0, consistencyScore)),
      components: {
        predicateMatch,
        roleMatch,
        protectedLiteralPreservation
      },
      warnings,
      metadata: {
        originalClauses: originalClauses.length,
        parsedClauses: parsedClauses.length,
        protectedLiteralsFound: originalProtectedLiterals.length
      }
    };
  }

  /**
   * Simulate parsing back from realized text
   * This is a simplified simulation for testing
   */
  private simulateParseBack(text: string, language: string): LunumClause[] {
    // Simple heuristic: extract predicates from text
    const predicates: string[] = [];
    const words = text.split(/\s+/);
    
    // Look for common predicate patterns
    if (/greet/i.test(text)) predicates.push('greeting');
    if (/statement|is|are|was|were/i.test(text)) predicates.push('statement');
    if (/question|\?$/i.test(text)) predicates.push('question');
    if (/location|located|at|in|on/i.test(text)) predicates.push('location');
    if (/action|does|did|will|can/i.test(text)) predicates.push('action');

    // Create mock clauses
    return predicates.map(predicate => ({
      predicate,
      roles: {
        subject: words[0] || 'text'
      }
    }));
  }

  /**
   * Calculate predicate match rate
   */
  private calculatePredicateMatch(original: LunumClause[], parsed: LunumClause[]): number {
    if (original.length === 0 && parsed.length === 0) return 1;
    if (original.length === 0 || parsed.length === 0) return 0;

    const originalPredicates = new Set(original.map(c => c.predicate).filter(Boolean));
    const parsedPredicates = new Set(parsed.map(c => c.predicate).filter(Boolean));

    let matches = 0;
    for (const pred of originalPredicates) {
      if (parsedPredicates.has(pred)) {
        matches++;
      }
    }

    return matches / originalPredicates.size;
  }

  /**
   * Calculate role match rate
   */
  private calculateRoleMatch(original: LunumClause[], parsed: LunumClause[]): number {
    if (original.length === 0 || parsed.length === 0) return 0;

    let totalRoles = 0;
    let matchedRoles = 0;

    for (let i = 0; i < Math.min(original.length, parsed.length); i++) {
      const origRoles = Object.keys(original[i]?.roles ?? {});
      const parsedRoles = Object.keys(parsed[i]?.roles ?? {});

      totalRoles += origRoles.length;
      
      for (const role of origRoles) {
        if (parsedRoles.includes(role)) {
          matchedRoles++;
        }
      }
    }

    return totalRoles > 0 ? matchedRoles / totalRoles : 0;
  }

  /**
   * Calculate protected literal preservation
   */
  private calculateProtectedLiteralPreservation(
    realizedText: string,
    literals: Array<{ text: string; type: string }>
  ): number {
    if (literals.length === 0) return 1;

    const textLower = realizedText.toLowerCase();
    let preserved = 0;

    for (const literal of literals) {
      if (textLower.includes(literal.text.toLowerCase())) {
        preserved++;
      }
    }

    return preserved / literals.length;
  }

  /**
   * Calculate fingerprint from clauses (simplified)
   */
  private calculateFingerprint(clauses: LunumClause[]): string {
    let hash = 0;
    for (const clause of clauses) {
      const text = clause.predicate || '';
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
    }
    return `rtf:${Math.abs(hash).toString(16)}`;
  }

  /**
   * Check if consistency meets minimum threshold
   */
  isConsistent(result: RoundTripResult): boolean {
    return result.consistencyScore >= this.minConsistencyScore;
  }

  /**
   * Get minimum consistency score
   */
  getMinConsistencyScore(): number {
    return this.minConsistencyScore;
  }

  /**
   * Set minimum consistency score
   */
  setMinConsistencyScore(score: number): void {
    this.minConsistencyScore = score;
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const roundtripConsistencyExports = [
  RoundTripChecker
] as const;