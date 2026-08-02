/**
 * Compaction quality gate validation runner (R7.10).
 *
 * Validates context-compaction quality gates across context modes
 * (natural / lunum / mixed) using deterministic, seeded simulated
 * scores (no Math.random). Produces per-gate pass/fail verdicts with
 * margin-to-threshold, per-mode summaries, and an overall compaction
 * readiness verdict.
 */

// ── Types ──────────────────────────────────────────────────────────

export type CompactionGateId =
  | 'minimum-compression'
  | 'preservation-floor'
  | 'latency-budget'
  | 'cost-efficiency'
  | 'regression-guard';

export type GateThresholdDirection = 'gte' | 'lte';

export interface CompactionQualityGate {
  id: CompactionGateId;
  description: string;
  threshold: number;
  direction: GateThresholdDirection;
}

export type GateContextMode = 'natural' | 'lunum' | 'mixed';

export interface ContextModeDescriptor {
  mode: GateContextMode;
  description: string;
  compactionApplied: boolean;
}

export interface GateEvaluationResult {
  gateId: CompactionGateId;
  mode: GateContextMode;
  score: number;
  threshold: number;
  direction: GateThresholdDirection;
  passed: boolean;
  margin: number;
}

export interface ModeGateSummary {
  mode: GateContextMode;
  totalGates: number;
  passedGates: number;
  failedGates: number;
  failingGateIds: readonly CompactionGateId[];
  allPassed: boolean;
}

export type CompactionReadinessVerdict = 'ready' | 'partial' | 'not-ready';

export interface CompactionGateValidationReport {
  timestamp: string;
  gates: readonly CompactionQualityGate[];
  modes: readonly GateContextMode[];
  results: readonly GateEvaluationResult[];
  modeSummaries: readonly ModeGateSummary[];
  totalEvaluations: number;
  totalPassed: number;
  totalFailed: number;
  verdict: CompactionReadinessVerdict;
}

// ── Constants ──────────────────────────────────────────────────────

export const COMPACTION_QUALITY_GATES: readonly CompactionQualityGate[] = Object.freeze([
  Object.freeze({
    id: 'minimum-compression' as CompactionGateId,
    description: 'Compaction must achieve at least 30% token savings vs. natural mode.',
    threshold: 0.30,
    direction: 'gte' as GateThresholdDirection,
  }),
  Object.freeze({
    id: 'preservation-floor' as CompactionGateId,
    description: 'Semantic preservation must remain at or above 90%.',
    threshold: 0.90,
    direction: 'gte' as GateThresholdDirection,
  }),
  Object.freeze({
    id: 'latency-budget' as CompactionGateId,
    description: 'Latency must not exceed 2x the natural-mode baseline.',
    threshold: 2.0,
    direction: 'lte' as GateThresholdDirection,
  }),
  Object.freeze({
    id: 'cost-efficiency' as CompactionGateId,
    description: 'Cost-per-quality ratio must not exceed 1.0 (parity with natural mode).',
    threshold: 1.0,
    direction: 'lte' as GateThresholdDirection,
  }),
  Object.freeze({
    id: 'regression-guard' as CompactionGateId,
    description: 'Score must be no worse than the previous baseline (0.0 regression tolerance).',
    threshold: 0.0,
    direction: 'gte' as GateThresholdDirection,
  }),
]);

export const CONTEXT_MODES: readonly ContextModeDescriptor[] = Object.freeze([
  Object.freeze({
    mode: 'natural' as GateContextMode,
    description: 'Uncompacted natural-language context; serves as the baseline.',
    compactionApplied: false,
  }),
  Object.freeze({
    mode: 'lunum' as GateContextMode,
    description: 'Fully compacted Lunum-encoded context.',
    compactionApplied: true,
  }),
  Object.freeze({
    mode: 'mixed' as GateContextMode,
    description: 'Partial compaction: Lunum encoding blended with natural-language spans.',
    compactionApplied: true,
  }),
]);

// ── Deterministic scoring ─────────────────────────────────────────

/**
 * Deterministic string hash (djb2 variant), used to seed simulated
 * scores from (mode, gateId) so results are stable across runs
 * without relying on Math.random.
 */
function seedFromKey(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Map a hash seed to a small deterministic jitter in [0, spread).
 */
function jitterFromSeed(seed: number, spread: number): number {
  return (seed % 1000) / 1000 * spread;
}

/**
 * Simulate a gate score for a given mode. Scores are deterministic:
 * derived from the mode's compaction characteristics plus a bounded,
 * seeded jitter for realism. Natural mode never shows compression
 * benefit since no compaction is applied.
 */
function simulateGateScore(gate: CompactionQualityGate, mode: GateContextMode): number {
  const descriptor = CONTEXT_MODES.find(m => m.mode === mode);
  const compactionApplied = descriptor?.compactionApplied ?? false;
  const seed = seedFromKey(`${mode}:${gate.id}`);
  const jitter = jitterFromSeed(seed, 0.04) - 0.02; // +/- 2%

  switch (gate.id) {
    case 'minimum-compression': {
      if (!compactionApplied) {
        // Natural mode has no compression benefit by definition.
        return 0;
      }
      const base = mode === 'lunum' ? 0.52 : 0.38; // lunum compacts harder than mixed
      return Math.max(0, base + jitter);
    }
    case 'preservation-floor': {
      const base = mode === 'natural' ? 1.0 : mode === 'mixed' ? 0.965 : 0.945;
      return Math.min(1, Math.max(0, base + jitter));
    }
    case 'latency-budget': {
      // Ratio vs. natural-mode baseline latency; natural is always 1.0x.
      const base = mode === 'natural' ? 1.0 : mode === 'mixed' ? 1.35 : 1.55;
      return Math.max(0, base + jitter);
    }
    case 'cost-efficiency': {
      // Cost-per-quality ratio vs. natural-mode baseline (1.0 = parity).
      const base = mode === 'natural' ? 1.0 : mode === 'mixed' ? 0.82 : 0.68;
      return Math.max(0, base + jitter);
    }
    case 'regression-guard': {
      // Delta vs. previous baseline; >= 0 means no regression.
      const base = mode === 'natural' ? 0.01 : mode === 'mixed' ? 0.015 : 0.02;
      return base + jitter;
    }
  }
}

// ── Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a single quality gate for a single context mode, producing
 * a deterministic pass/fail verdict with margin-to-threshold.
 *
 * Margin is signed: positive means passing with room to spare,
 * negative means failing by that amount (in threshold units).
 */
export function evaluateGate(
  gate: CompactionQualityGate,
  mode: GateContextMode,
): GateEvaluationResult {
  const score = simulateGateScore(gate, mode);
  const passed = gate.direction === 'gte' ? score >= gate.threshold : score <= gate.threshold;
  const margin = gate.direction === 'gte' ? score - gate.threshold : gate.threshold - score;

  return {
    gateId: gate.id,
    mode,
    score,
    threshold: gate.threshold,
    direction: gate.direction,
    passed,
    margin,
  };
}

function summarizeMode(
  mode: GateContextMode,
  results: readonly GateEvaluationResult[],
): ModeGateSummary {
  const modeResults = results.filter(r => r.mode === mode);
  const passedGates = modeResults.filter(r => r.passed).length;
  const failedGates = modeResults.length - passedGates;
  const failingGateIds = modeResults.filter(r => !r.passed).map(r => r.gateId);

  return {
    mode,
    totalGates: modeResults.length,
    passedGates,
    failedGates,
    failingGateIds,
    allPassed: failedGates === 0,
  };
}

/**
 * Run the full compaction quality gate validation matrix: every gate
 * evaluated against every context mode. Produces per-gate results,
 * per-mode summaries, and an overall readiness verdict.
 *
 * Verdict rules:
 * - 'ready': every compaction-applying mode (lunum, mixed) passes all gates.
 * - 'not-ready': every compaction-applying mode fails at least one gate.
 * - 'partial': a mix of the above.
 */
export function runCompactionGateValidation(
  gates: readonly CompactionQualityGate[] = COMPACTION_QUALITY_GATES,
  modes: readonly ContextModeDescriptor[] = CONTEXT_MODES,
): CompactionGateValidationReport {
  const modeIds = modes.map(m => m.mode);

  const results: GateEvaluationResult[] = [];
  for (const mode of modeIds) {
    for (const gate of gates) {
      results.push(evaluateGate(gate, mode));
    }
  }

  const modeSummaries = modeIds.map(mode => summarizeMode(mode, results));

  const totalEvaluations = results.length;
  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = totalEvaluations - totalPassed;

  const compactionSummaries = modeSummaries.filter(s => {
    const descriptor = modes.find(m => m.mode === s.mode);
    return descriptor?.compactionApplied ?? false;
  });

  let verdict: CompactionReadinessVerdict;
  if (compactionSummaries.length === 0) {
    verdict = 'not-ready';
  } else if (compactionSummaries.every(s => s.allPassed)) {
    verdict = 'ready';
  } else if (compactionSummaries.every(s => !s.allPassed)) {
    verdict = 'not-ready';
  } else {
    verdict = 'partial';
  }

  return {
    timestamp: new Date().toISOString(),
    gates,
    modes: modeIds,
    results,
    modeSummaries,
    totalEvaluations,
    totalPassed,
    totalFailed,
    verdict,
  };
}
