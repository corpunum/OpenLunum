import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TESTLUNUMV1_CANONICAL_DATASET_PATH,
  createTestLunumV1AuditPlan,
  loadTestLunumV1CanonicalDataset
} from '../src/testlunumv1-audit-plan.js';
import type { TestLunumV1AuditPlan } from '../src/testlunumv1-audit-plan.js';
import type { TestLunumV1AuditExecutionRecord } from '../src/testlunumv1-audit-executor.js';
import {
  adaptTestLunumV1AuditExecutionRecords,
  serializeTestLunumV1AuditRecordsToJsonl,
  sortTestLunumV1AuditRecords,
  type TestLunumV1AuditRecord,
  type TestLunumV1AuditRecordContext
} from '../src/testlunumv1-audit-records.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const MODEL_MATRIX = [
  { id: 'slot-a', profileId: 'model-a', profileSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  { id: 'slot-b', profileId: 'model-b', profileSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
] as const;

const CONTEXT: TestLunumV1AuditRecordContext = {
  runId: 'fixture-run-001',
  datasetSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  piWorkerId: 'audit-instrumentation',
  piWorkerModel: 'openai/gpt-5.4-mini',
  generatedAt: '2026-07-24T00:00:00.000Z'
};

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

function findExecution(plan: TestLunumV1AuditPlan, predicate: (execution: TestLunumV1AuditPlan['executions'][number]) => boolean) {
  const execution = plan.executions.find(predicate);
  assert.ok(execution, 'expected to find a matching planned execution in the fixture plan');
  return execution!;
}

// --- Fixture builders: hand-built TestLunumV1AuditExecutionRecord shapes, ---
// --- exactly mirroring what the real #313 executor code paths produce.    ---
// --- No target-model calls anywhere in this file.                        ---

function passedParseExperimentRecord(plan: TestLunumV1AuditPlan): TestLunumV1AuditExecutionRecord {
  const execution = findExecution(plan, (entry) => entry.suiteId === 'canonical');
  const goldItem = plan.canonicalDataset.find((item) => item.id === execution.itemId)!;
  return {
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: 'parse-experiment',
    status: 'passed',
    latencyMs: 12.5,
    stageOutputs: [{ stage: 'parse', rawOutput: JSON.stringify(goldItem.goldSem) }],
    errorMessage: null
  };
}

function erroredParseExperimentRecord(plan: TestLunumV1AuditPlan): TestLunumV1AuditExecutionRecord {
  const execution = findExecution(plan, (entry) => entry.suiteId === 'canonical' && entry.modelSlotId === 'slot-b');
  return {
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: 'parse-experiment',
    status: 'error',
    latencyMs: 3.2,
    stageOutputs: [],
    errorMessage: 'synthetic transport failure'
  };
}

function passedRetentionRecord(plan: TestLunumV1AuditPlan): TestLunumV1AuditExecutionRecord {
  const execution = findExecution(plan, (entry) => entry.suiteId === 'mutation');
  return {
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: 'retention',
    status: 'passed',
    latencyMs: 40,
    stageOutputs: [
      { stage: 'realization', rawOutput: 'The user prefers dark mode.' },
      { stage: 'parse-back', rawOutput: JSON.stringify({ kind: 'preference', clauses: [] }) }
    ],
    errorMessage: null
  };
}

function failedEmptyRealizationRecord(plan: TestLunumV1AuditPlan): TestLunumV1AuditExecutionRecord {
  const execution = findExecution(plan, (entry) => entry.suiteId === 'robustness');
  return {
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: 'retention',
    status: 'failed',
    latencyMs: 8,
    stageOutputs: [{ stage: 'realization', rawOutput: '' }],
    errorMessage: 'realization produced empty output'
  };
}

function failedEmptyParseBackRecord(plan: TestLunumV1AuditPlan): TestLunumV1AuditExecutionRecord {
  const execution = findExecution(plan, (entry) => entry.suiteId === 'cross-lingual');
  return {
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: 'retention',
    status: 'failed',
    latencyMs: 22,
    stageOutputs: [
      { stage: 'realization', rawOutput: 'Some realized text.' },
      { stage: 'parse-back', rawOutput: '' }
    ],
    errorMessage: 'parse-back produced empty output'
  };
}

function erroredParseBackRecord(plan: TestLunumV1AuditPlan): TestLunumV1AuditExecutionRecord {
  const execution = findExecution(plan, (entry) => entry.suiteId === 'reproducibility');
  return {
    executionId: execution.id,
    suiteId: execution.suiteId,
    itemId: execution.itemId,
    sourceLanguage: execution.sourceLanguage,
    modelSlotId: execution.modelSlotId,
    stage: execution.stage,
    repeatLabel: execution.repeatLabel,
    cliPath: 'retention',
    status: 'error',
    latencyMs: 17,
    stageOutputs: [{ stage: 'realization', rawOutput: 'Realized text before parse-back threw.' }],
    errorMessage: 'parse-back: synthetic transport failure'
  };
}

test('a passed parse-experiment execution produces exactly one JSONL-ready record with matched gold and exact status', async () => {
  const plan = await buildPlan();
  const execution = passedParseExperimentRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  assert.equal(adapted.length, 1);
  const record = adapted[0]!;
  assert.equal(record.stageName, 'parse');
  assert.equal(record.status, 'passed');
  assert.equal(record.errorClass, 'none');
  assert.equal(record.errorMessage, null);
  assert.notEqual(record.goldSem, null);
  assert.equal(record.exact, true);
  assert.equal(record.nearSemanticOnly, false);
  assert.equal(record.rawOutput, execution.stageOutputs[0]!.rawOutput);
  assert.notEqual(record.extractedPayload, null);
});

test('an errored parse-experiment execution (transport threw before any output) still produces one retained JSONL record', async () => {
  const plan = await buildPlan();
  const execution = erroredParseExperimentRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  assert.equal(adapted.length, 1);
  const record = adapted[0]!;
  assert.equal(record.stageName, 'parse');
  assert.equal(record.status, 'error');
  assert.equal(record.errorClass, 'transport_error');
  assert.equal(record.errorMessage, 'synthetic transport failure');
  assert.equal(record.rawOutput, null);
  assert.equal(record.extractedPayload, null);
});

test('a passed retention execution preserves realization and parse-back as two separate, non-flattened records', async () => {
  const plan = await buildPlan();
  const execution = passedRetentionRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  assert.equal(adapted.length, 2);
  const stageNames = adapted.map((record) => record.stageName);
  assert.deepEqual(stageNames, ['realization', 'parse-back']);
  for (const record of adapted) {
    assert.equal(record.status, 'passed');
    assert.equal(record.errorClass, 'none');
    assert.equal(record.executionId, execution.executionId);
  }
  const realizationRecord = adapted.find((record) => record.stageName === 'realization')!;
  const parseBackRecord = adapted.find((record) => record.stageName === 'parse-back')!;
  assert.equal(realizationRecord.parsedSem, null, 'realization is not a parse result and must not carry a Sem');
  assert.notEqual(parseBackRecord.extractedPayload, null);
});

test('a failed retention execution (empty realization output) is retained and classified distinctly from empty parse-back and transport errors', async () => {
  const plan = await buildPlan();
  const execution = failedEmptyRealizationRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  assert.equal(adapted.length, 1, 'only the realization stage was attempted; parse-back must not be fabricated');
  const record = adapted[0]!;
  assert.equal(record.stageName, 'realization');
  assert.equal(record.status, 'failed');
  assert.equal(record.errorClass, 'realization_empty_output');
  assert.equal(record.errorMessage, 'realization produced empty output');
});

test('a failed retention execution (empty parse-back output) retains both stages, with only parse-back carrying the failure', async () => {
  const plan = await buildPlan();
  const execution = failedEmptyParseBackRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  assert.equal(adapted.length, 2);
  const realizationRecord = adapted.find((record) => record.stageName === 'realization')!;
  const parseBackRecord = adapted.find((record) => record.stageName === 'parse-back')!;
  assert.equal(realizationRecord.status, 'passed');
  assert.equal(realizationRecord.errorClass, 'none');
  assert.equal(parseBackRecord.status, 'failed');
  assert.equal(parseBackRecord.errorClass, 'parse_back_empty_output');
});

test('an errored retention execution (parse-back transport threw) retains the successful realization plus one errored parse-back record, distinct from a failed status', async () => {
  const plan = await buildPlan();
  const execution = erroredParseBackRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  assert.equal(adapted.length, 2);
  const realizationRecord = adapted.find((record) => record.stageName === 'realization')!;
  const parseBackRecord = adapted.find((record) => record.stageName === 'parse-back')!;
  assert.equal(realizationRecord.status, 'passed');
  assert.equal(parseBackRecord.status, 'error');
  assert.equal(parseBackRecord.errorClass, 'transport_error');
  assert.notEqual(parseBackRecord.errorClass, 'parse_back_empty_output', 'a transport throw must not be classified the same as an empty-output failure');
  assert.equal(parseBackRecord.rawOutput, null);
});

test('nullable fields (usage, finishReason, prompt hashes) stay explicitly null when the source executor record has no such data -- never defaulted to fake values', async () => {
  const plan = await buildPlan();
  const execution = passedRetentionRecord(plan);

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  for (const record of adapted) {
    assert.equal(record.usage, null);
    assert.equal(record.finishReason, null);
    assert.equal(record.systemPromptSha256, null);
    assert.equal(record.userPromptSha256, null);
  }
});

test('non-canonical suites have no gold sem available and never report exact or near-only matches', async () => {
  const plan = await buildPlan();
  const execution = passedRetentionRecord(plan);
  assert.notEqual(execution.suiteId, 'canonical');

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  for (const record of adapted) {
    assert.equal(record.goldSem, null);
    assert.equal(record.exact, false);
    assert.equal(record.nearSemanticOnly, false);
  }
});

test('worker/model identity, dataset hash, and profile hash are threaded through onto every record', async () => {
  const plan = await buildPlan();
  const execution = passedRetentionRecord(plan);
  const expectedSlot = MODEL_MATRIX.find((slot) => slot.id === execution.modelSlotId)!;

  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT);

  for (const record of adapted) {
    assert.equal(record.piWorkerId, CONTEXT.piWorkerId);
    assert.equal(record.piWorkerModel, CONTEXT.piWorkerModel);
    assert.equal(record.datasetSha256, CONTEXT.datasetSha256);
    assert.equal(record.datasetPath, plan.datasetPath);
    assert.equal(record.targetModelProfileId, expectedSlot.profileId);
    assert.equal(record.targetModelProfileSha256, expectedSlot.profileSha256);
    assert.equal(record.attempt, 1);
  }
});

test('rejects an execution referencing a model slot outside the plan', async () => {
  const plan = await buildPlan();
  const execution = { ...passedRetentionRecord(plan), modelSlotId: 'not-a-real-slot' };

  assert.throws(
    () => adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT),
    /unknown model slot not-a-real-slot/
  );
});

test('rejects a tampered execution record whose stageOutputs is not a contiguous prefix of its cliPath stage sequence', async () => {
  const plan = await buildPlan();
  const execution: TestLunumV1AuditExecutionRecord = {
    ...passedRetentionRecord(plan),
    stageOutputs: [{ stage: 'parse-back', rawOutput: '{}' }]
  };

  assert.throws(
    () => adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT),
    /stage output 0 is parse-back, expected realization/
  );
});

test('rejects a passed execution record with fewer stage outputs than its cliPath requires', async () => {
  const plan = await buildPlan();
  const execution: TestLunumV1AuditExecutionRecord = {
    ...passedRetentionRecord(plan),
    stageOutputs: [{ stage: 'realization', rawOutput: 'only one stage' }]
  };

  assert.throws(
    () => adaptTestLunumV1AuditExecutionRecords(plan, [execution], CONTEXT),
    /is passed but only has 1 of 2 expected stage outputs/
  );
});

test('ordering is deterministic across repeated adaptation runs and independent of input record order', async () => {
  const plan = await buildPlan();
  const executions = [
    passedParseExperimentRecord(plan),
    erroredParseExperimentRecord(plan),
    passedRetentionRecord(plan),
    failedEmptyRealizationRecord(plan),
    failedEmptyParseBackRecord(plan),
    erroredParseBackRecord(plan)
  ];

  const forward = adaptTestLunumV1AuditExecutionRecords(plan, executions, CONTEXT);
  const reversed = adaptTestLunumV1AuditExecutionRecords(plan, [...executions].reverse(), CONTEXT);
  const shuffled = adaptTestLunumV1AuditExecutionRecords(plan, [executions[3]!, executions[0]!, executions[5]!, executions[1]!, executions[4]!, executions[2]!], CONTEXT);

  const idsOf = (records: readonly TestLunumV1AuditRecord[]) => records.map((record) => `${record.executionId}:${record.stageName}`);

  assert.deepEqual(idsOf(forward), idsOf(reversed));
  assert.deepEqual(idsOf(forward), idsOf(shuffled));

  // Re-sorting an already-sorted array must be a no-op (idempotent, stable).
  const resorted = sortTestLunumV1AuditRecords(forward);
  assert.deepEqual(idsOf(resorted), idsOf(forward));
});

test('serializes to real JSONL: one JSON object per line, parseable back into equivalent records, deterministic across repeated calls', async () => {
  const plan = await buildPlan();
  const executions = [passedParseExperimentRecord(plan), passedRetentionRecord(plan), failedEmptyParseBackRecord(plan)];
  const adapted = adaptTestLunumV1AuditExecutionRecords(plan, executions, CONTEXT);

  const jsonl = serializeTestLunumV1AuditRecordsToJsonl(adapted);
  const lines = jsonl.split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, adapted.length);

  const parsedBack = lines.map((line) => JSON.parse(line) as TestLunumV1AuditRecord);
  assert.deepEqual(parsedBack, adapted);

  const jsonlAgain = serializeTestLunumV1AuditRecordsToJsonl(adapted);
  assert.equal(jsonl, jsonlAgain);
});

test('serializing an empty record set produces an empty string, not a stray newline', () => {
  assert.equal(serializeTestLunumV1AuditRecordsToJsonl([]), '');
});
