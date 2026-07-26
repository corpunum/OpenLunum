/**
 * Nested retention record fixtures (#354 R3.2).
 *
 * The frozen `datasets/dev/multilingual-core-v1.jsonl` corpus (see #325/#332
 * history) is single-clause per item and MUST NOT be modified -- it is
 * referenced by committed manifests with pinned SHA-256 hashes across
 * several closed issues. These fixtures are test-only additions that
 * exercise the SAME retention manifest/CLI schema with structurally richer
 * records: nested `conditions`/`consequences` two levels deep, multiple
 * roles per clause, and a `time` field, in the same four languages
 * (EN/EL/ES/ID) as the core corpus.
 *
 * Location rationale: `packages/eval/test-fixtures/retention/` already
 * holds the retention CLI's own mock dataset/manifest/mock-response
 * fixtures (`coverage-dataset.json`, `coverage-manifest.json`,
 * `mock-responses.json`; see `retention-cli.test.ts` /
 * `retention-manifest.test.ts`). These nested records are the same kind of
 * artifact -- pipeline test fixtures, not additions to a frozen held-out
 * evaluation corpus -- so they follow that existing convention rather than
 * `datasets/dev/` (which #353 uses for genuinely new HELD-OUT corpus
 * items with their own provenance manifest for live parse evaluation, a
 * different purpose from these mock-transport pipeline tests).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';

import { readJson, sha256File } from '../src/io.js';
import { planRetentionExecution, validateRetentionManifest, type RetentionCoverageManifest } from '../src/retention-manifest.js';
import { runRetentionCli, type RetentionStageRawRecord } from '../src/retention-cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'retention');

interface NestedDatasetItem {
  id: string;
  semanticGroup: string;
  sourceLanguage: string;
  sourceText: string;
  goldSem: {
    clauses: Array<{
      predicate: string;
      roles: Record<string, unknown>;
      conditions?: unknown[];
      consequences?: unknown[];
      time?: unknown;
    }>;
  };
  protectedLiterals: string[];
  tags: string[];
}

function readJsonl<T>(file: string): Promise<T[]> {
  return readFile(file, 'utf8').then((content) => {
    const trimmed = content.trim();
    if (!trimmed) return [];
    return trimmed.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
  });
}

function clauseDepth(clause: { conditions?: unknown[]; consequences?: unknown[] }): number {
  const nested = [...(clause.conditions ?? []), ...(clause.consequences ?? [])] as Array<{
    conditions?: unknown[];
    consequences?: unknown[];
  }>;
  if (nested.length === 0) return 1;
  return 1 + Math.max(...nested.map((child) => clauseDepth(child)));
}

test('nested retention dataset SHA-256 matches the committed coverage manifest', async () => {
  const manifest = await readJson<RetentionCoverageManifest>(path.join(FIXTURE_ROOT, 'nested-coverage-manifest.json'));
  const actualHash = await sha256File(path.join(WORKSPACE_ROOT, manifest.dataset.path));
  assert.strictEqual(actualHash, manifest.dataset.sha256);
});

test('nested retention dataset validates against the real retention-manifest schema', async () => {
  const manifest = await readJson<RetentionCoverageManifest>(path.join(FIXTURE_ROOT, 'nested-coverage-manifest.json'));
  const dataset = await readJson<NestedDatasetItem[]>(path.join(FIXTURE_ROOT, 'nested-dataset.json'));

  const validated = validateRetentionManifest(manifest);
  const plan = planRetentionExecution(validated, dataset as any);

  assert.strictEqual(plan.plannedItemIds.length, 8);
  assert.strictEqual(plan.realizationCalls, 8);
  assert.strictEqual(plan.parseBackCalls, 8);
  assert.strictEqual(plan.totalModelCalls, 16);
});

test('nested retention fixture items cover all four languages for both semantic groups, no gaps or dupes', async () => {
  const dataset = await readJson<NestedDatasetItem[]>(path.join(FIXTURE_ROOT, 'nested-dataset.json'));

  const languages = ['en', 'el', 'es', 'id'];
  const groups = ['nested-deadline-escalation', 'nested-funds-approval'];

  const seen = new Set<string>();
  for (const item of dataset) {
    const key = `${item.semanticGroup}:${item.sourceLanguage}`;
    assert.ok(!seen.has(key), `duplicate coverage cell: ${key}`);
    seen.add(key);
  }

  for (const group of groups) {
    for (const language of languages) {
      assert.ok(seen.has(`${group}:${language}`), `missing coverage cell: ${group}:${language}`);
    }
  }

  assert.strictEqual(dataset.length, groups.length * languages.length);
});

test('nested retention fixture items are at least 2 levels deep, carry multiple roles per clause and a time field', async () => {
  const dataset = await readJson<NestedDatasetItem[]>(path.join(FIXTURE_ROOT, 'nested-dataset.json'));

  for (const item of dataset) {
    for (const clause of item.goldSem.clauses) {
      assert.ok(clauseDepth(clause) >= 3, `${item.id}: expected nesting depth >= 3 (root + 2 nested levels), got ${clauseDepth(clause)}`);
      assert.ok(Object.keys(clause.roles).length >= 2, `${item.id}: expected multiple roles on the root clause`);
    }
  }

  // At least one item's nesting carries a `time` field at a non-root level,
  // proving `time` survives inside `conditions`/`consequences`, not just at
  // the top clause.
  const hasNestedTime = dataset.some((item) =>
    item.goldSem.clauses.some((clause) => {
      const nested = [...(clause.conditions ?? []), ...(clause.consequences ?? [])] as Array<{ time?: unknown; conditions?: unknown[] }>;
      return nested.some((child) => child.time !== undefined) || nested.some((child) =>
        ((child.conditions ?? []) as Array<{ time?: unknown }>).some((grandchild) => grandchild.time !== undefined)
      );
    })
  );
  assert.ok(hasNestedTime, 'expected at least one item with a time field at a nested level');
});

test('nested retention fixtures round-trip cleanly end-to-end through the real CLI with a mock transport', async () => {
  const relativeOutputRoot = path.join('reports', 'retention', `nested-mock-cli-${Date.now()}`);
  const resolvedOutputRoot = path.join(WORKSPACE_ROOT, relativeOutputRoot);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-retention-nested-'));

  try {
    const { outputDirectory, summary } = await runRetentionCli(
      path.join(FIXTURE_ROOT, 'nested-coverage-manifest.json'),
      {
        root: WORKSPACE_ROOT,
        outputRoot: relativeOutputRoot,
        mockFixturePath: path.relative(WORKSPACE_ROOT, path.join(FIXTURE_ROOT, 'nested-mock-responses.json'))
      }
    );

    assert.ok(outputDirectory.startsWith(resolvedOutputRoot));
    assert.strictEqual(summary.itemCount, 8);
    assert.strictEqual(summary.passedItems, 8);
    assert.strictEqual(summary.failedItems, 0);
    assert.strictEqual(summary.errorItems, 0);

    const realizationRecords = await readJsonl<RetentionStageRawRecord>(path.join(outputDirectory, 'raw', 'realization.jsonl'));
    assert.strictEqual(realizationRecords.length, 8);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(resolvedOutputRoot, { recursive: true, force: true });
  }
});
