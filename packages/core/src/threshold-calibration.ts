import crypto from 'node:crypto';

export type CalibrationStatus = 'proposed' | 'accepted' | 'frozen' | 'superseded';

export interface ThresholdDecision {
  thresholdId: string;
  value: number;
  status: CalibrationStatus;
  rationale: string;
  evidenceSources: string[];
  decisionDate: string;
  decisionOwner: string;
  supersedes: string | null;
  constraints: string[];
}

export interface ThresholdRegistry {
  version: string;
  decisions: ThresholdDecision[];
  frozenAt: string | null;
  integrityHash: string;
}

export const CURRENT_THRESHOLD_DECISIONS: readonly ThresholdDecision[] = Object.freeze([
  {
    thresholdId: 'similarity-default',
    value: 0.8,
    status: 'frozen' as CalibrationStatus,
    rationale: 'Threshold sweep at 0.8 yields TP=8, FP=8, FN=0, TN=100, recall=1.0. ' +
      'Chosen to maximize recall (no false negatives) at the cost of moderate false positives. ' +
      'Hard invariants (negation-flip, role-identity, etc.) catch safety-critical mismatches independently.',
    evidenceSources: [
      'reports/experiments/threshold-sweep/2026-07-26T15-56-41-813Z/',
      'packages/core/src/comparison.ts',
      'packages/core/test/comparison.test.ts',
    ],
    decisionDate: '2026-08-01',
    decisionOwner: 'corpunum',
    supersedes: null,
    constraints: [
      'R5.1a clause-path-aware role-identity invariant must be active',
      'Hard mismatch invariants must be enforced before threshold comparison',
      'Historical evidence must not be retroactively rewritten',
    ],
  },
  {
    thresholdId: 'similarity-strict',
    value: 0.85,
    status: 'proposed' as CalibrationStatus,
    rationale: 'At 0.85: TP=6, FP=4, FN=2, TN=104, precision=0.6, recall=0.75. ' +
      'Fewer false positives but introduces 2 false negatives. ' +
      'Suitable for high-precision contexts where missed similarities are acceptable.',
    evidenceSources: [
      'reports/experiments/threshold-sweep/2026-07-26T15-56-41-813Z/',
    ],
    decisionDate: '2026-08-01',
    decisionOwner: 'corpunum',
    supersedes: null,
    constraints: [
      'Must not be used as default without explicit owner approval',
    ],
  },
]);

export function computeRegistryHash(decisions: readonly ThresholdDecision[]): string {
  const canonical = JSON.stringify(decisions.map(d => ({
    id: d.thresholdId,
    value: d.value,
    status: d.status,
    date: d.decisionDate,
  })));
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function buildThresholdRegistry(decisions: readonly ThresholdDecision[]): ThresholdRegistry {
  const frozenDecisions = decisions.filter(d => d.status === 'frozen');
  return {
    version: '1.0',
    decisions: [...decisions],
    frozenAt: frozenDecisions.length > 0 ? frozenDecisions[0]!.decisionDate : null,
    integrityHash: computeRegistryHash(decisions),
  };
}

export function getActiveThreshold(
  decisions: readonly ThresholdDecision[],
  thresholdId: string,
): ThresholdDecision | null {
  const candidates = decisions
    .filter(d => d.thresholdId === thresholdId)
    .filter(d => d.status === 'frozen' || d.status === 'accepted');
  if (candidates.length === 0) return null;
  const frozen = candidates.find(d => d.status === 'frozen');
  return frozen ?? candidates[0]!;
}

export function validateDecisionChain(decisions: readonly ThresholdDecision[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const d of decisions) {
    const key = `${d.thresholdId}:${d.status}:${d.decisionDate}`;
    if (ids.has(key)) {
      errors.push(`Duplicate decision: ${key}`);
    }
    ids.add(key);

    if (d.supersedes !== null) {
      const superseded = decisions.find(
        s => s.thresholdId === d.thresholdId && s.decisionDate === d.supersedes,
      );
      if (!superseded) {
        errors.push(`Decision ${d.thresholdId} supersedes unknown decision dated ${d.supersedes}`);
      }
    }

    if (d.value < 0 || d.value > 1) {
      errors.push(`Decision ${d.thresholdId} has value ${d.value} outside [0, 1]`);
    }

    if (d.evidenceSources.length === 0) {
      errors.push(`Decision ${d.thresholdId} has no evidence sources`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function canSupersede(
  existing: ThresholdDecision,
  replacement: ThresholdDecision,
): { allowed: boolean; reason: string } {
  if (existing.thresholdId !== replacement.thresholdId) {
    return { allowed: false, reason: 'Different threshold IDs cannot supersede each other' };
  }

  if (existing.status === 'frozen' && replacement.status !== 'frozen') {
    return { allowed: false, reason: 'A frozen decision can only be superseded by another frozen decision' };
  }

  if (replacement.evidenceSources.length === 0) {
    return { allowed: false, reason: 'Replacement must have evidence sources' };
  }

  if (replacement.supersedes !== existing.decisionDate) {
    return { allowed: false, reason: 'Replacement must reference the decision it supersedes' };
  }

  return { allowed: true, reason: 'Supersession allowed' };
}
