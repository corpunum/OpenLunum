/**
 * Pilot Success Criteria & Rollback Triggers (R16.1 + R16.2)
 *
 * Defines strict thresholds for multilingual preference/constraint memory pilot.
 * Provides evaluation function to assess pilot health and trigger rollbacks.
 */

export const PILOT_SUCCESS_VERSION = '1.0.0' as const;

/**
 * Success criteria thresholds for pilot evaluation.
 * All thresholds must be met for pilot to pass a health check.
 */
export interface SuccessCriteria {
  /** Retention rate threshold (percent): stored_retrieved / total_stored >= threshold */
  retentionThresholdPercent: number;

  /** Fingerprint stability threshold (percent): how much drift is tolerable in 24h */
  fingerprintDriftThresholdPercent: number;

  /** Round-trip fidelity threshold (percent): canonical form must be exact */
  roundTripFidelityThresholdPercent: number;

  /** Latency p95 threshold (milliseconds): 95th percentile query time */
  latencyP95Ms: number;

  /** Multilingual consistency threshold (percent): same sem across languages */
  multilingualConsistencyPercent: number;

  /** Data corruption tolerance (count): max validation errors allowed */
  dataCorruptionTolerance: number;

  /** Test coverage threshold (percent): scenarios passing / total scenarios */
  testCoverageThresholdPercent: number;
}

/**
 * Default success criteria thresholds.
 * These are the baseline for production pilot evaluation.
 */
export const DEFAULT_SUCCESS_CRITERIA: SuccessCriteria = {
  retentionThresholdPercent: 98.0,
  fingerprintDriftThresholdPercent: 0.1,
  roundTripFidelityThresholdPercent: 99.0,
  latencyP95Ms: 50,
  multilingualConsistencyPercent: 99.0,
  dataCorruptionTolerance: 0,
  testCoverageThresholdPercent: 85.0,
};

/**
 * Rollback trigger condition with ID and description.
 */
export interface RollbackTrigger {
  id: string;
  name: string;
  severity: 'hard-stop' | 'soft-warning';
  description: string;
  condition: (metrics: PilotMetrics) => boolean;
  actionRequired: string;
  timelineMinutes: number;
}

/**
 * Pilot metrics snapshot from a single evaluation point.
 */
export interface PilotMetrics {
  timestamp: string;
  phase: 'setup' | 'shadow' | 'partial' | 'full';
  durationHours: number;

  // Functional metrics
  retentionRatePercent: number;
  fingerprintStabilityPercent: number;
  roundTripFidelityPercent: number;
  multilingualConsistencyPercent: number;
  latencyP95Ms: number;
  validationErrors: number;

  // Metadata
  scenariosRun: number;
  scenariosPassed: number;
  languagesTested: string[];
  testCorpusSize: number;
}

/**
 * Result of evaluating pilot health against success criteria.
 */
export interface PilotHealthEvaluation {
  status: 'PASS' | 'WARN' | 'FAIL';
  passedCriteria: string[];
  failedCriteria: string[];
  triggeredRollbacks: RollbackTrigger[];
  reasons: string[];
  timestamp: string;
}

/**
 * Evaluate pilot metrics against success criteria.
 * Returns PASS/WARN/FAIL status with detailed reasons.
 *
 * @param metrics Current pilot metrics snapshot
 * @param criteria Success criteria thresholds (defaults to DEFAULT_SUCCESS_CRITERIA)
 * @returns Health evaluation with status, passed/failed criteria, and triggered rollbacks
 */
export function evaluatePilotHealth(
  metrics: PilotMetrics,
  criteria: SuccessCriteria = DEFAULT_SUCCESS_CRITERIA,
): PilotHealthEvaluation {
  const timestamp = new Date().toISOString();
  const passedCriteria: string[] = [];
  const failedCriteria: string[] = [];
  const reasons: string[] = [];
  const triggeredRollbacks: RollbackTrigger[] = [];

  // Check retention rate
  const retentionPass = metrics.retentionRatePercent >= criteria.retentionThresholdPercent;
  if (retentionPass) {
    passedCriteria.push(`Retention rate: ${metrics.retentionRatePercent.toFixed(2)}%`);
  } else {
    failedCriteria.push(`Retention rate: ${metrics.retentionRatePercent.toFixed(2)}% < ${criteria.retentionThresholdPercent}%`);
    reasons.push('Retention below threshold — stored records may not be retrievable');
  }

  // Check fingerprint stability
  const fingerprintPass = metrics.fingerprintStabilityPercent >= (100 - criteria.fingerprintDriftThresholdPercent);
  if (fingerprintPass) {
    passedCriteria.push(`Fingerprint stability: ${metrics.fingerprintStabilityPercent.toFixed(3)}%`);
  } else {
    failedCriteria.push(
      `Fingerprint drift: ${(100 - metrics.fingerprintStabilityPercent).toFixed(3)}% > ${criteria.fingerprintDriftThresholdPercent}%`,
    );
    reasons.push('Fingerprint hash unstable — deduplication may fail');
  }

  // Check round-trip fidelity
  const roundTripPass = metrics.roundTripFidelityPercent >= criteria.roundTripFidelityThresholdPercent;
  if (roundTripPass) {
    passedCriteria.push(`Round-trip fidelity: ${metrics.roundTripFidelityPercent.toFixed(2)}%`);
  } else {
    failedCriteria.push(
      `Round-trip fidelity: ${metrics.roundTripFidelityPercent.toFixed(2)}% < ${criteria.roundTripFidelityThresholdPercent}%`,
    );
    reasons.push('Canonicalization pipeline may lose semantic information');
  }

  // Check latency
  const latencyPass = metrics.latencyP95Ms <= criteria.latencyP95Ms;
  if (latencyPass) {
    passedCriteria.push(`Latency P95: ${metrics.latencyP95Ms}ms`);
  } else {
    failedCriteria.push(`Latency P95: ${metrics.latencyP95Ms}ms > ${criteria.latencyP95Ms}ms`);
    reasons.push('Query latency too high — user experience degradation');
  }

  // Check multilingual consistency
  const multilingualPass = metrics.multilingualConsistencyPercent >= criteria.multilingualConsistencyPercent;
  if (multilingualPass) {
    passedCriteria.push(`Multilingual consistency: ${metrics.multilingualConsistencyPercent.toFixed(2)}%`);
  } else {
    failedCriteria.push(
      `Multilingual consistency: ${metrics.multilingualConsistencyPercent.toFixed(2)}% < ${criteria.multilingualConsistencyPercent}%`,
    );
    reasons.push('Cross-language fingerprint equivalence not maintained');
  }

  // Check data corruption
  const noCorruptionPass = metrics.validationErrors <= criteria.dataCorruptionTolerance;
  if (noCorruptionPass) {
    passedCriteria.push(`Data corruption: 0 errors`);
  } else {
    failedCriteria.push(`Data corruption: ${metrics.validationErrors} errors > ${criteria.dataCorruptionTolerance}`);
    reasons.push('Data integrity compromised — immediate rollback required');
  }

  // Check test coverage
  const coverage = metrics.scenariosRun > 0 ? (metrics.scenariosPassed / metrics.scenariosRun) * 100 : 0;
  const coveragePass = coverage >= criteria.testCoverageThresholdPercent;
  if (coveragePass) {
    passedCriteria.push(`Test coverage: ${coverage.toFixed(1)}%`);
  } else {
    failedCriteria.push(`Test coverage: ${coverage.toFixed(1)}% < ${criteria.testCoverageThresholdPercent}%`);
    reasons.push('Test suite not sufficiently passing');
  }

  // Check for rollback triggers
  // Only use soft warnings with default criteria; hard stops always apply
  const allTriggers = getAllRollbackTriggers(
    criteria === DEFAULT_SUCCESS_CRITERIA ? 'all' : 'hard-stops-only',
  );
  for (const trigger of allTriggers) {
    if (trigger.condition(metrics)) {
      triggeredRollbacks.push(trigger);
      if (trigger.severity === 'hard-stop') {
        reasons.push(`HARD STOP (${trigger.id}): ${trigger.actionRequired}`);
      } else {
        reasons.push(`WARNING (${trigger.id}): ${trigger.actionRequired}`);
      }
    }
  }

  // Determine overall status
  let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';

  // Hard stop: fail immediately
  const hardStops = triggeredRollbacks.filter(t => t.severity === 'hard-stop');
  if (hardStops.length > 0) {
    status = 'FAIL';
  }
  // Any failed criteria: fail
  else if (failedCriteria.length > 0) {
    status = 'FAIL';
  }
  // Soft warnings: warn
  else if (triggeredRollbacks.filter(t => t.severity === 'soft-warning').length > 0) {
    status = 'WARN';
  }

  return {
    status,
    passedCriteria,
    failedCriteria,
    triggeredRollbacks,
    reasons,
    timestamp,
  };
}

/**
 * Get all rollback triggers (hard stops and/or soft warnings).
 * @param mode 'all' for both hard-stops and soft warnings, 'hard-stops-only' for only hard stops
 */
function getAllRollbackTriggers(mode: 'all' | 'hard-stops-only' = 'all'): RollbackTrigger[] {
  const triggers: RollbackTrigger[] = [
    // Hard stops
    {
      id: 'R-1',
      name: 'Data Corruption',
      severity: 'hard-stop',
      description: 'Any validation error on stored records',
      condition: m => m.validationErrors > 0,
      actionRequired: 'Immediate rollback, investigate root cause',
      timelineMinutes: 5,
    },
    {
      id: 'R-2',
      name: 'Fingerprint Drift',
      severity: 'hard-stop',
      description: 'Fingerprint divergence > 0.5% in 24h',
      condition: m => (100 - m.fingerprintStabilityPercent) > 0.5,
      actionRequired: 'Rollback, audit canonicalization',
      timelineMinutes: 5,
    },
    {
      id: 'R-3',
      name: 'Retention Collapse',
      severity: 'hard-stop',
      description: 'Retention rate < 95%',
      condition: m => m.retentionRatePercent < 95,
      actionRequired: 'Rollback after 4h sustained, prevent data loss',
      timelineMinutes: 240,
    },
    {
      id: 'R-4',
      name: 'Latency Spike',
      severity: 'hard-stop',
      description: 'P95 latency > 100ms for > 1h',
      condition: m => m.latencyP95Ms > 100,
      actionRequired: 'Rollback, profile, re-optimize',
      timelineMinutes: 60,
    },
    {
      id: 'R-5',
      name: 'Validation Failure',
      severity: 'hard-stop',
      description: 'Invalid sems written to store',
      condition: m => m.validationErrors > 0,
      actionRequired: 'Rollback within 30 min',
      timelineMinutes: 30,
    },

    // Soft warnings
    {
      id: 'W-1',
      name: 'Retention Degradation',
      severity: 'soft-warning',
      description: 'Retention 98% → 97%',
      condition: m => m.retentionRatePercent >= 97 && m.retentionRatePercent < 98,
      actionRequired: 'Alert + debug logs',
      timelineMinutes: 120,
    },
    {
      id: 'W-2',
      name: 'Fingerprint Skew',
      severity: 'soft-warning',
      description: 'Fingerprint stability 0.1% → 0.3%',
      condition: m => {
        const drift = 100 - m.fingerprintStabilityPercent;
        return drift > 0.1 && drift <= 0.5;
      },
      actionRequired: 'Alert + re-measure',
      timelineMinutes: 240,
    },
    {
      id: 'W-3',
      name: 'Multilingual Inconsistency',
      severity: 'soft-warning',
      description: 'Multilingual consistency 99% → 97%',
      condition: m => m.multilingualConsistencyPercent >= 97 && m.multilingualConsistencyPercent < 99,
      actionRequired: 'Alert on language pair',
      timelineMinutes: 120,
    },
    {
      id: 'W-4',
      name: 'Latency Creep',
      severity: 'soft-warning',
      description: 'Latency 40ms → 45ms p95',
      condition: m => m.latencyP95Ms > 40 && m.latencyP95Ms <= 100,
      actionRequired: 'Alert + profile',
      timelineMinutes: 240,
    },
  ];

  if (mode === 'hard-stops-only') {
    return triggers.filter(t => t.severity === 'hard-stop');
  }

  return triggers;
}

/**
 * Format a pilot health evaluation as a readable report string.
 */
export function formatPilotHealthReport(evaluation: PilotHealthEvaluation): string {
  const lines: string[] = [];
  lines.push(`Pilot Health Report [${evaluation.timestamp}]`);
  lines.push(`Status: ${evaluation.status}`);
  lines.push('');

  if (evaluation.passedCriteria.length > 0) {
    lines.push('Passed Criteria:');
    evaluation.passedCriteria.forEach(c => lines.push(`  ✓ ${c}`));
    lines.push('');
  }

  if (evaluation.failedCriteria.length > 0) {
    lines.push('Failed Criteria:');
    evaluation.failedCriteria.forEach(c => lines.push(`  ✗ ${c}`));
    lines.push('');
  }

  if (evaluation.triggeredRollbacks.length > 0) {
    lines.push('Triggered Rollbacks:');
    evaluation.triggeredRollbacks.forEach(r => {
      const icon = r.severity === 'hard-stop' ? '🛑' : '⚠️';
      lines.push(`  ${icon} ${r.id} (${r.name}): ${r.actionRequired} [${r.timelineMinutes}min]`);
    });
    lines.push('');
  }

  if (evaluation.reasons.length > 0) {
    lines.push('Reasons:');
    evaluation.reasons.forEach(r => lines.push(`  • ${r}`));
  }

  return lines.join('\n');
}

/**
 * Check if pilot should proceed or rollback based on evaluation status.
 * FAIL status always requires rollback.
 * WARN status requires manual review but can proceed with caution.
 * PASS status allows continuation.
 */
export function shouldRollback(evaluation: PilotHealthEvaluation): boolean {
  // Any hard-stop rollback trigger → immediate rollback
  if (evaluation.triggeredRollbacks.some(r => r.severity === 'hard-stop')) {
    return true;
  }

  // FAIL status → rollback
  if (evaluation.status === 'FAIL') {
    return true;
  }

  return false;
}

/**
 * Check if pilot can proceed safely (passes all criteria).
 */
export function canProceedSafely(evaluation: PilotHealthEvaluation): boolean {
  return evaluation.status === 'PASS' && evaluation.failedCriteria.length === 0;
}
