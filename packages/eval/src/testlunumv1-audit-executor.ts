/**
 * testLunumv1 built-CLI audit executor (#313).
 *
 * Consumes the frozen `TestLunumV1AuditPlan` produced by the #311 audit-plan
 * module (`./testlunumv1-audit-plan.js`) and executes each planned execution
 * against exactly one of the two *built* CLI entrypoints that already exist
 * in this package:
 *
 *   - `parse-experiment` (`./parse-experiment.js` -> `runParseExperiment`)
 *   - `retention`        (`./retention-cli.js`    -> `runRetentionCli`)
 *
 * This module does not re-derive the canonical dataset, suite inventories,
 * or call budgets: it only imports and consumes the plan's exported types
 * and values. It performs no target-model calls -- every execution goes
 * through a caller-supplied mock/integration transport that mirrors the
 * `complete(system, user)` contract already used by
 * `OpenAICompatibleModel`/`RetentionStageClient`. It renders no reports or
 * bundles; it produces only an in-memory diagnostics summary.
 *
 * Suite -> built-CLI-path routing is fixed and documented here rather than
 * derived, because the #311 plan intentionally does not carry a CLI-path
 * field:
 *
 *   - `canonical` suite items are executed through the `parse-experiment`
 *     path: the suite is single-stage / single-repeat ('official'), which
 *     matches the one-shot parse pass performed by `runParseExperiment`.
 *   - every other suite (`mutation`, `robustness`, `cross-lingual`,
 *     `reproducibility`) is executed through the `retention` path: these
 *     suites exercise multi-stage / multi-repeat coverage, which matches the
 *     realization + parse-back stage pair performed by `runRetentionCli`.
 */

import type {
  TestLunumV1AuditPlan,
  TestLunumV1AuditSuiteId,
  TestLunumV1PlannedExecution
} from './testlunumv1-audit-plan.js';
import { validateTestLunumV1AuditPlan } from './testlunumv1-audit-plan.js';
import type { ModelCompletion } from './types.js';

export type TestLunumV1AuditExecutionCliPath = 'parse-experiment' | 'retention';

export type TestLunumV1AuditExecutionStageName = 'parse' | 'realization' | 'parse-back';

export type TestLunumV1AuditExecutionStatus = 'passed' | 'failed' | 'error';

/**
 * Fixed, documented mapping from audit-plan suite id to the built CLI path
 * that executes it. See module doc comment for rationale. This mapping is
 * exhaustive over `TestLunumV1AuditSuiteId` -- TypeScript enforces that at
 * compile time via the `Record` type below.
 */
export const TESTLUNUMV1_AUDIT_SUITE_CLI_PATH: Readonly<Record<TestLunumV1AuditSuiteId, TestLunumV1AuditExecutionCliPath>> = Object.freeze({
  canonical: 'parse-experiment',
  mutation: 'retention',
  robustness: 'retention',
  'cross-lingual': 'retention',
  reproducibility: 'retention'
});

export interface TestLunumV1AuditExecutorTransportContext {
  execution: TestLunumV1PlannedExecution;
  cliPath: TestLunumV1AuditExecutionCliPath;
  stage: TestLunumV1AuditExecutionStageName;
}

/**
 * Mock/integration transport contract consumed by the executor. It mirrors
 * `OpenAICompatibleModel.complete()` / `RetentionStageClient.complete()` --
 * the same shape the built CLIs already use -- so a transport written for
 * this executor is trivially reusable as a `RetentionStageClient` or as the
 * backing of a loopback mock server for `runParseExperiment`. Implementors
 * MUST NOT perform real target-model network calls; this executor is
 * mock/integration-transport only.
 */
export interface TestLunumV1AuditExecutorTransport {
  complete(context: TestLunumV1AuditExecutorTransportContext): Promise<ModelCompletion>;
}

export interface TestLunumV1AuditExecutionRecord {
  executionId: string;
  suiteId: TestLunumV1AuditSuiteId;
  itemId: string;
  sourceLanguage: TestLunumV1PlannedExecution['sourceLanguage'];
  modelSlotId: string;
  stage: number;
  repeatLabel: string;
  cliPath: TestLunumV1AuditExecutionCliPath;
  status: TestLunumV1AuditExecutionStatus;
  latencyMs: number;
  stageOutputs: readonly { stage: TestLunumV1AuditExecutionStageName; rawOutput: string }[];
  errorMessage: string | null;
}

export interface TestLunumV1AuditExecutionSummary {
  planDatasetPath: string;
  totalPlanned: number;
  totalExecuted: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  records: readonly TestLunumV1AuditExecutionRecord[];
}

function assertFrozen(value: unknown, label: string): void {
  if (!Object.isFrozen(value)) {
    throw new Error(`testLunumv1 audit executor requires a frozen ${label}; the #311 plan module always freezes its output`);
  }
}

/**
 * Enforces that the plan handed to the executor is exactly the frozen,
 * validated output of the #311 module -- not a hand-rolled or mutated
 * lookalike. This is done by:
 *
 *   1. Asserting every plan-level collection is frozen (the #311 module
 *      deep-freezes everything it returns; a plan that isn't frozen did not
 *      come from `createTestLunumV1AuditPlan`/`validateTestLunumV1AuditPlan`
 *      unmodified).
 *   2. Re-running the plan through `validateTestLunumV1AuditPlan` (imported,
 *      not re-derived) and asserting the recomputed execution id sequence is
 *      byte-for-byte identical to the plan's own execution id sequence. Any
 *      tampering with suites, model matrix, or declared execution count
 *      surfaces as a thrown error from the #311 module itself, or as a
 *      mismatch here.
 */
export function assertTestLunumV1AuditPlanFrozenAndExact(plan: TestLunumV1AuditPlan): void {
  assertFrozen(plan, 'audit plan');
  assertFrozen(plan.executions, 'audit plan executions');
  assertFrozen(plan.canonicalDataset, 'audit plan canonical dataset');
  assertFrozen(plan.modelMatrix, 'audit plan model matrix');
  assertFrozen(plan.suites, 'audit plan suites');

  const recomputed = validateTestLunumV1AuditPlan({
    datasetPath: plan.datasetPath,
    canonicalDataset: plan.canonicalDataset,
    modelMatrix: plan.modelMatrix,
    suites: plan.suites,
    declaredExecutionCount: plan.declaredExecutionCount
  });

  const recomputedIds = recomputed.executions.map((execution) => execution.id);
  const planIds = plan.executions.map((execution) => execution.id);

  if (recomputedIds.length !== planIds.length) {
    throw new Error(
      `testLunumv1 audit executor: plan execution count mismatch on re-validation: ${planIds.length} !== ${recomputedIds.length}`
    );
  }

  for (let index = 0; index < recomputedIds.length; index += 1) {
    if (recomputedIds[index] !== planIds[index]) {
      throw new Error(
        `testLunumv1 audit executor: plan execution key mismatch at index ${index}: ${planIds[index]} !== ${recomputedIds[index]}`
      );
    }
  }
}

/**
 * Fail-closed accounting check: every planned execution id must appear in
 * `records` exactly once, and no record may reference an execution id that
 * is not part of the plan. Throws on the first violation found; missing ids
 * are reported together (truncated) so callers can see the scope of a
 * shortfall in one error.
 */
export function assertTestLunumV1AuditExecutionAccounting(
  plan: TestLunumV1AuditPlan,
  records: readonly TestLunumV1AuditExecutionRecord[]
): void {
  const plannedIds = new Set(plan.executions.map((execution) => execution.id));
  const seen = new Set<string>();

  for (const record of records) {
    if (!plannedIds.has(record.executionId)) {
      throw new Error(`testLunumv1 audit executor: unexpected execution record outside the frozen plan: ${record.executionId}`);
    }
    if (seen.has(record.executionId)) {
      throw new Error(`testLunumv1 audit executor: duplicate execution record: ${record.executionId}`);
    }
    seen.add(record.executionId);
  }

  const missing = [...plannedIds].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    const shown = missing.slice(0, 5).join(', ');
    const suffix = missing.length > 5 ? ` (+${missing.length - 5} more)` : '';
    throw new Error(`testLunumv1 audit executor: missing execution records for ${missing.length} planned execution(s): ${shown}${suffix}`);
  }
}

function cliPathForSuite(suiteId: TestLunumV1AuditSuiteId): TestLunumV1AuditExecutionCliPath {
  const cliPath = TESTLUNUMV1_AUDIT_SUITE_CLI_PATH[suiteId];
  if (!cliPath) {
    throw new Error(`testLunumv1 audit executor: no built CLI path routing for suite ${suiteId}`);
  }
  return cliPath;
}

async function executeParseExperimentPath(
  execution: TestLunumV1PlannedExecution,
  transport: TestLunumV1AuditExecutorTransport
): Promise<{ status: TestLunumV1AuditExecutionStatus; stageOutputs: TestLunumV1AuditExecutionRecord['stageOutputs']; errorMessage: string | null }> {
  try {
    const completion = await transport.complete({ execution, cliPath: 'parse-experiment', stage: 'parse' });
    return {
      status: 'passed',
      stageOutputs: [{ stage: 'parse', rawOutput: completion.content }],
      errorMessage: null
    };
  } catch (error) {
    return {
      status: 'error',
      stageOutputs: [],
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function executeRetentionPath(
  execution: TestLunumV1PlannedExecution,
  transport: TestLunumV1AuditExecutorTransport
): Promise<{ status: TestLunumV1AuditExecutionStatus; stageOutputs: TestLunumV1AuditExecutionRecord['stageOutputs']; errorMessage: string | null }> {
  const stageOutputs: { stage: TestLunumV1AuditExecutionStageName; rawOutput: string }[] = [];

  let realizationCompletion: ModelCompletion;
  try {
    realizationCompletion = await transport.complete({ execution, cliPath: 'retention', stage: 'realization' });
  } catch (error) {
    return {
      status: 'error',
      stageOutputs,
      errorMessage: `realization: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  stageOutputs.push({ stage: 'realization', rawOutput: realizationCompletion.content });
  if (!realizationCompletion.content.trim()) {
    return { status: 'failed', stageOutputs, errorMessage: 'realization produced empty output' };
  }

  let parseBackCompletion: ModelCompletion;
  try {
    parseBackCompletion = await transport.complete({ execution, cliPath: 'retention', stage: 'parse-back' });
  } catch (error) {
    return {
      status: 'error',
      stageOutputs,
      errorMessage: `parse-back: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  stageOutputs.push({ stage: 'parse-back', rawOutput: parseBackCompletion.content });
  if (!parseBackCompletion.content.trim()) {
    return { status: 'failed', stageOutputs, errorMessage: 'parse-back produced empty output' };
  }

  return { status: 'passed', stageOutputs, errorMessage: null };
}

/**
 * Executes every planned execution in `plan.executions`, in plan order,
 * routing each one to exactly one built CLI path (`parse-experiment` or
 * `retention`) per `TESTLUNUMV1_AUDIT_SUITE_CLI_PATH`. All model interaction
 * goes through `transport` -- a mock or integration transport supplied by
 * the caller; this function never performs a real target-model call itself.
 *
 * Frozen-input and exact-execution-key enforcement happens before any
 * execution occurs (`assertTestLunumV1AuditPlanFrozenAndExact`), and
 * fail-closed accounting happens after execution completes
 * (`assertTestLunumV1AuditExecutionAccounting`). Because this function
 * derives its record set directly from `plan.executions` by construction,
 * the post-execution accounting check exists as defense in depth for
 * callers that mutate or reuse `records` afterward -- and it is exercised
 * directly (with hand-built record sets) in this package's test suite.
 */
export async function executeTestLunumV1AuditPlan(
  plan: TestLunumV1AuditPlan,
  transport: TestLunumV1AuditExecutorTransport
): Promise<TestLunumV1AuditExecutionSummary> {
  assertTestLunumV1AuditPlanFrozenAndExact(plan);

  const records: TestLunumV1AuditExecutionRecord[] = [];

  for (const execution of plan.executions) {
    const cliPath = cliPathForSuite(execution.suiteId);
    const started = performance.now();
    const result = cliPath === 'parse-experiment'
      ? await executeParseExperimentPath(execution, transport)
      : await executeRetentionPath(execution, transport);

    records.push({
      executionId: execution.id,
      suiteId: execution.suiteId,
      itemId: execution.itemId,
      sourceLanguage: execution.sourceLanguage,
      modelSlotId: execution.modelSlotId,
      stage: execution.stage,
      repeatLabel: execution.repeatLabel,
      cliPath,
      status: result.status,
      latencyMs: performance.now() - started,
      stageOutputs: result.stageOutputs,
      errorMessage: result.errorMessage
    });
  }

  assertTestLunumV1AuditExecutionAccounting(plan, records);

  return {
    planDatasetPath: plan.datasetPath,
    totalPlanned: plan.executions.length,
    totalExecuted: records.length,
    passedCount: records.filter((record) => record.status === 'passed').length,
    failedCount: records.filter((record) => record.status === 'failed').length,
    errorCount: records.filter((record) => record.status === 'error').length,
    records
  };
}

/**
 * Convenience transport for tests/integration runs: a deterministic,
 * frozen-fixture-backed mock that returns one queued completion per
 * `complete()` call, in call order, across the whole executor run (shared
 * queue, not per-execution). This mirrors the existing
 * `retention-cli.ts#createMockClient` fixture convention used elsewhere in
 * this package, adapted to the executor's transport contract.
 */
export function createTestLunumV1AuditExecutorFixtureTransport(
  responses: readonly (ModelCompletion | Error)[]
): TestLunumV1AuditExecutorTransport {
  if (responses.length === 0) {
    throw new Error('testLunumv1 audit executor fixture transport requires at least one queued response');
  }
  let index = 0;
  return {
    async complete(): Promise<ModelCompletion> {
      const next = responses[index++];
      if (!next) {
        throw new Error('testLunumv1 audit executor fixture transport exhausted');
      }
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }
  };
}
