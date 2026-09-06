import { createHash } from 'node:crypto';
import { normalizeSemanticCandidate, semanticFingerprint, validateSemanticCandidate } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

/** Public input exposed to an extraction worker; no scoring fields are allowed. */
export interface BlindSourceItem {
  handle: string;
  sourceText: string;
  sourceLanguage: string;
  kind: 'memory' | 'query';
}

export interface BlindCandidateRow {
  handle: string;
  result: { candidateSem: LunumSem | null; provenance?: Record<string, unknown> };
}

export interface BlindLedgerValidation {
  valid: boolean;
  errors: string[];
  identityAvailable: number;
  abstentions: number;
}

const FORBIDDEN_KEYS = new Set([
  'goldSem', 'goldLfp', 'expectedFingerprint', 'expectedMemoryIds',
  'semanticEquivalentMemoryIds', 'protectedSemanticAtoms', 'semanticGroup',
  'criticalPairId', 'criticalDimension', 'expectedOutcome', 'scoring',
]);

function findForbidden(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => findForbidden(entry, `${path}[${index}]`));
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(FORBIDDEN_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...findForbidden(entry, `${path}.${key}`),
  ]);
}

function sourceHash(sourceText: string): string {
  return createHash('sha256').update(sourceText).digest('hex');
}

/** Validate an opaque, source-only candidate ledger before private scoring. */
export function validateBlindAgentLedger(source: readonly BlindSourceItem[], rows: readonly BlindCandidateRow[]): BlindLedgerValidation {
  const errors: string[] = [];
  const sourceHandles = new Set<string>();
  for (const [index, item] of source.entries()) {
    if (!item || typeof item.handle !== 'string' || !item.handle.trim()) errors.push(`source[${index}] handle must be non-empty`);
    else if (sourceHandles.has(item.handle)) errors.push(`duplicate source handle: ${item.handle}`);
    else sourceHandles.add(item.handle);
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`source[${index}] must be an object`);
      continue;
    }
    if (typeof item.sourceText !== 'string' || !item.sourceText.trim()) errors.push(`source[${index}] sourceText must be non-empty`);
    if (typeof item.sourceLanguage !== 'string' || !item.sourceLanguage.trim()) errors.push(`source[${index}] sourceLanguage must be non-empty`);
    if (item.kind !== 'memory' && item.kind !== 'query') errors.push(`source[${index}] kind is invalid`);
  }
  const rowHandles = new Set<string>();
  let identityAvailable = 0;
  let abstentions = 0;
  for (const [index, row] of rows.entries()) {
    const rowKeys = row && typeof row === 'object' ? Object.keys(row as unknown as Record<string, unknown>).sort() : [];
    if (rowKeys.join(',') !== 'handle,result') errors.push(`row[${index}] must contain exactly handle,result`);
    if (!row || typeof row.handle !== 'string' || !row.handle.trim()) { errors.push(`row[${index}] handle must be non-empty`); continue; }
    if (rowHandles.has(row.handle)) errors.push(`duplicate candidate handle: ${row.handle}`);
    rowHandles.add(row.handle);
    if (!sourceHandles.has(row.handle)) errors.push(`candidate handle is not in source manifest: ${row.handle}`);
    if (!row.result || typeof row.result !== 'object' || Array.isArray(row.result)) { errors.push(`row[${index}] result must be an object`); continue; }
    const resultKeys = Object.keys(row.result).sort();
    if (!resultKeys.every((key) => key === 'candidateSem' || key === 'provenance')) errors.push(`row[${index}] result contains unsupported fields`);
    const forbidden = findForbidden(row.result, `rows[${index}].result`);
    errors.push(...forbidden.map((key) => `forbidden evaluator field: ${key}`));
    const sourceItem = source.find((item) => item && typeof item === 'object' && item.handle === row.handle);
    const declaredSourceHash = row.result.provenance && typeof row.result.provenance === 'object' && !Array.isArray(row.result.provenance)
      ? (row.result.provenance as Record<string, unknown>).sourceHash : undefined;
    if (declaredSourceHash !== undefined && (typeof declaredSourceHash !== 'string' || !/^[0-9a-f]{64}$/u.test(declaredSourceHash) || !sourceItem || typeof sourceItem.sourceText !== 'string' || declaredSourceHash !== sourceHash(sourceItem.sourceText))) {
      errors.push(`row[${index}] provenance sourceHash does not match the source manifest`);
    }
    if (row.result.candidateSem === null) { abstentions++; continue; }
    if (!row.result.candidateSem || typeof row.result.candidateSem !== 'object' || Array.isArray(row.result.candidateSem)) { errors.push(`row[${index}] candidateSem must be an object or null`); continue; }
    const structural = validateSemanticCandidate(row.result.candidateSem);
    if (!structural.ok) { errors.push(`row[${index}] candidateSem is invalid: ${structural.errors.join('; ')}`); continue; }
    const normalized = normalizeSemanticCandidate(row.result.candidateSem, { strict: true });
    if (!normalized.sem || !normalized.canonical) { errors.push(`row[${index}] candidateSem is noncanonical`); continue; }
    try { semanticFingerprint(normalized.sem); identityAvailable++; }
    catch { errors.push(`row[${index}] candidateSem has no exact semantic identity`); }
  }
  for (const handle of sourceHandles) if (!rowHandles.has(handle)) errors.push(`missing candidate row for source handle: ${handle}`);
  return { valid: errors.length === 0, errors, identityAvailable, abstentions };
}
