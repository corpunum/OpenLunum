export interface SupersessionRecord {
  id: string;
  supersededId: string;
  supersededBy: string;
  reason: string;
  timestamp: string;
  preservedEvidence: boolean;
}

export interface CorrectionEntry {
  id: string;
  originalClaim: string;
  correctedClaim: string;
  correctionReason: string;
  evidenceIds: string[];
  timestamp: string;
}

export interface SupersessionRegistry {
  records: SupersessionRecord[];
  corrections: CorrectionEntry[];
}

export interface HistoryValidation {
  valid: boolean;
  issues: string[];
}

export interface EvidenceSnapshot {
  evidenceId: string;
  claim: string;
  status: 'current' | 'superseded' | 'corrected';
  supersessionChain: string[];
  snapshotAt: string;
}

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

export function createSupersession(
  oldId: string,
  newId: string,
  reason: string,
): SupersessionRecord {
  return {
    id: generateId('sr'),
    supersededId: oldId,
    supersededBy: newId,
    reason,
    timestamp: new Date().toISOString(),
    preservedEvidence: true,
  };
}

export function createCorrection(
  originalClaim: string,
  correctedClaim: string,
  reason: string,
  evidenceIds: string[],
): CorrectionEntry {
  return {
    id: generateId('cr'),
    originalClaim,
    correctedClaim,
    correctionReason: reason,
    evidenceIds,
    timestamp: new Date().toISOString(),
  };
}

export function buildSupersessionChain(
  registry: SupersessionRegistry,
  startId: string,
): SupersessionRecord[] {
  const chain: SupersessionRecord[] = [];
  const visited = new Set<string>();
  let current = startId;

  while (!visited.has(current)) {
    visited.add(current);
    const record = registry.records.find((r) => r.supersededId === current);
    if (!record) break;
    chain.push(record);
    current = record.supersededBy;
  }

  return chain;
}

export function validateNoHistoryRewriting(
  registry: SupersessionRegistry,
): HistoryValidation {
  const issues: string[] = [];

  for (const record of registry.records) {
    if (!record.preservedEvidence) {
      issues.push(`Evidence ${record.supersededId} was not preserved when superseded by ${record.supersededBy}`);
    }
    if (record.supersededId === record.supersededBy) {
      issues.push(`Self-supersession detected: ${record.supersededId}`);
    }
  }

  const bySuperseded = new Map<string, SupersessionRecord[]>();
  for (const record of registry.records) {
    const list = bySuperseded.get(record.supersededId) ?? [];
    list.push(record);
    bySuperseded.set(record.supersededId, list);
  }

  for (const record of registry.records) {
    const visited = new Set<string>();
    let current = record.supersededId;
    while (current) {
      if (visited.has(current)) {
        issues.push(`Circular supersession chain detected involving ${current}`);
        break;
      }
      visited.add(current);
      const next = registry.records.find((r) => r.supersededId === current);
      if (!next) break;
      current = next.supersededBy;
    }
  }

  return { valid: issues.length === 0, issues };
}

export function snapshotEvidence(
  registry: SupersessionRegistry,
  id: string,
  description: string,
): EvidenceSnapshot {
  const chain = buildSupersessionChain(registry, id);
  const isSuperseded = registry.records.some((r) => r.supersededId === id);
  const isCorrected = registry.corrections.some(
    (c) => c.evidenceIds.includes(id),
  );

  let status: 'current' | 'superseded' | 'corrected';
  if (isSuperseded) {
    status = 'superseded';
  } else if (isCorrected) {
    status = 'corrected';
  } else {
    status = 'current';
  }

  return {
    evidenceId: id,
    claim: description,
    status,
    supersessionChain: chain.map((r) => r.id),
    snapshotAt: new Date().toISOString(),
  };
}
