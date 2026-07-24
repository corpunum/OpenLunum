import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';

import {
  TESTLUNUMV1_CANONICAL_DATASET_PATH,
  createTestLunumV1AuditPlan,
  loadTestLunumV1CanonicalDataset
} from '../src/testlunumv1-audit-plan.js';
import type { TestLunumV1AuditPlan } from '../src/testlunumv1-audit-plan.js';
import {
  TESTLUNUMV1_AUDIT_SUITE_CLI_PATH,
  assertTestLunumV1AuditExecutionAccounting,
  assertTestLunumV1AuditPlanFrozenAndExact,
  createTestLunumV1AuditExecutorFixtureTransport,
  executeTestLunumV1AuditPlan,
  type TestLunumV1AuditExecutionRecord,
  type TestLunumV1AuditExecutorTransport
} from '../src/testlunumv1-audit-executor.js';
import { planRetentionExecution, validateRetentionManifest } from '../src/retention-manifest.js';
import { runRetentionCli, type RetentionStageClient } from '../src/retention-cli.js';
import type { CompletionUsage, ModelCompletion } from '../src/types.js';
import { readJson } from '../src/io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RETENTION_FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');

const MODEL_MATRIX = [
  { id: 'slot-a', profileId: 'model-a', profileSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  { id: 'slot-b', profileId: 'model-b', profileSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
] as const;

async function buildPlan(): Promise<TestLunumV1AuditPlan> {
  const datasetPath = path.join(WORKSPACE_ROOT, TESTLUNUMV1_CANONICAL_DATASET_PATH);
  const dataset = await loadTestLunumV1CanonicalDataset(datasetPath);
  return createTestLunumV1AuditPlan({
    datasetPath,
    canonicalDataset: dataset,
    modelMatrix: MODEL_MATRIX,
    declaredExecutionCount: 126
  });
}

/** Always-passing deterministic transport: every stage returns non-empty content. */
function alwaysPassingTransport(): TestLunumV1AuditExecutorTransport {
  return {
    async complete(context): Promise<ModelCompletion> {
      return {
        content: JSON.stringify({ executionId: context.execution.id, stage: context.stage }),
        finishReason: 'stop',
        usage: null
      };
    }
  };
}

test('executes the full plan: one record per planned execution, exact key coverage', async () => {
  const plan = await buildPlan();
  const summary = await executeTestLunumV1AuditPlan(plan, alwaysPassingTransport());

  assert.equal(summary.totalPlanned, plan.executions.length);
  assert.equal(summary.totalExecuted, plan.executions.length);
  assert.equal(summary.records.length, 126);
  assert.equal(summary.passedCount, 126);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.errorCount, 0);

  const recordIds = new Set(summary.records.map((record) => record.executionId));
  const plannedIds = new Set(plan.executions.map((execution) => execution.id));
  assert.equal(recordIds.size, plannedIds.size);
  for (const id of plannedIds) {
    assert.ok(recordIds.has(id), `missing execution record for ${id}`);
  }

  // No unplanned records and no duplicates -- accounting must pass cleanly.
  assert.doesNotThrow(() => assertTestLunumV1AuditExecutionAccounting(plan, summary.records));
});

test('routes every execution to exactly one of the two built CLI paths per the documented suite mapping', async () => {
  const plan = await buildPlan();
  const summary = await executeTestLunumV1AuditPlan(plan, alwaysPassingTransport());

  for (const record of summary.records) {
    const expectedCliPath = TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[record.suiteId];
    assert.equal(record.cliPath, expectedCliPath);
    assert.ok(record.cliPath === 'parse-experiment' || record.cliPath === 'retention');
  }

  const canonicalRecords = summary.records.filter((record) => record.suiteId === 'canonical');
  assert.ok(canonicalRecords.length > 0);
  assert.ok(canonicalRecords.every((record) => record.cliPath === 'parse-experiment'));

  const nonCanonicalRecords = summary.records.filter((record) => record.suiteId !== 'canonical');
  assert.ok(nonCanonicalRecords.length > 0);
  assert.ok(nonCanonicalRecords.every((record) => record.cliPath === 'retention'));
});

test('rejects a missing execution record', async () => {
  const plan = await buildPlan();
  const records: TestLunumV1AuditExecutionRecord[] = plan.executions.slice(1).map((execution) => ({
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[execution.suiteId],
    status: 'passed',
    latencyMs: 1,
    stageOutputs: [],
    errorMessage: null
  }));

  assert.throws(
    () => assertTestLunumV1AuditExecutionAccounting(plan, records),
    /missing execution records for 1 planned execution/
  );
});

test('rejects a duplicate execution record', async () => {
  const plan = await buildPlan();
  const first = plan.executions[0]!;
  const baseRecord: TestLunumV1AuditExecutionRecord = {
    executionId: first.id,
    suiteId: first.suiteId,
    itemId: first.itemId,
    sourceLanguage: first.sourceLanguage,
    modelSlotId: first.modelSlotId,
    stage: first.stage,
    repeatLabel: first.repeatLabel,
    cliPath: TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[first.suiteId],
    status: 'passed',
    latencyMs: 1,
    stageOutputs: [],
    errorMessage: null
  };
  const records: TestLunumV1AuditExecutionRecord[] = [
    ...plan.executions.map((execution) => ({ ...baseRecord, executionId: execution.id, suiteId: execution.suiteId })),
    baseRecord
  ];

  assert.throws(
    () => assertTestLunumV1AuditExecutionAccounting(plan, records),
    /duplicate execution record: /
  );
});

test('rejects an unexpected execution record outside the plan', async () => {
  const plan = await buildPlan();
  const records: TestLunumV1AuditExecutionRecord[] = plan.executions.map((execution) => ({
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[execution.suiteId],
    status: 'passed',
    latencyMs: 1,
    stageOutputs: [],
    errorMessage: null
  }));
  records.push({
    ...records[0]!,
    executionId: 'not-a-planned-execution-id'
  });

  assert.throws(
    () => assertTestLunumV1AuditExecutionAccounting(plan, records),
    /unexpected execution record outside the frozen plan: not-a-planned-execution-id/
  );
});

test('rejects a plan that has been tampered with (not frozen, or execution keys inconsistent with a re-validation)', async () => {
  const plan = await buildPlan();

  // A structurally-similar but unfrozen object must be rejected outright.
  const unfrozenClone: TestLunumV1AuditPlan = {
    ...plan,
    executions: [...plan.executions]
  };
  assert.throws(() => assertTestLunumV1AuditPlanFrozenAndExact(unfrozenClone), /requires a frozen/);
  await assert.rejects(() => executeTestLunumV1AuditPlan(unfrozenClone, alwaysPassingTransport()), /requires a frozen/);

  // Splicing in an extra frozen-looking execution without updating
  // declaredExecutionCount must be rejected by the re-validation against the
  // canonical #311 module, not silently accepted.
  const extraExecution = { ...plan.executions[0]!, id: 'canonical:extra-injected-id' };
  const tamperedExecutions = Object.freeze([...plan.executions, extraExecution]);
  const tamperedPlan: TestLunumV1AuditPlan = Object.freeze({
    ...plan,
    executions: tamperedExecutions
  });
  assert.throws(() => assertTestLunumV1AuditPlanFrozenAndExact(tamperedPlan), /count mismatch|declared execution count mismatch/);
});

test('execution is deterministic for frozen inputs: repeated runs against the same plan and fixture-backed transport produce identical record sequences', async () => {
  const plan = await buildPlan();
  const fixtureResponses: ModelCompletion[] = plan.executions.flatMap((execution) => {
    const cliPath = TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[execution.suiteId];
    const stages = cliPath === 'parse-experiment' ? 1 : 2;
    return Array.from({ length: stages }, (_unused, stageIndex) => ({
      content: JSON.stringify({ executionId: execution.id, stageIndex }),
      finishReason: 'stop',
      usage: null
    }));
  });

  const runOnce = () => executeTestLunumV1AuditPlan(plan, createTestLunumV1AuditExecutorFixtureTransport(fixtureResponses));

  const first = await runOnce();
  const second = await runOnce();

  const stripLatency = (records: readonly TestLunumV1AuditExecutionRecord[]) =>
    records.map(({ latencyMs: _latencyMs, ...rest }) => rest);

  assert.deepStrictEqual(stripLatency(first.records), stripLatency(second.records));
  assert.equal(first.totalExecuted, second.totalExecuted);
  assert.equal(first.passedCount, second.passedCount);
  assert.equal(first.records.map((record) => record.executionId).join(','), second.records.map((record) => record.executionId).join(','));
});

test('a retention-path execution surfaces failed/error status without throwing when transport signals empty output or an error', async () => {
  const plan = await buildPlan();
  const retentionExecution = plan.executions.find((execution) => TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[execution.suiteId] === 'retention');
  assert.ok(retentionExecution);

  const failingTransport: TestLunumV1AuditExecutorTransport = {
    async complete(context): Promise<ModelCompletion> {
      if (context.execution.id === retentionExecution!.id && context.stage === 'realization') {
        return { content: '', finishReason: 'stop', usage: null };
      }
      return { content: JSON.stringify({ ok: true }), finishReason: 'stop', usage: null };
    }
  };

  const summary = await executeTestLunumV1AuditPlan(plan, failingTransport);
  const record = summary.records.find((entry) => entry.executionId === retentionExecution!.id);
  assert.ok(record);
  assert.equal(record!.status, 'failed');
  assert.equal(record!.errorMessage, 'realization produced empty output');
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.totalExecuted, plan.executions.length);
});

test('a parse-experiment-path execution surfaces error status when the transport throws, without aborting the whole run', async () => {
  const plan = await buildPlan();
  const parseExecution = plan.executions.find((execution) => TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[execution.suiteId] === 'parse-experiment');
  assert.ok(parseExecution);

  const flakyTransport: TestLunumV1AuditExecutorTransport = {
    async complete(context): Promise<ModelCompletion> {
      if (context.execution.id === parseExecution!.id) {
        throw new Error('synthetic transport failure');
      }
      return { content: JSON.stringify({ ok: true }), finishReason: 'stop', usage: null };
    }
  };

  const summary = await executeTestLunumV1AuditPlan(plan, flakyTransport);
  const record = summary.records.find((entry) => entry.executionId === parseExecution!.id);
  assert.ok(record);
  assert.equal(record!.status, 'error');
  assert.equal(record!.errorMessage, 'synthetic transport failure');
  assert.equal(summary.totalExecuted, plan.executions.length);
  assert.doesNotThrow(() => assertTestLunumV1AuditExecutionAccounting(plan, summary.records));
});

// --- Integration: prove genuine wiring to the actual built retention CLI ---
// entrypoint (`runRetentionCli`), not just the executor's own transport
// abstraction. Uses the already-committed retention test fixtures so no new
// dataset/prompt content is introduced by this change.
test('integration: the retention CLI path corresponds to the real, built runRetentionCli entrypoint', async () => {
  type CompletionQueueItem = {
    content?: string;
    finishReason?: string | null;
    usage?: CompletionUsage | null;
    error?: string;
  };

  function mockClient(queue: Array<CompletionQueueItem | Error>): RetentionStageClient {
    let index = 0;
    return {
      async complete(): Promise<ModelCompletion> {
        const next = queue[index++];
        if (!next) throw new Error('mock client exhausted');
        if (next instanceof Error) throw next;
        if (typeof next.error === 'string' && next.error.trim()) throw new Error(next.error);
        if (typeof next.content !== 'string') throw new Error(`mock client item ${index} must provide content or error`);
        return { content: next.content, finishReason: next.finishReason ?? null, usage: next.usage ?? null };
      }
    };
  }

  const manifest = await readJson<any>(path.join(RETENTION_FIXTURE_ROOT, 'coverage-manifest.json'));
  const dataset = await readJson<Array<{ id: string }>>(path.join(RETENTION_FIXTURE_ROOT, 'coverage-dataset.json'));
  const validated = validateRetentionManifest(manifest);
  const plan = planRetentionExecution(validated, dataset as any);
  assert.ok(plan.plannedItemIds.length > 0);

  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-testlunumv1-audit-executor-'));
  const relativeOutputRoot = path.join('reports', 'retention', `audit-executor-integration-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);

  try {
    const mockFixture = await readJson<CompletionQueueItem[]>(path.join(RETENTION_FIXTURE_ROOT, 'mock-responses.json'));
    const client = mockClient(mockFixture);
    const manifestPath = path.join(RETENTION_FIXTURE_ROOT, 'coverage-manifest.json');

    const { summary } = await runRetentionCli(manifestPath, {
      root: WORKSPACE_ROOT,
      outputRoot: relativeOutputRoot,
      client
    });

    // This is the real, built CLI entrypoint (`runRetentionCli`) that the
    // executor's `retention` cliPath is documented to correspond to -- not a
    // reimplementation.
    assert.equal(summary.manifestId, validated.id);
    assert.equal(summary.itemCount, plan.plannedItemIds.length);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});
