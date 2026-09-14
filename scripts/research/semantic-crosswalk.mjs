#!/usr/bin/env node

import { SEMANTIC_PROTOCOL_REGISTRY } from '../../packages/core/dist/src/semantic-registry.js';

const SUPPORTED_OUTCOMES = new Set(['parse', 'abstain']);
function reject(message) { throw new Error(`crosswalk_rejected:${message}`); }

function mapped(map, field, value) {
  if (!map || !Object.prototype.hasOwnProperty.call(map, value) || typeof map[value] !== 'string' || !map[value]) {
    reject(`unmapped_${field}:${value}`);
  }
  const result = map[value];
  const registry = field === 'predicate' ? SEMANTIC_PROTOCOL_REGISTRY.predicates
    : field === 'role' ? SEMANTIC_PROTOCOL_REGISTRY.roles
      : field === 'kind' ? SEMANTIC_PROTOCOL_REGISTRY.kinds
        : field === 'world' ? SEMANTIC_PROTOCOL_REGISTRY.worlds
          : field === 'modality' ? SEMANTIC_PROTOCOL_REGISTRY.modalities : [];
  if (!registry.includes(result)) reject(`invalid_${field}:${result}`);
  return result;
}

function optionalMapped(map, field, value) {
  return value === undefined || value === null ? value : mapped(map, field, value);
}

/** Experimental, loss-aware PropBank -> Lunum IR adapter. */
export function propbankToLunumIr({ roleset, predicate, arguments: argumentsList, predicateMap, roleMap, kind, kindMap }) {
  if (typeof roleset !== 'string' || !roleset) reject('roleset_required');
  if (typeof predicate !== 'string' || !predicate) reject('predicate_required');
  if (!Array.isArray(argumentsList) || !argumentsList.every((item) => item && typeof item === 'object')) reject('arguments_invalid');
  if (!roleMap || typeof roleMap !== 'object') reject('roleset_role_map_required');
  const mappedPredicate = mapped(predicateMap, 'predicate', predicate);
  const roles = {};
  for (const argument of argumentsList) {
    const targetRole = roleMap[argument.label];
    if (typeof targetRole !== 'string' || !targetRole) reject(`unmapped_role:${argument.label}`);
    if (roles[targetRole]) reject(`duplicate_lunum_role:${targetRole}`);
    roles[targetRole] = { handle: argument.handle, evidence: { source: 'propbank', roleset, label: argument.label } };
  }
  const mappedKind = optionalMapped(kindMap, 'kind', kind);
  return {
    version: 'lunum-ir/0.1', outcome: 'parse',
    ...(mappedKind === undefined || mappedKind === null ? {} : { kind: mappedKind }),
    predicate: mappedPredicate, roles,
    sourceAnnotations: [{ scheme: 'propbank', roleset }]
  };
}

/** Conservative UMR-like adapter; unsupported graph fields fail explicitly. */
export function umrLikeToLunumIr(input, { predicateMap = {}, roleMap = {}, kindMap = {}, worldMap = {}, modalityMap = {} } = {}) {
  if (!input || typeof input !== 'object') reject('input_invalid');
  if (!SUPPORTED_OUTCOMES.has(input.outcome ?? 'parse')) reject('outcome_unsupported');
  if (input.outcome === 'abstain') return { version: 'lunum-ir/0.1', outcome: 'abstain', abstentionReason: input.abstentionReason ?? 'unresolved' };
  const predicate = mapped(predicateMap, 'predicate', input.predicate);
  const roles = {};
  for (const [sourceRole, value] of Object.entries(input.roles ?? {})) {
    const targetRole = mapped(roleMap, 'role', sourceRole);
    if (roles[targetRole]) reject(`duplicate_lunum_role:${targetRole}`);
    roles[targetRole] = value;
  }
  const supported = new Set(['outcome', 'predicate', 'roles', 'kind', 'world', 'negated', 'modality', 'time', 'conditions', 'consequences']);
  const unsupported = Object.keys(input).filter((key) => !supported.has(key));
  if (unsupported.length) reject(`unsupported_fields:${unsupported.join(',')}`);
  const world = optionalMapped(worldMap, 'world', input.world);
  const kind = optionalMapped(kindMap, 'kind', input.kind);
  const modality = optionalMapped(modalityMap, 'modality', input.modality);
  return {
    version: 'lunum-ir/0.1', outcome: 'parse',
    ...(world === undefined || world === null ? {} : { world }),
    ...(kind === undefined || kind === null ? {} : { kind }),
    predicate, roles,
    ...(input.negated === undefined ? {} : { negated: input.negated }),
    ...(modality === undefined || modality === null ? {} : { modality }),
    ...(input.time === undefined ? {} : { time: input.time }),
    ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
    ...(input.consequences === undefined ? {} : { consequences: input.consequences }),
    sourceAnnotations: [{ scheme: 'umr-like' }]
  };
}
