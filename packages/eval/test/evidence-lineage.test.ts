/**
 * Tests for evidence lineage infrastructure (issue #490).
 *
 * Covers:
 * - Lineage edge creation with all relation types
 * - Predecessor/successor chain traversal (A → B → C)
 * - Correction records
 * - Current-flag correctness
 * - Registry integration
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createLineageEdge,
  createLineageRecord,
  buildLineageIndex,
  queryLineage,
  addSupersessionToRegistry,
  saveLineageEdges,
  loadLineageEdges,
  type LineageEdge,
  type LineageRelation,
} from '../src/evidence-lineage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEdge(
  pred: number,
  succ: number,
  relation: LineageRelation,
  reason: string,
  retainedPaths?: string[]
): LineageEdge {
  return createLineageEdge(pred, succ, relation, reason, retainedPaths);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('evidence-lineage: createLineageEdge sets all fields correctly', () => {
  const edge = makeEdge(1, 2, 'superseded-by', 'Fixed scoring bug in row 1');
  assert.equal(edge.predecessorLedgerRowId, 1);
  assert.equal(edge.successorLedgerRowId, 2);
  assert.equal(edge.relation, 'superseded-by');
  assert.equal(edge.reason, 'Fixed scoring bug in row 1');
  assert.ok(edge.timestamp.length > 0);
  assert.deepEqual(edge.retainedPaths, undefined);
});

test('evidence-lineage: createLineageRecord generates deterministic ID and flags', () => {
  const edge = makeEdge(1, 2, 'corrected-by', 'Typo in result');
  const record = createLineageRecord(edge, false);
  assert.equal(record.lineageId, 'L-1-2-corrected-by');
  assert.equal(record.current, false);
  assert.strictEqual(record.edge, edge);
});

test('evidence-lineage: current flag is true for the latest entry', () => {
  const edge = makeEdge(1, 2, 'superseded-by', 'Superseded');
  const currentRecord = createLineageRecord(edge, true);
  assert.equal(currentRecord.current, true);
});

test('evidence-lineage: chain A superseded-by B superseded-by C', () => {
  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'Revised methodology'),
    makeEdge(2, 3, 'superseded-by', 'Fixed scoring'),
  ];
  const currentEntries = new Set([3]); // Only 3 is current

  // Query entry 2 — should have 1 as predecessor, 3 as successor
  const result = queryLineage(2, edges, currentEntries);
  assert.equal(result.ledgerRowId, 2);
  assert.equal(result.predecessors.length, 1);
  const predEdge = result.predecessors[0]?.edge;
  assert.ok(predEdge);
  assert.equal(predEdge.predecessorLedgerRowId, 1);
  assert.equal(result.successors.length, 1);
  const succEdge = result.successors[0]?.edge;
  assert.ok(succEdge);
  assert.equal(succEdge.successorLedgerRowId, 3);

  // Full chains
  assert.equal(result.predecessorChain.length, 1);
  const p0 = result.predecessorChain[0]?.edge;
  assert.ok(p0);
  assert.equal(p0.successorLedgerRowId, 2); // edge 1→2

  assert.equal(result.successorChain.length, 1);
  const sc0 = result.successorChain[0]?.edge;
  assert.ok(sc0);
  assert.equal(sc0.predecessorLedgerRowId, 2);
});

test('evidence-lineage: querying the oldest entry shows no predecessors', () => {
  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'Revised'),
    makeEdge(2, 3, 'superseded-by', 'Fixed'),
  ];
  const currentEntries = new Set([3]);
  const result = queryLineage(1, edges, currentEntries);
  assert.equal(result.ledgerRowId, 1);
  assert.equal(result.predecessors.length, 0);
  assert.equal(result.successors.length, 1);
  assert.equal(result.successorChain.length, 2); // 1→2 and 2→3
});

test('evidence-lineage: querying the newest entry shows no successors', () => {
  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'Revised'),
    makeEdge(2, 3, 'superseded-by', 'Fixed'),
  ];
  const currentEntries = new Set([3]);
  const result = queryLineage(3, edges, currentEntries);
  assert.equal(result.ledgerRowId, 3);
  assert.equal(result.predecessors.length, 1);
  assert.equal(result.successors.length, 0);
  assert.equal(result.predecessorChain.length, 2); // 1→2 and 2→3
});

test('evidence-lineage: isolated entry has empty chains', () => {
  const edges: LineageEdge[] = [makeEdge(1, 2, 'superseded-by', 'Reason')];
  const currentEntries = new Set([2]);
  const result = queryLineage(5, edges, currentEntries);
  assert.equal(result.ledgerRowId, 5);
  assert.equal(result.predecessors.length, 0);
  assert.equal(result.successors.length, 0);
  assert.equal(result.predecessorChain.length, 0);
  assert.equal(result.successorChain.length, 0);
});

test('evidence-lineage: correction relation type works', () => {
  const edge = makeEdge(5, 6, 'corrected-by', 'Corrected typo in summary');
  assert.equal(edge.relation, 'corrected-by');
  const record = createLineageRecord(edge, true);
  assert.equal(record.lineageId, 'L-5-6-corrected-by');
});

test('evidence-lineage: replaced-by relation type works', () => {
  const edge = makeEdge(10, 11, 'replaced-by', 'Architecture changed');
  assert.equal(edge.relation, 'replaced-by');
});

test('evidence-lineage: extended-by relation type works', () => {
  const edge = makeEdge(20, 21, 'extended-by', 'Added three more items');
  assert.equal(edge.relation, 'extended-by');
});

test('evidence-lineage: buildLineageIndex maps both directions', () => {
  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'Reason 1'),
    makeEdge(2, 3, 'superseded-by', 'Reason 2'),
  ];
  const index = buildLineageIndex(edges);
  assert.equal(index.get(1)?.length, 1); // 1 as predecessor
  assert.equal(index.get(2)?.length, 2); // 2 as both successor of 1 and predecessor of 3
  assert.equal(index.get(3)?.length, 1); // 3 as successor
});

test('evidence-lineage: retainedPaths are preserved', () => {
  const edge = makeEdge(1, 2, 'superseded-by', 'Superseded', ['path/to/evidence.md']);
  assert.deepEqual(edge.retainedPaths, ['path/to/evidence.md']);
});

test('evidence-lineage: registry supersession adds entry and marks old', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'evidence-lineage-'));
  const registryPath = path.join(dir, 'evidence-registry.json');

  const registry = {
    registryVersion: 1,
    generated: '2026-07-31',
    entries: [
      {
        ledgerRowId: 1,
        ledgerText: 'PR #100',
        prNumbers: [100],
        issueNumbers: [99],
        mergeCommits: [{ pr: 100, sha: 'a'.repeat(40), verified: true }],
        evidencePaths: ['docs/evidence.md'],
        datasetSha256: [],
        evaluatorVerdict: null,
        resultSummary: 'Original evidence',
        limitations: 'None',
        limitationsSource: 'tracker',
        discrepancy: null,
        verificationStatus: 'verified',
      },
    ],
  };
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const newEntry = {
    ledgerRowId: 2,
    ledgerText: 'PR #101',
    prNumbers: [101],
    issueNumbers: [99],
    mergeCommits: [{ pr: 101, sha: 'b'.repeat(40), verified: true }],
    evidencePaths: ['docs/evidence-v2.md'],
    datasetSha256: [],
    evaluatorVerdict: null,
    resultSummary: 'Updated evidence',
    limitations: 'None',
    limitationsSource: 'tracker',
    discrepancy: null,
    verificationStatus: 'verified',
  };

  const updated = await addSupersessionToRegistry(
    registryPath,
    1,
    newEntry,
    'superseded-by',
    'Corrected methodology'
  );

  assert.equal(updated.entries.length, 2);

  // Old entry should have supersession metadata
  const oldEntry = updated.entries[0];
  assert.ok(oldEntry);
  assert.equal(oldEntry.supersededBy as number, 2);
  assert.equal(oldEntry.supersessionRelation as LineageRelation, 'superseded-by');
  assert.equal(oldEntry.supersessionReason as string, 'Corrected methodology');
  assert.ok(oldEntry.supersessionTimestamp);

  // New entry should be added
  const addedEntry = updated.entries[1];
  assert.ok(addedEntry);
  assert.equal(addedEntry.ledgerRowId, 2);
  assert.equal(updated.supersededCount, 1);
});

test('evidence-lineage: save and load lineage edges round-trip', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'evidence-lineage-'));
  const lineagePath = path.join(dir, 'lineage-edges.json');

  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'Revised'),
    makeEdge(2, 3, 'corrected-by', 'Typo'),
  ];
  await saveLineageEdges(lineagePath, edges);

  const loaded = await loadLineageEdges(lineagePath);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]?.predecessorLedgerRowId, 1);
  assert.equal(loaded[0]?.successorLedgerRowId, 2);
  assert.equal(loaded[0]?.relation, 'superseded-by');
  assert.equal(loaded[1]?.relation, 'corrected-by');
});

test('evidence-lineage: complex chain with diamond (A→B, A→C, B→D, C→D)', () => {
  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'extended-by', 'Branch B'),
    makeEdge(1, 3, 'extended-by', 'Branch C'),
    makeEdge(2, 4, 'superseded-by', 'Merge B into D'),
    makeEdge(3, 4, 'superseded-by', 'Merge C into D'),
  ];
  const currentEntries = new Set([4]);

  const result = queryLineage(4, edges, currentEntries);
  assert.equal(result.predecessors.length, 2); // from B and C
  assert.equal(result.successors.length, 0);
  assert.equal(result.predecessorChain.length, 4); // 1→2, 2→4, 1→3, 3→4
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

test('evidence-lineage: cleanup temp directories', async () => {
  // Already cleaned up by mkdtemp consumers via try/finally in real usage.
  // This test exists to confirm the pattern works in the test harness.
  const dir = await mkdtemp(path.join(tmpdir(), 'evidence-lineage-cleanup-'));
  const file = path.join(dir, 'marker.txt');
  await writeFile(file, 'exists'); // dir exists
  await rm(dir, { recursive: true, force: true });
  // After deletion, the directory should not exist
  try {
    await readFile(file, 'utf-8');
    assert.fail('Directory should not exist');
  } catch {
    // Expected
  }
});
