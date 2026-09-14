/**
 * Integration tests for evidence lineage infrastructure (issue #490).
 *
 * Verifies that the persisted lineage-edges.json file is consistent with
 * the evidence-registry.json, that queryLineage returns correct chains,
 * and that supersession chains (A → B → C) and correction records work end-to-end.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

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
  type LineageQueryResult,
} from '../src/evidence-lineage.js';

import {
  createSupersession,
  createCorrection,
  buildSupersessionChain,
  validateNoHistoryRewriting,
  snapshotEvidence,
  type SupersessionRecord,
  type CorrectionEntry,
  type SupersessionRegistry,
} from '../src/evidence-supersession.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// Tests: lineage-edges.json persistence
// ---------------------------------------------------------------------------

test('evidence-lineage-integration: lineage-edges.json loads and is valid', async () => {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const lineagePath = path.join(workspaceRoot, 'reports', 'lineage-edges.json');

  const raw = await readFile(lineagePath, 'utf-8');
  const edges = JSON.parse(raw) as LineageEdge[];

  assert.ok(Array.isArray(edges), 'lineage-edges.json must be an array');
  assert.ok(edges.length > 0, 'lineage-edges.json must have at least one edge');

  for (const edge of edges) {
    assert.ok(typeof edge.predecessorLedgerRowId === 'number', 'predecessorLedgerRowId must be a number');
    assert.ok(typeof edge.successorLedgerRowId === 'number', 'successorLedgerRowId must be a number');
    assert.ok(typeof edge.relation === 'string', 'relation must be a string');
    assert.ok(['superseded-by', 'corrected-by', 'replaced-by', 'extended-by'].includes(edge.relation), `invalid relation: ${edge.relation}`);
    assert.ok(typeof edge.reason === 'string' && edge.reason.length > 0, 'reason must be non-empty');
    assert.ok(typeof edge.timestamp === 'string' && edge.timestamp.length > 0, 'timestamp must be non-empty');
  }
});

test('evidence-lineage-integration: all lineage edges reference existing registry entries', async () => {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const lineagePath = path.join(workspaceRoot, 'reports', 'lineage-edges.json');
  const registryPath = path.join(workspaceRoot, 'reports', 'evidence-registry.json');

  const edges = JSON.parse(await readFile(lineagePath, 'utf-8')) as LineageEdge[];
  const registry = JSON.parse(await readFile(registryPath, 'utf-8'));

  const rowIds = new Set(registry.entries.map((e: { ledgerRowId: number }) => e.ledgerRowId));

  for (const edge of edges) {
    assert.ok(rowIds.has(edge.predecessorLedgerRowId), `predecessor row ${edge.predecessorLedgerRowId} not in registry`);
    assert.ok(rowIds.has(edge.successorLedgerRowId), `successor row ${edge.successorLedgerRowId} not in registry`);
  }
});

test('evidence-lineage-integration: queryLineage returns correct chain for known supersession', async () => {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const edges = await loadLineageEdges(path.join(workspaceRoot, 'reports', 'lineage-edges.json'));
  const currentEntries = new Set([15, 31]); // The latest entries for each line

  // Row 31 supersedes row 30
  const result31 = queryLineage(31, edges, currentEntries);
  assert.equal(result31.ledgerRowId, 31);
  assert.equal(result31.predecessors.length, 1);
  assert.equal(result31.successors.length, 0);
  assert.equal(result31.predecessorChain.length, 1);

  const predEdge = result31.predecessors[0]?.edge;
  assert.ok(predEdge);
  assert.equal(predEdge.predecessorLedgerRowId, 30);
  assert.equal(predEdge.relation, 'superseded-by');

  // Row 30 has no predecessors
  const result30 = queryLineage(30, edges, currentEntries);
  assert.equal(result30.predecessors.length, 0);
  assert.equal(result30.successors.length, 1);
  const succEdge = result30.successors[0]?.edge;
  assert.ok(succEdge);
  assert.equal(succEdge.successorLedgerRowId, 31);
});

test('evidence-lineage-integration: correction record works end-to-end', async () => {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const edges = await loadLineageEdges(path.join(workspaceRoot, 'reports', 'lineage-edges.json'));

  // Row 15 corrected row 14
  const result15 = queryLineage(15, edges, new Set([15, 31]));
  assert.equal(result15.ledgerRowId, 15);
  assert.equal(result15.predecessors.length, 1);
  const predEdge = result15.predecessors[0]?.edge;
  assert.ok(predEdge);
  assert.equal(predEdge.relation, 'corrected-by');
  assert.equal(predEdge.predecessorLedgerRowId, 14);
});

// ---------------------------------------------------------------------------
// Tests: supersession chains (A → B → C)
// ---------------------------------------------------------------------------

test('evidence-lineage-integration: three-step supersession chain A→B→C', async () => {
  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'First revision'),
    makeEdge(2, 3, 'superseded-by', 'Second revision'),
  ];
  const currentEntries = new Set([3]);

  // Query the middle entry
  const result = queryLineage(2, edges, currentEntries);
  assert.equal(result.ledgerRowId, 2);
  assert.equal(result.predecessors.length, 1);
  assert.equal(result.successors.length, 1);
  assert.equal(result.predecessorChain.length, 1); // Only direct predecessor
  assert.equal(result.successorChain.length, 1);  // Only direct successor

  // The full predecessor chain from 3 should include both edges
  const fullChain = queryLineage(3, edges, currentEntries);
  assert.equal(fullChain.predecessorChain.length, 2);

  // Verify chain order: first edge is 1→2, second is 2→3
  assert.equal(fullChain.predecessorChain[0]?.edge.predecessorLedgerRowId, 2);
  assert.equal(fullChain.predecessorChain[1]?.edge.predecessorLedgerRowId, 1);
});

test('evidence-lineage-integration: supersession chain with three entries matches registry pattern', async () => {
  // Simulate a realistic three-step supersession like the real rows 30→31
  // plus a hypothetical further revision
  const edges: LineageEdge[] = [
    makeEdge(10, 11, 'superseded-by', 'Initial threshold sweep showed deficiencies'),
    makeEdge(11, 12, 'corrected-by', 'Corrected mechanism explanation'),
    makeEdge(12, 13, 'superseded-by', 'Invariants eliminated false positives'),
  ];
  const currentEntries = new Set([13]);

  // Query entry 11 (middle)
  const result = queryLineage(11, edges, currentEntries);
  assert.equal(result.ledgerRowId, 11);
  assert.equal(result.predecessors.length, 1);
  assert.equal(result.successors.length, 1);

  // Verify predecessor chain from 13 includes all three entries
  const fullChain = queryLineage(13, edges, currentEntries);
  assert.equal(fullChain.predecessorChain.length, 3);
});

// ---------------------------------------------------------------------------
// Tests: integration with evidence-supersession types
// ---------------------------------------------------------------------------

test('evidence-lineage-integration: lineage edges and supersession records are consistent', async () => {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const registryPath = path.join(workspaceRoot, 'reports', 'evidence-registry.json');
  const lineagePath = path.join(workspaceRoot, 'reports', 'lineage-edges.json');

  const registry = JSON.parse(await readFile(registryPath, 'utf-8'));
  const edges = JSON.parse(await readFile(lineagePath, 'utf-8')) as LineageEdge[];

  // Build a supersession registry from the lineage edges
  const supersessionRegistry: SupersessionRegistry = {
    records: edges.map((edge, i) => createSupersession(
      String(edge.predecessorLedgerRowId),
      String(edge.successorLedgerRowId),
      edge.reason
    )),
    corrections: [],
  };

  // Find corrections from edges
  const correctionEdges = edges.filter(e => e.relation === 'corrected-by');
  for (const edge of correctionEdges) {
    supersessionRegistry.corrections.push(createCorrection(
      `Entry ${edge.predecessorLedgerRowId}`,
      `Entry ${edge.successorLedgerRowId}`,
      edge.reason,
      [String(edge.predecessorLedgerRowId)]
    ));
  }

  // Validate no history rewriting
  const validation = validateNoHistoryRewriting(supersessionRegistry);
  assert.equal(validation.valid, true, `Validation issues: ${JSON.stringify(validation.issues)}`);
});

test('evidence-lineage-integration: snapshotEvidence works with lineage-based registry', async () => {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const lineagePath = path.join(workspaceRoot, 'reports', 'lineage-edges.json');
  const edges = JSON.parse(await readFile(lineagePath, 'utf-8')) as LineageEdge[];

  const supersessionRegistry: SupersessionRegistry = {
    records: edges.map((edge, i) => createSupersession(
      String(edge.predecessorLedgerRowId),
      String(edge.successorLedgerRowId),
      edge.reason
    )),
    corrections: [],
  };

  // Entry 30 should be superseded
  const snapshot30 = snapshotEvidence(supersessionRegistry, '30', 'Threshold sweep');
  assert.equal(snapshot30.status, 'superseded');
  assert.equal(snapshot30.supersessionChain.length, 1);

  // Entry 31 should be current
  const snapshot31 = snapshotEvidence(supersessionRegistry, '31', 'Calibration confirmed');
  assert.equal(snapshot31.status, 'current');
  assert.equal(snapshot31.supersessionChain.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: registry integration (addSupersessionToRegistry)
// ---------------------------------------------------------------------------

test('evidence-lineage-integration: addSupersessionToRegistry produces valid updated registry', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lineage-integration-'));
  const registryPath = path.join(dir, 'evidence-registry.json');

  const registry = {
    registryVersion: 1,
    generated: '2026-08-01',
    entries: [
      {
        ledgerRowId: 100,
        ledgerText: 'Original evidence',
        prNumbers: [200],
        issueNumbers: [199],
        mergeCommits: [{ pr: 200, sha: 'a'.repeat(40), verified: true }],
        evidencePaths: ['docs/evidence.md'],
        datasetSha256: [],
        evaluatorVerdict: null,
        resultSummary: 'Original',
        limitations: 'None',
        limitationsSource: 'tracker',
        discrepancy: null,
        verificationStatus: 'verified',
      },
    ],
  };
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const newEntry = {
    ledgerRowId: 101,
    ledgerText: 'Revised evidence',
    prNumbers: [201],
    issueNumbers: [199],
    mergeCommits: [{ pr: 201, sha: 'b'.repeat(40), verified: true }],
    evidencePaths: ['docs/evidence-v2.md'],
    datasetSha256: [],
    evaluatorVerdict: null,
    resultSummary: 'Revised',
    limitations: 'None',
    limitationsSource: 'tracker',
    discrepancy: null,
    verificationStatus: 'verified',
  };

  const updated = await addSupersessionToRegistry(
    registryPath,
    100,
    newEntry,
    'superseded-by',
    'Better methodology'
  );

  assert.equal(updated.entries.length, 2);
  assert.equal(updated.supersededCount, 1);

  // Old entry should have supersession fields
  const oldEntry = updated.entries[0] as Record<string, unknown>;
  assert.equal(oldEntry.supersededBy, 101);
  assert.equal(oldEntry.supersessionRelation, 'superseded-by');
  assert.ok(oldEntry.supersessionTimestamp);

  // New entry should be current
  const newEntryLoaded = updated.entries[1] as Record<string, unknown>;
  assert.ok(updated.currentEntries?.includes(101));

  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests: save/load round-trip preserves data
// ---------------------------------------------------------------------------

test('evidence-lineage-integration: save/load preserves chain data', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lineage-integration-'));
  const lineagePath = path.join(dir, 'lineage.json');

  const edges: LineageEdge[] = [
    makeEdge(1, 2, 'superseded-by', 'Reason A'),
    makeEdge(2, 3, 'corrected-by', 'Reason B'),
    makeEdge(3, 4, 'extended-by', 'Reason C'),
  ];
  await saveLineageEdges(lineagePath, edges);

  const loaded = await loadLineageEdges(lineagePath);
  assert.equal(loaded.length, 3);
  assert.equal(loaded[0]?.predecessorLedgerRowId, 1);
  assert.equal(loaded[0]?.relation, 'superseded-by');
  assert.equal(loaded[1]?.relation, 'corrected-by');
  assert.equal(loaded[2]?.relation, 'extended-by');
  assert.deepEqual(loaded[0]?.retainedPaths, undefined);

  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

test('evidence-lineage-integration: cleanup temp directories', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lineage-integration-cleanup-'));
  const marker = path.join(dir, 'marker.txt');
  await writeFile(marker, 'test');
  await rm(dir, { recursive: true, force: true });

  try {
    await readFile(marker, 'utf-8');
    assert.fail('Directory should be deleted');
  } catch {
    // Expected
  }
});
