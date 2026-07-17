/**
 * Tokenizer measurement framework for generic-en-pivot/0.1
 * 
 * This module provides tokenizer measurement functionality for the
 * generic-en-pivot/0.1 renderer profile.
 */

import type { LunumRecord } from './types.js';

// ── Tokenizer Configuration ────────────────────────────────────────

export interface TokenizerConfig {
  /** Tokenizer name */
  name: string;
  /** Tokenizer version */
  version?: string;
  /** Maximum tokens per record */
  maxTokens?: number;
  /** Whether to measure exact tokens */
  exact?: boolean;
}

// ── Tokenizer Result ───────────────────────────────────────────────

export interface TokenizerResult {
  /** Tokenizer name */
  tokenizer: string;
  /** Token count */
  tokens: number;
  /** Actual token list if exact */
  tokenList?: string[];
  /** Error if any */
  error?: string;
}

// ── Measurement Result ─────────────────────────────────────────────

export interface MeasurementResult {
  /** Record being measured */
  record: LunumRecord;
  /** Results for each tokenizer */
  results: TokenizerResult[];
  /** Average token count */
  averageTokens: number;
  /** Minimum token count */
  minTokens: number;
  /** Maximum token count */
  maxTokens: number;
  /** Timestamp */
  timestamp: number;
}

// ── Tokenizer Measurement Framework ────────────────────────────────

export class TokenizerMeasurementFramework {
  private config: Required<TokenizerConfig>;
  private measurements: MeasurementResult[];

  constructor(config: TokenizerConfig = {}) {
    this.config = {
      name: config.name ?? 'generic',
      version: config.version ?? '1.0.0',
      maxTokens: config.maxTokens ?? 4096,
      exact: config.exact ?? true
    };
    this.measurements = [];
  }

  /**
   * Measure tokens for a record
   */
  measure(record: LunumRecord, tokenizer?: (text: string) => { tokens: number; tokenList?: string[] }): MeasurementResult {
    const result: TokenizerResult = {
      tokenizer: this.config.name,
      tokens: 0,
      tokenList: []
    };

    try {
      // Get the text to measure
      const text = this.getTextToMeasure(record);
      
      // Measure tokens
      if (tokenizer) {
        const tokenResult = tokenizer(text);
        result.tokens = tokenResult.tokens;
        result.tokenList = tokenResult.tokenList || [];
      } else {
        // Estimate tokens (rough approximation)
        result.tokens = this.estimateTokens(text);
      }

      // Check max tokens
      if (result.tokens > this.config.maxTokens) {
        result.error = `Token count ${result.tokens} exceeds max ${this.config.maxTokens}`;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    // Create measurement result
    const measurement: MeasurementResult = {
      record,
      results: [result],
      averageTokens: result.tokens,
      minTokens: result.tokens,
      maxTokens: result.tokens,
      timestamp: Date.now()
    };

    // Store measurement
    this.storeMeasurement(measurement);

    return measurement;
  }

  /**
   * Measure multiple records
   */
  measureBatch(records: LunumRecord[], tokenizer?: (text: string) => { tokens: number; tokenList?: string[] }): MeasurementResult[] {
    return records.map(record => this.measure(record, tokenizer));
  }

  /**
   * Get text to measure from record
   */
  private getTextToMeasure(record: LunumRecord): string {
    // Priority: source text > Lunum code > rendered text
    if (record.source.text) {
      return record.source.text;
    }
    
    // Get Lunum code if available
    const renderings = Object.values(record.renderings);
    if (renderings.length > 0) {
      return (renderings[0] as any).code || '';
    }
    
    return '';
  }

  /**
   * Estimate tokens (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Store measurement
   */
  private storeMeasurement(measurement: MeasurementResult): void {
    this.measurements.push(measurement);
  }

  /**
   * Get measurements
   */
  getMeasurements(): MeasurementResult[] {
    return [...this.measurements];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalMeasurements: number;
    averageTokens: number;
    minTokens: number;
    maxTokens: number;
  } {
    if (this.measurements.length === 0) {
      return {
        totalMeasurements: 0,
        averageTokens: 0,
        minTokens: 0,
        maxTokens: 0
      };
    }

    const totalTokens = this.measurements.reduce((sum, m) => sum + m.averageTokens, 0);
    const minTokens = Math.min(...this.measurements.map(m => m.minTokens));
    const maxTokens = Math.max(...this.measurements.map(m => m.maxTokens));

    return {
      totalMeasurements: this.measurements.length,
      averageTokens: totalTokens / this.measurements.length,
      minTokens,
      maxTokens
    };
  }

  /**
   * Clear measurements
   */
  clear(): void {
    this.measurements = [];
  }

  /**
   * Get configuration
   */
  getConfig(): Required<TokenizerConfig> {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<TokenizerConfig>): void {
    if (config.name !== undefined) this.config.name = config.name;
    if (config.version !== undefined) this.config.version = config.version;
    if (config.maxTokens !== undefined) this.config.maxTokens = config.maxTokens;
    if (config.exact !== undefined) this.config.exact = config.exact;
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const tokenizerMeasurementExports = [
  TokenizerMeasurementFramework
] as const;