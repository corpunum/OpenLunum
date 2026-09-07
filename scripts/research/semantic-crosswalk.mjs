#!/usr/bin/env node

const SUPPORTED_OUTCOMES = new Set(['parse', 'abstain']);
function reject(message) { throw new Error(`crosswalk_rejected:${message}`); }

/** Experimental, loss-aware PropBank -> Lunum IR adapter. */
export function propbankToLunumIr({ roleset, predicate, arguments: argumentsList, roleMap }) {
  if (typeof roleset !== 'string' || !roleset) reject('roleset_required');
  if (typeof predicate !== 'string' || !predicate) reject('predicate_required');
  if (!Array.isArray(argumentsList) || !argumentsList.every((item) => item && typeof item === 'object')) reject('arguments_invalid');
  if (!roleMap || typeof roleMap !== 'object') reject('roleset_role_map_required');
  const roles = {};
  for (const argument of argumentsList) {
    const targetRole = roleMap[argument.label];
    if (typeof targetRole !== 'string' || !targetRole) reject(`unmapped_role:${argument.label}`);
    if (roles[targetRole]) reject(`duplicate_lunum_role:${targetRole}`);
    roles[targetRole] = { handle: argument.handle, evidence: { source: 'propbank', roleset, label: argument.label } };
  }
  return { version: 'lunum-ir/0.1', outcome: 'parse', kind: 'event', predicate, roles, sourceAnnotations: [{ scheme: 'propbank', roleset }] };
}

/** Conservative UMR-like adapter; unsupported graph fields fail explicitly. */
export function umrLikeToLunumIr(input, { predicateMap = {}, roleMap = {} } = {}) {
  if (!input || typeof input !== 'object') reject('input_invalid');
  if (!SUPPORTED_OUTCOMES.has(input.outcome ?? 'parse')) reject('outcome_unsupported');
  if (input.outcome === 'abstain') return { version: 'lunum-ir/0.1', outcome: 'abstain', abstentionReason: input.abstentionReason ?? 'unresolved' };
  const predicate = predicateMap[input.predicate] ?? input.predicate;
  if (typeof predicate !== 'string' || !predicate) reject('predicate_unmapped');
  const roles = {};
  for (const [sourceRole, value] of Object.entries(input.roles ?? {})) {
    const targetRole = roleMap[sourceRole] ?? sourceRole;
    if (roles[targetRole]) reject(`duplicate_lunum_role:${targetRole}`);
    roles[targetRole] = value;
  }
  const supported = new Set(['outcome', 'predicate', 'roles', 'kind', 'world', 'negated', 'modality', 'time', 'conditions', 'consequences']);
  const unsupported = Object.keys(input).filter((key) => !supported.has(key));
  if (unsupported.length) reject(`unsupported_fields:${unsupported.join(',')}`);
  return { version: 'lunum-ir/0.1', outcome: 'parse', world: input.world, kind: input.kind, predicate, roles, negated: input.negated, modality: input.modality, time: input.time, conditions: input.conditions, consequences: input.consequences, sourceAnnotations: [{ scheme: 'umr-like' }] };
}
