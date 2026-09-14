import { SEM_SCHEMA } from './constants.js';
import type { LunumClause, LunumSem, LunumTerm, LunumTermObject, ValidationResult } from './types.js';

/**
 * Canonicalization algorithm (lunum-canon/1.0)
 *
 * This module implements the frozen 1.0 canonicalization algorithm for Lunum-Sem.
 * Canonicalization transforms semantic content into a deterministic form suitable for
 * fingerprinting and storage. The algorithm is deterministic and reversible at the
 * semantic level (identity is preserved even if formatting is normalized).
 *
 * Key invariants:
 * - Same semantic content always produces the same canonical form
 * - Different semantic content produces different canonical forms (with high probability)
 * - Canonicalization is stable across language boundaries and Unicode normalization forms
 * - Clause order is preserved (significant for multi-clause semantics)
 */

/**
 * Normalize identifiers (predicates, role names, type discriminators, IDs, language tags).
 * Identifiers undergo: NFKC Unicode normalization, trimming, lowercasing, space→underscore.
 * Example: "Prefer Object" → "prefer_object"
 */
function normalizeIdentifier(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, '_').toLocaleLowerCase('und');
}

/**
 * Normalize text values (in "value" fields and other text content).
 * Text undergoes: NFKC Unicode normalization, trimming, multiple spaces→single space.
 * Text is NOT lowercased or case-normalized, preserving semantic distinction.
 * Example: "Hello  World" → "Hello World"
 */
function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalUnknown(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(canonicalUnknown);
  if (!isObject(value)) return String(value);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) continue;
    if (key === 'id' || key === 'type' || key === 'ref' || key === 'language') out[key] = normalizeIdentifier(item);
    else if (key === 'value' && typeof item === 'string') out[key] = normalizeText(item);
    else out[key] = canonicalUnknown(item);
  }
  return out;
}

function canonicalTerm(term: LunumTerm): LunumTerm {
  return canonicalUnknown(term) as LunumTerm;
}

function canonicalClause(clause: LunumClause): LunumClause {
  const roles: Record<string, LunumTerm> = {};
  for (const key of Object.keys(clause.roles ?? {}).sort()) {
    const item = clause.roles[key];
    if (item === undefined) continue;
    roles[normalizeIdentifier(key)] = canonicalTerm(item);
  }
  const out: LunumClause = {
    predicate: normalizeIdentifier(clause.predicate),
    roles,
    negated: clause.negated === true
  };
  if (clause.modality != null) out.modality = normalizeIdentifier(clause.modality);
  if (clause.time != null) out.time = canonicalTerm(clause.time);
  if (clause.conditions?.length) out.conditions = clause.conditions.map(canonicalClause);
  if (clause.consequences?.length) out.consequences = clause.consequences.map(canonicalClause);
  if (clause.annotations && Object.keys(clause.annotations).length) out.annotations = canonicalUnknown(clause.annotations) as Record<string, unknown>;
  return out;
}

/**
 * Validate a Lunum-Sem object before canonicalization.
 * This check ensures the object has the required structure and fields.
 * Canonicalization will fail if validation returns false.
 */
export function validateSem(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['sem must be an object'] };
  if (value.schema !== SEM_SCHEMA) errors.push(`schema must equal ${SEM_SCHEMA}`);
  if (!String(value.world ?? '').trim()) errors.push('world is required');
  if (!String(value.kind ?? '').trim()) errors.push('kind is required');
  if (!Array.isArray(value.clauses) || value.clauses.length === 0) errors.push('clauses must be a non-empty array');
  if (value.references !== undefined) {
    if (!Array.isArray(value.references)) errors.push('references must be an array');
    else value.references.forEach((reference, index) => {
      if (!isObject(reference)) errors.push(`references[${index}] must be an object`);
    });
  }
  for (const [index, rawClause] of (Array.isArray(value.clauses) ? value.clauses : []).entries()) {
    if (!isObject(rawClause)) { errors.push(`clauses[${index}] must be an object`); continue; }
    if (!String(rawClause.predicate ?? '').trim()) errors.push(`clauses[${index}].predicate is required`);
    if (!isObject(rawClause.roles)) errors.push(`clauses[${index}].roles must be an object`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Canonicalize a Lunum-Sem object to a deterministic form.
 *
 * This is the main entry point for canonicalization. It:
 * 1. Validates the input structure
 * 2. Normalizes schema, world, kind, and clauses
 * 3. Sorts and recursively canonicalizes nested structures
 * 4. Omits empty optional fields
 *
 * The output is deterministic: identical inputs always produce identical outputs.
 * Throw if validation fails.
 */
export function canonicalizeSem(value: unknown): LunumSem {
  const validation = validateSem(value);
  if (!validation.ok) throw new TypeError(`Invalid Lunum-Sem: ${validation.errors.join('; ')}`);
  const sem = value as unknown as LunumSem;
  const out: LunumSem = {
    schema: SEM_SCHEMA,
    world: normalizeIdentifier(sem.world),
    kind: normalizeIdentifier(sem.kind),
    clauses: sem.clauses.map(canonicalClause)
  };
  if (sem.references?.length) out.references = sem.references.map((item) => canonicalTerm(item as unknown as LunumTerm) as LunumTermObject);
  if (sem.provenance && Object.keys(sem.provenance).length) out.provenance = canonicalUnknown(sem.provenance) as Record<string, unknown>;
  if (sem.annotations && Object.keys(sem.annotations).length) out.annotations = canonicalUnknown(sem.annotations) as Record<string, unknown>;
  return out;
}

/**
 * Stable JSON stringification for deterministic hashing.
 *
 * This function produces a canonical JSON representation where:
 * - Object keys are sorted lexicographically (enables deterministic ordering)
 * - Arrays preserve their order (order is significant)
 * - All values are recursively stringified in the same manner
 *
 * The output is suitable for cryptographic hashing (SHA-256) because
 * identical input always produces identical output string, regardless
 * of object key insertion order or whitespace variation.
 *
 * Example:
 *   stableStringify({ b: 1, a: 2 }) === stableStringify({ a: 2, b: 1 })
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  const entries = Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
  return `{${entries.join(',')}}`;
}
