import { SEM_SCHEMA } from './constants.js';
import { CANONICAL_SEMANTIC_FRAMES, validateSemFrames } from './frame-registry.js';
import { SEMANTIC_PROTOCOL_REGISTRY, basicIdentifier } from './semantic-registry.js';
import { validateSem } from './canonicalize.js';
import type { LunumClause, LunumSem, LunumTerm } from './types.js';

/**
 * Input for the frame-first agent workflow. The builder only supplies the
 * transport envelope; it never infers a role value or promotes the result.
 */
export interface CandidateBuilderInput {
  world: string;
  kind: string;
  predicate: string;
  roles: Record<string, LunumTerm>;
  negated?: boolean;
  modality?: string | null;
  time?: LunumTerm;
  conditions?: LunumClause[];
  consequences?: LunumClause[];
}

export interface CandidateBuilderResult {
  sem: LunumSem;
  frame: (typeof CANONICAL_SEMANTIC_FRAMES)[string];
  allowedRoles: readonly string[];
  requiredRoles: readonly string[];
  /** Explicit alternatives that satisfy a frame's minimum semantic target. */
  atLeastOneOf: readonly string[] | null;
}

/**
 * Runtime JSON Schema for the frame-first envelope.  This is generated from
 * the same registry used by the builder; it is a transport preflight only.
 * The builder remains authoritative because JSON Schema cannot express every
 * semantic/frame invariant (grounding and exact identity in particular).
 */
export function getCandidateBuilderSchema(): Record<string, unknown> {
  const termObject: Record<string, unknown> = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...SEMANTIC_PROTOCOL_REGISTRY.termTypes] },
      id: { type: 'string' },
      value: {},
    },
    required: ['type'],
    additionalProperties: true,
  };
  const term: Record<string, unknown> = {
    oneOf: [
      { type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' },
      { type: 'array', items: { $ref: '#/$defs/term' } }, { $ref: '#/$defs/termObject' },
    ],
  };
  const clauseRef = { $ref: '#/$defs/clause' };
  const commonProperties: Record<string, unknown> = {
    world: { type: 'string', enum: [...SEMANTIC_PROTOCOL_REGISTRY.worlds] },
    kind: { type: 'string', enum: [...SEMANTIC_PROTOCOL_REGISTRY.kinds] },
    negated: { type: 'boolean' },
    modality: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    time: { $ref: '#/$defs/term' },
    conditions: { type: 'array', items: clauseRef },
    consequences: { type: 'array', items: clauseRef },
  };
  const variants = Object.values(CANONICAL_SEMANTIC_FRAMES).map((frame) => {
    const roleProperties: Record<string, unknown> = {};
    for (const role of frame.roles) roleProperties[role.name] = { $ref: '#/$defs/term' };
    const requiredRoles = frame.roles.filter((role) => role.required).map((role) => role.name);
    const roleSchema: Record<string, unknown> = { type: 'object', properties: roleProperties, additionalProperties: false, ...(requiredRoles.length ? { required: requiredRoles } : {}) };
    if (frame.atLeastOneOf?.length) roleSchema.anyOf = frame.atLeastOneOf.map((role) => ({ required: [role] }));
    return {
      type: 'object',
      properties: { ...commonProperties, predicate: { const: frame.predicate }, roles: roleSchema },
      required: ['world', 'kind', 'predicate', 'roles'],
      additionalProperties: false,
    };
  });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://lunum.dev/schema/agent-builder/0.1',
    title: 'OpenLunum frame-first candidate builder input',
    oneOf: variants,
    $defs: { term, termObject, clause: { oneOf: variants }, },
  };
}

function assertNestedFrames(clauses: readonly LunumClause[], field: 'conditions' | 'consequences'): void {
  for (const [index, clause] of clauses.entries()) {
    const predicate = basicIdentifier(clause?.predicate ?? '');
    if (!CANONICAL_SEMANTIC_FRAMES[predicate]) throw new TypeError(`invalid_builder_frame:${field}[${index}].predicate is not framed`);
    if (clause.conditions !== undefined) {
      if (!Array.isArray(clause.conditions)) throw new TypeError(`invalid_builder_${field}:${index}.conditions must be an array`);
      assertNestedFrames(clause.conditions, 'conditions');
    }
    if (clause.consequences !== undefined) {
      if (!Array.isArray(clause.consequences)) throw new TypeError(`invalid_builder_${field}:${index}.consequences must be an array`);
      assertNestedFrames(clause.consequences, 'consequences');
    }
  }
}

/**
 * Construct a transport-shaped candidate from agent-selected frame slots.
 *
 * This is intentionally stricter than the general candidate submission path:
 * exact-identity extraction currently supports only registered canonical
 * frames. The returned Sem remains untrusted and must still pass
 * submitCandidate() (including grounding and identity gates).
 */
export function buildCandidateSem(input: CandidateBuilderInput): CandidateBuilderResult {
  if (!input || typeof input !== 'object') throw new TypeError('builder_input_required');
  const allowedInputFields = new Set(['world', 'kind', 'predicate', 'roles', 'negated', 'modality', 'time', 'conditions', 'consequences']);
  const unknownInputFields = Object.keys(input as unknown as Record<string, unknown>).filter((key) => !allowedInputFields.has(key));
  if (unknownInputFields.length) throw new TypeError(`unknown_builder_fields:${unknownInputFields.sort().join(',')}`);
  if (typeof input.world !== 'string') throw new TypeError('builder_world_string_required');
  if (typeof input.kind !== 'string') throw new TypeError('builder_kind_string_required');
  if (typeof input.predicate !== 'string') throw new TypeError('builder_predicate_string_required');
  const world = basicIdentifier(input.world);
  const kind = basicIdentifier(input.kind);
  const predicate = basicIdentifier(input.predicate);
  if (!SEMANTIC_PROTOCOL_REGISTRY.worlds.includes(world)) throw new TypeError(`unknown_world:${world}`);
  if (!SEMANTIC_PROTOCOL_REGISTRY.kinds.includes(kind)) throw new TypeError(`unknown_kind:${kind}`);
  if (!SEMANTIC_PROTOCOL_REGISTRY.predicates.includes(predicate)) throw new TypeError(`unknown_predicate:${predicate}`);
  const frame = CANONICAL_SEMANTIC_FRAMES[predicate];
  if (!frame) throw new TypeError(`unframed_predicate:${predicate}`);
  if (!input.roles || typeof input.roles !== 'object' || Array.isArray(input.roles)) throw new TypeError('roles_object_required');
  const rolePrototype = Object.getPrototypeOf(input.roles);
  if (rolePrototype !== Object.prototype && rolePrototype !== null) throw new TypeError('roles_plain_object_required');
  const roles: Record<string, LunumTerm> = Object.create(null) as Record<string, LunumTerm>;
  for (const [rawRole, term] of Object.entries(input.roles)) {
    if (typeof rawRole !== 'string') throw new TypeError('builder_role_string_required');
    const normalizedRole = SEMANTIC_PROTOCOL_REGISTRY.aliases.role[basicIdentifier(rawRole)] ?? basicIdentifier(rawRole);
    if (roles[normalizedRole] !== undefined) throw new TypeError(`role_collision:${rawRole}->${normalizedRole}`);
    roles[normalizedRole] = term;
  }
  const allowedRoles = frame.roles.map((role) => role.name);
  const unexpected = Object.keys(roles).filter((role) => !allowedRoles.includes(basicIdentifier(role)));
  if (unexpected.length) throw new TypeError(`unexpected_frame_roles:${unexpected.join(',')}`);
  const clause: LunumClause = { predicate, roles };
  if (input.negated !== undefined) clause.negated = input.negated;
  if (input.modality !== undefined) clause.modality = input.modality;
  if (input.time !== undefined) clause.time = input.time;
  if (input.conditions !== undefined) clause.conditions = input.conditions;
  if (input.consequences !== undefined) clause.consequences = input.consequences;
  if (input.conditions !== undefined) {
    if (!Array.isArray(input.conditions)) throw new TypeError('invalid_builder_conditions:must be an array');
    assertNestedFrames(input.conditions, 'conditions');
  }
  if (input.consequences !== undefined) {
    if (!Array.isArray(input.consequences)) throw new TypeError('invalid_builder_consequences:must be an array');
    assertNestedFrames(input.consequences, 'consequences');
  }
  const sem: LunumSem = { schema: SEM_SCHEMA, world, kind, clauses: [clause] };
  const transport = validateSem(sem);
  if (!transport.ok) throw new TypeError(`invalid_builder_candidate:${transport.errors.join('; ')}`);
  const frameValidation = validateSemFrames(sem);
  if (!frameValidation.valid) throw new TypeError(`invalid_builder_frame:${frameValidation.issues.map((issue) => issue.code).join(',')}`);
  return {
    sem,
    frame,
    allowedRoles: Object.freeze(allowedRoles),
    requiredRoles: Object.freeze(frame.roles.filter((role) => role.required).map((role) => role.name)),
    atLeastOneOf: frame.atLeastOneOf?.length ? Object.freeze([...frame.atLeastOneOf]) : null,
  };
}
