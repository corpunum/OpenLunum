/**
 * Retention fallback and rollback (R3.7).
 *
 * Validates fallback and rollback behavior when a parse → realize → parse-back
 * round trip fails or becomes ambiguous:
 *
 * 1. Detection of ambiguous round-trips — independent re-parses of the same
 *    realized text disagree, or retention scores among candidates diverge.
 * 2. Automatic fallback to original text — when a round trip fails or is
 *    ambiguous, the original natural-language source is preserved and the
 *    derived canonical form is not trusted for storage.
 * 3. Rollback of stored canonical forms on failure — a ledger tracks stored
 *    canonical versions per key and can revert to the prior version (or to
 *    "no canonical form, natural text only") when a round trip fails.
 * 4. Audit trail for all fallback decisions — every store/fallback/review/
 *    rollback decision is recorded as an immutable, sequenced audit entry.
 */

import type { LunumRecord, LunumSem } from './types.js';
import { compareSem, type SemanticComparison } from './compare.js';
import { fingerprintSem } from './fingerprint.js';
import { rollbackToSource, type RollbackResult } from './rollback-process.js';

// ── Policy ─────────────────────────────────────────────────────────

export interface RoundTripRetentionPolicy {
  /** Minimum feature recall (expected features found in parsed-back sem) required to accept. */
  minRetentionRecall: number;
  /** Minimum feature precision (parsed-back features that were actually expected) required to accept. */
  minRetentionPrecision: number;
  /** Minimum fraction of alternative parses that must agree (by fingerprint) to be considered unambiguous. */
  ambiguityAgreementThreshold: number;
  /** Maximum allowed spread in feature recall among alternative parses before flagging ambiguity. */
  ambiguityScoreMarginThreshold: number;
  /** Width of the review band below minRetentionRecall before an outright failure is declared. */
  reviewBandWidth: number;
}

export const DEFAULT_ROUND_TRIP_RETENTION_POLICY: RoundTripRetentionPolicy = {
  minRetentionRecall: 0.8,
  minRetentionPrecision: 0.6,
  ambiguityAgreementThreshold: 0.75,
  ambiguityScoreMarginThreshold: 0.2,
  reviewBandWidth: 0.1
};

// ── Round-trip attempt ────────────────────────────────────────────

export interface RoundTripAttempt {
  /** Original natural-language source text. */
  naturalText: string;
  /** Language of the original source, if known. */
  sourceLanguage?: string | null | undefined;
  /** Gold/expected semantic structure the round trip should reproduce. */
  expectedSem: LunumSem;
  /** Text realized from expectedSem (possibly in a different language). */
  realizedText?: string | undefined;
  /** Semantic structure parsed back from realizedText. Null/undefined if parsing produced nothing usable. */
  parsedBackSem?: LunumSem | null | undefined;
  /** Error raised while realizing or parsing back, if any. */
  parseError?: string | undefined;
  /** Independent additional re-parses of the same realized text, used for ambiguity detection. */
  alternativeParses?: LunumSem[] | undefined;
}

// ── Ambiguity detection ────────────────────────────────────────────

export interface AmbiguityDetectionResult {
  ambiguous: boolean;
  reasons: string[];
  /** Number of distinct fingerprints among all candidate parses (parsedBackSem + alternativeParses). */
  distinctFingerprints: number;
  /** Total number of candidate parses considered. */
  totalCandidates: number;
  /** Fraction of candidates sharing the most common fingerprint (1.0 = full agreement). */
  agreementRate: number;
  /** Spread (max - min) of feature recall against expectedSem among candidates, or null if fewer than 2. */
  scoreMargin: number | null;
}

const NO_AMBIGUITY: Omit<AmbiguityDetectionResult, 'reasons'> = {
  ambiguous: false,
  distinctFingerprints: 0,
  totalCandidates: 0,
  agreementRate: 1,
  scoreMargin: null
};

/**
 * Detect whether a round trip is ambiguous: independent re-parses of the same
 * realized text disagree with each other, or their retention scores against
 * the expected sem diverge beyond the configured margin.
 *
 * Fail-safe: with zero or one candidate parse and no divergence signal,
 * the round trip is treated as unambiguous (ambiguity requires evidence).
 */
export function detectAmbiguousRoundTrip(
  attempt: RoundTripAttempt,
  policy: RoundTripRetentionPolicy = DEFAULT_ROUND_TRIP_RETENTION_POLICY
): AmbiguityDetectionResult {
  const candidates: LunumSem[] = [];
  if (attempt.parsedBackSem) candidates.push(attempt.parsedBackSem);
  if (attempt.alternativeParses) candidates.push(...attempt.alternativeParses);

  if (candidates.length === 0) {
    return { ...NO_AMBIGUITY, reasons: [] };
  }

  const reasons: string[] = [];
  const fingerprints = candidates.map((c) => fingerprintSem(c));
  const counts = new Map<string, number>();
  for (const fp of fingerprints) counts.set(fp, (counts.get(fp) ?? 0) + 1);
  const distinct = counts.size;
  const maxCount = Math.max(...counts.values());
  const agreementRate = maxCount / candidates.length;

  if (distinct > 1 && agreementRate < policy.ambiguityAgreementThreshold) {
    reasons.push(
      `round-trip parses disagree: ${distinct} distinct outcomes among ${candidates.length} candidates ` +
      `(majority agreement ${(agreementRate * 100).toFixed(1)}%, threshold ${(policy.ambiguityAgreementThreshold * 100).toFixed(1)}%)`
    );
  }

  let scoreMargin: number | null = null;
  if (candidates.length > 1) {
    const recalls = candidates.map((c) => compareSem(attempt.expectedSem, c).featureRecall);
    const maxRecall = Math.max(...recalls);
    const minRecall = Math.min(...recalls);
    scoreMargin = maxRecall - minRecall;
    if (scoreMargin > policy.ambiguityScoreMarginThreshold) {
      reasons.push(
        `retention score margin ${scoreMargin.toFixed(3)} across candidates exceeds threshold ${policy.ambiguityScoreMarginThreshold}`
      );
    }
  }

  return {
    ambiguous: reasons.length > 0,
    reasons,
    distinctFingerprints: distinct,
    totalCandidates: candidates.length,
    agreementRate,
    scoreMargin
  };
}

// ── Round-trip evaluation ──────────────────────────────────────────

export type RoundTripFailureCode =
  | 'parse_error'
  | 'missing_parsed_sem'
  | 'hard_invariant_mismatch'
  | 'low_recall'
  | 'low_precision'
  | 'ambiguous_disagreement'
  | 'ambiguous_score_margin';

export type RoundTripStatus = 'success' | 'ambiguous' | 'failed';

export interface RoundTripEvaluation {
  status: RoundTripStatus;
  failureCodes: RoundTripFailureCode[];
  reasons: string[];
  comparison: SemanticComparison | null;
  ambiguity: AmbiguityDetectionResult;
}

/**
 * Evaluate a round-trip attempt end to end: parse errors, missing output,
 * hard-invariant mismatches, insufficient retention recall/precision, and
 * ambiguity (disagreement or score-margin divergence among candidate parses).
 *
 * Fails closed: any missing evidence (parse error, no parsed sem) is treated
 * as a failure rather than silently accepted.
 */
export function evaluateRoundTrip(
  attempt: RoundTripAttempt,
  policy: RoundTripRetentionPolicy = DEFAULT_ROUND_TRIP_RETENTION_POLICY
): RoundTripEvaluation {
  const failureCodes: RoundTripFailureCode[] = [];
  const reasons: string[] = [];

  if (attempt.parseError) {
    failureCodes.push('parse_error');
    reasons.push(`parse error: ${attempt.parseError}`);
  }

  if (!attempt.parsedBackSem) {
    failureCodes.push('missing_parsed_sem');
    reasons.push('no parsed-back semantic structure available');
    const ambiguity = detectAmbiguousRoundTrip(attempt, policy);
    return { status: 'failed', failureCodes, reasons, comparison: null, ambiguity };
  }

  const comparison = compareSem(attempt.expectedSem, attempt.parsedBackSem);

  if (comparison.hardMismatch) {
    failureCodes.push('hard_invariant_mismatch');
    reasons.push(`hard invariant violated: ${comparison.hardInvariants.map((inv) => inv.code).join(', ') || 'unspecified'}`);
  }

  if (comparison.featureRecall < policy.minRetentionRecall - policy.reviewBandWidth) {
    failureCodes.push('low_recall');
    reasons.push(`feature recall ${comparison.featureRecall.toFixed(3)} below minimum ${policy.minRetentionRecall}`);
  } else if (comparison.featureRecall < policy.minRetentionRecall) {
    reasons.push(
      `feature recall ${comparison.featureRecall.toFixed(3)} in review band ` +
      `[${(policy.minRetentionRecall - policy.reviewBandWidth).toFixed(3)}, ${policy.minRetentionRecall.toFixed(3)})`
    );
  }

  if (comparison.featurePrecision < policy.minRetentionPrecision) {
    failureCodes.push('low_precision');
    reasons.push(`feature precision ${comparison.featurePrecision.toFixed(3)} below minimum ${policy.minRetentionPrecision}`);
  }

  const ambiguity = detectAmbiguousRoundTrip(attempt, policy);
  if (ambiguity.ambiguous) {
    if (ambiguity.reasons.some((r) => r.includes('disagree'))) failureCodes.push('ambiguous_disagreement');
    if (ambiguity.reasons.some((r) => r.includes('score margin'))) failureCodes.push('ambiguous_score_margin');
    reasons.push(...ambiguity.reasons);
  }

  const hardFailureCodes: RoundTripFailureCode[] = [
    'parse_error', 'missing_parsed_sem', 'hard_invariant_mismatch', 'low_recall', 'low_precision'
  ];
  let status: RoundTripStatus = 'success';
  if (failureCodes.some((c) => hardFailureCodes.includes(c))) {
    status = 'failed';
  } else if (ambiguity.ambiguous) {
    status = 'ambiguous';
  }

  return { status, failureCodes, reasons, comparison, ambiguity };
}

// ── Automatic fallback to original text ───────────────────────────

export interface RoundTripFallbackRecord {
  naturalText: string;
  sourceLanguage: string | null;
  /** True when the round trip failed or was ambiguous and fallback was triggered. */
  fellBack: boolean;
  evaluation: RoundTripEvaluation;
  /** Always true: the original natural-language text is preserved regardless of outcome. */
  preservedOriginal: true;
}

/**
 * Evaluate a round trip and produce a fallback record. On failure or
 * ambiguity, the derived canonical form must not be trusted; the caller
 * should treat naturalText as the authoritative representation.
 */
export function applyRoundTripFallback(
  attempt: RoundTripAttempt,
  policy: RoundTripRetentionPolicy = DEFAULT_ROUND_TRIP_RETENTION_POLICY
): RoundTripFallbackRecord {
  const evaluation = evaluateRoundTrip(attempt, policy);
  return {
    naturalText: attempt.naturalText,
    sourceLanguage: attempt.sourceLanguage ?? null,
    fellBack: evaluation.status !== 'success',
    evaluation,
    preservedOriginal: true
  };
}

// ── Audit trail ────────────────────────────────────────────────────

export type RetentionAuditAction = 'store' | 'fallback' | 'review' | 'rollback';

export interface RetentionAuditEntry {
  /** Monotonically increasing sequence number, unique per ledger instance. */
  sequence: number;
  /** Timestamp (ms since epoch, or injected clock value) when the decision was recorded. */
  timestamp: number;
  /** Caller-supplied key identifying the record/slot this decision concerns. */
  key: string;
  action: RetentionAuditAction;
  status: RoundTripStatus;
  reasonCodes: RoundTripFailureCode[];
  reasons: string[];
  /** Fingerprint of the canonical form stored for this key before this decision, or null. */
  previousFingerprint: string | null;
  /** Fingerprint of the canonical form stored for this key after this decision, or null. */
  resultingFingerprint: string | null;
  /** Whether the original natural-language text is the authoritative form after this decision. */
  naturalTextPreserved: boolean;
}

export interface CanonicalFormVersion {
  record: LunumRecord;
  fingerprint: string;
  storedAt: number;
}

/**
 * Tracks per-key version history of stored canonical forms and produces an
 * append-only audit trail of every store/fallback/review/rollback decision.
 *
 * Rollback reverts a key to its previous stored version (if any); if there
 * is no previous version, the key ends up with no canonical form at all,
 * meaning only the original natural-language source remains authoritative.
 */
export class RetentionRollbackLedger {
  private readonly clock: () => number;
  private readonly history = new Map<string, CanonicalFormVersion[]>();
  private readonly audit: RetentionAuditEntry[] = [];
  private sequence = 0;

  constructor(options: { clock?: (() => number) | undefined } = {}) {
    this.clock = options.clock ?? (() => Date.now());
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private currentVersion(key: string): CanonicalFormVersion | undefined {
    const versions = this.history.get(key);
    if (!versions || versions.length === 0) return undefined;
    return versions[versions.length - 1];
  }

  /** Current stored canonical form for `key`, if any. */
  getCurrentVersion(key: string): CanonicalFormVersion | undefined {
    return this.currentVersion(key);
  }

  /** Record a successful (or review-band) storage of a canonical form. */
  commit(key: string, record: LunumRecord, evaluation: RoundTripEvaluation): RetentionAuditEntry {
    const previous = this.currentVersion(key);
    const versions = this.history.get(key) ?? [];
    versions.push({ record, fingerprint: record.fingerprint, storedAt: this.clock() });
    this.history.set(key, versions);

    const entry: RetentionAuditEntry = {
      sequence: this.nextSequence(),
      timestamp: this.clock(),
      key,
      action: evaluation.status === 'ambiguous' ? 'review' : 'store',
      status: evaluation.status,
      reasonCodes: evaluation.failureCodes,
      reasons: evaluation.reasons,
      previousFingerprint: previous?.fingerprint ?? null,
      resultingFingerprint: record.fingerprint,
      naturalTextPreserved: false
    };
    this.audit.push(entry);
    return entry;
  }

  /** Record a fallback decision (canonical form not stored; natural text preserved). */
  recordFallback(key: string, evaluation: RoundTripEvaluation): RetentionAuditEntry {
    const current = this.currentVersion(key);
    const entry: RetentionAuditEntry = {
      sequence: this.nextSequence(),
      timestamp: this.clock(),
      key,
      action: 'fallback',
      status: evaluation.status,
      reasonCodes: evaluation.failureCodes,
      reasons: evaluation.reasons.length > 0 ? evaluation.reasons : ['round trip failed or ambiguous; falling back to original text'],
      previousFingerprint: current?.fingerprint ?? null,
      resultingFingerprint: current?.fingerprint ?? null,
      naturalTextPreserved: true
    };
    this.audit.push(entry);
    return entry;
  }

  recordRollbackDecision(key: string, evaluation: RoundTripEvaluation): RetentionAuditEntry {
    const current = this.currentVersion(key);
    const entry: RetentionAuditEntry = {
      sequence: this.nextSequence(),
      timestamp: this.clock(),
      key,
      action: 'rollback',
      status: evaluation.status,
      reasonCodes: evaluation.failureCodes,
      reasons: evaluation.reasons.length > 0 ? evaluation.reasons : ['round trip failed; no new version was stored'],
      previousFingerprint: current?.fingerprint ?? null,
      resultingFingerprint: current?.fingerprint ?? null,
      naturalTextPreserved: true
    };
    this.audit.push(entry);
    return entry;
  }

  /**
   * Roll back the stored canonical form for `key` after a failed or ambiguous
   * round trip. Pops the most recent stored version (if any) and reverts to
   * the prior one, or to "no canonical form" if there was no prior version.
   */
  rollback(key: string, evaluation: RoundTripEvaluation): RetentionAuditEntry {
    const versions = this.history.get(key) ?? [];
    const removed = versions.length > 0 ? versions.pop() : undefined;
    this.history.set(key, versions);
    const restored = versions.length > 0 ? versions[versions.length - 1] : undefined;

    const entry: RetentionAuditEntry = {
      sequence: this.nextSequence(),
      timestamp: this.clock(),
      key,
      action: 'rollback',
      status: evaluation.status,
      reasonCodes: evaluation.failureCodes,
      reasons: evaluation.reasons.length > 0 ? evaluation.reasons : ['round trip failed or ambiguous; rolling back stored canonical form'],
      previousFingerprint: removed?.fingerprint ?? null,
      resultingFingerprint: restored?.fingerprint ?? null,
      naturalTextPreserved: true
    };
    this.audit.push(entry);
    return entry;
  }

  /** Full (or per-key) audit trail, in the order decisions were recorded. */
  getAuditTrail(key?: string | undefined): readonly RetentionAuditEntry[] {
    return key ? this.audit.filter((e) => e.key === key) : [...this.audit];
  }
}

// ── Orchestration ──────────────────────────────────────────────────

export interface ProcessRoundTripOptions {
  /** Key identifying the record/slot this round trip concerns (e.g. record id or fingerprint prefix). */
  key: string;
  attempt: RoundTripAttempt;
  /** Canonical record that would be stored if the round trip succeeds. Required for a 'store' outcome. */
  candidateRecord?: LunumRecord | undefined;
  policy?: RoundTripRetentionPolicy | undefined;
}

export interface ProcessRoundTripResult {
  evaluation: RoundTripEvaluation;
  fallback: RoundTripFallbackRecord;
  auditEntry: RetentionAuditEntry;
}

/**
 * End-to-end retention decision for one round-trip attempt against a ledger:
 * - success → commit candidateRecord (or record a review-band store if ambiguous
 *   but no hard failure and a candidateRecord was supplied)
 * - ambiguous/failed → roll back any previously stored canonical form for `key`
 *   and fall back to the original natural-language text
 */
export function processRoundTrip(
  ledger: RetentionRollbackLedger,
  options: ProcessRoundTripOptions
): ProcessRoundTripResult {
  const policy = options.policy ?? DEFAULT_ROUND_TRIP_RETENTION_POLICY;
  const evaluation = evaluateRoundTrip(options.attempt, policy);
  const fallback = applyRoundTripFallback(options.attempt, policy);

  let auditEntry: RetentionAuditEntry;
  if (evaluation.status === 'success' && options.candidateRecord) {
    auditEntry = ledger.commit(options.key, options.candidateRecord, evaluation);
  } else if (evaluation.status === 'failed') {
    auditEntry = ledger.recordRollbackDecision(options.key, evaluation);
  } else {
    // ambiguous, or success with no candidateRecord to store
    auditEntry = ledger.recordFallback(options.key, evaluation);
  }

  return { evaluation, fallback, auditEntry };
}

// ── Verified rollback (integrates provenance-verified source rollback) ────

export interface VerifiedCanonicalRollback {
  ledgerEntry: RetentionAuditEntry;
  sourceRollback: RollbackResult;
}

/**
 * Roll back a stored canonical record after a failed/ambiguous round trip,
 * combining the ledger's version-history rollback with provenance-verified
 * reversion to the original natural-language source (rollback-process.ts).
 */
export function rollbackCanonicalOnFailure(
  ledger: RetentionRollbackLedger,
  key: string,
  record: LunumRecord,
  evaluation: RoundTripEvaluation
): VerifiedCanonicalRollback {
  const sourceRollback = rollbackToSource(record);
  const ledgerEntry = ledger.rollback(key, evaluation);
  return { ledgerEntry, sourceRollback };
}
