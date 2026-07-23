import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';

import { planRetentionExecution, validateRetentionManifest } from '../src/retention-manifest.js';
import {
  recomputeRetentionSummary,
  runRetentionCli,
  type RetentionStageClient,
  type RetentionStageRawRecord
} from '../src/retention-cli.js';
import type { CompletionUsage, ModelCompletion } from '../src/types.js';
import { readJson } from '../src/io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');

type CompletionQueueItem = {
  content: string;
  finishReason: string | null;
  usage: CompletionUsage | null;
};

function mockClient(queue: Array<CompletionQueueItem | Error>): RetentionStageClient {
  let index = 0;
  return {
    async complete(): Promise<ModelCompletion> {
      const next = queue[index++];
      if (!next) throw new Error('mock client exhausted');
      if (next instanceof Error) throw next;
      return {
        content: next.content,
        finishReason: next.finishReason,
        usage: next.usage
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

  try {
    const manifestPath = path.join(FIXTURE_ROOT, 'coverage-manifest.json');
    const client = mockClient([
      {
        content: JSON.stringify({ realizedText: 'The user prefers concise answers.' }),
        finishReason: null,
        usage: null
      },
      {
        content: JSON.stringify({ parsedText: 'The user prefers concise answers.' }),
        finishReason: 'stop',
        usage: {
          promptTokens: 9,
          completionTokens: 3,
          totalTokens: 12,
          cachedTokens: 0,
          reasoningTokens: 0
        }
      },
      {
        content: 'Faithful rewrite for item b',
        finishReason: 'stop',
        usage: {
          promptTokens: 7,
          completionTokens: 2,
          totalTokens: 9,
          cachedTokens: 0,
          reasoningTokens: 0
        }
      },
      {
        content: JSON.stringify({ parsedText: 'Faithful rewrite for item b' }),
        finishReason: 'stop',
        usage: {
          promptTokens: 8,
          completionTokens: 2,
          totalTokens: 10,
          cachedTokens: 0,
          reasoningTokens: 0
        }
      },
      {
        content: 'Faithful rewrite for item c',
        finishReason: null,
        usage: null
      },
      new Error('HTTP 503 upstream'),
      new Error('HTTP 503 upstream')
    ]);

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
