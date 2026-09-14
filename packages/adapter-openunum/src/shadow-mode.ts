/**
 * Shadow mode for OpenUnum adapter
 * 
 * This module provides shadow mode functionality for the OpenUnum adapter,
 * allowing safe testing without affecting production systems.
 */

import { compareSem, fingerprintSem } from '@corpunum/lunum';
import type { LunumRecord, LunumSem, LunumSidecar } from '@corpunum/lunum';

// ── Shadow Mode Configuration ───────────────────────────────────────

export interface ShadowModeConfig {
  /** Enable shadow mode */
  enabled?: boolean;
  /** Log level for shadow operations */
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  /** Maximum number of shadow records to keep */
  maxRecords?: number;
  /** Whether to compare with production */
  compareWithProduction?: boolean;
}

// ── Shadow Record ───────────────────────────────────────────────────

export interface ShadowRecord {
  /** Original record */
  original: LunumRecord;
  /** Shadow record */
  shadow: LunumRecord;
  /** Comparison result */
  comparison?: {    /** Are fingerprints the same? */
    fingerprintsMatch: boolean;
    /** Are semantics the same? */
    semanticsMatch: boolean;
    /** Differences found */
    differences: string[];
  } | undefined;
  /** Timestamp */
  timestamp: number;
  /** Error if any */
  error?: string | undefined;
}

// ── Shadow Mode Adapter ─────────────────────────────────────────────

export class ShadowModeAdapter {
  private config: Required<ShadowModeConfig>;
  private shadowRecords: ShadowRecord[];

  constructor(config: ShadowModeConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      logLevel: config.logLevel ?? 'info',
      maxRecords: config.maxRecords ?? 1000,
      compareWithProduction: config.compareWithProduction ?? false
    } as Required<ShadowModeConfig>;
    this.shadowRecords = [];
  }

  /**
   * Process a record in shadow mode
   */
  process(record: LunumRecord, shadowSem: LunumSem): {
    processed: LunumRecord;
    shadow: LunumRecord | null;
    comparison?: {
      fingerprintsMatch: boolean;
      semanticsMatch: boolean;
      differences: string[];
    } | undefined;
  } {
    if (!this.config.enabled) {
      return {
        processed: record,
        shadow: null
      };
    }

    // Create shadow record
    const shadow: LunumRecord = {
      recordVersion: record.recordVersion,
      source: record.source,
      sem: shadowSem,
      // Shadow records must use the same canonical semantic identity as core.
      // A private hash format would make shadow comparisons incomparable with
      // production records and could conceal normalization differences.
      fingerprint: fingerprintSem(shadowSem),
      renderings: {},
      policy: record.policy,
      meta: { ...record.meta, _shadow: true }
    };

    // Compare if enabled
    let comparison: ShadowRecord['comparison'] | undefined;
    if (this.config.compareWithProduction) {
      comparison = this.compareRecords(record, shadow);
    }

    // Store shadow record
    this.storeShadowRecord({
      original: record,
      shadow,
      comparison,
      timestamp: Date.now()
    });

    return {
      processed: record,
      shadow,
      comparison
    };
  }

  /**
   * Compare two records
   */
  private compareRecords(original: LunumRecord, shadow: LunumRecord): {
    fingerprintsMatch: boolean;
    semanticsMatch: boolean;
    differences: string[];
  } {
    const differences: string[] = [];
    
    // Compare fingerprints
    const fingerprintsMatch = original.fingerprint === shadow.fingerprint;
    if (!fingerprintsMatch) {
      differences.push(`Fingerprint mismatch: ${original.fingerprint} vs ${shadow.fingerprint}`);
    }

    // Compare semantics
    const semanticsMatch = compareSem(original.sem, shadow.sem).exactCanonical;
    if (!semanticsMatch) {
      differences.push('Semantics mismatch');
    }

    return {
      fingerprintsMatch,
      semanticsMatch,
      differences
    };
  }

  /**
   * Store shadow record
   */
  private storeShadowRecord(record: ShadowRecord): void {
    this.shadowRecords.push(record);
    
    // Enforce max records
    if (this.shadowRecords.length > this.config.maxRecords) {
      this.shadowRecords = this.shadowRecords.slice(-this.config.maxRecords);
    }
  }

  /**
   * Get shadow records
   */
  getShadowRecords(): ShadowRecord[] {
    return [...this.shadowRecords];
  }

  /**
   * Get shadow statistics
   */
  getStats(): {
    totalRecords: number;
    enabled: boolean;
    compareWithProduction: boolean;
    maxRecords: number;
  } {
    return {
      totalRecords: this.shadowRecords.length,
      enabled: this.config.enabled,
      compareWithProduction: this.config.compareWithProduction,
      maxRecords: this.config.maxRecords
    };
  }

  /**
   * Clear shadow records
   */
  clear(): void {
    this.shadowRecords = [];
  }

  /**
   * Get configuration
   */
  getConfig(): Required<ShadowModeConfig> {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<ShadowModeConfig>): void {
    if (config.enabled !== undefined) this.config.enabled = config.enabled;
    if (config.logLevel !== undefined) this.config.logLevel = config.logLevel;
    if (config.maxRecords !== undefined) this.config.maxRecords = config.maxRecords;
    if (config.compareWithProduction !== undefined) this.config.compareWithProduction = config.compareWithProduction;
  }
}

// ── Export ──────────────────────────────────────────────────────────

export const shadowModeExports = [
  ShadowModeAdapter
] as const;
