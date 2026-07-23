import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';

import { planRetentionExecution, validateRetentionManifest } from '../src/retention-manifest.js';
import {
  recomputeRetentionSummary,
  runRetentionCli,
  type RetentionCliSummary,
  type RetentionStageClient,
  type RetentionStageRawRecord
} from '../src/retention-cli.js';
import type { CompletionUsage, ModelCompletion } from '../src/types.js';
import { readJson } from '../src/io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');
const BUILT_CLI = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'dist', 'src', 'cli.js');

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

test('retention CLI planner validates the committed coverage manifest', async () => {
  const manifest = await readJson<any>(path.join(FIXTURE_ROOT, 'coverage-manifest.json'));
  const dataset = await readJson<Array<{ id: string }>>(path.join(FIXTURE_ROOT, 'coverage-dataset.json'));

  const validated = validateRetentionManifest(manifest);
  const plan = planRetentionExecution(validated, dataset as any);

  assert.deepStrictEqual(plan.plannedItemIds, ['retention-item-a', 'retention-item-b', 'retention-item-c']);
  assert.strictEqual(plan.realizationCalls, 6);
  assert.strictEqual(plan.parseBackCalls, 6);
  assert.strictEqual(plan.totalModelCalls, 12);
});

test('retention CLI writes raw stage JSONL and recomputes aggregates from it', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-retention-cli-'));
  const relativeOutputRoot = path.join('reports', 'retention', `mock-cli-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);
  const mockFixture = await readJson<CompletionQueueItem[]>(path.join(FIXTURE_ROOT, 'mock-responses.json'));

  try {
    const manifestPath = path.join(FIXTURE_ROOT, 'coverage-manifest.json');
    const client = mockClient(mockFixture);

    const { outputDirectory, summary } = await runRetentionCli(manifestPath, {
      root: WORKSPACE_ROOT,
      outputRoot: relativeOutputRoot,
      client
    });

    assert.ok(outputDirectory.startsWith(resolvedOutputRoot), 'output directory must stay within the requested root');

    const realizationRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'realization.jsonl'));
    const parseBackRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'parse-back.jsonl'));
    const allRecords = [...realizationRecords, ...parseBackRecords];
    assert.strictEqual(realizationRecords.length, 4);
    assert.strictEqual(parseBackRecords.length, 3);

    const recomputed = recomputeRetentionSummary(allRecords, {
      runId: summary.runId,
      manifestId: summary.manifestId,
      baselineCommit: summary.baselineCommit,
      datasetSha256: summary.datasetSha256,
      plannedItemCount: summary.plannedItemCount,
      realizationCalls: summary.realizationCalls,
      parseBackCalls: summary.parseBackCalls,
      totalModelCalls: summary.totalModelCalls
    });

    assert.deepStrictEqual({ ...recomputed, generatedAt: summary.generatedAt }, summary);
    assert.strictEqual(summary.itemCount, 3);
    assert.strictEqual(summary.passedItems, 2);
    assert.strictEqual(summary.failedItems, 0);
    assert.strictEqual(summary.errorItems, 1);
    assert.strictEqual(summary.errorTaxonomy.http, 2);
    assert.strictEqual(summary.unavailableFields.finishReason, 4);
    assert.strictEqual(summary.unavailableFields.usage, 4);
    assert.ok(summary.realizationLatencyMs.count > 0);
    assert.ok(summary.parseBackLatencyMs.count > 0);
    assert.ok(summary.itemLatencyMs.p50Ms >= 0);
    assert.ok(summary.itemLatencyMs.p95Ms >= summary.itemLatencyMs.p50Ms);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});

test('retention CLI command path uses the committed mock fixture without a live profile', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-retention-cli-cmd-'));
  const relativeOutputRoot = path.join('reports', 'retention', `mock-cli-cmd-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);
  const manifestPath = path.join(FIXTURE_ROOT, 'coverage-manifest.json');
  const mockFixturePath = path.join(FIXTURE_ROOT, 'mock-responses.json');

  try {
    const result = spawnSync(process.execPath, [
      BUILT_CLI,
      'retention',
      '--manifest',
      manifestPath,
      '--mock-fixture',
      mockFixturePath,
      '--output-root',
      relativeOutputRoot
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as {
      outputDirectory: string;
      summary: RetentionCliSummary;
    };

    assert.ok(parsed.outputDirectory.startsWith(resolvedOutputRoot), 'output directory must stay within the requested root');

    const realizationRecords = await readJsonl<RetentionStageRawRecord>(path.join(parsed.outputDirectory, 'raw', 'realization.jsonl'));
    const parseBackRecords = await readJsonl<RetentionStageRawRecord>(path.join(parsed.outputDirectory, 'raw', 'parse-back.jsonl'));
    const allRecords = [...realizationRecords, ...parseBackRecords];
    assert.strictEqual(realizationRecords.length, 4);
    assert.strictEqual(parseBackRecords.length, 3);

    const recomputed = recomputeRetentionSummary(allRecords, {
      runId: parsed.summary.runId,
      manifestId: parsed.summary.manifestId,
      baselineCommit: parsed.summary.baselineCommit,
      datasetSha256: parsed.summary.datasetSha256,
      plannedItemCount: parsed.summary.plannedItemCount,
      realizationCalls: parsed.summary.realizationCalls,
      parseBackCalls: parsed.summary.parseBackCalls,
      totalModelCalls: parsed.summary.totalModelCalls
    });

    assert.deepStrictEqual({ ...recomputed, generatedAt: parsed.summary.generatedAt }, parsed.summary);
    assert.strictEqual(parsed.summary.itemCount, 3);
    assert.strictEqual(parsed.summary.passedItems, 2);
    assert.strictEqual(parsed.summary.failedItems, 0);
    assert.strictEqual(parsed.summary.errorItems, 1);
    assert.strictEqual(parsed.summary.errorTaxonomy.http, 2);
    assert.strictEqual(parsed.summary.unavailableFields.finishReason, 4);
    assert.strictEqual(parsed.summary.unavailableFields.usage, 4);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});

test('retention CLI command path still requires an explicit live profile without the mock fixture', async () => {
  const result = spawnSync(process.execPath, [
    BUILT_CLI,
    'retention',
    '--manifest',
    path.join(FIXTURE_ROOT, 'coverage-manifest.json')
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --profile <model-profile>/u);
});

test('retention CLI rejects output roots that escape the workspace', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-retention-cli-root-'));
  try {
    const client = mockClient([]);
    await assert.rejects(
      () => runRetentionCli(path.join(FIXTURE_ROOT, 'coverage-manifest.json'), {
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
