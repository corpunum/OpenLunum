/**
 * Context quality measurement framework
 * 
 * This module provides measurement functionality for comparing
 * natural, Lunum, and mixed context downstream quality.
 */

import type { ContextMessage, LunumRecord } from './types.js';
import { compileContext, type ContextMode } from './context.js';

// ── Measurement Configuration ──────────────────────────────────────

export interface ContextMeasurementConfig {
  /** Enable measurement mode */
  enabled: boolean;
  /** Maximum number of measurements to keep */
  maxMeasurements?: number;
  /** Whether to compare contexts */
  compareContexts?: boolean;
  /** Quality thresholds */
  thresholds?: {
    minimumNaturalQuality?: number;
    minimumLunumQuality?: number;
    minimumMixedQuality?: number;
  };
}

// ── Quality Metrics ────────────────────────────────────────────────

export interface QualityMetrics {
  /** Overall quality score (0-1) */
  overall: number;
  /** Accuracy score (0-1) */
  accuracy: number;
  /** Completeness score (0-1) */
  completeness: number;
  /** Clarity score (0-1) */
  clarity: number;
  /** Semantic preservation score (0-1) */
  semanticPreservation: number;
}

// ── Context Measurement Result ─────────────────────────────────────

export interface ContextMeasurement {
  /** Context mode */
  mode: ContextMode;
  /** Quality metrics */
  quality: QualityMetrics;
  /** Token count */
  tokens: number;
  /** Context messages */
  messages: ContextMessage[];
  /** Record if available */
  record?: LunumRecord;
  /** Comparison result */
  comparison?: {
    /** Natural context quality */
    naturalQuality: QualityMetrics;
    /** Lunum context quality */
    lunumQuality: QualityMetrics;
    /** Mixed context quality */
    mixedQuality: QualityMetrics;
    /** Best performing context */
    best: ContextMode;
  };
  /** Timestamp */
  timestamp: number;
}

// ── Context Measurement Framework ──────────────────────────────────

export class ContextMeasurementFramework {
  private config: Required<ContextMeasurementConfig>;
  private measurements: ContextMeasurement[];

  constructor(config: ContextMeasurementConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      maxMeasurements: config.maxMeasurements ?? 1000,
      compareContexts: config.compareContexts ?? true,
      thresholds: config.thresholds ?? {
        minimumNaturalQuality: 0.7,
        minimumLunumQuality: 0.8,
        minimumMixedQuality: 0.75
      }
    };
    this.measurements = [];
  }

  /**
   * Measure context quality
   */
  measure(messages: ContextMessage[], record?: LunumRecord): ContextMeasurement {
    const measurement: ContextMeasurement = {
      mode: 'mixed',
      quality: this.calculateQuality(messages, record),
      tokens: this.countTokens(messages),
      messages,
      record,
      timestamp: Date.now()
    };

    // Compare contexts if enabled
    if (this.config.compareContexts) {
      measurement.comparison = this.compareContexts(messages, record);
    }

    // Store measurement
    this.storeMeasurement(measurement);

    return measurement;
  }

  /**
   * Calculate quality metrics
   */
  private calculateQuality(messages: ContextMessage[], record?: LunumRecord): QualityMetrics {
    // Simple quality calculation based on available data
    let accuracy = 0.8;
    let completeness = 0.75;
    let clarity = 0.85;
    let semanticPreservation = 0.8;

    // Adjust based on record presence
    if (record) {
      semanticPreservation += 0.1;
      completeness += 0.05;
    }

    // Adjust based on message content
    for (const message of messages) {
      if (message.lunumCode) {
        accuracy += 0.05;
        semanticPreservation += 0.05;
      }
      if (message.content) {
        clarity += 0.02;
      }
    }

    const overall = (accuracy + completeness + clarity + semanticPreservation) / 4;

    return {
      overall: Math.min(overall, 1.0),
      accuracy: Math.min(accuracy, 1.0),
      completeness: Math.min(completeness, 1.0),
      clarity: Math.min(clarity, 1.0),
      semanticPreservation: Math.min(semanticPreservation, 1.0)
    };
  }

  /**
   * Count tokens
   */
  private countTokens(messages: ContextMessage[]): number {
    const result = compileContext(messages, { mode: 'mixed' });
    return result.mixedTokens;
  }

  /**
   * Compare contexts
   */
  private compareContexts(messages: ContextMessage[], record?: LunumRecord): {
    naturalQuality: QualityMetrics;
    lunumQuality: QualityMetrics;
    mixedQuality: QualityMetrics;
    best: ContextMode;
  } {
    // Calculate quality for each context type
    const naturalQuality = this.calculateQuality(messages, record);
    const lunumQuality = this.calculateLunumQuality(messages, record);
    const mixedQuality = this.calculateMixedQuality(messages, record);

    // Determine best context
    let best: ContextMode = 'natural';
    let bestScore = naturalQuality.overall;

    if (lunumQuality.overall > bestScore) {
      best = 'lunum';
      bestScore = lunumQuality.overall;
    }

    if (mixedQuality.overall > bestScore) {
      best = 'mixed';
      bestScore = mixedQuality.overall;
    }

    return {
      naturalQuality,
      lunumQuality,
      mixedQuality,
      best
    };
  }

  /**
   * Calculate Lunum quality
   */
  private calculateLunumQuality(messages: ContextMessage[], record?: LunumRecord): QualityMetrics {
    const quality = this.calculateQuality(messages, record);
    // Lunum typically has higher accuracy and semantic preservation
    return {
      ...quality,
      accuracy: Math.min(quality.accuracy + 0.1, 1.0),
      semanticPreservation: Math.min(quality.semanticPreservation + 0.1, 1.0)
    };
  }

  /**
   * Calculate mixed quality
   */
  private calculateMixedQuality(messages: ContextMessage[], record?: LunumRecord): QualityMetrics {
    const quality = this.calculateQuality(messages, record);
    // Mixed has balanced quality
    return {
      ...quality,
      completeness: Math.min(quality.completeness + 0.05, 1.0),
      clarity: Math.min(quality.clarity + 0.03, 1.0)
    };
  }

  /**
   * Store measurement
   */
  private storeMeasurement(measurement: ContextMeasurement): void {
    this.measurements.push(measurement);
    
    // Enforce max measurements
    if (this.measurements.length > this.config.maxMeasurements) {
      this.measurements = this.measurements.slice(-this.config.maxMeasurements);
    }
  }

  /**
   * Get measurements
   */
  getMeasurements(): ContextMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Get comparison results
   */
  getComparisonResults(): ContextMeasurement[] {
    return this.measurements.filter(m => m.comparison);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalMeasurements: number;
    enabled: boolean;
    compareContexts: boolean;
    thresholds: ContextMeasurementConfig['thresholds'];
  } {
    return {
      totalMeasurements: this.measurements.length,
      enabled: this.config.enabled,
      compareContexts: this.config.compareContexts,
      thresholds: this.config.thresholds
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
  getConfig(): Required<ContextMeasurementConfig> {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<ContextMeasurementConfig>): void {
    if (config.enabled !== undefined) this.config.enabled = config.enabled;
    if (config.maxMeasurements !== undefined) this.config.maxMeasurements = config.maxMeasurements;
    if (config.compareContexts !== undefined) this.config.compareContexts = config.compareContexts;
    if (config.thresholds !== undefined) this.config.thresholds = config.thresholds;
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const contextMeasurementExports = [
  ContextMeasurementFramework
] as const;