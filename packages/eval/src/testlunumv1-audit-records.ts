/**
 * testLunumv1 audit CLI record adapter (#314).
 *
 * Adapts the real, in-memory execution records produced by the #313 built-CLI
 * audit executor (`./testlunumv1-audit-executor.js`) into the protocol-facing
 * JSONL record contract already established by the #309 synthetic bundle
 * module (`./testlunumv1-bundle.js`, `TestLunumV1SyntheticRawRecord`). This
 * module performs no target-model calls itself and renders no reports or
 * bundles -- report/bundle generation is #315, out of scope here.
 *
 * ## Why some fields are always null
 *
 * The #313 executor's `TestLunumV1AuditExecutionRecord` does not carry every
 * field the testLunumv1 protocol JSONL contract asks for -- specifically it
 * never captures per-call `usage`, `finishReason`, or prompt text/hashes: its
 * transport contract (`TestLunumV1AuditExecutorTransport.complete()`) only
 * returns a `ModelCompletion`, and the executor discards everything except
 * `completion.content` when it records a stage output (see
 * `executeParseExperimentPath`/`executeRetentionPath` in
 * `./testlunumv1-audit-executor.ts`). Rather than fabricate plausible-looking
 * values for `usage`, `finishReason`, `systemPromptSha256`, and
 * `userPromptSha256`, this adapter always emits them as explicit `null` --
 * "unavailable from the source record", not "defaulted to a fake value". If a
 * future revision of the #313 executor starts capturing these fields, this
 * adapter should be updated to thread them through instead of nulling them.
 *
 * ## Per-stage reconstruction
 *
 * The executor records one `TestLunumV1AuditExecutionRecord` per *planned
 * execution*, with a `stageOutputs` array covering however many stages of the
 * execution actually ran before the execution settled into `passed`,
 * `failed`, or `error`. This adapter expands each execution record into one
 * JSONL record *per stage that was actually attempted* -- realization and
 * parse-back are never merged into a single line, and canonical/parse
 * executions produce exactly one line. The expansion relies on an invariant
 * that is true of every code path in `./testlunumv1-audit-executor.ts` as of
 * #313 (verified by reading `executeParseExperimentPath` and
 * `executeRetentionPath` directly, and enforced defensively below):
 *
 *   - `stageOutputs` is always a strict, contiguous prefix of the stage
 *     sequence for the execution's `cliPath` (`['parse']` for
 *     `parse-experiment`; `['realization', 'parse-back']` for `retention`).
 *   - A stage only ever appears in `stageOutputs` once its transport call has
 *     returned *without throwing* -- so every recorded stage's own outcome is
 *     `passed`, except possibly the last one, which carries the execution's
 *     overall `status` when that status is `failed` (i.e. the empty-output
 *     case, where the transport call succeeded but produced unusable
 *     content).
 *   - `status === 'error'` always means the *next* stage after the recorded
 *     prefix threw before producing any output; that stage is emitted as a
 *     single additional JSONL line with `rawOutput: null` and the execution's
 *     `errorMessage`. Stages beyond that are never attempted and are not
 *     fabricated as JSONL lines.
 *
 * If an execution record ever violates this invariant (e.g. more stage
 * outputs than the cliPath's sequence allows, or a `passed` execution with a
 * short `stageOutputs`), this module throws a fail-closed error rather than
 * guessing.
 */

import type {
  TestLunumV1AuditExecutionCliPath,
  TestLunumV1AuditExecutionRecord,
  TestLunumV1AuditExecutionStageName,
  TestLunumV1AuditExecutionStatus
} from './testlunumv1-audit-executor.js';
import type { TestLunumV1AuditPlan, TestLunumV1AuditSuiteId, TestLunumV1PlannedExecution } from './testlunumv1-audit-plan.js';
import type { CompletionUsage } from './types.js';

export const TESTLUNUMV1_AUDIT_RECORD_SCHEMA = 'openlunum-testlunumv1-audit-record/0.1' as const;

/**
 * Stable, explicit error taxonomy for adapted records. `none` covers passed
 * stages; `transport_error` covers every case where the executor's `status`
 * was `error` (a transport-level failure -- the underlying `complete()` call
 * threw); `realization_empty_output` / `parse_back_empty_output` cover the
 * two known `failed` cases the #313 retention path can produce;
 * `unknown_failure` is a fail-closed catch-all for any `failed` status whose
 * message does not match a known case, so new failure modes are visible in
 * aggregate counts rather than silently miscategorized.
 */
export type TestLunumV1AuditRecordErrorClass =
  | 'none'
  | 'transport_error'
  | 'realization_empty_output'
  | 'parse_back_empty_output'
  | 'unknown_failure';

export interface TestLunumV1AuditRecord {
  schema: typeof TESTLUNUMV1_AUDIT_RECORD_SCHEMA;
  runId: string;
  executionId: string;
  suiteId: TestLunumV1AuditSuiteId;
  itemId: string;
  sourceLanguage: TestLunumV1PlannedExecution['sourceLanguage'];
  modelSlotId: string;
  targetModelProfileId: string;
  targetModelProfileSha256: string;
  piWorkerId: string;
  piWorkerModel: string;
  cliPath: TestLunumV1AuditExecutionCliPath;
  stage: number;
  stageName: TestLunumV1AuditExecutionStageName;
  repeatLabel: string;
  attempt: number;
  datasetPath: string;
  datasetSha256: string;
  rawOutput: string | null;
  extractedPayload: Record<string, unknown> | null;
  parsedSem: Record<string, unknown> | null;
  goldSem: Record<string, unknown> | null;
  status: TestLunumV1AuditExecutionStatus;
  exact: boolean;
  nearSemanticOnly: boolean;
  usage: CompletionUsage | null;
  finishReason: string | null;
  systemPromptSha256: string | null;
  userPromptSha256: string | null;
  latencyMs: number;
  errorClass: TestLunumV1AuditRecordErrorClass;
  errorMessage: string | null;
  generatedAt: string;
}

export interface TestLunumV1AuditRecordContext {
  runId: string;
  datasetSha256: string;
  piWorkerId: string;
  piWorkerModel: string;
  generatedAt: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Attempts to parse `text` as a JSON object; returns null for anything else (non-JSON text, arrays, primitives, empty string). */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function deepEqualCanonical(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function stageSequenceForCliPath(cliPath: TestLunumV1AuditExecutionCliPath): readonly TestLunumV1AuditExecutionStageName[] {
  return cliPath === 'parse-experiment' ? ['parse'] : ['realization', 'parse-back'];
}

function classifyRecordError(
  stageStatus: TestLunumV1AuditExecutionStatus,
  errorMessage: string | null
): TestLunumV1AuditRecordErrorClass {
  if (stageStatus === 'passed') return 'none';
  if (stageStatus === 'error') return 'transport_error';
  if (errorMessage === 'realization produced empty output') return 'realization_empty_output';
  if (errorMessage === 'parse-back produced empty output') return 'parse_back_empty_output';
  return 'unknown_failure';
}

function assertExecutionInvariant(execution: TestLunumV1AuditExecutionRecord, sequence: readonly TestLunumV1AuditExecutionStageName[]): void {
  const outputCount = execution.stageOutputs.length;
  if (outputCount > sequence.length) {
    throw new Error(
      `testLunumv1 audit record adapter: execution ${execution.executionId} has ${outputCount} stage outputs, more than the ${sequence.length} stages defined for cliPath ${execution.cliPath}`
    );
  }
  for (let index = 0; index < outputCount; index += 1) {
    const expected = sequence[index];
    const actual = execution.stageOutputs[index]!.stage;
    if (actual !== expected) {
      throw new Error(
        `testLunumv1 audit record adapter: execution ${execution.executionId} stage output ${index} is ${actual}, expected ${expected} (stageOutputs must be a contiguous prefix of the cliPath's stage sequence)`
      );
    }
  }
  if (execution.status === 'passed' && outputCount !== sequence.length) {
    throw new Error(
      `testLunumv1 audit record adapter: execution ${execution.executionId} is passed but only has ${outputCount} of ${sequence.length} expected stage outputs`
    );
  }
  if (execution.status === 'failed' && outputCount === 0) {
    throw new Error(
      `testLunumv1 audit record adapter: execution ${execution.executionId} is failed but has no stage outputs to attribute the failure to`
    );
  }
  if (execution.status === 'error' && outputCount >= sequence.length) {
    throw new Error(
      `testLunumv1 audit record adapter: execution ${execution.executionId} is error but already has every expected stage output (${outputCount}/${sequence.length}); an errored execution must have at least one un-attempted stage`
    );
  }
}

/**
 * Adapts one #313 execution record into one or more protocol-contract JSONL
 * records -- one per stage actually attempted (see module doc comment for
 * the reconstruction rules). Emits records for failed and errored executions
 * too; nothing is dropped.
 */
function adaptExecutionRecord(
  plan: TestLunumV1AuditPlan,
  execution: TestLunumV1AuditExecutionRecord,
  context: TestLunumV1AuditRecordContext,
  goldByItemId: ReadonlyMap<string, Record<string, unknown> | null>,
  profileBySlotId: ReadonlyMap<string, { profileId: string; profileSha256: string }>
): TestLunumV1AuditRecord[] {
  const sequence = stageSequenceForCliPath(execution.cliPath);
  assertExecutionInvariant(execution, sequence);

  const slotProfile = profileBySlotId.get(execution.modelSlotId);
  if (!slotProfile) {
    throw new Error(`testLunumv1 audit record adapter: unknown model slot ${execution.modelSlotId} for execution ${execution.executionId} (not present in plan.modelMatrix)`);
  }

  const emitCount = execution.status === 'error' ? execution.stageOutputs.length + 1 : execution.stageOutputs.length;
  const gold = execution.suiteId === 'canonical' ? goldByItemId.get(execution.itemId) ?? null : null;

  const records: TestLunumV1AuditRecord[] = [];

  for (let index = 0; index < emitCount; index += 1) {
    const stageName = sequence[index]!;
    const hasOutput = index < execution.stageOutputs.length;
    const isTerminalRecorded = hasOutput && index === execution.stageOutputs.length - 1;

    const stageStatus: TestLunumV1AuditExecutionStatus = hasOutput
      ? (isTerminalRecorded && execution.status === 'failed' ? 'failed' : 'passed')
      : 'error';

    const rawOutput = hasOutput ? execution.stageOutputs[index]!.rawOutput : null;
    const stageErrorMessage = stageStatus === 'passed' ? null : execution.errorMessage;

    // parse-back and parse are "parse-type" stages: attempt to recover a
    // structured payload from raw output. realization is not a parse result.
    const extractedPayload = rawOutput !== null && (stageName === 'parse' || stageName === 'parse-back')
      ? parseJsonObject(rawOutput)
      : null;
    const parsedSem = extractedPayload;

    const exact = gold !== null && parsedSem !== null && deepEqualCanonical(parsedSem, gold);
    const nearSemanticOnly = !exact
      && gold !== null
      && parsedSem !== null
      && isPlainObject(gold)
      && typeof gold.kind !== 'undefined'
      && parsedSem.kind === gold.kind;

    records.push({
      schema: TESTLUNUMV1_AUDIT_RECORD_SCHEMA,
      runId: context.runId,
      executionId: execution.executionId,
      suiteId: execution.suiteId,
      itemId: execution.itemId,
      sourceLanguage: execution.sourceLanguage,
      modelSlotId: execution.modelSlotId,
      targetModelProfileId: slotProfile.profileId,
      targetModelProfileSha256: slotProfile.profileSha256,
      piWorkerId: context.piWorkerId,
      piWorkerModel: context.piWorkerModel,
      cliPath: execution.cliPath,
      stage: execution.stage,
      stageName,
      repeatLabel: execution.repeatLabel,
      // The #313 executor performs exactly one attempt per planned
      // execution -- it has no internal retry loop (unlike the built
      // `runRetentionCli`, which retries up to `maxAttemptsPerItem` times).
      // Retry/attempt semantics live in the built CLIs themselves, which are
      // out of scope for this adapter; `attempt` is always 1, deliberately.
      attempt: 1,
      datasetPath: plan.datasetPath,
      datasetSha256: context.datasetSha256,
      rawOutput,
      extractedPayload,
      parsedSem,
      goldSem: gold,
      status: stageStatus,
      exact,
      nearSemanticOnly,
      // Unavailable from the #313 executor's record shape -- see module doc
      // comment. Explicitly null, never fabricated.
      usage: null,
      finishReason: null,
      systemPromptSha256: null,
      userPromptSha256: null,
      latencyMs: execution.latencyMs,
      errorClass: classifyRecordError(stageStatus, stageErrorMessage),
      errorMessage: stageErrorMessage,
      generatedAt: context.generatedAt
    });
  }

  return records;
}

/**
 * Deterministic ordering key for adapted records: sorted by suite id, then
 * item id, then model slot id, then the plan's numeric stage, then repeat
 * label, then the record's position within its execution's stage sequence
 * (`parse` and `realization` before `parse-back`), then execution id as a
 * final tiebreaker. This does not depend on the input array's order, so
 * `sortTestLunumV1AuditRecords` produces the same output regardless of the
 * order `records` were adapted or concatenated in.
 */
function sortKey(record: TestLunumV1AuditRecord): string {
  const stagePadded = String(record.stage).padStart(8, '0');
  const stageNameRank = record.stageName === 'parse-back' ? 1 : 0;
  return [record.suiteId, record.itemId, record.modelSlotId, stagePadded, record.repeatLabel, String(stageNameRank), record.executionId]
    .join(' ');
}

export function sortTestLunumV1AuditRecords(records: readonly TestLunumV1AuditRecord[]): readonly TestLunumV1AuditRecord[] {
  return [...records].sort((a, b) => {
    const keyA = sortKey(a);
    const keyB = sortKey(b);
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return 0;
  });
}

/**
 * Adapts every execution record produced by `executeTestLunumV1AuditPlan`
 * (#313) into protocol-contract JSONL records, in deterministic order (see
 * `sortTestLunumV1AuditRecords`). Failed and errored executions produce
 * records too -- nothing is dropped.
 */
export function adaptTestLunumV1AuditExecutionRecords(
  plan: TestLunumV1AuditPlan,
  executionRecords: readonly TestLunumV1AuditExecutionRecord[],
  context: TestLunumV1AuditRecordContext
): readonly TestLunumV1AuditRecord[] {
  const goldByItemId = new Map<string, Record<string, unknown> | null>(
    plan.canonicalDataset.map((item) => [item.id, isPlainObject(item.goldSem) ? item.goldSem as unknown as Record<string, unknown> : null])
  );
  const profileBySlotId = new Map<string, { profileId: string; profileSha256: string }>(
    plan.modelMatrix.map((slot) => [slot.id, { profileId: slot.profileId, profileSha256: slot.profileSha256 }])
  );

  const adapted: TestLunumV1AuditRecord[] = [];
  for (const execution of executionRecords) {
    adapted.push(...adaptExecutionRecord(plan, execution, context, goldByItemId, profileBySlotId));
  }

  return sortTestLunumV1AuditRecords(adapted);
}

/** Serializes adapted records to actual JSONL text: one JSON object per line, in the array's given order (call `sortTestLunumV1AuditRecords` first for deterministic ordering). Empty input serializes to an empty string. */
export function serializeTestLunumV1AuditRecordsToJsonl(records: readonly TestLunumV1AuditRecord[]): string {
  if (records.length === 0) return '';
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}
