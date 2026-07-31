/**
 * Hard product gates (R6.1 #463).
 *
 * Converts semantic invariants from diagnostics into hard gates that block
 * 'match' verdicts when safety-critical semantic changes are detected.
 */

import { compareSem, type SemanticComparison } from './compare.js';
import type { InvariantFiring, HardInvariantCode } from './semantic-invariants.js';
import type { LunumSem } from './types.js';

export type ComparisonVerdict = 'match' | 'mismatch' | 'partial';

export interface GatedComparison extends SemanticComparison {
  verdict: ComparisonVerdict;
  gateBlocked: boolean;
  blockingInvariants: InvariantFiring[];
  gateReport: GateReport;
}

export interface GateReport {
  totalGatesChecked: number;
  gatesPassed: number;
  gatesFailed: number;
  failedGateCodes: HardInvariantCode[];
  enforced: boolean;
}

export interface HardGatePolicy {
  featureRecallThreshold: number;
  featurePrecisionThreshold: number;
  enforcedInvariantCodes: HardInvariantCode[];
}

const ALL_INVARIANT_CODES: HardInvariantCode[] = [
  'role-identity',
  'negation-flip',
  'condition-change',
  'obligation-permission',
  'protected-literal'
];

export const DEFAULT_HARD_GATE_POLICY: HardGatePolicy = {
  featureRecallThreshold: 0.95,
  featurePrecisionThreshold: 0.95,
  enforcedInvariantCodes: ALL_INVARIANT_CODES
};

function computeVerdict(
  comparison: SemanticComparison,
  blockingInvariants: InvariantFiring[],
  policy: HardGatePolicy
): ComparisonVerdict {
  if (blockingInvariants.length > 0) return 'mismatch';

  if (comparison.exactCanonical) return 'match';

  if (
    comparison.featureRecall >= policy.featureRecallThreshold &&
    comparison.featurePrecision >= policy.featurePrecisionThreshold &&
    !comparison.hardMismatch
  ) {
    return 'match';
  }

  if (
    comparison.featureRecall >= 0.5 &&
    !comparison.hardMismatch
  ) {
    return 'partial';
  }

  return 'mismatch';
}

export function gatedCompareSem(
  expected: LunumSem,
  actual: LunumSem,
  policy: HardGatePolicy = DEFAULT_HARD_GATE_POLICY
): GatedComparison {
  const comparison = compareSem(expected, actual, { explain: true });

  const blockingInvariants = comparison.hardInvariants.filter(
    (inv) => policy.enforcedInvariantCodes.includes(inv.code)
  );

  const gateReport: GateReport = {
    totalGatesChecked: policy.enforcedInvariantCodes.length,
    gatesPassed: policy.enforcedInvariantCodes.length - blockingInvariants.length,
    gatesFailed: blockingInvariants.length,
    failedGateCodes: [...new Set(blockingInvariants.map((inv) => inv.code))],
    enforced: true
  };

  const verdict = computeVerdict(comparison, blockingInvariants, policy);

  return {
    ...comparison,
    verdict,
    gateBlocked: blockingInvariants.length > 0,
    blockingInvariants,
    gateReport
  };
}

export function isGateBlocked(result: GatedComparison): boolean {
  return result.gateBlocked;
}

export function getBlockingReasons(result: GatedComparison): string[] {
  return result.blockingInvariants.map((inv) =>
    `[${inv.code}] ${inv.detail}`
  );
}
