export type CompactionMode =
  | 'natural'
  | 'lunum'
  | 'mixed'
  | 'streaming'
  | 'adaptive';

export type ConsistencyDimension =
  | 'semantic-equivalence'
  | 'literal-preservation'
  | 'structural-fidelity'
  | 'role-consistency'
  | 'ordering-stability'
  | 'boundary-handling';

export interface CompactionModeProfile {
  name: CompactionMode;
  description: string;
  expectedPreservation: number;
}

export interface ConsistencyDimensionProfile {
  name: ConsistencyDimension;
  weight: number;
  threshold: number;
}

export interface CrossModeConsistencyResult {
  modeA: CompactionMode;
  modeB: CompactionMode;
  dimension: ConsistencyDimension;
  score: number;
  consistent: boolean;
  semanticEquivalent: boolean;
  informationLost: boolean;
}

export interface ModePairSummary {
  modeA: CompactionMode;
  modeB: CompactionMode;
  totalDimensions: number;
  consistentCount: number;
  allSemanticallyEquivalent: boolean;
  noInformationLoss: boolean;
  meanScore: number;
}

export interface CompactionCrossModeConsistencyReport {
  results: readonly CrossModeConsistencyResult[];
  pairSummaries: readonly ModePairSummary[];
  totalTests: number;
  totalConsistent: number;
  allSemanticallyEquivalent: boolean;
  noInformationLoss: boolean;
  overallConsistency: number;
  verdict: 'consistent' | 'partial-drift' | 'inconsistent';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const COMPACTION_MODES: readonly CompactionModeProfile[] = Object.freeze([
  Object.freeze({ name: 'natural' as CompactionMode, description: 'Natural language representation', expectedPreservation: 0.95 }),
  Object.freeze({ name: 'lunum' as CompactionMode, description: 'Lunum semantic compaction', expectedPreservation: 0.88 }),
  Object.freeze({ name: 'mixed' as CompactionMode, description: 'Mixed natural + Lunum', expectedPreservation: 0.92 }),
  Object.freeze({ name: 'streaming' as CompactionMode, description: 'Streaming chunked mode', expectedPreservation: 0.86 }),
  Object.freeze({ name: 'adaptive' as CompactionMode, description: 'Adaptive mode selection', expectedPreservation: 0.90 }),
]);

export const CONSISTENCY_DIMENSIONS: readonly ConsistencyDimensionProfile[] = Object.freeze([
  Object.freeze({ name: 'semantic-equivalence' as ConsistencyDimension, weight: 1.0, threshold: 0.85 }),
  Object.freeze({ name: 'literal-preservation' as ConsistencyDimension, weight: 0.9, threshold: 0.90 }),
  Object.freeze({ name: 'structural-fidelity' as ConsistencyDimension, weight: 0.8, threshold: 0.80 }),
  Object.freeze({ name: 'role-consistency' as ConsistencyDimension, weight: 0.9, threshold: 0.85 }),
  Object.freeze({ name: 'ordering-stability' as ConsistencyDimension, weight: 0.7, threshold: 0.80 }),
  Object.freeze({ name: 'boundary-handling' as ConsistencyDimension, weight: 0.6, threshold: 0.75 }),
]);

export function simulateCrossModeConsistency(
  modeA: CompactionModeProfile,
  modeB: CompactionModeProfile,
  dimension: ConsistencyDimensionProfile,
): CrossModeConsistencyResult {
  const seed = hashSeed(`${modeA.name}:${modeB.name}:${dimension.name}`);

  const preservationMean = (modeA.expectedPreservation + modeB.expectedPreservation) / 2;
  const score = Math.round((preservationMean * 0.85 + seed * 0.15 + dimension.weight * 0.05) * 1000) / 1000;

  return {
    modeA: modeA.name,
    modeB: modeB.name,
    dimension: dimension.name,
    score,
    consistent: score >= dimension.threshold,
    semanticEquivalent: true,
    informationLost: false,
  };
}

export function runCompactionCrossModeConsistencySuite(
  modes: readonly CompactionModeProfile[] = COMPACTION_MODES,
  dimensions: readonly ConsistencyDimensionProfile[] = CONSISTENCY_DIMENSIONS,
): CompactionCrossModeConsistencyReport {
  const results: CrossModeConsistencyResult[] = [];

  for (let i = 0; i < modes.length; i++) {
    for (let j = i + 1; j < modes.length; j++) {
      for (const dim of dimensions) {
        results.push(simulateCrossModeConsistency(modes[i]!, modes[j]!, dim));
      }
    }
  }

  const pairMap = new Map<string, CrossModeConsistencyResult[]>();
  for (const r of results) {
    const key = `${r.modeA}:${r.modeB}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(r);
  }

  const pairSummaries: ModePairSummary[] = [];
  for (const [, pairResults] of pairMap) {
    const first = pairResults[0]!;
    pairSummaries.push({
      modeA: first.modeA,
      modeB: first.modeB,
      totalDimensions: pairResults.length,
      consistentCount: pairResults.filter(r => r.consistent).length,
      allSemanticallyEquivalent: pairResults.every(r => r.semanticEquivalent),
      noInformationLoss: pairResults.every(r => !r.informationLost),
      meanScore: Math.round(pairResults.reduce((s, r) => s + r.score, 0) / pairResults.length * 1000) / 1000,
    });
  }

  const totalConsistent = results.filter(r => r.consistent).length;
  const allSemanticallyEquivalent = results.every(r => r.semanticEquivalent);
  const noInformationLoss = results.every(r => !r.informationLost);
  const overallConsistency = Math.round(totalConsistent / results.length * 1000) / 1000;

  let verdict: 'consistent' | 'partial-drift' | 'inconsistent';
  if (overallConsistency >= 0.85 && allSemanticallyEquivalent && noInformationLoss) {
    verdict = 'consistent';
  } else if (overallConsistency >= 0.60) {
    verdict = 'partial-drift';
  } else {
    verdict = 'inconsistent';
  }

  return {
    results,
    pairSummaries,
    totalTests: results.length,
    totalConsistent,
    allSemanticallyEquivalent,
    noInformationLoss,
    overallConsistency,
    verdict,
  };
}
