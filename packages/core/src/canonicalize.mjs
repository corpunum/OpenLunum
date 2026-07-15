import { SEM_SCHEMA } from './constants.mjs';

function normalizeIdentifier(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, '_')
    .toLocaleLowerCase('und');
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function canonicalTerm(term) {
  if (term === null || typeof term === 'boolean' || typeof term === 'number') return term;
  if (typeof term === 'string') return normalizeText(term);
  if (Array.isArray(term)) return term.map(canonicalTerm);
  const out = {};
  for (const key of Object.keys(term).sort()) {
    const value = term[key];
    if (value === undefined) continue;
    if (key === 'id' || key === 'type' || key === 'ref') out[key] = normalizeIdentifier(value);
    else if (key === 'language') out[key] = normalizeIdentifier(value);
    else if (key === 'value' && typeof value === 'string') out[key] = normalizeText(value);
    else out[key] = canonicalTerm(value);
  }
  return out;
}

function canonicalClause(clause = {}) {
  const roles = {};
  for (const key of Object.keys(clause.roles || {}).sort()) roles[normalizeIdentifier(key)] = canonicalTerm(clause.roles[key]);
  const out = {
    predicate: normalizeIdentifier(clause.predicate),
    roles,
    negated: clause.negated === true
  };
  if (clause.modality != null) out.modality = normalizeIdentifier(clause.modality);
  if (clause.time != null) out.time = canonicalTerm(clause.time);
  if (Array.isArray(clause.conditions) && clause.conditions.length) out.conditions = clause.conditions.map(canonicalClause);
  if (Array.isArray(clause.consequences) && clause.consequences.length) out.consequences = clause.consequences.map(canonicalClause);
  if (clause.annotations && Object.keys(clause.annotations).length) out.annotations = canonicalTerm(clause.annotations);
  return out;
}

export function validateSem(sem) {
  const errors = [];
  if (!sem || typeof sem !== 'object' || Array.isArray(sem)) errors.push('sem must be an object');
  if (sem?.schema !== SEM_SCHEMA) errors.push(`schema must equal ${SEM_SCHEMA}`);
  if (!String(sem?.world || '').trim()) errors.push('world is required');
  if (!String(sem?.kind || '').trim()) errors.push('kind is required');
  if (!Array.isArray(sem?.clauses) || sem.clauses.length === 0) errors.push('clauses must be a non-empty array');
  for (const [index, clause] of (sem?.clauses || []).entries()) {
    if (!String(clause?.predicate || '').trim()) errors.push(`clauses[${index}].predicate is required`);
    if (!clause?.roles || typeof clause.roles !== 'object' || Array.isArray(clause.roles)) errors.push(`clauses[${index}].roles must be an object`);
  }
  return { ok: errors.length === 0, errors };
}

export function canonicalizeSem(sem) {
  const validation = validateSem(sem);
  if (!validation.ok) throw new TypeError(`Invalid Lunum-Sem: ${validation.errors.join('; ')}`);
  const out = {
    schema: SEM_SCHEMA,
    world: normalizeIdentifier(sem.world),
    kind: normalizeIdentifier(sem.kind),
    clauses: sem.clauses.map(canonicalClause)
  };
  if (Array.isArray(sem.references) && sem.references.length) out.references = sem.references.map(canonicalTerm);
  if (sem.provenance && Object.keys(sem.provenance).length) out.provenance = canonicalTerm(sem.provenance);
  if (sem.annotations && Object.keys(sem.annotations).length) out.annotations = canonicalTerm(sem.annotations);
  return out;
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}
