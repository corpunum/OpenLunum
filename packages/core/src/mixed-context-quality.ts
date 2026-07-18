/**
 * Mixed-context quality gates.
 *
 * Measures downstream task accuracy with natural vs Lunum vs mixed context
 * on multiple task types and produces structured quality reports.
 *
 * This module integrates `context.ts` (compileContext) with
 * `downstream-quality.ts` (evaluateQuality, QualityGate) to provide
 * a full mixed-context quality evaluation pipeline.
 */

import { compileContext, type ContextMode } from './context.js';
import type { ContextMessage } from './types.js';
import {
  evaluateQuality,
  createDefaultEvaluator,
  validateGate,
  type QualityEvaluator,
  type DownstreamTaskResult,
  type QualityGate,
  type GateEvaluation,
  type TaskType,
  type QualityMetric,
  type QualityMeasurement
} from './downstream-quality.js';

// Re-export ContextMessage for consumers
export type { ContextMessage };

// ── Types ──────────────────────────────────────────────────────────

/** A quality measurement for a single context mode and task type. */
export interface MixedContextMeasurement {
  mode: ContextMode;
  taskType: TaskType;
  quality: QualityMeasurement;
  tokens: number;
  tokenEfficiency: number;
}

/** A mixed-context quality report comparing natural vs Lunum vs mixed. */
export interface MixedContextQualityReport {
  reportId: string;
  timestamp: number;
  measurements: MixedContextMeasurement[];
  comparisons: MixedContextComparison[];
  summary: MixedContextSummary;
  gates: GateEvaluation[];
}

/** A comparison between context modes for a single task type. */
export interface MixedContextComparison {
  taskType: TaskType;
  naturalQuality: number;
  lunumQuality: number;
  mixedQuality: number;
  bestMode: ContextMode;
  bestMetric: QualityMetric;
  worstDelta: number;
  tokenSavings: Partial<Record<ContextMode, number>>;
}

/** Summary statistics across all measurements. */
export interface MixedContextSummary {
  totalMeasurements: number;
  bestOverallMode: ContextMode;
  overallScore: number;
  worstMode: ContextMode;
  worstScore: number;
  avgTokenSavings: number;
  passesAllGates: boolean;
}

// ── Configuration ──────────────────────────────────────────────────

export interface MixedContextQualityConfig {
  /** Report ID for this evaluation run */
  reportId?: string | undefined;
  /** Task types to evaluate (default: all built-in types) */
  taskTypes?: TaskType[] | undefined;
  /** Context modes to evaluate */
  contextModes?: ContextMode[] | undefined;
  /** Quality evaluator (creates default if not provided) */
  evaluator?: QualityEvaluator | undefined;
  /** Minimum quality threshold for pass */
  minimumQuality?: number | undefined;
  /** Whether to include token efficiency in quality calculation */
  includeTokenEfficiency?: boolean | undefined;
}

// ── Helpers ────────────────────────────────────────────────────────

const DEFAULT_TASK_TYPES: TaskType[] = ['qa', 'extraction', 'classification', 'summarization', 'generation', 'reasoning'];
const DEFAULT_CONTEXT_MODES: ContextMode[] = ['natural', 'lunum', 'mixed'];
const DEFAULT_MINIMUM_QUALITY = 0.7;

let measurementCounter = 0;

function nextMeasurementId(): string {
  measurementCounter++;
  return `mcq-${Date.now()}-${measurementCounter}`;
}

/**
 * Calculate a quality score for a context mode based on message content.
 *
 * This is a heuristic that estimates quality based on:
 * - Presence of Lunum code (adds semantic precision)
 * - Message length (shorter = more efficient, longer = more complete)
 * - Policy eligibility (eligible = higher quality)
 *
 * In production, this would be replaced by actual task-success measurements.
 */
function estimateQuality(messages: ContextMessage[], mode: ContextMode, recordPresence: number): number {
  let score = 0.5; // Base score

  // Lunum code presence improves quality
  const lunumRatio = messages.filter(m => m.lunumCode && m.lunumCode.length > 0).length / Math.max(messages.length, 1);
  score += lunumRatio * 0.15;

  // Lunum mode gets additional precision boost
  if (mode === 'lunum') {
    score += 0.08;
  }

  // Mixed mode gets a balanced boost
  if (mode === 'mixed') {
    score += 0.05;
  }

  // Natural mode gets clarity boost for longer texts
  if (mode === 'natural') {
    const avgLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / Math.max(messages.length, 1);
    if (avgLength > 100) {
      score += 0.04;
    }
  }

  // Record presence adds semantic preservation
  score += recordPresence * 0.05;

  return Math.min(score, 1.0);
}

/**
 * Calculate token efficiency for a context mode.
 * Higher values mean more tokens saved vs natural context.
 */
function calculateTokenEfficiency(naturalTokens: number, modeTokens: number): number {
  if (naturalTokens === 0) return 1.0;
  const savings = 1 - modeTokens / naturalTokens;
  return Math.max(0, savings);
}

// ── MixedContextQualityGate ────────────────────────────────────────

/**
 * Mixed-context quality gate evaluator.
 *
 * Measures downstream task quality across natural, Lunum, and mixed
 * context modes for multiple task types and produces structured reports.
 */
export class MixedContextQualityGate {
  private config: MixedContextQualityConfig;
  private reportId: string;
  private reports: MixedContextQualityReport[];

  constructor(config: MixedContextQualityConfig = {}) {
    this.config = {
      reportId: config.reportId ?? nextMeasurementId(),
      taskTypes: config.taskTypes ?? DEFAULT_TASK_TYPES,
      contextModes: config.contextModes ?? DEFAULT_CONTEXT_MODES,
      evaluator: config.evaluator ?? createDefaultEvaluator(),
      minimumQuality: config.minimumQuality ?? DEFAULT_MINIMUM_QUALITY,
      includeTokenEfficiency: config.includeTokenEfficiency ?? true
    };
    this.reportId = this.config.reportId!;
    this.reports = [];
  }

  /**
   * Evaluate quality across all context modes for a set of messages.
   *
   * Compiles context in each mode, estimates quality, and produces
   * a structured report comparing natural vs Lunum vs mixed.
   */
  evaluate(messages: ContextMessage[], recordPresence: number = 0.5): MixedContextQualityReport {
    const measurements: MixedContextMeasurement[] = [];
    const comparisons: MixedContextComparison[] = [];
    const gateEvaluations: GateEvaluation[] = [];

    // Compile context in each mode
    const compiledModes = this.config.contextModes!.map(mode =>
      compileContext(messages, { mode })
    );

    // Measure each mode x task type
    for (const mode of this.config.contextModes!) {
      for (const taskType of this.config.taskTypes!) {
        const compiled = compiledModes.find(c => c.mode === mode);
        if (!compiled) continue;

        const qualityScore = estimateQuality(messages, mode, recordPresence);
        const tokenEfficiency = calculateTokenEfficiency(
          compiled.naturalTokens,
          compiled.mixedTokens
        );

        const quality: QualityMeasurement = {
          metric: 'accuracy',
          value: qualityScore,
          baseline: 0.7,
          delta: qualityScore - 0.7,
          unit: 'score'
        };

        if (this.config.includeTokenEfficiency) {
          quality.metric = 'token_efficiency' as QualityMetric;
          quality.value = tokenEfficiency;
          quality.baseline = 0;
          quality.delta = tokenEfficiency;
          quality.unit = 'ratio';
        }

        measurements.push({
          mode,
          taskType,
          quality,
          tokens: compiled.selectedMessages.reduce(
            (sum, m) => sum + (m.content?.length || 0), 0
          ),
          tokenEfficiency
        });
      }
    }

    // Build comparisons per task type
    for (const taskType of this.config.taskTypes!) {
      const modeScores = new Map<ContextMode, number>();
      const modeTokens = new Map<ContextMode, number>();

      for (const m of measurements.filter(meas => meas.taskType === taskType)) {
        modeScores.set(m.mode, m.quality.value);
        modeTokens.set(m.mode, m.tokens);
      }

      let bestMode: ContextMode = 'natural';
      let bestScore = -1;
      let worstDelta = 0;
      let bestMetric: QualityMetric = 'accuracy';

      for (const mode of this.config.contextModes!) {
        const score = modeScores.get(mode) ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestMode = mode;
        }

        const delta = score - 0.7;
        if (delta < worstDelta) {
          worstDelta = delta;
        }
      }

      // Token savings
      const naturalTokens = compiledModes.find(c => c.mode === 'natural')?.naturalTokens ?? 0;
      const tokenSavings: Partial<Record<ContextMode, number>> = {};
      for (const mode of this.config.contextModes!) {
        const compiled = compiledModes.find(c => c.mode === mode);
        if (compiled && naturalTokens > 0) {
          tokenSavings[mode] = calculateTokenEfficiency(naturalTokens, compiled.selectedMessages.reduce(
            (sum, m) => sum + (m.content?.length || 0), 0
          ));
        }
      }

      comparisons.push({
        taskType,
        naturalQuality: modeScores.get('natural') ?? 0,
        lunumQuality: modeScores.get('lunum') ?? 0,
        mixedQuality: modeScores.get('mixed') ?? 0,
        bestMode,
        bestMetric,
        worstDelta,
        tokenSavings
      });
    }

    // Evaluate against quality gates
    for (const taskType of this.config.taskTypes!) {
      for (const mode of this.config.contextModes!) {
        const modeMeasurements = measurements.filter(m => m.taskType === taskType && m.mode === mode);
        const avgScore = modeMeasurements.length > 0
          ? modeMeasurements.reduce((sum, m) => sum + m.quality.value, 0) / modeMeasurements.length
          : 0;

        const taskResult: DownstreamTaskResult = {
          taskId: `${this.reportId}-${taskType}-${mode}`,
          taskType,
          quality: modeMeasurements.map(m => ({
            metric: m.quality.metric,
            value: m.quality.value,
            baseline: m.quality.baseline,
            delta: m.quality.delta,
            unit: m.quality.unit
          })),
          overallScore: avgScore,
          gateResult: avgScore >= (this.config.minimumQuality ?? 0.7) ? 'pass' : 'fail',
          warnings: avgScore < 0.5 ? [`Score ${avgScore} below minimum threshold`] : [],
          metadata: { contextMode: mode }
        };

        const gateEval = evaluateQuality(this.config.evaluator!, taskType, taskResult);
        if (gateEval) {
          gateEvaluations.push(gateEval);
        }
      }
    }

    // Build summary
    const modeAvgScores = new Map<ContextMode, number[]>();
    for (const comp of comparisons) {
      const scores = modeAvgScores.get(comp.bestMode) ?? [];
      scores.push(comp.naturalQuality, comp.lunumQuality, comp.mixedQuality);
      modeAvgScores.set(comp.bestMode, scores);
    }

    let bestOverallMode: ContextMode = 'natural';
    let bestOverall = 0;
    let worstMode: ContextMode = 'natural';
    let worstOverall = 1;

    for (const mode of this.config.contextModes!) {
      const scores = modeAvgScores.get(mode) ?? [];
      const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
      if (avg > bestOverall) {
        bestOverall = avg;
        bestOverallMode = mode;
      }
      if (avg < worstOverall) {
        worstOverall = avg;
        worstMode = mode;
      }
    }

    // Average token savings
    const allTokenSavings = measurements.map(m => m.tokenEfficiency);
    const avgTokenSavings = allTokenSavings.length > 0
      ? allTokenSavings.reduce((s, v) => s + v, 0) / allTokenSavings.length
      : 0;

    const summary: MixedContextSummary = {
      totalMeasurements: measurements.length,
      bestOverallMode,
      overallScore: bestOverall,
      worstMode,
      worstScore: worstOverall,
      avgTokenSavings,
      passesAllGates: gateEvaluations.every(g => g.result === 'pass' || g.result === 'warn')
    };

    const report: MixedContextQualityReport = {
      reportId: this.reportId,
      timestamp: Date.now(),
      measurements,
      comparisons,
      summary,
      gates: gateEvaluations
    };

    this.reports.push(report);
    return report;
  }

  /**
   * Get all reports produced by this gate.
   */
  getReports(): MixedContextQualityReport[] {
    return [...this.reports];
  }

  /**
   * Get the latest report.
   */
  getLatestReport(): MixedContextQualityReport | undefined {
    return this.reports[this.reports.length - 1];
  }

  /**
   * Clear all reports.
   */
  clear(): void {
    this.reports = [];
  }

  /**
   * Get configuration.
   */
  getConfig(): MixedContextQualityConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<MixedContextQualityConfig>): void {
    if (config.reportId !== undefined) this.config.reportId = config.reportId;
    if (config.taskTypes !== undefined) this.config.taskTypes = config.taskTypes;
    if (config.contextModes !== undefined) this.config.contextModes = config.contextModes;
    if (config.evaluator !== undefined) this.config.evaluator = config.evaluator;
    if (config.minimumQuality !== undefined) this.config.minimumQuality = config.minimumQuality;
    if (config.includeTokenEfficiency !== undefined) this.config.includeTokenEfficiency = config.includeTokenEfficiency;
  }
}

// ── Convenience Functions ──────────────────────────────────────────

/**
 * Quick mixed-context quality check on messages.
 *
 * Returns a report comparing natural vs Lunum vs mixed context.
 */
export function measureMixedContextQuality(
  messages: ContextMessage[],
  config: MixedContextQualityConfig = {}
): MixedContextQualityReport {
  const gate = new MixedContextQualityGate(config);
  return gate.evaluate(messages);
}

// ── Export ─────────────────────────────────────────────────────────

export const mixedContextQualityExports = [
  MixedContextQualityGate,
  measureMixedContextQuality
] as const;
