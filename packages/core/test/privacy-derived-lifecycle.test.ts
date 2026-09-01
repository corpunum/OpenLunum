import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DerivedDataLifecycleRegistry,
  createDerivedDataLifecycle,
  deletionAuditEvents,
  hashSourceContent,
  validateDerivedSemanticProvenance,
  verifyDerivedDeletionCascade,
  type DerivedArtifactKind,
  type DerivedSemanticProvenance,
  type SourcePrivacyLineage,
} from '../src/privacy-derived-lifecycle.js';

const NOW = '2026-09-01T00:00:00.000Z';
const SOURCE: SourcePrivacyLineage = {
  sourceId: 'source-opaque-123',
  sourceContentHash: hashSourceContent('A user supplied private message.'),
  sensitivity: 'sensitive',
  retentionExpiresAt: '2026-10-01T00:00:00.000Z',
  deletionMethod: 'secure-delete',
};

function provenance(overrides: Partial<DerivedSemanticProvenance> = {}): DerivedSemanticProvenance {
  return {
    extractorModelId: 'local/qwen3-coder-30b',
    extractorModelIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    endpointProfile: 'local-openai-compatible/qwen3-coder-30b',
    promptVersion: 'extract-v3',
    promptHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    schemaVersion: 'lunum-sem/0.2',
    codeCommit: '7a40c3f80f017c21d69ba606fe7c11f267257958',
    extractedAt: NOW,
    validationStatus: 'verified',
    promotionStatus: 'promoted',
    ...overrides,
  };
}

describe('privacy-derived-lifecycle', () => {
  it('inherits stricter source sensitivity and never extends source retention', () => {
    const lifecycle = createDerivedDataLifecycle({
      source: SOURCE,
      provenance: provenance(),
      category: 'semantic-content',
      requestedSensitivity: 'public',
      requestedRetentionDays: 365,
      now: NOW,
    });
    assert.equal(lifecycle.sensitivity, 'sensitive');
    assert.equal(lifecycle.retentionExpiresAt, SOURCE.retentionExpiresAt);
    assert.equal(lifecycle.deletionMethod, 'secure-delete');
    assert.equal(lifecycle.source.sourceContentHash, SOURCE.sourceContentHash);
  });

  it('fails closed on placeholder provenance and cannot promote schema-valid semantics', () => {
    const errors = validateDerivedSemanticProvenance(provenance({
      extractorModelId: 'replace-with-server-model-id',
      validationStatus: 'schema-valid',
      promotionStatus: 'promoted',
    }));
    assert.ok(errors.some((error) => error.includes('extractorModelId')));
    assert.ok(errors.some((error) => error.includes('only independently verified')));
    assert.throws(() => createDerivedDataLifecycle({ source: SOURCE, provenance: provenance({ validationStatus: 'schema-valid', promotionStatus: 'promoted' }), now: NOW }));
  });

  it('cascades source deletion through semantic, all fingerprint, index, and cache registrations', () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    const kinds: DerivedArtifactKind[] = [
      'semantic-record', 'surface-fingerprint', 'exact-semantic-fingerprint',
      'near-semantic-fingerprint', 'semantic-index', 'retrieval-cache', 'renderer-cache',
    ];
    for (const kind of kinds) registry.register({ artifactId: `${kind}-1`, kind, lifecycle });

    const plan = registry.buildDeletionPlan(SOURCE);
    assert.equal(plan.targets.length, kinds.length + 1);
    const deleted: string[] = [];
    const report = registry.executeDeletion(plan, (target) => { deleted.push(`${target.kind}:${target.targetId}`); return true; });
    assert.equal(report.complete, true);
    assert.equal(verifyDerivedDeletionCascade(report), true);
    assert.equal(deleted.length, kinds.length + 1);
    assert.deepEqual(registry.list(SOURCE.sourceId), []);

    const events = deletionAuditEvents(report, 'retention-worker', 'source deletion request', NOW);
    assert.equal(events.length, kinds.length + 1);
    assert.ok(events.every((event) => !JSON.stringify(event).includes('A user supplied private message.')));
  });

  it('adversarially detects a skipped cache deletion and retains registry state for retry', () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle });
    registry.register({ artifactId: 'cache-1', kind: 'retrieval-cache', lifecycle });
    const report = registry.executeDeletion(registry.buildDeletionPlan(SOURCE), (target) => target.kind !== 'retrieval-cache');
    assert.equal(report.complete, false);
    assert.equal(verifyDerivedDeletionCascade(report), false);
    assert.equal(registry.list(SOURCE.sourceId).length, 2);
    assert.equal(report.results.find((result) => result.kind === 'retrieval-cache')?.deleted, false);
  });
});
