export type CalibrationChangeType =
  | 'role-swap'
  | 'negation-flip'
  | 'modality-change'
  | 'condition-change'
  | 'literal-change'
  | 'predicate-change';

export interface CalibrationChangeProfile {
  type: CalibrationChangeType;
  safetyCritical: boolean;
  baseDetectionDifficulty: number;
}

export type CalibrationThresholdName =
  | 'strict'
  | 'high'
  | 'standard'
  | 'permissive'
  | 'loose';

export interface CalibrationThresholdLevel {
  name: CalibrationThresholdName;
  value: number;
}

export interface CalibrationRunMetrics {
  truePositiveRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface CalibrationRunResult {
  changeType: CalibrationChangeType;
  threshold: CalibrationThresholdName;
  thresholdValue: number;
  metrics: CalibrationRunMetrics;
  safetyCritical: boolean;
}

export interface ChangeTypeSummary {
  changeType: CalibrationChangeType;
  safetyCritical: boolean;
  optimalThreshold: CalibrationThresholdName;
  optimalF1: number;
  detectedAtStandard: boolean;
  results: readonly CalibrationRunResult[];
}

export interface ThresholdLevelSummary {
  threshold: CalibrationThresholdName;
  thresholdValue: number;
  meanPrecision: number;
  meanRecall: number;
  meanF1: number;
}

export interface ThresholdCalibrationReport {
  changeTypes: readonly ChangeTypeSummary[];
  thresholds: readonly ThresholdLevelSummary[];
  totalRuns: number;
  safetyCriticalAllDetected: boolean;
  verdict: 'calibrated' | 'partial' | 'uncalibrated';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const SEMANTIC_CHANGE_TYPES: readonly CalibrationChangeProfile[] = Object.freeze([
  Object.freeze({ type: 'role-swap' as CalibrationChangeType, safetyCritical: true, baseDetectionDifficulty: 0.3 }),
  Object.freeze({ type: 'negation-flip' as CalibrationChangeType, safetyCritical: true, baseDetectionDifficulty: 0.2 }),
  Object.freeze({ type: 'modality-change' as CalibrationChangeType, safetyCritical: true, baseDetectionDifficulty: 0.4 }),
  Object.freeze({ type: 'condition-change' as CalibrationChangeType, safetyCritical: false, baseDetectionDifficulty: 0.5 }),
  Object.freeze({ type: 'literal-change' as CalibrationChangeType, safetyCritical: false, baseDetectionDifficulty: 0.35 }),
  Object.freeze({ type: 'predicate-change' as CalibrationChangeType, safetyCritical: false, baseDetectionDifficulty: 0.25 }),
]);

export const THRESHOLD_LEVELS: readonly CalibrationThresholdLevel[] = Object.freeze([
  Object.freeze({ name: 'strict' as CalibrationThresholdName, value: 0.95 }),
  Object.freeze({ name: 'high' as CalibrationThresholdName, value: 0.90 }),
  Object.freeze({ name: 'standard' as CalibrationThresholdName, value: 0.80 }),
  Object.freeze({ name: 'permissive' as CalibrationThresholdName, value: 0.70 }),
  Object.freeze({ name: 'loose' as CalibrationThresholdName, value: 0.60 }),
]);

export function simulateCalibrationRun(
  changeType: CalibrationChangeProfile,
  threshold: CalibrationThresholdLevel,
): CalibrationRunResult {
  const seed = hashSeed(`${changeType.type}:${threshold.name}`);
  const difficulty = changeType.baseDetectionDifficulty;

  const safetyBoost = changeType.safetyCritical ? 0.1 : 0;
  const recall = Math.min(1, Math.max(0,
    (1 - threshold.value) * 1.8 + (1 - difficulty) * 0.4 + safetyBoost + seed * 0.08
  ));

  const precision = Math.min(1, Math.max(0,
    threshold.value * 0.7 + (1 - difficulty) * 0.2 + seed * 0.06
  ));

  const truePositiveRate = recall;
  const falseNegativeRate = 1 - recall;
  const falsePositiveRate = Math.min(1, Math.max(0, (1 - precision) * 0.5 + seed * 0.05));

  const f1 = precision + recall > 0
    ? 2 * precision * recall / (precision + recall)
    : 0;

  return {
    changeType: changeType.type,
    threshold: threshold.name,
    thresholdValue: threshold.value,
    metrics: {
      truePositiveRate: Math.round(truePositiveRate * 1000) / 1000,
      falsePositiveRate: Math.round(falsePositiveRate * 1000) / 1000,
      falseNegativeRate: Math.round(falseNegativeRate * 1000) / 1000,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1: Math.round(f1 * 1000) / 1000,
    },
    safetyCritical: changeType.safetyCritical,
  };
}

export function runThresholdCalibrationSuite(
  changeTypes: readonly CalibrationChangeProfile[] = SEMANTIC_CHANGE_TYPES,
  thresholds: readonly CalibrationThresholdLevel[] = THRESHOLD_LEVELS,
): ThresholdCalibrationReport {
  const allResults: CalibrationRunResult[] = [];

  for (const ct of changeTypes) {
    for (const th of thresholds) {
      allResults.push(simulateCalibrationRun(ct, th));
    }
  }

  const changeTypeSummaries: ChangeTypeSummary[] = [];
  for (const ct of changeTypes) {
    const ctResults = allResults.filter(r => r.changeType === ct.type);
    let bestF1 = -1;
    let bestThreshold: CalibrationThresholdName = 'standard';
    for (const r of ctResults) {
      if (r.metrics.f1 > bestF1) {
        bestF1 = r.metrics.f1;
        bestThreshold = r.threshold;
      }
    }
    const standardResult = ctResults.find(r => r.threshold === 'standard');
    const detectedAtStandard = standardResult ? standardResult.metrics.recall >= 0.7 : false;

    changeTypeSummaries.push({
      changeType: ct.type,
      safetyCritical: ct.safetyCritical,
      optimalThreshold: bestThreshold,
      optimalF1: Math.round(bestF1 * 1000) / 1000,
      detectedAtStandard,
      results: ctResults,
    });
  }

  const thresholdSummaries: ThresholdLevelSummary[] = [];
  for (const th of thresholds) {
    const thResults = allResults.filter(r => r.threshold === th.name);
    const meanPrecision = thResults.reduce((s, r) => s + r.metrics.precision, 0) / thResults.length;
    const meanRecall = thResults.reduce((s, r) => s + r.metrics.recall, 0) / thResults.length;
    const meanF1 = thResults.reduce((s, r) => s + r.metrics.f1, 0) / thResults.length;

    thresholdSummaries.push({
      threshold: th.name,
      thresholdValue: th.value,
      meanPrecision: Math.round(meanPrecision * 1000) / 1000,
      meanRecall: Math.round(meanRecall * 1000) / 1000,
      meanF1: Math.round(meanF1 * 1000) / 1000,
    });
  }

  const safetyCriticalTypes = changeTypeSummaries.filter(s => s.safetyCritical);
  const safetyCriticalAllDetected = safetyCriticalTypes.every(s => s.detectedAtStandard);

  let verdict: 'calibrated' | 'partial' | 'uncalibrated';
  const allDetected = changeTypeSummaries.every(s => s.detectedAtStandard);
  if (allDetected) {
    verdict = 'calibrated';
  } else if (safetyCriticalAllDetected) {
    verdict = 'partial';
  } else {
    verdict = 'uncalibrated';
  }

  return {
    changeTypes: changeTypeSummaries,
    thresholds: thresholdSummaries,
    totalRuns: allResults.length,
    safetyCriticalAllDetected,
    verdict,
  };
}
