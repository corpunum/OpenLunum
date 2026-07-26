/**
 * Repeated realize/parse-back pass plan (#354 R3.3).
 *
 * Investigates whether `openlunum-retention-manifest/0.1` (retention-manifest.ts)
 * and `runRetentionCli` (retention-cli.ts) support CHAINING two full round
 * trips (realize -> parse-back -> realize-again -> re-parse-back) on the
 * same items, where the second pass's input is the first pass's actual
 * output.
 *
 * Finding: they do not. `limits.maxAttemptsPerItem` is a same-input RETRY
 * loop (`runRetentionCli`'s attempt loop always re-reads
 * `item.sourceText` from the manifest's static dataset; it breaks on the
 * first passed attempt and never feeds a prior attempt's `parsedText`
 * forward). There is no manifest field or runtime hook that lets pass N+1
 * consume pass N's output. This is a genuine code gap, not something
 * expressible via existing schema options -- see the `chainingGapNote` in
 * `../test-fixtures/retention/repeated-pass-plan.json` for exactly what a
 * future implementation would need (a `pass` dimension on
 * `RetentionStageRawRecord` distinct from `attempt`, a manifest-level pass
 * count, and feed-forward logic deriving each pass's input from the prior
 * pass's `parsedText`). Per this issue's constraints, that runtime chaining
 * is NOT implemented here.
 *
 * What IS authored and validated here: a two-pass PLAN document
 * (`openlunum-retention-repeated-pass-plan/0.1`, a distinct, non-executable
 * wrapper schema -- deliberately NOT registered with `validateRetentionManifest`
 * so nothing could mistake it for a runnable manifest) containing two
 * embedded, independently schema-valid `openlunum-retention-manifest/0.1`
 * documents, one per pass, over the SAME nested items authored for R3.2.
 * Both embedded manifests validate and plan cleanly through the REAL
 * `validateRetentionManifest` / `planRetentionExecution` functions -- no new
 * validation code was written for this test. Pass 2's `dataset` currently
 * points at the same static pass-1 input (a schema-valid placeholder) and
 * is explicitly documented as such: real second-pass drift measurement
 * requires regenerating pass 2's dataset from pass 1's actual raw output,
 * which needs a live run and is out of scope for this issue (zero live
 * model calls; live execution is a separate follow-up per the issue body).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';

import { readJson } from '../src/io.js';
import { planRetentionExecution, validateRetentionManifest, type RetentionCoverageManifest } from '../src/retention-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');

interface RepeatedPassPlan {
  schema: string;
  id: string;
  totalPasses: number;
  chainingAutomated: boolean;
  chainingGapNote: string;
  passes: Array<{
    passNumber: number;
    inputSource: string;
    manifest: RetentionCoverageManifest;
  }>;
}

test('repeated-pass plan is authored with exactly 2 passes and documents that chaining is not automated', async () => {
  const plan = await readJson<RepeatedPassPlan>(path.join(FIXTURE_ROOT, 'repeated-pass-plan.json'));

  assert.strictEqual(plan.schema, 'openlunum-retention-repeated-pass-plan/0.1');
  assert.strictEqual(plan.totalPasses, 2);
  assert.strictEqual(plan.passes.length, 2);
  assert.strictEqual(plan.chainingAutomated, false);
  assert.match(plan.chainingGapNote, /pass.*field/iu);
  assert.match(plan.chainingGapNote, /RetentionStageRawRecord/u);
});

test('each embedded pass manifest independently validates against the real retention-manifest schema', async () => {
  const plan = await readJson<RepeatedPassPlan>(path.join(FIXTURE_ROOT, 'repeated-pass-plan.json'));
  const dataset = await readJson<Array<{ id: string }>>(path.join(FIXTURE_ROOT, 'nested-dataset.json'));

  for (const pass of plan.passes) {
    const validated = validateRetentionManifest(pass.manifest);
    const executionPlan = planRetentionExecution(validated, dataset as any);
    assert.strictEqual(executionPlan.plannedItemIds.length, 8, `pass ${pass.passNumber} should plan all 8 nested items`);
    assert.strictEqual(executionPlan.totalModelCalls, 16, `pass ${pass.passNumber} should plan 16 model calls (8 items x 2 stages)`);
  }
});

test('both passes target the identical item-id set, matching what R3.3 requires ("on the same items")', async () => {
  const plan = await readJson<RepeatedPassPlan>(path.join(FIXTURE_ROOT, 'repeated-pass-plan.json'));

  const [pass1, pass2] = plan.passes;
  assert.deepStrictEqual(pass1!.manifest.expectedItemIds, pass2!.manifest.expectedItemIds);
});

test('pass 2 input source is explicitly documented as a placeholder pending pass-1 output regeneration', async () => {
  const plan = await readJson<RepeatedPassPlan>(path.join(FIXTURE_ROOT, 'repeated-pass-plan.json'));
  const pass2 = plan.passes.find((p) => p.passNumber === 2);

  assert.ok(pass2, 'expected a pass 2 entry');
  assert.match(pass2!.inputSource, /PLACEHOLDER/u);
  assert.match(pass2!.inputSource, /regenerated from pass 1/u);
});
