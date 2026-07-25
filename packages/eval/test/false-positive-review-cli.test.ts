import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';

import {
  FalsePositiveReviewInfrastructureError,
  recomputeFalsePositiveReviewSummary,
  runFalsePositiveReviewCli,
  type FalsePositiveReviewClient,
  type FalsePositiveReviewRawRecord,
  type FalsePositiveReviewSummary
} from '../src/false-positive-review-cli.js';
import type { CompletionUsage, ModelCompletion } from '../src/types.js';
import { readJson } from '../src/io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'false-positive-review');
const BUILT_CLI = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'dist', 'src', 'cli.js');

type CompletionQueueItem = {
  content?: string;
  finishReason?: string | null;
  usage?: CompletionUsage | null;
  error?: string;
};

function mockClient(queue: Array<CompletionQueueItem | Error>): FalsePositiveReviewClient {
  let index = 0;
  return {
    async complete(): Promise<ModelCompletion> {
      const next = queue[index++];
      if (!next) throw new Error('mock client exhausted');
      if (next instanceof Error) throw next;
      if (typeof next.error === 'string' && next.error.trim()) {
        throw new Error(next.error);
      }
      if (typeof next.content !== 'string') {
        throw new Error(`mock client item ${index} must provide content or error`);
      }
      return {
        content: next.content,
        finishReason: next.finishReason ?? null,
        usage: next.usage ?? null
      };
    }
  };
}

function readJsonl<T>(file: string): Promise<T[]> {
  return readFile(file, 'utf8').then((content) => {
    const trimmed = content.trim();
    if (!trimmed) return [];
    return trimmed.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
  });
}

test('false-positive review CLI writes raw per-item JSONL and recomputes a report matching a hand-verified outcome mix', async () => {
  const relativeOutputRoot = path.join('reports', 'evaluations', 'false-positive-review', `mock-cli-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);
  const mockFixture = await readJson<CompletionQueueItem[]>(path.join(FIXTURE_ROOT, 'mock-responses.json'));

  try {
    const manifestPath = path.join(FIXTURE_ROOT, 'review-manifest.json');
    const client = mockClient(mockFixture);

    const { outputDirectory, summary, rawRecords } = await runFalsePositiveReviewCli(manifestPath, {
      root: WORKSPACE_ROOT,
      outputRoot: relativeOutputRoot,
      client
    });

    assert.ok(outputDirectory.startsWith(resolvedOutputRoot), 'output directory must stay within the requested root');

    const records = await readJsonl<FalsePositiveReviewRawRecord>(path.join(outputDirectory, 'raw', 'items.jsonl'));
    assert.strictEqual(records.length, 4);
    assert.deepStrictEqual(records.map((r) => r.itemId), ['fp-correct-en', 'fp-false-positive-en', 'fp-role-both-en', 'fp-invalid-output-en']);
    assert.deepStrictEqual(records.map((r) => r.status), ['passed', 'passed', 'passed', 'failed']);
    assert.deepStrictEqual(records.map((r) => r.outcome), ['correct', 'false_positive', 'correct', null]);

    // fp-correct-en: model correctly detected the negation. Matches its OWN
    // gold, not the source's -- the scorer correctly tracked the change.
    const correct = records[0]!;
    assert.strictEqual(correct.falsePositive, false);
    assert.strictEqual(correct.ownGoldMatched, true);
    assert.strictEqual(correct.sourceMatch?.exact, false);
    assert.strictEqual(correct.ownMatch?.exact, true);

    // fp-false-positive-en: model failed to detect the modality mutation and
    // reproduced the source's unconditional-instruction meaning exactly.
    // This is the defining false positive this runner exists to catch.
    const falsePositive = records[1]!;
    assert.strictEqual(falsePositive.falsePositive, true);
    assert.strictEqual(falsePositive.ownGoldMatched, false);
    assert.strictEqual(falsePositive.sourceMatch?.exact, true);

    // fp-role-both-en: the role-swap mutation's own gold used to ALSO
    // register as a near-semantic match against the source gold under the
    // 0.8 threshold, because the near-semantic scorer's role-filler
    // features were not bound to their clause (issue #346) -- verified
    // against the real #328 corpus item this fixture is copied from:
    // role-delete-en/delete-en scored 1.0 near-similarity despite the
    // swapped agent/confirmer roles. With #346's clause-context binding,
    // that near-semantic collision is gone (source exact match is already
    // false via the path-aware exact fingerprint), so the model correctly
    // parsing the swap now correctly registers as `correct`, not a false
    // positive.
    const both = records[2]!;
    assert.strictEqual(both.falsePositive, false);
    assert.strictEqual(both.ownGoldMatched, true);
    assert.strictEqual(both.ownMatch?.exact, true);
    assert.strictEqual(both.sourceMatch?.exact, false);
    assert.strictEqual(both.sourceMatch?.nearSemanticOnly, false);

    // fp-invalid-output-en: model produced no JSON object at all -- a
    // genuine model failure, not infrastructure. Does not abort the run.
    const invalid = records[3]!;
    assert.strictEqual(invalid.status, 'failed');
    assert.strictEqual(invalid.errorClass, 'no_json_in_output');
    assert.strictEqual(invalid.sourceMatch, null);
    assert.strictEqual(invalid.ownMatch, null);

    const recomputed = recomputeFalsePositiveReviewSummary(rawRecords, {
      runId: summary.runId,
      manifestId: summary.manifestId,
      baselineCommit: summary.baselineCommit,
      mutationDatasetSha256: summary.mutationDatasetSha256,
      sourceDatasetSha256: summary.sourceDatasetSha256,
      systemPromptSha256: summary.systemPromptSha256,
      plannedItemCount: summary.plannedItemCount,
      parseCalls: summary.parseCalls,
      totalModelCalls: summary.totalModelCalls
    });
    assert.deepStrictEqual({ ...recomputed, generatedAt: summary.generatedAt }, summary);

    assert.strictEqual(summary.itemCount, 4);
    assert.strictEqual(summary.parsedItems, 3);
    assert.strictEqual(summary.invalidItems, 1);
    assert.strictEqual(summary.falsePositiveCount, 1);
    assert.strictEqual(summary.falsePositiveRate, 1 / 3);
    assert.strictEqual(summary.ownGoldMatchedCount, 2);
    assert.strictEqual(summary.ownGoldMatchRate, 2 / 3);
    assert.deepStrictEqual(summary.outcomeCounts, {
      correct: 2,
      false_positive: 1,
      false_positive_and_own_matched: 0,
      lost: 0
    });

    assert.strictEqual(summary.byMutationType.length, 4);
    for (const category of ['extra-clause', 'modality', 'negation', 'role']) {
      const row = summary.byMutationType.find((r) => r.key === category);
      assert.ok(row, `missing mutation-category breakdown for ${category}`);
      assert.strictEqual(row!.totalItems, 1);
    }

    assert.strictEqual(summary.byLanguage.length, 1);
    assert.strictEqual(summary.byLanguage[0]!.key, 'en');
    assert.strictEqual(summary.byLanguage[0]!.totalItems, 4);
    assert.strictEqual(summary.byLanguage[0]!.parsedItems, 3);
    assert.strictEqual(summary.byLanguage[0]!.falsePositiveCount, 1);

    assert.ok(summary.latencyMs.count === 4);

    const reportMarkdown = await readFile(path.join(outputDirectory, 'report.md'), 'utf8');
    assert.match(reportMarkdown, /False-positive rate/u);
    assert.match(reportMarkdown, /By mutation category/u);
    assert.match(reportMarkdown, /By language/u);
  } finally {
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});

test('false-positive review CLI command path uses the committed mock fixture without a live profile', async () => {
  const relativeOutputRoot = path.join('reports', 'evaluations', 'false-positive-review', `mock-cli-cmd-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);
  const manifestPath = path.join(FIXTURE_ROOT, 'review-manifest.json');
  const mockFixturePath = path.join(FIXTURE_ROOT, 'mock-responses.json');

  try {
    const result = spawnSync(process.execPath, [
      BUILT_CLI,
      'false-positive-review',
      '--manifest',
      manifestPath,
      '--mock-fixture',
      mockFixturePath,
      '--output-root',
      relativeOutputRoot
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as { outputDirectory: string; summary: FalsePositiveReviewSummary };

    assert.ok(parsed.outputDirectory.startsWith(resolvedOutputRoot));
    const records = await readJsonl<FalsePositiveReviewRawRecord>(path.join(parsed.outputDirectory, 'raw', 'items.jsonl'));
    assert.strictEqual(records.length, 4);
    assert.strictEqual(parsed.summary.parsedItems, 3);
    assert.strictEqual(parsed.summary.falsePositiveCount, 1);
  } finally {
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});

test('false-positive review CLI command path still requires an explicit live profile without the mock fixture', async () => {
  const result = spawnSync(process.execPath, [
    BUILT_CLI,
    'false-positive-review',
    '--manifest',
    path.join(FIXTURE_ROOT, 'review-manifest.json')
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --profile <model-profile>/u);
});

test('false-positive review CLI rejects output roots that escape the workspace', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-fpr-cli-root-'));
  try {
    const client = mockClient([]);
    await assert.rejects(
      () => runFalsePositiveReviewCli(path.join(FIXTURE_ROOT, 'review-manifest.json'), {
        root: WORKSPACE_ROOT,
        outputRoot: path.join(temp, '..', 'escape'),
        client
      }),
      /must stay within/
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('false-positive review: an infrastructure failure invalidates the whole run instead of dropping the item', async () => {
  const relativeOutputRoot = path.join('reports', 'evaluations', 'false-positive-review', `mock-cli-infra-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);

  try {
    const client = mockClient([
      { error: 'Model call failed: HTTP 500 slot busy: no available slot' }
    ]);

    await assert.rejects(
      () => runFalsePositiveReviewCli(path.join(FIXTURE_ROOT, 'review-manifest.json'), {
        root: WORKSPACE_ROOT,
        outputRoot: relativeOutputRoot,
        client
      }),
      (error: unknown) => {
        assert.ok(error instanceof FalsePositiveReviewInfrastructureError);
        assert.match(error.message, /infrastructure failure/u);
        assert.match(error.message, /INVALID/u);
        return true;
      }
    );

    // The run directory is created, and a single diagnostic raw record is
    // written for the aborted attempt -- but NO summary.json or report.md,
    // because the run as a whole is invalid and must not be mistaken for
    // completed evidence.
    const runDirs = await import('node:fs/promises').then(({ readdir }) => readdir(resolvedOutputRoot));
    assert.strictEqual(runDirs.length, 1);
    const outputDirectory = path.join(resolvedOutputRoot, runDirs[0]!);

    const records = await readJsonl<FalsePositiveReviewRawRecord>(path.join(outputDirectory, 'raw', 'items.jsonl'));
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0]!.itemId, 'fp-correct-en');
    assert.strictEqual(records[0]!.status, 'failed');
    assert.match(records[0]!.errorClass ?? '', /^infrastructure:/u);

    await assert.rejects(() => readJson(path.join(outputDirectory, 'summary.json')));
    await assert.rejects(() => readFile(path.join(outputDirectory, 'report.md'), 'utf8'));
  } finally {
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});
