import { readFile, writeFile } from 'node:fs/promises';

export type LineageRelation = 'superseded-by' | 'corrected-by' | 'replaced-by' | 'extended-by';

export interface LineageEdge {
  predecessorLedgerRowId: number;
  successorLedgerRowId: number;
  relation: LineageRelation;
  reason: string;
  timestamp: string;
  retainedPaths?: string[];
}

export interface LineageRecord {
  lineageId: string;
  current: boolean;
  edge: LineageEdge;
}

export interface LineageChainEntry {
  edge: LineageEdge;
  depth: number;
}

export interface LineageQueryResult {
  ledgerRowId: number;
  predecessors: LineageChainEntry[];
  successors: LineageChainEntry[];
  predecessorChain: LineageChainEntry[];
  successorChain: LineageChainEntry[];
  isCurrent: boolean;
}

export function createLineageEdge(
  predecessorLedgerRowId: number,
  successorLedgerRowId: number,
  relation: LineageRelation,
  reason: string,
  retainedPaths?: string[],
): LineageEdge {
  return {
    predecessorLedgerRowId,
    successorLedgerRowId,
    relation,
    reason,
    timestamp: new Date().toISOString(),
    ...(retainedPaths ? { retainedPaths } : {}),
  };
}

export function createLineageRecord(edge: LineageEdge, current: boolean): LineageRecord {
  return {
    lineageId: `L-${edge.predecessorLedgerRowId}-${edge.successorLedgerRowId}-${edge.relation}`,
    current,
    edge,
  };
}

export function buildLineageIndex(edges: LineageEdge[]): Map<number, LineageEdge[]> {
  const index = new Map<number, LineageEdge[]>();

  for (const edge of edges) {
    const predList = index.get(edge.predecessorLedgerRowId) ?? [];
    predList.push(edge);
    index.set(edge.predecessorLedgerRowId, predList);

    const succList = index.get(edge.successorLedgerRowId) ?? [];
    succList.push(edge);
    index.set(edge.successorLedgerRowId, succList);
  }

  return index;
}

export function queryLineage(
  ledgerRowId: number,
  edges: LineageEdge[],
  currentEntries: Set<number>,
): LineageQueryResult {
  const bySuccessor = new Map<number, LineageEdge[]>();
  const byPredecessor = new Map<number, LineageEdge[]>();

  for (const edge of edges) {
    const predList = byPredecessor.get(edge.predecessorLedgerRowId) ?? [];
    predList.push(edge);
    byPredecessor.set(edge.predecessorLedgerRowId, predList);

    const succList = bySuccessor.get(edge.successorLedgerRowId) ?? [];
    succList.push(edge);
    bySuccessor.set(edge.successorLedgerRowId, succList);
  }

  const predecessors: LineageChainEntry[] = (bySuccessor.get(ledgerRowId) ?? [])
    .map((edge) => ({ edge, depth: 1 }));

  const successors: LineageChainEntry[] = (byPredecessor.get(ledgerRowId) ?? [])
    .map((edge) => ({ edge, depth: 1 }));

  const predecessorChain = walkChain(ledgerRowId, bySuccessor, byPredecessor, 'predecessors');
  const successorChain = walkChain(ledgerRowId, bySuccessor, byPredecessor, 'successors');

  return {
    ledgerRowId,
    predecessors,
    successors,
    predecessorChain,
    successorChain,
    isCurrent: currentEntries.has(ledgerRowId),
  };
}

function walkChain(
  startId: number,
  bySuccessor: Map<number, LineageEdge[]>,
  byPredecessor: Map<number, LineageEdge[]>,
  direction: 'predecessors' | 'successors',
): LineageChainEntry[] {
  const chain: LineageChainEntry[] = [];
  const visited = new Set<number>();
  const queue = [startId];
  visited.add(startId);
  let depth = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edgesForNode = direction === 'predecessors'
      ? bySuccessor.get(current) ?? []
      : byPredecessor.get(current) ?? [];

    for (const edge of edgesForNode) {
      depth++;
      chain.push({ edge, depth });

      const nextId = direction === 'predecessors'
        ? edge.predecessorLedgerRowId
        : edge.successorLedgerRowId;

      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push(nextId);
      }
    }
  }

  return chain;
}

export interface UpdatedRegistry {
  entries: Record<string, unknown>[];
  supersededCount: number;
  currentEntries?: number[];
}

export async function addSupersessionToRegistry(
  registryPath: string,
  oldRowId: number,
  newEntry: Record<string, unknown>,
  relation: LineageRelation,
  reason: string,
): Promise<UpdatedRegistry> {
  const raw = await readFile(registryPath, 'utf-8');
  const registry = JSON.parse(raw) as { entries: Record<string, unknown>[] };

  const oldEntry = registry.entries.find(
    (e) => (e as { ledgerRowId: number }).ledgerRowId === oldRowId,
  );
  if (oldEntry) {
    oldEntry.supersededBy = (newEntry as { ledgerRowId: number }).ledgerRowId;
    oldEntry.supersessionRelation = relation;
    oldEntry.supersessionTimestamp = new Date().toISOString();
    oldEntry.supersessionReason = reason;
  }

  registry.entries.push(newEntry);

  const currentEntries = registry.entries
    .filter((e) => !(e as { supersededBy?: number }).supersededBy)
    .map((e) => (e as { ledgerRowId: number }).ledgerRowId);

  const supersededCount = registry.entries.length - currentEntries.length;

  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  return { entries: registry.entries, supersededCount, currentEntries };
}

export async function saveLineageEdges(filePath: string, edges: LineageEdge[]): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(edges, null, 2)}\n`);
}

export async function loadLineageEdges(filePath: string): Promise<LineageEdge[]> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as LineageEdge[];
}
