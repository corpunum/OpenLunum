import type { HardGatePolicy } from './hard-gates.js';

export interface CompactionGateThresholds {
  semanticPreservation: number;
  literalPreservation: number;
  rolePreservation: number;
  safetyInvariantPassRate: number;
}

export interface CompactionGateResult {
  gate: keyof CompactionGateThresholds;
  threshold: number;
  actual: number;
  passed: boolean;
}

export interface CompactionGateReport {
  results: CompactionGateResult[];
  allPassed: boolean;
  fallbackRequired: boolean;
  verdict: 'compact' | 'fallback-natural' | 'blocked';
}

export const DEFAULT_COMPACTION_THRESHOLDS: CompactionGateThresholds = {
  semanticPreservation: 0.85,
  literalPreservation: 0.90,
  rolePreservation: 0.95,
  safetyInvariantPassRate: 1.0,
};

export interface FallbackQualityInput {
  semanticPreservationScore: number;
  literalPreservationRate: number;
  rolePreservationRate: number;
  safetyInvariantPassRate: number;
}

function checkGate(
  gate: keyof CompactionGateThresholds,
  actual: number,
  threshold: number,
): CompactionGateResult {
  return { gate, threshold, actual, passed: actual >= threshold };
}

export function evaluateCompactionGates(
  input: FallbackQualityInput,
  thresholds: CompactionGateThresholds = DEFAULT_COMPACTION_THRESHOLDS,
): CompactionGateReport {
  const results: CompactionGateResult[] = [
    checkGate('semanticPreservation', input.semanticPreservationScore, thresholds.semanticPreservation),
    checkGate('literalPreservation', input.literalPreservationRate, thresholds.literalPreservation),
    checkGate('rolePreservation', input.rolePreservationRate, thresholds.rolePreservation),
    checkGate('safetyInvariantPassRate', input.safetyInvariantPassRate, thresholds.safetyInvariantPassRate),
  ];

  const allPassed = results.every((r) => r.passed);
  const safetyFailed = results.some((r) => r.gate === 'safetyInvariantPassRate' && !r.passed);

  let verdict: 'compact' | 'fallback-natural' | 'blocked';
  if (safetyFailed) {
    verdict = 'blocked';
  } else if (allPassed) {
    verdict = 'compact';
  } else {
    verdict = 'fallback-natural';
  }

  return { results, allPassed, fallbackRequired: !allPassed, verdict };
}

export function isCompactionSafe(
  input: FallbackQualityInput,
  thresholds?: CompactionGateThresholds,
): boolean {
  return evaluateCompactionGates(input, thresholds).allPassed;
}

export function compactionGatePolicyFromHardGates(
  hardPolicy: HardGatePolicy,
): CompactionGateThresholds {
  return {
    semanticPreservation: Math.min(hardPolicy.featureRecallThreshold, hardPolicy.featurePrecisionThreshold),
    literalPreservation: 0.90,
    rolePreservation: 0.95,
    safetyInvariantPassRate: 1.0,
  };
}
