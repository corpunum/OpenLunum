/**
 * Downstream Quality Gates for Lunum.
 *
 * Task-success metrics and quality gates that verify downstream task quality
 * is preserved when using Lunum context vs raw text.
 */

export type TaskType = 'qa' | 'summarization' | 'extraction' | 'classification' | 'generation' | 'reasoning' | 'other';
export type QualityMetric = 'accuracy' | 'recall' | 'precision' | 'f1' | 'semantic_similarity' | 'token_efficiency';
export type GateResult = 'pass' | 'warn' | 'fail';

/** A quality metric measurement. */
export interface QualityMeasurement {
  metric: QualityMetric;
  value: number;
  baseline: number;
  delta: number;
  unit: string;
}

/** A downstream task evaluation result. */
export interface DownstreamTaskResult {
  taskId: string;
  taskType: TaskType;
  quality: QualityMeasurement[];
  overallScore: number;
  gateResult: GateResult;
  warnings: string[];
  metadata?: Record<string, unknown>;
}

/** A quality gate configuration. */
export interface QualityGate {
  name: string;
  taskType: TaskType;
  minimumScore: number;
  minimumMetrics: Partial<Record<QualityMetric, number>>;
  warnThreshold: number;
  failThreshold: number;
}

/** A quality gate evaluation result. */
export interface GateEvaluation {
  gateName: string;
  result: GateResult;
  score: number;
  minimumScore: number;
  delta: number;
  metrics: Record<QualityMetric, QualityMeasurement | undefined>;
  warnings: string[];
}

/** Quality gate evaluator. */
export interface QualityEvaluator {
  gates: QualityGate[];
  results: DownstreamTaskResult[];
}

/** Evaluate a task result against quality gates. */
export function evaluateQuality(
  evaluator: QualityEvaluator,
  taskType: TaskType,
  result: DownstreamTaskResult
): GateEvaluation | null {
  const gate = evaluator.gates.find(g => g.taskType === taskType);
  if (!gate) return null;

  const metrics: Record<QualityMetric, QualityMeasurement | undefined> = {
    accuracy: undefined,
    recall: undefined,
    precision: undefined,
    f1: undefined,
    semantic_similarity: undefined,
    token_efficiency: undefined
  };

  for (const m of result.quality) {
    if (m.metric in metrics) {
      metrics[m.metric as QualityMetric] = m;
    }
  }

  let warnings: string[] = [];
  let gateResult: GateResult = 'pass';
  const delta = result.overallScore - gate.minimumScore;

  if (result.overallScore < gate.failThreshold) {
    gateResult = 'fail';
    warnings.push(`Score ${result.overallScore} below fail threshold ${gate.failThreshold}`);
  } else if (result.overallScore < gate.warnThreshold) {
    gateResult = 'warn';
    warnings.push(`Score ${result.overallScore} below warn threshold ${gate.warnThreshold}`);
  }

  // Check individual metric thresholds
  for (const [metric, minScore] of Object.entries(gate.minimumMetrics)) {
    const m = metrics[metric as QualityMetric];
    if (m && m.value < (minScore ?? 0)) {
      if (gateResult !== 'fail') gateResult = 'warn';
      warnings.push(`Metric ${metric} value ${m.value} below minimum ${minScore}`);
    }
  }

  return {
    gateName: gate.name,
    result: gateResult,
    score: result.overallScore,
    minimumScore: gate.minimumScore,
    delta,
    metrics,
    warnings
  };
}

/** Validate a quality gate. */
export function validateGate(gate: QualityGate): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!gate.name) errors.push('missing name');
  if (!gate.taskType) errors.push('missing taskType');
  if (gate.minimumScore === undefined || gate.minimumScore < 0 || gate.minimumScore > 1) {
    errors.push('minimumScore must be between 0 and 1');
  }
  if (gate.warnThreshold === undefined || gate.warnThreshold < 0 || gate.warnThreshold > 1) {
    errors.push('warnThreshold must be between 0 and 1');
  }
  if (gate.failThreshold === undefined || gate.failThreshold < 0 || gate.failThreshold > 1) {
    errors.push('failThreshold must be between 0 and 1');
  }
  if (gate.minimumScore > 0.5 && gate.warnThreshold < gate.minimumScore) {
    errors.push('warnThreshold should be >= minimumScore');
  }

  return { ok: errors.length === 0, errors };
}

/** Create a default evaluator. */
export function createDefaultEvaluator(): QualityEvaluator {
  return {
    gates: [
      {
        name: 'qa-gate',
        taskType: 'qa',
        minimumScore: 0.7,
        minimumMetrics: { accuracy: 0.7, semantic_similarity: 0.6 },
        warnThreshold: 0.8,
        failThreshold: 0.5
      },
      {
        name: 'extraction-gate',
        taskType: 'extraction',
        minimumScore: 0.8,
        minimumMetrics: { precision: 0.8, recall: 0.8, f1: 0.8 },
        warnThreshold: 0.9,
        failThreshold: 0.6
      },
      {
        name: 'classification-gate',
        taskType: 'classification',
        minimumScore: 0.75,
        minimumMetrics: { accuracy: 0.75, f1: 0.7 },
        warnThreshold: 0.85,
        failThreshold: 0.5
      }
    ],
    results: []
  };
}
