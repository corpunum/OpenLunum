/**
 * Near-semantic fingerprints for fuzzy matching and similarity
 * 
 * This module provides near-semantic fingerprint generation
 * and comparison for semantic similarity tracking.
 */

import type { LunumSem, LunumRecord } from './types.js';

// ── Near-Semantic Fingerprint Type ─────────────────────────────────

export type NearSemanticFingerprint = string;

// ── Similarity Result ──────────────────────────────────────────────

export interface SimilarityResult {
  /** First fingerprint */
  fingerprint1: NearSemanticFingerprint;
  /** Second fingerprint */
  fingerprint2: NearSemanticFingerprint;
  /** Similarity score (0-1) */
  similarity: number;
  /** Whether they are similar */
  similar: boolean;
  /** Threshold used */
  threshold: number;
}

// ── Near-Semantic Fingerprint Generator ────────────────────────────

export class NearSemanticFingerprintGenerator {
  private threshold: number;

  constructor(threshold: number = 0.8) {
    this.threshold = threshold;
  }

  /**
   * Generate near-semantic fingerprint for a semantic representation
   */
  generate(sem: LunumSem): NearSemanticFingerprint {
    // Extract key features for near-semantic fingerprint
    const features = this.extractFeatures(sem);
    const hash = this.hashFeatures(features);
    return `nfp:${hash}`;
  }

  /**
   * Generate near-semantic fingerprint for a record
   */
  generateFromRecord(record: LunumRecord): NearSemanticFingerprint {
    return this.generate(record.sem);
  }

  /**
   * Compare two near-semantic fingerprints
   */
  compare(fp1: NearSemanticFingerprint, fp2: NearSemanticFingerprint): SimilarityResult {
    const similarity = this.calculateSimilarity(fp1, fp2);
    const similar = similarity >= this.threshold;

    return {
      fingerprint1: fp1,
      fingerprint2: fp2,
      similarity,
      similar,
      threshold: this.threshold
    };
  }

  /**
   * Compare fingerprints for two records
   */
  compareRecords(record1: LunumRecord, record2: LunumRecord): SimilarityResult {
    const fp1 = this.generateFromRecord(record1);
    const fp2 = this.generateFromRecord(record2);
    return this.compare(fp1, fp2);
  }

  /**
   * Extract features from semantic representation
   */
  private extractFeatures(sem: LunumSem): string[] {
    const features: string[] = [];

    // Add schema
    features.push(sem.schema);

    // Add world
    features.push(sem.world);

    // Add kind
    features.push(sem.kind);

    // Add predicates
    for (const clause of sem.clauses) {
      features.push(clause.predicate);
      
      // Add roles
      for (const [role, value] of Object.entries(clause.roles ?? {})) {
        features.push(`${role}:${this.stringifyValue(value)}`);
      }
      
      // Add negation
      if (clause.negated) {
        features.push(`negated:${clause.predicate}`);
      }
      
      // Add time
      if (clause.time) {
        features.push(`time:${this.stringifyValue(clause.time)}`);
      }
      
      // Add modality
      if (clause.modality) {
        features.push(`modality:${clause.modality}`);
      }
    }

    return features;
  }

  /**
   * Hash features to create fingerprint
   */
  private hashFeatures(features: string[]): string {
    let hash = 0;
    const sorted = [...features].sort();
    
    for (const feature of sorted) {
      hash = ((hash << 5) - hash) + this.hashString(feature);
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Hash a string
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Stringify a value for feature extraction
   */
  private stringifyValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  /**
   * Calculate similarity between two fingerprints
   */
  private calculateSimilarity(fp1: NearSemanticFingerprint, fp2: NearSemanticFingerprint): number {
    // Extract hashes
    const hash1 = fp1.replace('nfp:', '');
    const hash2 = fp2.replace('nfp:', '');

    // Simple hash comparison for similarity
    if (hash1 === hash2) {
      return 1.0;
    }

    // Count matching characters
    let matches = 0;
    const minLen = Math.min(hash1.length, hash2.length);
    
    for (let i = 0; i < minLen; i++) {
      if (hash1[i] === hash2[i]) {
        matches++;
      }
    }

    // Calculate similarity
    return minLen > 0 ? matches / hash1.length : 0;
  }

  /**
   * Get threshold
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Set threshold
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const nearSemanticFingerprintExports = [
  NearSemanticFingerprintGenerator
] as const;