/**
 * Failure-path mock-transport tests (#354 R3.5).
 *
 * Deterministic tests, zero live model calls, exercising three failure
 * modes on the retention CLI's real `runRetentionCli` pipeline
 * (`retention-cli.ts`) through an in-test mock `RetentionStageClient`:
 *
 *   (a) request timeout
 *   (b) malformed / non-JSON parse-back output
 *   (c) an HTTP error mid-run (later item in the same run)
 *
 * For each, this asserts:
 *   - correct classification, reusing the SAME infrastructure-vs-genuine-
 *     model-failure taxonomy pattern established for #332 in
 *     `false-positive-review-cli.ts` (see that module's doc comment):
 *     a transport-level throw from `client.complete()` itself (timeout,
 *     HTTP error) is infrastructure and lands as retention stage
 *     `status: 'error'` with `errorClass` from `classifyError()`
 *     ('timeout' / 'http'); a malformed-but-HTTP-200 response is a
 *     genuine per-item model failure and lands as `status: 'failed'`
 *     with `errorClass: 'validation_error'` -- never 'error'.
 *   - NO silent retry: `limits.maxAttemptsPerItem` is 1 in the fixture
 *     manifest (`failure-path-manifest.json`), and this file additionally
 *     counts `client.complete()` invocations per item/stage directly, so a
 *     hidden retry loop would be caught even if the manifest's own limit
 *     were misconfigured.
 *   - NO silent exclusion: every item the run attempted appears in the raw
 *     per-stage JSONL (`raw/realization.jsonl` / `raw/parse-back.jsonl`),
 *     including the ones that errored or failed -- nothing is dropped from
 *     the output.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';

import { runRetentionCli, type RetentionStageClient, type RetentionStageRawRecord } from '../src/retention-cli.js';
import type { CompletionUsage, ModelCompletion } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'failure-path-manifest.json');

type ScriptedResponse =
  | { kind: 'content'; content: string; finishReason?: string | null; usage?: CompletionUsage | null }
  | { kind: 'error'; message: string };

/**
 * A scripted mock transport keyed by (itemId, stage) -- not call order --
 * so tests stay readable regardless of dataset iteration order, plus a
 * call counter per (itemId, stage) to prove no silent retry occurs.
 */
function scriptedClient(script: Map<string, ScriptedResponse>): {
  client: RetentionStageClient;
  callCounts: Map<string, number>;
} {
  const callCounts = new Map<string, number>();

  const client: RetentionStageClient = {
    async complete(system: string, user: string): Promise<ModelCompletion> {
      const parsed = JSON.parse(user) as { id: string };
      const stage = system.includes('Parse the realized text') ? 'parse-back' : 'realization';
      const key = `${parsed.id}:${stage}`;
      callCounts.set(key, (callCounts.get(key) ?? 0) + 1);

      const response = script.get(key);
      if (!response) {
        throw new Error(`unscripted call: ${key}`);
      }
      if (response.kind === 'error') {
        throw new Error(response.message);
      }
      return {
        content: response.content,
        finishReason: response.finishReason ?? 'stop',
        usage: response.usage ?? null
      };
    }
  };

  return { client, callCounts };
}

async function readJsonl<T>(file: string): Promise<T[]> {
  const content = await readFile(file, 'utf8');
  const trimmed = content.trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
}

async function runWithScript(script: Map<string, ScriptedResponse>, label: string) {
  const relativeOutputRoot = path.join('reports', 'retention', `failure-path-${label}-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);
  const { client, callCounts } = scriptedClient(script);

  const { outputDirectory, summary, rawRecords } = await runRetentionCli(MANIFEST_PATH, {
    root: WORKSPACE_ROOT,
    outputRoot: relativeOutputRoot,
    client
  });

  return { outputDirectory, resolvedOutputRoot, summary, rawRecords, callCounts };
}

async function cleanup(resolvedOutputRoot: string) {
  await rm(resolvedOutputRoot, { recursive: true, force: true });
}

// ── (a) request timeout ────────────────────────────────────────────────

test('failure path: request timeout is classified as infrastructure error, not silently retried or excluded', async () => {
  const script = new Map<string, ScriptedResponse>([
    ['failure-path-item-a:realization', { kind: 'error', message: 'Request timeout after 30000ms' }],
    ['failure-path-item-b:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'Ο χρήστης προτιμά σύντομες απαντήσεις.' }) }],
    ['failure-path-item-b:parse-back', { kind: 'content', content: JSON.stringify({ parsedText: 'Ο χρήστης προτιμά σύντομες απαντήσεις.' }) }],
    ['failure-path-item-c:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'El usuario prefiere respuestas concisas.' }) }],
    ['failure-path-item-c:parse-back', { kind: 'content', content: JSON.stringify({ parsedText: 'El usuario prefiere respuestas concisas.' }) }]
  ]);

  const { resolvedOutputRoot, outputDirectory, callCounts } = await runWithScript(script, 'timeout');
  try {
    const realizationRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'realization.jsonl'));
    const parseBackRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'parse-back.jsonl'));

    // Correct classification: infrastructure, not a genuine model failure.
    const itemA = realizationRecords.find((r) => r.itemId === 'failure-path-item-a');
    assert.ok(itemA, 'item A must appear in raw realization output despite the timeout');
    assert.strictEqual(itemA!.status, 'error');
    assert.strictEqual(itemA!.errorClass, 'timeout');
    assert.match(itemA!.errorMessage ?? '', /timeout/u);

    // No silent retry: exactly one attempt was made for item A's realization.
    assert.strictEqual(callCounts.get('failure-path-item-a:realization'), 1);

    // No silent exclusion: all 3 items are attempted and present in the raw
    // output (item A only in realization.jsonl since its realization
    // errored and parse-back is correctly never attempted for it; items B
    // and C complete both stages normally).
    assert.strictEqual(realizationRecords.length, 3);
    assert.deepStrictEqual(
      realizationRecords.map((r) => r.itemId).sort(),
      ['failure-path-item-a', 'failure-path-item-b', 'failure-path-item-c']
    );
    assert.strictEqual(parseBackRecords.length, 2);
    assert.deepStrictEqual(
      parseBackRecords.map((r) => r.itemId).sort(),
      ['failure-path-item-b', 'failure-path-item-c']
    );
    assert.ok(!parseBackRecords.some((r) => r.itemId === 'failure-path-item-a'), 'a failed realization must not fabricate a parse-back attempt');
  } finally {
    await cleanup(resolvedOutputRoot);
  }
});

// ── (b) malformed / non-JSON parse-back output ───────────────────────────

test('failure path: malformed non-JSON parse-back output is a genuine model failure, not infrastructure, and is not silently retried or excluded', async () => {
  const script = new Map<string, ScriptedResponse>([
    ['failure-path-item-a:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'The user prefers concise answers.' }) }],
    // A successful HTTP 200 response whose content is plain prose, not JSON.
    ['failure-path-item-a:parse-back', { kind: 'content', content: 'Sure, here is a rewrite: the user likes short answers.' }],
    ['failure-path-item-b:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'Ο χρήστης προτιμά σύντομες απαντήσεις.' }) }],
    ['failure-path-item-b:parse-back', { kind: 'content', content: JSON.stringify({ parsedText: 'Ο χρήστης προτιμά σύντομες απαντήσεις.' }) }],
    ['failure-path-item-c:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'El usuario prefiere respuestas concisas.' }) }],
    ['failure-path-item-c:parse-back', { kind: 'content', content: JSON.stringify({ parsedText: 'El usuario prefiere respuestas concisas.' }) }]
  ]);

  const { resolvedOutputRoot, outputDirectory, callCounts } = await runWithScript(script, 'malformed');
  try {
    const parseBackRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'parse-back.jsonl'));

    const itemA = parseBackRecords.find((r) => r.itemId === 'failure-path-item-a');
    assert.ok(itemA, 'item A must appear in raw parse-back output despite malformed content');

    // Correct classification: a genuine model failure (schema/validation),
    // NEVER 'error' (infrastructure) -- the HTTP call itself succeeded.
    assert.strictEqual(itemA!.status, 'failed');
    assert.strictEqual(itemA!.errorClass, 'validation_error');
    assert.notStrictEqual(itemA!.status, 'error');

    // The raw, unparseable model output is preserved verbatim, not discarded.
    assert.strictEqual(itemA!.rawOutput, 'Sure, here is a rewrite: the user likes short answers.');
    assert.strictEqual(itemA!.extractedPayload, null);

    // No silent retry: exactly one parse-back attempt for item A.
    assert.strictEqual(callCounts.get('failure-path-item-a:parse-back'), 1);
    assert.strictEqual(callCounts.get('failure-path-item-a:realization'), 1);

    // No silent exclusion: all 3 items completed both stages and are present.
    assert.strictEqual(parseBackRecords.length, 3);
    assert.deepStrictEqual(
      parseBackRecords.map((r) => r.itemId).sort(),
      ['failure-path-item-a', 'failure-path-item-b', 'failure-path-item-c']
    );
  } finally {
    await cleanup(resolvedOutputRoot);
  }
});

// ── (c) HTTP error mid-run ────────────────────────────────────────────────

test('failure path: an HTTP error mid-run is classified as infrastructure, does not abort later items, and is not silently retried or excluded', async () => {
  const script = new Map<string, ScriptedResponse>([
    ['failure-path-item-a:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'The user prefers concise answers.' }) }],
    ['failure-path-item-a:parse-back', { kind: 'content', content: JSON.stringify({ parsedText: 'The user prefers concise answers.' }) }],
    // Item B's realization fails with a transport-level HTTP error mid-run.
    ['failure-path-item-b:realization', { kind: 'error', message: 'HTTP 500 Internal Server Error' }],
    ['failure-path-item-c:realization', { kind: 'content', content: JSON.stringify({ realizedText: 'El usuario prefiere respuestas concisas.' }) }],
    ['failure-path-item-c:parse-back', { kind: 'content', content: JSON.stringify({ parsedText: 'El usuario prefiere respuestas concisas.' }) }]
  ]);

  const { resolvedOutputRoot, outputDirectory, summary, callCounts } = await runWithScript(script, 'http-mid-run');
  try {
    const realizationRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'realization.jsonl'));
    const parseBackRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'parse-back.jsonl'));

    const itemB = realizationRecords.find((r) => r.itemId === 'failure-path-item-b');
    assert.ok(itemB, 'item B must appear in raw realization output despite the HTTP error');
    assert.strictEqual(itemB!.status, 'error');
    assert.strictEqual(itemB!.errorClass, 'http');
    assert.match(itemB!.errorMessage ?? '', /HTTP 500/u);

    // The run did not abort: item C (attempted after the failing item B)
    // still completed both stages normally.
    const itemC = parseBackRecords.find((r) => r.itemId === 'failure-path-item-c');
    assert.ok(itemC, 'item C, attempted after the mid-run failure, must still complete');
    assert.strictEqual(itemC!.status, 'passed');

    // No silent retry on the failing item.
    assert.strictEqual(callCounts.get('failure-path-item-b:realization'), 1);
    assert.strictEqual(callCounts.get('failure-path-item-b:parse-back'), undefined, 'a failed realization must not fabricate a parse-back attempt');

    // No silent exclusion: every attempted item appears in raw output
    // regardless of outcome, and the summary's error taxonomy accounts for
    // the failure rather than hiding it.
    assert.strictEqual(realizationRecords.length, 3);
    assert.deepStrictEqual(
      realizationRecords.map((r) => r.itemId).sort(),
      ['failure-path-item-a', 'failure-path-item-b', 'failure-path-item-c']
    );
    assert.strictEqual(parseBackRecords.length, 2);
    assert.strictEqual(summary.errorTaxonomy.http, 1);
    assert.strictEqual(summary.errorItems, 1);
    assert.strictEqual(summary.passedItems, 2);
  } finally {
    await cleanup(resolvedOutputRoot);
  }
});
