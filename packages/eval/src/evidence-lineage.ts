/**
 * Evidence lineage infrastructure for preserving superseded evidence and
 * correction chains without rewriting history. R13.7.
 *
 * When an evidence entry is superseded by a newer one, a lineage entry
 * links old → new, records the reason for supersession, and retains the
 * original evidence path so the chain remains auditable.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Shape of the evidence-registry.json top-level object. */
interface Registry {
  registryVersion: number;
  generated: string;
  entries: RegistryEntry[];
  supersededCount?: number;
  currentEntries?: number[];
  [key: string]: unknown;
}

interface RegistryEntry {
  ledgerRowId: number;
  ledgerText: string;
  prNumbers: number[];
  issueNumbers: number[];
  mergeCommits: Array<{ pr: number; sha: string; verified: boolean }>;
  evidencePaths: string[];
  datasetSha256: string[];
  evaluatorVerdict: unknown;
  resultSummary: string;
  limitations: string;
  limitationsSource: string;
  discrepancy: unknown;
  verificationStatus: string;
  [key: string]: unknown;
}

/**
 * Type of relationship between two evidence entries in a lineage chain.
 */
export type LineageRelation = 'superseded-by' | 'corrected-by' | 'replaced-by' | 'extended-by';

/**
 * A single lineage edge linking one evidence entry to the next in the chain.
 */
export interface LineageEdge {
  /** The ledger row ID of the predecessor entry. */
  predecessorLedgerRowId: number;
  /** The ledger row ID of the successor entry. */
  successorLedgerRowId: number;
  /** How the successor relates to the predecessor. */
  relation: LineageRelation;
  /** Human-readable explanation for the supersession. */
  reason: string;
  /** Timestamp of the supersession (ISO 8601). */
  timestamp: string;
  /** Paths retained from the predecessor so the original evidence remains findable. */
  retainedPaths?: string[] | undefined;
}

/**
 * Full lineage record containing the edge and the surrounding context.
 */
export interface LineageRecord {
  /** Unique identifier for this lineage edge. */
  lineageId: string;
  /** The edge defining the relationship. */
  edge: LineageEdge;
  /** Whether this is the current (non-superseded) version of this evidence line. */
  current: boolean;
}

/**
 * Result of a lineage query returning the full predecessor chain
 * (predecessors, successors, or both) for a given ledger row ID.
 */
export interface LineageQueryResult {
  /** The queried ledger row ID. */
  ledgerRowId: number;
  /** Direct predecessors (entries that this entry superseded). */
  predecessors: LineageRecord[];
  /** Direct successors (entries that superseded this entry). */
  successors: LineageRecord[];
  /** Full predecessor chain (all entries before this one). */
  predecessorChain: LineageRecord[];
  /** Full successor chain (all entries after this one). */
  successorChain: LineageRecord[];
}

/**
 * Create a lineage edge linking a superseded evidence entry to its successor.
 *
 * @param predecessorLedgerRowId — ledgerRowId of the entry being superseded
 * @param successorLedgerRowId — ledgerRowId of the replacement entry
 * @param relation — how the successor relates to the predecessor
 * @param reason — human-readable explanation
 * @param retainedPaths — paths from the predecessor to retain
 * @returns a fully formed LineageEdge
 */
export function createLineageEdge(
  predecessorLedgerRowId: number,
  successorLedgerRowId: number,
  relation: LineageRelation,
  reason: string,
  retainedPaths?: string[] | undefined
): LineageEdge {
  return {
    predecessorLedgerRowId,
    successorLedgerRowId,
    relation,
    reason,
    timestamp: new Date().toISOString(),
    retainedPaths,
  };
}

/**
 * Create a lineage record with a generated ID and current-flag.
 *
 * @param edge — the lineage edge
 * @param current — whether this entry is the current version
 * @returns a LineageRecord with a deterministic lineageId
 */
export function createLineageRecord(edge: LineageEdge, current: boolean): LineageRecord {
  const lineageId = `L-${edge.predecessorLedgerRowId}-${edge.successorLedgerRowId}-${edge.relation}`;
  return { lineageId, edge, current };
}

/**
 * Build a lineage index from a set of edges.
 * Returns a map from ledgerRowId to all edges touching that entry
 * (both as predecessor and successor).
 */
export function buildLineageIndex(edges: LineageEdge[]): Map<number, LineageEdge[]> {
  const index = new Map<number, LineageEdge[]>();
  for (const edge of edges) {
    const predEdges = index.get(edge.predecessorLedgerRowId);
    if (predEdges === undefined) {
      index.set(edge.predecessorLedgerRowId, [edge]);
    } else {
      predEdges.push(edge);
    }
    const succEdges = index.get(edge.successorLedgerRowId);
    if (succEdges === undefined) {
      index.set(edge.successorLedgerRowId, [edge]);
    } else {
      succEdges.push(edge);
    }
  }
  return index;
}

/**
 * Query the full lineage for a given evidence entry.
 *
 * @param ledgerRowId — the entry to query
 * @param edges — all known lineage edges
 * @param currentEntries — set of ledgerRowIds that are current (not superseded)
 * @returns a LineageQueryResult with predecessor/successor chains
 */
export function queryLineage(
  ledgerRowId: number,
  edges: LineageEdge[],
  currentEntries: Set<number>
): LineageQueryResult {
  const index = buildLineageIndex(edges);

  // Find edges where this entry is the successor (predecessors)
  const predecessorEdges = (index.get(ledgerRowId) ?? []).filter(
    (e: LineageEdge) => e.successorLedgerRowId === ledgerRowId
  );
  // Find edges where this entry is the predecessor (successors)
  const successorEdges = (index.get(ledgerRowId) ?? []).filter(
    (e: LineageEdge) => e.predecessorLedgerRowId === ledgerRowId
  );

  const buildRecords = (edgeList: LineageEdge[], asPredecessor: boolean): LineageRecord[] =>
    edgeList.map((edge: LineageEdge) =>
      createLineageRecord(edge, !asPredecessor && currentEntries.has(ledgerRowId))
    );

  // Build full chains by walking recursively
  const buildPredecessorChain = (id: number, visited = new Set<number>()): LineageRecord[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    const preds = (index.get(id) ?? []).filter((e: LineageEdge) => e.successorLedgerRowId === id);
    const records: LineageRecord[] = [];
    for (const edge of preds) {
      const record = createLineageRecord(edge, currentEntries.has(id));
      records.push(record);
      records.push(...buildPredecessorChain(edge.predecessorLedgerRowId, visited));
    }
    return records;
  };

  const buildSuccessorChain = (id: number, visited = new Set<number>()): LineageRecord[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    const succs = (index.get(id) ?? []).filter((e: LineageEdge) => e.predecessorLedgerRowId === id);
    const records: LineageRecord[] = [];
    for (const edge of succs) {
      const record = createLineageRecord(edge, currentEntries.has(id));
      records.push(record);
      records.push(...buildSuccessorChain(edge.successorLedgerRowId, visited));
    }
    return records;
  };

  return {
    ledgerRowId,
    predecessors: buildRecords(predecessorEdges, true),
    successors: buildRecords(successorEdges, false),
    predecessorChain: buildPredecessorChain(ledgerRowId),
    successorChain: buildSuccessorChain(ledgerRowId),
  };
}

/**
 * Add a supersession record to an evidence registry by updating
 * the entry's metadata. The old entry's paths are retained and
 * a new entry is added with a link back.
 *
 * @param registryPath — path to the evidence-registry.json file
 * @param oldEntryId — ledgerRowId of the entry being superseded
 * @param newEntry — the new registry entry that replaces the old one
 * @param relation — type of supersession
 * @param reason — explanation for the supersession
 * @returns the updated registry
 */
export async function addSupersessionToRegistry(
  registryPath: string,
  oldEntryId: number,
  newEntry: Record<string, unknown>,
  relation: LineageRelation,
  reason: string
): Promise<Registry> {
  const raw = await readFile(registryPath, 'utf-8');
  const existing = JSON.parse(raw) as Registry;

  // Mark old entry as superseded
  const oldEntryIndex = existing.entries.findIndex((e: RegistryEntry) => e.ledgerRowId === oldEntryId);
  if (oldEntryIndex === -1) {
    throw new Error(`Registry entry ${oldEntryId} not found for supersession`);
  }

  const oldEntry = existing.entries[oldEntryIndex];
  if (oldEntry === undefined) {
    throw new Error(`Registry entry at index ${oldEntryIndex} is undefined`);
  }
  const ep = oldEntry.evidencePaths;
  const retainedPaths = Array.isArray(ep) ? [...ep] : undefined;

  // Update old entry to mark as superseded
  const updatedOldEntry: Record<string, unknown> = { ...oldEntry };
  if (retainedPaths !== undefined) {
    updatedOldEntry.evidencePaths = retainedPaths;
  }
  updatedOldEntry.supersededBy = newEntry.ledgerRowId as number;
  updatedOldEntry.supersededByLedgerText = newEntry.ledgerText as string;
  updatedOldEntry.supersessionRelation = relation;
  updatedOldEntry.supersessionReason = reason;
  updatedOldEntry.supersessionTimestamp = new Date().toISOString();
  if (retainedPaths !== undefined) {
    updatedOldEntry.retainedPaths = retainedPaths;
  }
  if (existing.entries[oldEntryIndex] !== undefined) {
    existing.entries[oldEntryIndex] = updatedOldEntry as RegistryEntry;
  }

  // Add new entry
  existing.entries.push(newEntry as never);

  // Update metadata
  existing.supersededCount = (existing.supersededCount ?? 0) + 1;
  if (existing.currentEntries === undefined) {
    existing.currentEntries = [];
  }
  existing.currentEntries.push(newEntry.ledgerRowId as number);
  existing.currentEntries = [...new Set(existing.currentEntries)];

  const output = JSON.stringify(existing, null, 2) + '\n';
  await writeFile(registryPath, output, 'utf-8');

  return existing;
}

/**
 * Save a standalone lineage edges file alongside the registry.
 *
 * @param lineagePath — path for the lineage-edges.json file
 * @param edges — all lineage edges to persist
 */
export async function saveLineageEdges(
  lineagePath: string,
  edges: LineageEdge[]
): Promise<void> {
  await mkdir(path.dirname(lineagePath), { recursive: true });
  const output = JSON.stringify(edges, null, 2) + '\n';
  await writeFile(lineagePath, output, 'utf-8');
}

/**
 * Load a standalone lineage edges file.
 *
 * @param lineagePath — path for the lineage-edges.json file
 * @returns the parsed edges array
 */
export async function loadLineageEdges(lineagePath: string): Promise<LineageEdge[]> {
  const raw = await readFile(lineagePath, 'utf-8');
  return JSON.parse(raw) as LineageEdge[];
}
