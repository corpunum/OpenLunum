import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DerivedDataLifecycleRegistry,
  createDerivedDataLifecycle,
  deletionAuditEvents,
  hashSourceContent,
  validateDerivedSemanticProvenance,
  validateSourcePrivacyLineage,
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
  it('rejects inherited property names in every closed privacy-enum boundary', () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    for (const inherited of ['toString', 'constructor', '__proto__']) {
      const badSensitivity = { ...SOURCE, sensitivity: inherited as SourcePrivacyLineage['sensitivity'] };
      const badMethod = { ...SOURCE, deletionMethod: inherited as SourcePrivacyLineage['deletionMethod'] };
      assert.ok(validateSourcePrivacyLineage(badSensitivity).some((error) => error.includes('sensitivity')));
      assert.ok(validateSourcePrivacyLineage(badMethod).some((error) => error.includes('deletionMethod')));
      assert.throws(() => createDerivedDataLifecycle({ source: badSensitivity, provenance: provenance(), now: NOW }), /sensitivity/);
      assert.throws(() => createDerivedDataLifecycle({ source: badMethod, provenance: provenance(), now: NOW }), /deletionMethod/);
      assert.throws(() => createDerivedDataLifecycle({
        source: SOURCE, provenance: provenance(), now: NOW,
        requestedSensitivity: inherited as SourcePrivacyLineage['sensitivity'],
      }), /requestedSensitivity/);
      assert.throws(() => registry.register({
        artifactId: `forged-${inherited}`, kind: 'semantic-record',
        lifecycle: { ...lifecycle, sensitivity: inherited as SourcePrivacyLineage['sensitivity'] },
      }), /sensitivity/);
    }
    assert.deepEqual(registry.list(SOURCE.sourceId), []);
  });

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

  it('cascades source deletion through semantic, all fingerprint, index, and cache registrations', async () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    const kinds: DerivedArtifactKind[] = [
      'semantic-record', 'surface-fingerprint', 'exact-semantic-fingerprint',
      'near-semantic-fingerprint', 'semantic-index', 'retrieval-cache', 'renderer-cache',
    ];
    for (const kind of kinds) registry.register({ artifactId: `${kind}-1`, kind, lifecycle });

    const plan = registry.buildDeletionPlan(SOURCE);
    assert.equal(plan.targets.length, kinds.length + 1);
    assert.equal(plan.contractVersion, 'derived-deletion-plan/1');
    assert.equal(plan.lineage.sourceContentHash, SOURCE.sourceContentHash);
    const deleted: string[] = [];
    const report = await registry.executeDeletion(plan, (target) => { deleted.push(`${target.kind}:${target.targetId}`); return true; });
    assert.equal(report.complete, true);
    assert.equal(verifyDerivedDeletionCascade(report), true);
    assert.equal(deleted.length, kinds.length + 1);
    assert.equal(deleted.at(-1), `source:${SOURCE.sourceId}`);
    assert.ok(deleted.slice(0, -1).every((target) => !target.startsWith('source:')));
    assert.ok(report.results.every(Object.isFrozen));
    assert.deepEqual(registry.list(SOURCE.sourceId), []);

    const duplicated = { ...report, results: [...report.results.slice(0, -1), report.results[0]!] };
    assert.equal(verifyDerivedDeletionCascade(duplicated), false);
    const wrongMethod = {
      ...report,
      results: report.results.map((result, index) => index === 0 ? { ...result, deletionMethod: 'delete' as const } : result),
    };
    assert.equal(verifyDerivedDeletionCascade(wrongMethod), false);
    const sourceFirst = {
      ...report,
      plan: { ...report.plan, targets: [report.plan.targets.at(-1)!, ...report.plan.targets.slice(0, -1)] },
    };
    assert.equal(verifyDerivedDeletionCascade(sourceFirst), false);

    const events = deletionAuditEvents(report, 'retention-worker', 'source deletion request', NOW);
    assert.equal(events.length, kinds.length + 1);
    assert.ok(events.every((event) => !JSON.stringify(event).includes('A user supplied private message.')));
  });

  it('adversarially detects a skipped cache deletion and retains registry state for retry', async () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle });
    registry.register({ artifactId: 'cache-1', kind: 'retrieval-cache', lifecycle });
    const visited: string[] = [];
    const report = await registry.executeDeletion(registry.buildDeletionPlan(SOURCE), (target) => {
      visited.push(target.kind);
      return target.kind !== 'retrieval-cache';
    });
    assert.equal(report.complete, false);
    assert.equal(verifyDerivedDeletionCascade(report), false);
    assert.equal(registry.list(SOURCE.sourceId).length, 2);
    assert.equal(report.results.find((result) => result.kind === 'retrieval-cache')?.deleted, false);
    assert.equal(visited.includes('source'), false);
    assert.equal(report.results.find((result) => result.kind === 'source')?.deleted, false);
  });

  it('refuses shortened, forged, duplicate, additional, and mismatched plans before calling the deleter', async () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle });
    const stale = registry.buildDeletionPlan(SOURCE);
    registry.register({ artifactId: 'cache-1', kind: 'retrieval-cache', lifecycle });
    const complete = registry.buildDeletionPlan(SOURCE);
    const plans = [
      stale,
      { ...complete, targets: complete.targets.slice(0, 1) },
      { ...complete, targets: complete.targets.map((target) => target.targetId === 'sem-1' ? { ...target, kind: 'renderer-cache' as const } : target) },
      { ...complete, targets: [...complete.targets, complete.targets[1]!] },
      { ...complete, targets: [...complete.targets, { ...complete.targets[1]!, targetId: 'unregistered' }] },
      { ...complete, targets: complete.targets.map((target) => target.targetId === 'cache-1' ? { ...target, deletionMethod: 'delete' as const } : target) },
      { ...complete, targets: complete.targets.map((target) => ({ ...target, sourceId: 'other-source' })) },
      { ...complete, sourceId: 'other-source' },
    ];

    for (const plan of plans) {
      let calls = 0;
      const report = await registry.executeDeletion(plan, () => { calls += 1; return true; });
      assert.equal(report.complete, false);
      assert.ok(report.error);
      assert.equal(calls, 0);
      assert.equal(registry.list(SOURCE.sourceId).length, 2);
    }
  });

  it('binds every registration and deletion plan to one immutable source lineage', () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle });
    assert.throws(() => registry.register({
      artifactId: 'sem-2', kind: 'semantic-record',
      lifecycle: createDerivedDataLifecycle({
        source: { ...SOURCE, sourceContentHash: hashSourceContent('different source') },
        provenance: provenance(), now: NOW,
      }),
    }), /lineage/i);
    assert.throws(() => registry.buildDeletionPlan({ ...SOURCE, sourceContentHash: hashSourceContent('different source') }), /lineage/i);
    assert.throws(() => registry.buildDeletionPlan({ ...SOURCE, retentionExpiresAt: '2026-11-01T00:00:00.000Z' }), /lineage/i);
    assert.equal(registry.list(SOURCE.sourceId).length, 1);
  });

  it('snapshots registered lifecycle data and refuses artifact ID replacement', () => {
    const registry = new DerivedDataLifecycleRegistry();
    const mutableSource = { ...SOURCE };
    const mutableLifecycle = {
      ...createDerivedDataLifecycle({ source: mutableSource, provenance: provenance(), now: NOW }),
      source: mutableSource,
    };
    const artifact = { artifactId: 'sem-1', kind: 'semantic-record' as const, lifecycle: mutableLifecycle };
    registry.register(artifact);
    assert.throws(() => registry.register(artifact), /already registered/i);
    mutableSource.sourceContentHash = hashSourceContent('mutated after registration');
    assert.equal(registry.list(SOURCE.sourceId)[0]?.lifecycle.source.sourceContentHash, SOURCE.sourceContentHash);
  });

  it('rejects a completed plan after the same source ID is registered with a new content hash', async () => {
    const registry = new DerivedDataLifecycleRegistry();
    const firstLifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle: firstLifecycle });
    const oldPlan = registry.buildDeletionPlan(SOURCE);
    assert.equal((await registry.executeDeletion(oldPlan, () => true)).complete, true);

    const nextSource = { ...SOURCE, sourceContentHash: hashSourceContent('new source incarnation') };
    const nextLifecycle = createDerivedDataLifecycle({ source: nextSource, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle: nextLifecycle });
    let calls = 0;
    const replay = await registry.executeDeletion(oldPlan, () => { calls += 1; return true; });
    assert.equal(replay.complete, false);
    assert.equal(calls, 0);
    assert.equal(registry.list(SOURCE.sourceId).length, 1);
  });

  it('requires registry issuance and exact lineage for a source-only plan', async () => {
    const registry = new DerivedDataLifecycleRegistry();
    const issued = registry.buildDeletionPlan(SOURCE);
    const forgedHash = {
      ...issued,
      lineage: { ...issued.lineage, sourceContentHash: hashSourceContent('forged source') },
    };
    const forgedMethod = {
      ...issued,
      targets: issued.targets.map((target) => ({ ...target, deletionMethod: 'delete' as const })),
    };
    const unknown = {
      contractVersion: 'derived-deletion-plan/1' as const,
      planId: 'unissued-plan',
      sourceId: 'unknown-source',
      lineage: { ...SOURCE, sourceId: 'unknown-source' },
      scope: 'registered-artifacts-only' as const,
      targets: [{ targetId: 'unknown-source', kind: 'source' as const, sourceId: 'unknown-source', deletionMethod: 'delete' as const }],
    };
    for (const plan of [forgedHash, forgedMethod, unknown]) {
      let calls = 0;
      const report = await registry.executeDeletion(plan, () => { calls += 1; return true; });
      assert.equal(report.complete, false);
      assert.equal(calls, 0);
    }
  });

  it('blocks registrations while an asynchronous cascade is in flight and preserves retry state on failure', async () => {
    const registry = new DerivedDataLifecycleRegistry();
    const lifecycle = createDerivedDataLifecycle({ source: SOURCE, provenance: provenance(), now: NOW });
    registry.register({ artifactId: 'sem-1', kind: 'semantic-record', lifecycle });
    const plan = registry.buildDeletionPlan(SOURCE);
    let signalStarted!: () => void;
    let releaseFirst!: (deleted: boolean) => void;
    let firstCalls = 0;
    let concurrentCalls = 0;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const first = new Promise<boolean>((resolve) => { releaseFirst = resolve; });
    const execution = registry.executeDeletion(plan, async (target) => {
      firstCalls += 1;
      if (target.kind === 'semantic-record') {
        signalStarted();
        return first;
      }
      return true;
    });
    await started;
    const concurrent = await registry.executeDeletion(plan, () => { concurrentCalls += 1; return true; });
    assert.equal(concurrent.complete, false);
    assert.match(concurrent.error ?? '', /already in progress/i);
    assert.equal(concurrentCalls, 0);
    assert.throws(() => registry.register({ artifactId: 'cache-1', kind: 'retrieval-cache', lifecycle }), /deletion.*progress/i);
    releaseFirst(false);
    const failed = await execution;
    assert.equal(failed.complete, false);
    assert.equal(firstCalls, 1);
    assert.equal(failed.results.find((result) => result.kind === 'source')?.deleted, false);
    assert.equal(registry.list(SOURCE.sourceId).length, 1);

    const retry = await registry.executeDeletion(registry.buildDeletionPlan(SOURCE), () => true);
    assert.equal(retry.complete, true);
    assert.deepEqual(registry.list(SOURCE.sourceId), []);
  });
});
