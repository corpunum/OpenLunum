/**
 * Source-derived privacy, retention, provenance, and deletion contracts.
 *
 * This module deliberately has no storage backend.  It is the contract that a
 * backend must use when it materializes semantic records, fingerprint entries,
 * indexes, or caches from a source.  A backend supplies the destructive
 * operation; this module refuses to report a cascade as complete unless every
 * registered derivative and the source operation succeeded.
 *
 * Source text is never copied into lineage or audit objects.  The only source
 * content identifier is a SHA-256 digest supplied by the caller.
 */

import { createHash } from 'node:crypto';
import {
  classifyDataCategory,
  getRetentionPolicy,
  type AuditEvent,
  type DataCategory,
  type DataSensitivity,
  type PrivacyRetentionPolicy,
} from './privacy-audit-map.js';

export type DerivedArtifactKind =
  | 'semantic-record'
  | 'surface-fingerprint'
  | 'exact-semantic-fingerprint'
  | 'near-semantic-fingerprint'
  | 'semantic-index'
  | 'retrieval-cache'
  | 'renderer-cache';

export const DERIVED_ARTIFACT_KINDS: readonly DerivedArtifactKind[] = Object.freeze([
  'semantic-record',
  'surface-fingerprint',
  'exact-semantic-fingerprint',
  'near-semantic-fingerprint',
  'semantic-index',
  'retrieval-cache',
  'renderer-cache',
] as const);

export type SemanticValidationStatus =
  | 'unvalidated'
  | 'schema-valid'
  | 'canonical-valid'
  | 'verified'
  | 'rejected';

export type SemanticPromotionStatus =
  | 'candidate'
  | 'natural-only'
  | 'review-required'
  | 'promoted'
  | 'deleted';

/** Opaque source identity and privacy limits.  Never put source text here. */
export interface SourcePrivacyLineage {
  readonly sourceId: string;
  /** SHA-256 of the source bytes/text under the producer's declared normalization. */
  readonly sourceContentHash: string;
  readonly sensitivity: DataSensitivity;
  /** Hard upper bound for all derivatives unless a separate, explicit policy is introduced. */
  readonly retentionExpiresAt: string;
  readonly deletionMethod: PrivacyRetentionPolicy['deletionMethod'];
}

/** Reproducibility data for a model-produced candidate semantic representation. */
export interface DerivedSemanticProvenance {
  readonly extractorModelId: string;
  /** Exact model-weight, deployment, or provider identity; not just a display name. */
  readonly extractorModelIdentity: string;
  readonly endpointProfile: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly schemaVersion: string;
  readonly codeCommit: string;
  readonly extractedAt: string;
  readonly validationStatus: SemanticValidationStatus;
  readonly promotionStatus: SemanticPromotionStatus;
}

/** The privacy and provenance envelope that must accompany every derivative. */
export interface DerivedDataLifecycle {
  readonly source: SourcePrivacyLineage;
  readonly category: DataCategory;
  readonly sensitivity: DataSensitivity;
  /** Always less than or equal to source.retentionExpiresAt. */
  readonly retentionExpiresAt: string;
  readonly deletionMethod: PrivacyRetentionPolicy['deletionMethod'];
  readonly provenance: DerivedSemanticProvenance;
}

export interface CreateDerivedDataLifecycleInput {
  readonly source: SourcePrivacyLineage;
  readonly provenance: DerivedSemanticProvenance;
  readonly category?: DataCategory;
  /** Cannot weaken source sensitivity. */
  readonly requestedSensitivity?: DataSensitivity;
  /** Cannot extend retention past the source's expiry. */
  readonly requestedRetentionDays?: number;
  /** Injectable clock for deterministic callers/tests. */
  readonly now?: string;
}

const SENSITIVITY_ORDER: Readonly<Record<DataSensitivity, number>> = Object.freeze({
  public: 0,
  internal: 1,
  sensitive: 2,
  restricted: 3,
} as const);

const DELETION_STRENGTH: Readonly<Record<PrivacyRetentionPolicy['deletionMethod'], number>> = Object.freeze({
  archive: 0,
  delete: 1,
  'secure-delete': 2,
} as const);

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function isCommit(value: string): boolean {
  return /^[a-f0-9]{7,64}$/u.test(value);
}

function isUsableText(value: string): boolean {
  return value.trim().length > 0 && !/(?:placeholder|replace[-_ ]with|unknown|todo)/iu.test(value);
}

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO-8601 timestamp`);
  return timestamp;
}

function strongerSensitivity(first: DataSensitivity, second: DataSensitivity): DataSensitivity {
  return SENSITIVITY_ORDER[first] >= SENSITIVITY_ORDER[second] ? first : second;
}

function strongerDeletionMethod(
  first: PrivacyRetentionPolicy['deletionMethod'],
  second: PrivacyRetentionPolicy['deletionMethod'],
): PrivacyRetentionPolicy['deletionMethod'] {
  return DELETION_STRENGTH[first] >= DELETION_STRENGTH[second] ? first : second;
}

/** Hash source content without retaining it in the resulting lineage metadata. */
export function hashSourceContent(sourceContent: string): string {
  return createHash('sha256').update(sourceContent).digest('hex');
}

/** Validate the non-sensitive source lineage fields needed for deletion and retention. */
export function validateSourcePrivacyLineage(source: SourcePrivacyLineage): string[] {
  const errors: string[] = [];
  if (!isUsableText(source.sourceId)) errors.push('sourceId must be a non-placeholder opaque identifier');
  if (!isSha256(source.sourceContentHash)) errors.push('sourceContentHash must be a 64-character lowercase SHA-256 hex digest');
  if (!(source.sensitivity in SENSITIVITY_ORDER)) errors.push('source sensitivity is invalid');
  try {
    parseTimestamp(source.retentionExpiresAt, 'source retentionExpiresAt');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!(source.deletionMethod in DELETION_STRENGTH)) errors.push('source deletionMethod is invalid');
  return errors;
}

/**
 * Validate provenance without accepting placeholders.  `schema-valid` is not
 * semantic verification; callers cannot label it `promoted` below.
 */
export function validateDerivedSemanticProvenance(provenance: DerivedSemanticProvenance): string[] {
  const errors: string[] = [];
  for (const [field, value] of Object.entries({
    extractorModelId: provenance.extractorModelId,
    extractorModelIdentity: provenance.extractorModelIdentity,
    endpointProfile: provenance.endpointProfile,
    promptVersion: provenance.promptVersion,
    schemaVersion: provenance.schemaVersion,
  })) {
    if (!isUsableText(value)) errors.push(`${field} must be non-empty and not a placeholder`);
  }
  if (!isSha256(provenance.promptHash)) errors.push('promptHash must be a 64-character lowercase SHA-256 hex digest');
  if (!isCommit(provenance.codeCommit)) errors.push('codeCommit must be a 7-64 character lowercase hexadecimal commit identifier');
  try {
    parseTimestamp(provenance.extractedAt, 'extractedAt');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (provenance.promotionStatus === 'promoted' && provenance.validationStatus !== 'verified') {
    errors.push('only independently verified semantics may be promoted; schema/canonical validity is insufficient');
  }
  if (provenance.validationStatus === 'rejected' && provenance.promotionStatus === 'promoted') {
    errors.push('rejected semantics cannot be promoted');
  }
  return errors;
}

/**
 * Build an inherited privacy envelope.  This intentionally fails closed when
 * lineage/provenance are incomplete instead of silently creating a durable,
 * weakly labelled semantic record.
 */
export function createDerivedDataLifecycle(input: CreateDerivedDataLifecycleInput): DerivedDataLifecycle {
  const sourceErrors = validateSourcePrivacyLineage(input.source);
  const provenanceErrors = validateDerivedSemanticProvenance(input.provenance);
  const errors = [...sourceErrors, ...provenanceErrors];
  if (errors.length > 0) throw new Error(`Invalid source-derived lifecycle: ${errors.join('; ')}`);

  const category = input.category ?? 'semantic-content';
  const categoryPolicy = getRetentionPolicy(category);
  if (!categoryPolicy) throw new Error(`No privacy retention policy exists for derived category ${category}`);
  if (input.requestedRetentionDays !== undefined && (!Number.isFinite(input.requestedRetentionDays) || input.requestedRetentionDays < 0)) {
    throw new Error('requestedRetentionDays must be a finite non-negative number');
  }

  const now = parseTimestamp(input.now ?? new Date().toISOString(), 'now');
  const requestedDays = input.requestedRetentionDays ?? categoryPolicy.retentionDays;
  const requestedExpiry = now + requestedDays * 86_400_000;
  const sourceExpiry = parseTimestamp(input.source.retentionExpiresAt, 'source retentionExpiresAt');
  const retentionExpiresAt = new Date(Math.min(requestedExpiry, sourceExpiry)).toISOString();
  const sensitivity = strongerSensitivity(input.source.sensitivity, input.requestedSensitivity ?? classifyDataCategory(category));

  return Object.freeze({
    source: Object.freeze({ ...input.source }),
    category,
    sensitivity,
    retentionExpiresAt,
    deletionMethod: strongerDeletionMethod(input.source.deletionMethod, categoryPolicy.deletionMethod),
    provenance: Object.freeze({ ...input.provenance }),
  });
}

export interface DerivedArtifactRegistration {
  readonly artifactId: string;
  readonly kind: DerivedArtifactKind;
  readonly lifecycle: DerivedDataLifecycle;
}

export interface DeletionTarget {
  readonly targetId: string;
  readonly kind: 'source' | DerivedArtifactKind;
  readonly sourceId: string;
  readonly deletionMethod: PrivacyRetentionPolicy['deletionMethod'];
}

export interface DerivedDeletionPlan {
  readonly sourceId: string;
  /** This plan covers only artifacts registered in this registry instance. */
  readonly scope: 'registered-artifacts-only';
  readonly targets: readonly DeletionTarget[];
}

export interface DeletionTargetResult extends DeletionTarget {
  readonly deleted: boolean;
  readonly error?: string;
}

export interface DerivedDeletionReport {
  readonly plan: DerivedDeletionPlan;
  readonly results: readonly DeletionTargetResult[];
  readonly complete: boolean;
}

export type DeleteTarget = (target: DeletionTarget) => void | boolean;

/**
 * Registry of derivatives owned by one storage boundary.  It is intentionally
 * not a database or cache: production adapters must register every materialized
 * artifact and provide a deleter that reaches their real store/index/cache.
 */
export class DerivedDataLifecycleRegistry {
  private readonly artifactsBySource = new Map<string, Map<string, DerivedArtifactRegistration>>();

  register(artifact: DerivedArtifactRegistration): void {
    if (!isUsableText(artifact.artifactId)) throw new Error('artifactId must be non-empty and not a placeholder');
    if (!DERIVED_ARTIFACT_KINDS.includes(artifact.kind)) throw new Error(`Unsupported derived artifact kind ${artifact.kind}`);
    const sourceErrors = validateSourcePrivacyLineage(artifact.lifecycle.source);
    const provenanceErrors = validateDerivedSemanticProvenance(artifact.lifecycle.provenance);
    const errors = [...sourceErrors, ...provenanceErrors];
    if (!getRetentionPolicy(artifact.lifecycle.category)) errors.push(`unknown derived category ${artifact.lifecycle.category}`);
    if (SENSITIVITY_ORDER[artifact.lifecycle.sensitivity] < SENSITIVITY_ORDER[artifact.lifecycle.source.sensitivity]) {
      errors.push('artifact sensitivity is weaker than its source sensitivity');
    }
    try {
      if (parseTimestamp(artifact.lifecycle.retentionExpiresAt, 'retentionExpiresAt') > parseTimestamp(artifact.lifecycle.source.retentionExpiresAt, 'source retentionExpiresAt')) {
        errors.push('artifact retention extends beyond source retention');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (DELETION_STRENGTH[artifact.lifecycle.deletionMethod] < DELETION_STRENGTH[artifact.lifecycle.source.deletionMethod]) {
      errors.push('artifact deletion method is weaker than source deletion method');
    }
    if (errors.length > 0) throw new Error(`Invalid derived artifact registration: ${errors.join('; ')}`);
    const sourceId = artifact.lifecycle.source.sourceId;
    const byId = this.artifactsBySource.get(sourceId) ?? new Map<string, DerivedArtifactRegistration>();
    if (byId.has(artifact.artifactId)) throw new Error(`Artifact ${artifact.artifactId} is already registered for source ${sourceId}`);
    byId.set(artifact.artifactId, Object.freeze({ ...artifact }));
    this.artifactsBySource.set(sourceId, byId);
  }

  list(sourceId: string): readonly DerivedArtifactRegistration[] {
    return Object.freeze([...(this.artifactsBySource.get(sourceId)?.values() ?? [])]);
  }

  buildDeletionPlan(source: SourcePrivacyLineage): DerivedDeletionPlan {
    const sourceErrors = validateSourcePrivacyLineage(source);
    if (sourceErrors.length > 0) throw new Error(`Invalid deletion source: ${sourceErrors.join('; ')}`);
    const artifacts = this.list(source.sourceId);
    const targets: DeletionTarget[] = [
      { targetId: source.sourceId, kind: 'source', sourceId: source.sourceId, deletionMethod: source.deletionMethod },
      ...artifacts.map((artifact) => ({
        targetId: artifact.artifactId,
        kind: artifact.kind,
        sourceId: source.sourceId,
        deletionMethod: artifact.lifecycle.deletionMethod,
      })),
    ];
    return Object.freeze({ sourceId: source.sourceId, scope: 'registered-artifacts-only', targets: Object.freeze(targets) });
  }

  executeDeletion(plan: DerivedDeletionPlan, deleteTarget: DeleteTarget): DerivedDeletionReport {
    const results: DeletionTargetResult[] = [];
    for (const target of plan.targets) {
      try {
        const outcome = deleteTarget(target);
        if (outcome === false) {
          results.push({ ...target, deleted: false, error: 'deleter reported target not deleted' });
        } else {
          results.push({ ...target, deleted: true });
        }
      } catch (error) {
        results.push({ ...target, deleted: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const complete = results.length === plan.targets.length && results.every((result) => result.deleted);
    if (complete) this.artifactsBySource.delete(plan.sourceId);
    return Object.freeze({ plan, results: Object.freeze(results), complete });
  }
}

/** A cascade is invalid if a single source/derivative deletion was skipped or failed. */
export function verifyDerivedDeletionCascade(report: DerivedDeletionReport): boolean {
  const planned = new Set(report.plan.targets.map((target) => `${target.kind}:${target.targetId}`));
  const successful = new Set(report.results.filter((result) => result.deleted).map((result) => `${result.kind}:${result.targetId}`));
  return report.complete && planned.size === report.plan.targets.length && planned.size === successful.size && [...planned].every((key) => successful.has(key));
}

/**
 * Audit entries intentionally contain only opaque IDs and hashes, never source
 * text or model output.  The caller persists these entries in its audit store.
 */
export function deletionAuditEvents(report: DerivedDeletionReport, actor: string, reason: string, timestamp = new Date().toISOString()): readonly AuditEvent[] {
  if (!isUsableText(actor)) throw new Error('actor must be non-empty and not a placeholder');
  if (!isUsableText(reason)) throw new Error('reason must be non-empty and not a placeholder');
  parseTimestamp(timestamp, 'audit timestamp');
  const events: AuditEvent[] = [];
  for (const result of report.results) {
    if (!result.deleted) continue;
    const base: AuditEvent = {
      timestamp,
      eventType: 'deletion' as const,
      dataCategory: (result.kind === 'source' ? 'user-input' : 'semantic-content') as DataCategory,
      recordId: result.targetId,
      actor,
      reason,
      deletionMethod: result.deletionMethod,
      ...(result.kind === 'source' ? {} : {
        contentHash: createHash('sha256').update(`${result.sourceId}:${result.kind}:${result.targetId}`).digest('hex')
      }),
    };
    events.push(base);
  }
  return Object.freeze(events);
}
