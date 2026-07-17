/**
 * Shadow mode for OpenUnum adapter
 * 
 * This module provides shadow mode functionality for the OpenUnum adapter,
 * allowing safe testing without affecting production systems.
 */

import type { LunumRecord, LunumSem, LunumSidecar } from '@corpunum/lunum';

// ── Shadow Mode Configuration ───────────────────────────────────────

export interface ShadowModeConfig {
  /** Enable shadow mode */
  enabled: boolean;
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
  comparison?: {
    /** Are fingerprints the same? */
    fingerprintsMatch: boolean;
    /** Are semantics the same? */
    semanticsMatch: boolean;
    /** Differences found */
    differences: string[];
  };
  /** Timestamp */
  timestamp: number;
  /** Error if any */
  error?: string;
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
    };
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
    };
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
      fingerprint: this.calculateFingerprint(shadowSem),
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
    const semanticsMatch = this.compareSemantics(original.sem, shadow.sem);
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
   * Compare two semantic representations
   */
  private compareSemantics(sem1: LunumSem, sem2: LunumSem): boolean {
    // Compare schema
    if (sem1.schema !== sem2.schema) return false;
    
    // Compare world
    if (sem1.world !== sem2.world) return false;
    
    // Compare kind
    if (sem1.kind !== sem2.kind) return false;
    
    // Compare clauses
    if (sem1.clauses.length !== sem2.clauses.length) return false;
    
    for (let i = 0; i < sem1.clauses.length; i++) {
      const c1 = sem1.clauses[i];
      const c2 = sem2.clauses[i];
      
      if (c1.predicate !== c2.predicate) return false;
      if (c1.negated !== c2.negated) return false;
      
      // Compare roles (simplified)
      const roles1 = Object.keys(c1.roles ?? {});
      const roles2 = Object.keys(c2.roles ?? {});
      if (roles1.length !== roles2.length) return false;
      
      for (const role of roles1) {
        if (c1.roles[role] !== c2.roles[role]) return false;
      }
    }
    
    return true;
  }

  /**
   * Calculate fingerprint for semantic (simplified)
   */
  private calculateFingerprint(sem: LunumSem): string {
    let hash = 0;
    const text = JSON.stringify(sem);
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `lfp:shadow:${Math.abs(hash).toString(16)}`;
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