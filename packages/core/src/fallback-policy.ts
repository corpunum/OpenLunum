import type { LunumSem } from './types.js';

export interface FallbackPolicy {
  minConfidence: number;
  requireAllRoles: boolean;
  requirePredicateInVocabulary: boolean;
  maxMissingFeatures: number;
  reviewBandWidth: number;
}

export const DEFAULT_FALLBACK_POLICY: FallbackPolicy = {
  minConfidence: 0.6,
  requireAllRoles: true,
  requirePredicateInVocabulary: true,
  maxMissingFeatures: 0,
  reviewBandWidth: 0.15
};

export interface FallbackDecision {
  action: 'store' | 'fallback' | 'review';
  reasons: string[];
  confidence: number;
  highRisk?: boolean;
}

export interface FallbackContext {
  expectedRoles?: readonly string[];
  knownPredicates?: ReadonlySet<string>;
  missingFeatureCount?: number;
}

export interface HighRiskFallbackRecord {
  sem: LunumSem;
  naturalText: string;
  decision: FallbackDecision;
  preserveNatural: true;
}

const HIGH_RISK_PREDICATES = new Set([
  'grant', 'revoke', 'authorize', 'approve', 'deny', 'reject',
  'consent', 'agree', 'opt_in', 'opt_out',
  'prohibit', 'forbid', 'restrict', 'block', 'allow', 'permit',
  'delete', 'destroy', 'erase', 'purge', 'remove',
  'disclose', 'share', 'export', 'transfer',
  'encrypt', 'decrypt', 'sign', 'verify',
  'escalate', 'alert', 'notify',
  'launch', 'execute', 'deploy',
]);

const HIGH_RISK_MODALITIES = new Set(['must', 'must_not', 'shall', 'shall_not']);

export function isHighRisk(sem: LunumSem): { highRisk: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const clause of sem.clauses) {
    if (HIGH_RISK_PREDICATES.has(clause.predicate)) {
      reasons.push(`predicate '${clause.predicate}' is safety-critical`);
    }
    if (clause.modality && HIGH_RISK_MODALITIES.has(clause.modality)) {
      reasons.push(`modality '${clause.modality}' on '${clause.predicate}' implies obligation/prohibition`);
    }
    if (clause.negated === true && HIGH_RISK_PREDICATES.has(clause.predicate)) {
      reasons.push(`negated safety-critical predicate '${clause.predicate}'`);
    }
    for (const condition of clause.conditions ?? []) {
      if (HIGH_RISK_PREDICATES.has(condition.predicate)) {
        reasons.push(`condition predicate '${condition.predicate}' is safety-critical`);
      }
    }
  }
  return { highRisk: reasons.length > 0, reasons };
}

export function evaluateHighRiskFallback(
  sem: LunumSem,
  confidence: number,
  naturalText: string,
  context: FallbackContext = {},
  policy: FallbackPolicy = DEFAULT_FALLBACK_POLICY
): HighRiskFallbackRecord {
  const base = evaluateFallback(sem, confidence, context, policy);
  const risk = isHighRisk(sem);
  if (risk.highRisk) {
    base.highRisk = true;
    if (base.action === 'store') {
      base.action = 'review';
      base.reasons = [...base.reasons, ...risk.reasons.map(r => `high-risk: ${r}`)];
    } else {
      base.reasons = [...base.reasons, ...risk.reasons.map(r => `high-risk: ${r}`)];
    }
  }
  return { sem, naturalText, decision: base, preserveNatural: true };
}

export function evaluateFallback(
  sem: LunumSem,
  confidence: number,
  context: FallbackContext = {},
  policy: FallbackPolicy = DEFAULT_FALLBACK_POLICY
): FallbackDecision {
  const reasons: string[] = [];
  const reviewReasons: string[] = [];

  if (confidence < policy.minConfidence - policy.reviewBandWidth) {
    reasons.push(`confidence ${confidence.toFixed(3)} below minimum ${policy.minConfidence}`);
  } else if (confidence < policy.minConfidence) {
    reviewReasons.push(`confidence ${confidence.toFixed(3)} in review band [${(policy.minConfidence - policy.reviewBandWidth).toFixed(3)}, ${policy.minConfidence.toFixed(3)})`);
  }

  if (policy.requireAllRoles && context.expectedRoles) {
    for (const clause of sem.clauses) {
      const presentRoles = new Set(Object.keys(clause.roles ?? {}));
      const missing = context.expectedRoles.filter((r) => !presentRoles.has(r));
      if (missing.length > 0) {
        reasons.push(`missing expected roles: ${missing.join(', ')}`);
      }
    }
  }

  if (policy.requirePredicateInVocabulary && context.knownPredicates) {
    for (const clause of sem.clauses) {
      if (!context.knownPredicates.has(clause.predicate)) {
        reviewReasons.push(`predicate '${clause.predicate}' not in controlled vocabulary`);
      }
    }
  }

  if (context.missingFeatureCount !== undefined && context.missingFeatureCount > policy.maxMissingFeatures) {
    reasons.push(`${context.missingFeatureCount} missing features exceeds maximum ${policy.maxMissingFeatures}`);
  }

  if (reasons.length > 0) {
    return { action: 'fallback', reasons: [...reasons, ...reviewReasons], confidence };
  }
  if (reviewReasons.length > 0) {
    return { action: 'review', reasons: reviewReasons, confidence };
  }
  return { action: 'store', reasons: [], confidence };
}
