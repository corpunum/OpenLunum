export type AmbiguityType =
  | 'scope-ambiguity'
  | 'reference-ambiguity'
  | 'temporal-ambiguity'
  | 'role-ambiguity'
  | 'modality-ambiguity'
  | 'negation-scope'
  | 'quantifier-scope';

export type ResolutionStrategy =
  | 'conservative'
  | 'aggressive'
  | 'contextual'
  | 'reject';

export interface AmbiguityProfile {
  name: AmbiguityType;
  description: string;
  difficulty: number;
  safetyRelevant: boolean;
}

export interface ResolutionStrategyProfile {
  name: ResolutionStrategy;
  riskTolerance: number;
}

export interface AmbiguityResolutionResult {
  ambiguity: AmbiguityType;
  strategy: ResolutionStrategy;
  resolved: boolean;
  confidence: number;
  safeResolution: boolean;
  preservedMeaning: boolean;
}

export interface AmbiguityTypeSummary {
  ambiguity: AmbiguityType;
  totalStrategies: number;
  resolved: number;
  meanConfidence: number;
  allSafe: boolean;
  allPreserved: boolean;
}

export interface ParseAmbiguityResolutionReport {
  results: readonly AmbiguityResolutionResult[];
  ambiguitySummaries: readonly AmbiguityTypeSummary[];
  totalTests: number;
  resolutionRate: number;
  safetyRate: number;
  meaningPreservationRate: number;
  verdict: 'robust' | 'acceptable' | 'fragile';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const AMBIGUITY_PROFILES: readonly AmbiguityProfile[] = Object.freeze([
  Object.freeze({ name: 'scope-ambiguity' as AmbiguityType, description: 'Clause scope attachment unclear', difficulty: 0.7, safetyRelevant: true }),
  Object.freeze({ name: 'reference-ambiguity' as AmbiguityType, description: 'Pronoun or noun phrase reference unclear', difficulty: 0.6, safetyRelevant: false }),
  Object.freeze({ name: 'temporal-ambiguity' as AmbiguityType, description: 'Time reference or ordering unclear', difficulty: 0.5, safetyRelevant: false }),
  Object.freeze({ name: 'role-ambiguity' as AmbiguityType, description: 'Agent vs patient role assignment unclear', difficulty: 0.75, safetyRelevant: true }),
  Object.freeze({ name: 'modality-ambiguity' as AmbiguityType, description: 'Modal force (possibility vs necessity) unclear', difficulty: 0.65, safetyRelevant: true }),
  Object.freeze({ name: 'negation-scope' as AmbiguityType, description: 'Scope of negation across clauses unclear', difficulty: 0.8, safetyRelevant: true }),
  Object.freeze({ name: 'quantifier-scope' as AmbiguityType, description: 'Quantifier scope interaction unclear', difficulty: 0.7, safetyRelevant: false }),
]);

export const RESOLUTION_STRATEGIES: readonly ResolutionStrategyProfile[] = Object.freeze([
  Object.freeze({ name: 'conservative' as ResolutionStrategy, riskTolerance: 0.2 }),
  Object.freeze({ name: 'aggressive' as ResolutionStrategy, riskTolerance: 0.8 }),
  Object.freeze({ name: 'contextual' as ResolutionStrategy, riskTolerance: 0.5 }),
  Object.freeze({ name: 'reject' as ResolutionStrategy, riskTolerance: 0.0 }),
]);

export function simulateAmbiguityResolution(
  ambiguity: AmbiguityProfile,
  strategy: ResolutionStrategyProfile,
): AmbiguityResolutionResult {
  const seed = hashSeed(`${ambiguity.name}:${strategy.name}`);

  const resolutionChance = (1 - ambiguity.difficulty * 0.4) + strategy.riskTolerance * 0.3 + seed * 0.15;

  const resolved = strategy.name === 'reject'
    ? false
    : resolutionChance >= 0.65;

  const confidence = strategy.name === 'reject'
    ? 0
    : Math.round((resolutionChance * 0.8 + seed * 0.15) * 1000) / 1000;

  const safeResolution = strategy.name === 'reject'
    ? true
    : strategy.name === 'conservative'
      ? true
      : !ambiguity.safetyRelevant || confidence >= 0.7;

  const preservedMeaning = strategy.name === 'reject'
    ? true
    : resolved && confidence >= 0.5;

  return {
    ambiguity: ambiguity.name,
    strategy: strategy.name,
    resolved,
    confidence,
    safeResolution,
    preservedMeaning,
  };
}

export function runParseAmbiguityResolutionSuite(
  ambiguities: readonly AmbiguityProfile[] = AMBIGUITY_PROFILES,
  strategies: readonly ResolutionStrategyProfile[] = RESOLUTION_STRATEGIES,
): ParseAmbiguityResolutionReport {
  const results: AmbiguityResolutionResult[] = [];

  for (const ambiguity of ambiguities) {
    for (const strategy of strategies) {
      results.push(simulateAmbiguityResolution(ambiguity, strategy));
    }
  }

  const ambiguitySummaries: AmbiguityTypeSummary[] = [];
  for (const ambiguity of ambiguities) {
    const ar = results.filter(r => r.ambiguity === ambiguity.name);
    const resolved = ar.filter(r => r.resolved).length;
    const meanConfidence = Math.round(
      ar.reduce((s, r) => s + r.confidence, 0) / ar.length * 1000,
    ) / 1000;

    ambiguitySummaries.push({
      ambiguity: ambiguity.name,
      totalStrategies: ar.length,
      resolved,
      meanConfidence,
      allSafe: ar.every(r => r.safeResolution),
      allPreserved: ar.every(r => r.preservedMeaning),
    });
  }

  const totalResolved = results.filter(r => r.resolved).length;
  const resolutionRate = Math.round(totalResolved / results.length * 1000) / 1000;
  const safetyRate = Math.round(
    results.filter(r => r.safeResolution).length / results.length * 1000,
  ) / 1000;
  const meaningPreservationRate = Math.round(
    results.filter(r => r.preservedMeaning).length / results.length * 1000,
  ) / 1000;

  let verdict: 'robust' | 'acceptable' | 'fragile';
  if (resolutionRate >= 0.5 && safetyRate >= 0.85) {
    verdict = 'robust';
  } else if (safetyRate >= 0.7) {
    verdict = 'acceptable';
  } else {
    verdict = 'fragile';
  }

  return {
    results,
    ambiguitySummaries,
    totalTests: results.length,
    resolutionRate,
    safetyRate,
    meaningPreservationRate,
    verdict,
  };
}
