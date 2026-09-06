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
 * Construct a transport-shaped candidate from agent-selected frame slots.
 *
 * This is intentionally stricter than the general candidate submission path:
 * exact-identity extraction currently supports only registered canonical
 * frames. The returned Sem remains untrusted and must still pass
 * submitCandidate() (including grounding and identity gates).
 */
export function buildCandidateSem(input: CandidateBuilderInput): CandidateBuilderResult {
  if (!input || typeof input !== 'object') throw new TypeError('builder_input_required');
  const world = basicIdentifier(input.world);
  const kind = basicIdentifier(input.kind);
  const predicate = basicIdentifier(input.predicate);
  if (!SEMANTIC_PROTOCOL_REGISTRY.worlds.includes(world)) throw new TypeError(`unknown_world:${world}`);
  if (!SEMANTIC_PROTOCOL_REGISTRY.kinds.includes(kind)) throw new TypeError(`unknown_kind:${kind}`);
  if (!SEMANTIC_PROTOCOL_REGISTRY.predicates.includes(predicate)) throw new TypeError(`unknown_predicate:${predicate}`);
  const frame = CANONICAL_SEMANTIC_FRAMES[predicate];
  if (!frame) throw new TypeError(`unframed_predicate:${predicate}`);
  if (!input.roles || typeof input.roles !== 'object' || Array.isArray(input.roles)) throw new TypeError('roles_object_required');
  const roles: Record<string, LunumTerm> = {};
  for (const [rawRole, term] of Object.entries(input.roles)) {
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
    atLeastOneOf: frame.atLeastOneOf ? Object.freeze([...frame.atLeastOneOf]) : null,
  };
}
