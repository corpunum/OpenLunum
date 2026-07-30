/**
 * Retention gates define named, measurable checks for semantic preservation
 * through a parse→realize→parse round-trip cycle.
 *
 * Each gate produces a pass/fail result with a numerical score (0-1).
 * The gate definition specifies:
 * - Name: human-readable identifier
 * - Description: what aspect of semantic preservation is being checked
 * - Score function: how to compute 0-1 score from gold and round-tripped semantics
 * - Threshold: minimum score to pass (default 0.8 for most gates)
 *
 * R3.4 requires 6 standard gates:
 * 1. Exact preservation (byte-identical)
 * 2. Feature preservation (all semantic features)
 * 3. Literal preservation (protected text strings)
 * 4. Role preservation (argument assignments)
 * 5. Negation preservation (negation flag)
 * 6. Modality preservation (must/should/may)
 */

import type { LunumSem, LunumClause, LunumTerm } from '@corpunum/lunum';
import { stableStringify } from '@corpunum/lunum';

// ── Types ──────────────────────────────────────────────────────────

export type RetentionGateName =
  | 'exact-preservation'
  | 'feature-preservation'
  | 'literal-preservation'
  | 'role-preservation'
  | 'negation-preservation'
  | 'modality-preservation';

export interface RetentionGateScore {
  gate: RetentionGateName;
  score: number; // 0-1
  passed: boolean;
  threshold: number;
  details?: string;
}

export interface RetentionGatesResult {
  goldSem: LunumSem;
  roundTripSem: LunumSem;
  sourceText: string;
  realizedText: string;
  protectedLiterals: string[];
  gateScores: Record<RetentionGateName, RetentionGateScore>;
  overallPassed: boolean;
  totalScore: number; // Average of all gate scores
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Recursively flatten clauses into a list of feature strings.
 * Each feature is a normalized key-value pair from the clause tree.
 */
function flattenClauses(clauses: LunumClause[], prefix = ''): Map<string, boolean> {
  const features = new Map<string, boolean>();

  clauses.forEach((clause, index) => {
    const path = `${prefix}${index}`;

    // Predicate is a core feature
    features.set(`${path}:predicate=${clause.predicate}`, true);

    // Negation is a feature
    if (clause.negated !== undefined) {
      features.set(`${path}:negated=${clause.negated}`, true);
    }

    // Modality is a feature
    if (clause.modality) {
      features.set(`${path}:modality=${clause.modality}`, true);
    }

    // Roles are features
    for (const [role, value] of Object.entries(clause.roles ?? {})) {
      const scalar = value == null
        ? 'null'
        : Array.isArray(value)
          ? value.map(v => typeof v === 'object' ? stableStringify(v) : String(v)).join('|')
          : typeof value === 'object'
            ? stableStringify(value)
            : String(value);
      features.set(`${path}:role:${role}=${scalar}`, true);
    }

    // Recursively flatten conditions and consequences
    if (clause.conditions?.length) {
      const condFeatures = flattenClauses(clause.conditions, `${path}.condition.`);
      for (const [feat] of condFeatures) {
        features.set(feat, true);
      }
    }
    if (clause.consequences?.length) {
      const consFeatures = flattenClauses(clause.consequences, `${path}.consequence.`);
      for (const [feat] of consFeatures) {
        features.set(feat, true);
      }
    }
  });

  return features;
}

/**
 * Score exact byte-identical preservation.
 * Only passes if the two Sem objects serialize to the exact same JSON.
 */
export function scoreExactPreservation(goldSem: LunumSem, roundTripSem: LunumSem): number {
  const goldJson = stableStringify(goldSem);
  const roundTripJson = stableStringify(roundTripSem);
  return goldJson === roundTripJson ? 1 : 0;
}

/**
 * Score feature preservation.
 * Measures what fraction of gold features appear in the round-trip Sem.
 * This is essentially semantic recall at the feature level.
 */
export function scoreFeaturePreservation(goldSem: LunumSem, roundTripSem: LunumSem): number {
  const goldFeatures = flattenClauses(goldSem.clauses ?? []);
  const roundTripFeatures = flattenClauses(roundTripSem.clauses ?? []);

  if (goldFeatures.size === 0) {
    return 1; // Empty semantics trivially preserve all features
  }

  let matched = 0;
  for (const [feature] of goldFeatures) {
    if (roundTripFeatures.has(feature)) {
      matched++;
    }
  }

  return matched / goldFeatures.size;
}

/**
 * Score protected literal preservation.
 * Measures what fraction of protected literals appear (case-insensitive substring match)
 * anywhere in the realized or round-trip text.
 */
export function scoreLiteralPreservation(
  protectedLiterals: string[],
  realizedText: string,
  roundTripText: string
): number {
  if (protectedLiterals.length === 0) {
    return 1; // No literals to preserve
  }

  const combined = (realizedText + ' ' + roundTripText).toLowerCase();
  let found = 0;

  for (const literal of protectedLiterals) {
    if (combined.includes(literal.toLowerCase())) {
      found++;
    }
  }

  return found / protectedLiterals.length;
}

/**
 * Score role preservation.
 * Measures what fraction of roles in gold clauses are also present in round-trip clauses.
 * Compares role presence (not values) at the structural level.
 */
export function scoreRolePreservation(goldSem: LunumSem, roundTripSem: LunumSem): number {
  const goldClauses = goldSem.clauses ?? [];
  const roundTripClauses = roundTripSem.clauses ?? [];

  if (goldClauses.length === 0) {
    return 1; // Empty semantics trivially preserve roles
  }

  let totalRoles = 0;
  let matchedRoles = 0;
  const minLen = Math.min(goldClauses.length, roundTripClauses.length);

  // Compare roles in corresponding clause positions
  for (let i = 0; i < minLen; i++) {
    const goldClause = goldClauses[i]!;
    const roundTripClause = roundTripClauses[i]!;
    const goldRoles = Object.keys(goldClause.roles ?? {});

    totalRoles += goldRoles.length;
    for (const role of goldRoles) {
      if (role in (roundTripClause.roles ?? {})) {
        matchedRoles++;
      }
    }
  }

  // If gold has more clauses, count missing roles
  if (goldClauses.length > roundTripClauses.length) {
    for (let i = minLen; i < goldClauses.length; i++) {
      const goldClause = goldClauses[i]!;
      totalRoles += Object.keys(goldClause.roles ?? {}).length;
    }
  }

  return totalRoles > 0 ? matchedRoles / totalRoles : 1;
}

/**
 * Score negation preservation.
 * Measures what fraction of gold clauses with negation flags still have them after round-trip.
 * A perfect score means all negations are preserved exactly.
 */
export function scoreNegationPreservation(goldSem: LunumSem, roundTripSem: LunumSem): number {
  const goldClauses = goldSem.clauses ?? [];
  const roundTripClauses = roundTripSem.clauses ?? [];

  if (goldClauses.length === 0) {
    return 1; // Empty semantics trivially preserve negations
  }

  let totalNegations = 0;
  let preservedNegations = 0;
  const minLen = Math.min(goldClauses.length, roundTripClauses.length);

  // Compare negation in corresponding clause positions
  for (let i = 0; i < minLen; i++) {
    const goldClause = goldClauses[i]!;
    if (goldClause.negated === true) {
      totalNegations++;
      const roundTripClause = roundTripClauses[i]!;
      if (roundTripClause.negated === true) {
        preservedNegations++;
      }
    }
  }

  // If gold has more clauses with negation, count them as not preserved
  for (let i = minLen; i < goldClauses.length; i++) {
    if (goldClauses[i]!.negated === true) {
      totalNegations++;
    }
  }

  return totalNegations > 0 ? preservedNegations / totalNegations : 1;
}

/**
 * Score modality preservation.
 * Measures what fraction of gold clauses with a modality flag (must/should/may)
 * still have the same modality after round-trip.
 */
export function scoreModalityPreservation(goldSem: LunumSem, roundTripSem: LunumSem): number {
  const goldClauses = goldSem.clauses ?? [];
  const roundTripClauses = roundTripSem.clauses ?? [];

  if (goldClauses.length === 0) {
    return 1; // Empty semantics trivially preserve modalities
  }

  let totalModalities = 0;
  let preservedModalities = 0;
  const minLen = Math.min(goldClauses.length, roundTripClauses.length);

  // Compare modality in corresponding clause positions
  for (let i = 0; i < minLen; i++) {
    const goldClause = goldClauses[i]!;
    if (goldClause.modality) {
      totalModalities++;
      const roundTripClause = roundTripClauses[i]!;
      if (roundTripClause.modality === goldClause.modality) {
        preservedModalities++;
      }
    }
  }

  // If gold has more clauses with modality, count them as not preserved
  for (let i = minLen; i < goldClauses.length; i++) {
    if (goldClauses[i]!.modality) {
      totalModalities++;
    }
  }

  return totalModalities > 0 ? preservedModalities / totalModalities : 1;
}

// ── Gate evaluators ────────────────────────────────────────────────

interface GateDefinition {
  name: RetentionGateName;
  description: string;
  threshold: number;
  scorer: (gold: LunumSem, roundTrip: LunumSem, sourceText: string, realizedText: string, literals: string[]) => number;
}

const GATES: GateDefinition[] = [
  {
    name: 'exact-preservation',
    description: 'Byte-identical JSON serialization after round-trip',
    threshold: 1.0, // Exact match only
    scorer: (gold, roundTrip) => scoreExactPreservation(gold, roundTrip)
  },
  {
    name: 'feature-preservation',
    description: 'All semantic features present after round-trip (semantic recall)',
    threshold: 0.8,
    scorer: (gold, roundTrip) => scoreFeaturePreservation(gold, roundTrip)
  },
  {
    name: 'literal-preservation',
    description: 'Protected text literals preserved in realized or round-trip text',
    threshold: 0.8,
    scorer: (gold, roundTrip, source, realized, literals) =>
      scoreLiteralPreservation(literals, realized, source)
  },
  {
    name: 'role-preservation',
    description: 'Role assignments preserved across clauses',
    threshold: 0.8,
    scorer: (gold, roundTrip) => scoreRolePreservation(gold, roundTrip)
  },
  {
    name: 'negation-preservation',
    description: 'Negation flags preserved on clauses',
    threshold: 0.9,
    scorer: (gold, roundTrip) => scoreNegationPreservation(gold, roundTrip)
  },
  {
    name: 'modality-preservation',
    description: 'Modality (must/should/may) preserved on clauses',
    threshold: 0.9,
    scorer: (gold, roundTrip) => scoreModalityPreservation(gold, roundTrip)
  }
];

/**
 * Evaluate all retention gates for a single round-trip.
 *
 * @param goldSem The original semantic representation
 * @param roundTripSem The semantic representation after realize→parse round-trip
 * @param sourceText Original source text (for literal checking)
 * @param realizedText The realized text from synthesis (for literal checking)
 * @param protectedLiterals Protected text literals to preserve
 * @returns Scores for all gates and overall pass/fail
 */
export function evaluateRetentionGates(
  goldSem: LunumSem,
  roundTripSem: LunumSem,
  sourceText: string,
  realizedText: string,
  protectedLiterals: string[] = []
): RetentionGatesResult {
  const gateScores: Record<RetentionGateName, RetentionGateScore> = {} as any;
  let totalScore = 0;
  let allPassed = true;

  for (const gate of GATES) {
    const score = gate.scorer(goldSem, roundTripSem, sourceText, realizedText, protectedLiterals);
    const passed = score >= gate.threshold;

    gateScores[gate.name] = {
      gate: gate.name,
      score,
      passed,
      threshold: gate.threshold,
      details: gate.description
    };

    totalScore += score;
    if (!passed) allPassed = false;
  }

  return {
    goldSem,
    roundTripSem,
    sourceText,
    realizedText,
    protectedLiterals,
    gateScores,
    overallPassed: allPassed,
    totalScore: totalScore / GATES.length
  };
}

/**
 * Get the list of all retention gate names in standard order.
 */
export function getRetentionGateNames(): RetentionGateName[] {
  return GATES.map(g => g.name);
}

/**
 * Get the threshold for a specific gate.
 */
export function getGateThreshold(gateName: RetentionGateName): number {
  const gate = GATES.find(g => g.name === gateName);
  if (!gate) throw new Error(`Unknown retention gate: ${gateName}`);
  return gate.threshold;
}
