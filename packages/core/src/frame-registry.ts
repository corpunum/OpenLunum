import type { LunumClause, LunumSem, LunumTerm } from './types.js';
import { basicIdentifier, SEMANTIC_PROTOCOL_REGISTRY } from './semantic-registry.js';

export const SEMANTIC_FRAME_REGISTRY_VERSION = 'lunum-frame/0.5' as const;

export interface FrameRoleRequirement {
  name: string;
  required: boolean;
  allowedTermTypes?: readonly string[];
  /** The filler must be a registered protocol predicate given as a bare identifier (decisions/0008). */
  vocabulary?: 'predicate';
  description?: string;
}

export interface PredicateFrameDefinition {
  predicate: string;
  roles: readonly FrameRoleRequirement[];
  atLeastOneOf?: readonly string[];
  exclusiveGroups?: readonly (readonly string[])[];
  /** If the key role is present, every listed role must be present too (decisions/0010). */
  requiredWith?: Readonly<Record<string, readonly string[]>>;
  /** Each pair of roles, when both present, must not be the same term (decisions/0010). */
  distinctRoles?: readonly (readonly [string, string])[];
  description: string;
}

/** Compact, generated prompt representation of the canonical identity frames. */
export function canonicalFramePromptBlock(): string {
  return Object.values(CANONICAL_SEMANTIC_FRAMES).map((frame) => {
    const required = frame.roles.filter((role) => role.required).map((role) => role.name);
    const optional = frame.roles.filter((role) => !role.required).map((role) => role.name);
    const extras = [
      ...(optional.length ? [`optional: ${optional.join(', ')}`] : []),
      ...(frame.atLeastOneOf?.length ? [`at least one of: ${frame.atLeastOneOf.join('|')}`] : []),
      ...(frame.exclusiveGroups?.flatMap((group) => [`${group.join('|')} (mutually exclusive)`]) ?? []),
      ...Object.entries(frame.requiredWith ?? {}).map(([trigger, dependents]) => `${trigger} requires ${dependents.join(', ')}`),
      ...(frame.distinctRoles ?? []).map(([left, right]) => `${left} and ${right} must differ`),
      ...frame.roles.flatMap((role) => role.allowedTermTypes?.length ? [`${role.name}: ${role.allowedTermTypes.join('|')}`] : []),
      ...frame.roles.flatMap((role) => role.vocabulary === 'predicate' ? [`${role.name}: a registered predicate`] : [])
    ];
    return `${frame.predicate}(${required.length ? required.join(', ') : 'no required roles'}${extras.length ? `; ${extras.join('; ')}` : ''}) — ${frame.description}`;
  }).join('\n');
}

export interface FrameValidationIssue {
  path: string;
  predicate: string;
  code: 'missing_required_role' | 'unregistered_role' | 'disallowed_term_type' | 'role_conflict' | 'unexpected_role' | 'unframed_predicate' | 'duplicate_semantic_channel' | 'placeholder_role' | 'unregistered_action' | 'dependent_role_missing' | 'identical_roles' | 'ambiguous_negated_permission';
  message: string;
}

export interface FrameValidationResult {
  valid: boolean;
  issues: FrameValidationIssue[];
}

/**
 * Versioned Small Semantic Frame Registry for Controlled Predicates.
 * Defines canonical argument roles and requirements so two legal but structurally
 * different encodings cannot both claim exact identity for the same proposition.
 *
 * This is NOT a giant domain ontology; it defines the core operational predicate frames.
 */
export const CANONICAL_SEMANTIC_FRAMES: Readonly<Record<string, PredicateFrameDefinition>> = Object.freeze({
  prefer: Object.freeze({
    predicate: 'prefer',
    roles: Object.freeze([
      { name: 'experiencer', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: 'An experiencer has a preference for a theme.'
  }),
  send: Object.freeze({
    predicate: 'send',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'object', required: true },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'destination', required: false }
    ]),
    exclusiveGroups: Object.freeze([Object.freeze(['recipient', 'destination'])]),
    description: 'An agent transmits an object to a recipient or destination.'
  }),
  receive: Object.freeze({
    predicate: 'receive',
    roles: Object.freeze([
      { name: 'recipient', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true },
      { name: 'source', required: false }
    ]),
    description: 'A recipient accepts or receives a theme from a source.'
  }),
  believe: Object.freeze({
    predicate: 'believe',
    roles: Object.freeze([
      { name: 'experiencer', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: 'An experiencer holds a belief regarding a theme or proposition.'
  }),
  publish: Object.freeze({
    predicate: 'publish',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true },
      { name: 'audience', required: false }
    ]),
    description: 'An agent makes a theme available to an audience or public.'
  }),
  retry: Object.freeze({
    predicate: 'retry',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'count', required: false, allowedTermTypes: ['quantity'] },
      { name: 'theme', required: false }
    ]),
    atLeastOneOf: Object.freeze(['count', 'theme']),
    description: 'An agent (optional in imperatives) attempts an action again, with a count or action theme.'
  }),
  request: Object.freeze({
    predicate: 'request',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system'] }
    ]),
    description: 'An agent requests a theme or action from an optional recipient.'
  }),
  keep: Object.freeze({
    predicate: 'keep',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: false },
      { name: 'visibility', required: false }
    ]),
    atLeastOneOf: Object.freeze(['theme', 'visibility']),
    description: 'An agent retains a theme, optionally with an explicit visibility.'
  }),
  delete: Object.freeze({
    predicate: 'delete',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: false },
      { name: 'object', required: false },
      { name: 'target', required: false }
    ]),
    exclusiveGroups: Object.freeze([Object.freeze(['theme', 'object', 'target'])]),
    description: 'An agent removes or deletes an object/theme/target.'
  }),
  enable: Object.freeze({
    predicate: 'enable',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: 'An agent enables a feature, system, or capability.'
  }),
  disable: Object.freeze({
    predicate: 'disable',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: 'An agent disables a feature, system, or capability.'
  }),
  allow: Object.freeze({
    predicate: 'allow',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: false },
      { name: 'action', required: false, vocabulary: 'predicate' as const }
    ]),
    atLeastOneOf: Object.freeze(['theme', 'action']),
    requiredWith: Object.freeze({ action: Object.freeze(['recipient']) }),
    distinctRoles: Object.freeze([Object.freeze(['agent', 'recipient'] as const)]),
    description: 'A stated permitter (agent) permits a recipient to perform an action (a registered predicate) and/or to act on a theme (the object or resource). With no stated permitter ("X is permitted to Y"), use modality permission on Y instead.'
  }),
  prohibit: Object.freeze({
    predicate: 'prohibit',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: false },
      { name: 'action', required: false, vocabulary: 'predicate' as const }
    ]),
    atLeastOneOf: Object.freeze(['theme', 'action']),
    requiredWith: Object.freeze({ action: Object.freeze(['recipient']) }),
    distinctRoles: Object.freeze([Object.freeze(['agent', 'recipient'] as const)]),
    description: 'A stated authority (agent) forbids a recipient from performing an action (a registered predicate) and/or from acting on a theme (the object or resource). With no stated authority ("X must not Y"), use negation or modality on Y instead.'
  }),
  deploy: Object.freeze({
    predicate: 'deploy',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'destination', required: true }
    ]),
    description: 'An agent deploys to an environment or destination.'
  }),
  copy: Object.freeze({
    predicate: 'copy',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'source', required: true },
      { name: 'destination', required: true }
    ]),
    description: 'An agent copies a resource from source to destination.'
  }),
  rotate: Object.freeze({
    predicate: 'rotate',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: 'An agent rotates a credential or key.'
  }),
  deadline: Object.freeze({
    predicate: 'deadline',
    roles: Object.freeze([
      { name: 'subject', required: true },
      { name: 'time', required: true }
    ]),
    description: 'A subject has a deadline at time.'
  }),
  below: Object.freeze({
    predicate: 'below',
    roles: Object.freeze([
      { name: 'subject', required: true },
      { name: 'value', required: true }
    ]),
    description: 'A metric or subject is below a threshold or value.'
  }),
  above: Object.freeze({
    predicate: 'above',
    roles: Object.freeze([
      { name: 'subject', required: true },
      { name: 'value', required: true }
    ]),
    description: 'A metric or subject is above a threshold or value.'
  }),
  before: Object.freeze({
    predicate: 'before',
    roles: Object.freeze([
      { name: 'subject', required: true },
      { name: 'object', required: true }
    ]),
    description: 'A subject event precedes an object event.'
  }),
  after: Object.freeze({
    predicate: 'after',
    roles: Object.freeze([
      { name: 'subject', required: true },
      { name: 'object', required: true }
    ]),
    description: 'A subject event follows an object event.'
  }),
  confirmed: Object.freeze({
    predicate: 'confirmed',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: false }
    ]),
    atLeastOneOf: Object.freeze(['agent', 'theme']),
    description: 'An action or transaction is confirmed by an agent or for a theme.'
  }),
  confirm: Object.freeze({
    predicate: 'confirm',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: false }
    ]),
    atLeastOneOf: Object.freeze(['agent', 'theme']),
    description: 'An agent confirms an action or transaction.'
  }),
  // decisions/0014: common registered predicates with a conventional argument
  // structure, so plain statements and permitter-less permissions using them
  // can be represented. Agent is optional (imperatives), as for enable/delete.
  ...Object.fromEntries(([
    ['read', 'reads a document, record or resource'],
    ['write', 'writes to a document, record or resource'],
    ['update', 'updates or edits a document, record or resource'],
    ['create', 'creates a document, record or resource'],
    ['access', 'accesses a resource or place'],
    ['archive', 'archives a document, record or resource'],
    ['store', 'stores or saves an item'],
    ['approve', 'approves a request, document or action'],
    ['run', 'runs or executes a job, task or process'],
    ['restart', 'restarts a system, service or process'],
  ] as const).map(([predicate, gloss]) => [predicate, Object.freeze({
    predicate,
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: `An agent ${gloss}.`
  })])),
  share: Object.freeze({
    predicate: 'share',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system', 'group', 'audience'] }
    ]),
    description: 'An agent shares a theme, optionally with a recipient.'
  }),
  notify: Object.freeze({
    predicate: 'notify',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'recipient', required: true, allowedTermTypes: ['actor', 'entity', 'system', 'group', 'audience'] },
      { name: 'theme', required: false }
    ]),
    description: 'An agent notifies a recipient, optionally about a theme.'
  }),
  grant: Object.freeze({
    predicate: 'grant',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system', 'group'] },
      { name: 'theme', required: true }
    ]),
    description: 'An agent grants a theme (access, a role, a credential) to a recipient.'
  }),
  revoke: Object.freeze({
    predicate: 'revoke',
    roles: Object.freeze([
      { name: 'agent', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system', 'group'] },
      { name: 'theme', required: true }
    ]),
    description: 'An agent revokes a theme (access, a role, a credential) from a recipient.'
  })
});

function getTermType(term: LunumTerm | undefined): string | undefined {
  if (term !== null && typeof term === 'object' && !Array.isArray(term) && typeof term.type === 'string') {
    return basicIdentifier(term.type);
  }
  return undefined;
}

/**
 * Validates a single clause against registered canonical frame requirements if defined.
 */
/**
 * A role filler that restates only its own term type or the clause predicate
 * (`allow … theme: {type: 'access', value: 'access'}`) names no argument; it
 * is how extractors paper over a role the source leaves unstated. Treat it as
 * absent so the frame fails and the extractor must abstain (decisions/0007).
 * A typed term with no content at all (`{type: 'access'}`) is also a
 * placeholder. Terms with an `id` are named instances and never placeholders.
 */
function identityKey(term: LunumTerm | undefined): string {
  if (term && typeof term === 'object' && !Array.isArray(term)) {
    const record = term as Record<string, unknown>;
    return basicIdentifier(String(record.id ?? record.ref ?? record.value ?? ''));
  }
  return basicIdentifier(String(term ?? ''));
}

function isPlaceholderTerm(term: LunumTerm | undefined, predicate: string): boolean {
  if (typeof term === 'string') return basicIdentifier(term) === predicate;
  if (!term || typeof term !== 'object' || Array.isArray(term)) return false;
  const record = term as Record<string, unknown>;
  if (record.id !== undefined && record.id !== null && record.id !== '') return false;
  // A typed term with no id, value or other content names nothing.
  if (Object.keys(record).every((key) => key === 'type' || record[key] === undefined || record[key] === null || record[key] === '')) return true;
  if (typeof record.value !== 'string') return false;
  const value = basicIdentifier(record.value);
  return value === predicate || (typeof record.type === 'string' && value === basicIdentifier(record.type));
}

export function validateClauseFrame(clause: LunumClause, pathPrefix = 'clause'): FrameValidationIssue[] {
  const issues: FrameValidationIssue[] = [];
  const predicate = basicIdentifier(clause.predicate);
  const frame = CANONICAL_SEMANTIC_FRAMES[predicate];

  if (!frame) {
    if (SEMANTIC_PROTOCOL_REGISTRY.predicates.includes(predicate)) {
      issues.push({ path: `${pathPrefix}.predicate`, predicate, code: 'unframed_predicate', message: `Registered predicate '${predicate}' has no canonical semantic frame` });
    }
    return issues;
  }

  const roleMap = new Map<string, LunumTerm>();
  for (const [k, v] of Object.entries(clause.roles ?? {})) {
    roleMap.set(basicIdentifier(k), v);
  }

  // decisions/0015: a prohibition is modality obligation + negated (the protocol
  // normalizes must_not/forbidden that way). permission + negated literally means
  // "permitted not to", which extractors misuse for prohibitions and which then
  // splits one meaning across two identities. Fail closed.
  if (clause.modality === 'permission' && clause.negated === true) {
    issues.push({ path: `${pathPrefix}.modality`, predicate, code: 'ambiguous_negated_permission', message: "permission with negated=true is ambiguous; for a prohibition use modality 'obligation' with negated=true (or prohibit with a stated authority); abstain for 'permitted not to'" });
  }

  const exclusiveGroups = frame.exclusiveGroups ?? [];
  for (const group of exclusiveGroups) {
    const present = group.filter((role) => roleMap.has(role));
    if (present.length > 1) {
      issues.push({
        path: `${pathPrefix}.roles`, predicate, code: 'role_conflict',
        message: `Predicate '${predicate}' permits only one of [${group.join(', ')}]; found [${present.join(', ')}]`
      });
    }
  }

  if (clause.time !== undefined && roleMap.has('time')) {
    issues.push({ path: `${pathPrefix}.time`, predicate, code: 'duplicate_semantic_channel', message: `Predicate '${predicate}' cannot encode time in both roles.time and clause.time` });
  }

  if (predicate === 'delete' && !['theme', 'object', 'target'].some((role) => roleMap.has(role))) {
    issues.push({
      path: `${pathPrefix}.roles`, predicate, code: 'missing_required_role',
      message: "Predicate 'delete' requires one target role: 'theme', 'object', or 'target'"
    });
  }

  const registeredRoles = new Set(SEMANTIC_PROTOCOL_REGISTRY.roles);
  const declaredRoles = new Set(frame.roles.map((role) => role.name));
  for (const role of roleMap.keys()) {
    if (!registeredRoles.has(role)) {
      issues.push({
        path: `${pathPrefix}.roles.${role}`,
        predicate,
        code: 'unregistered_role',
        message: `Role '${role}' is not registered in the semantic protocol`
      });
    }
    if (!declaredRoles.has(role)) {
      issues.push({ path: `${pathPrefix}.roles.${role}`, predicate, code: 'unexpected_role', message: `Role '${role}' is not allowed by the canonical '${predicate}' frame` });
    }
  }

  for (const [role, term] of roleMap) {
    if (isPlaceholderTerm(term, predicate)) {
      issues.push({ path: `${pathPrefix}.roles.${role}`, predicate, code: 'placeholder_role', message: `Role '${role}' for predicate '${predicate}' restates its type or predicate instead of naming an argument; abstain if the source does not state it` });
    }
  }

  // Check required roles
  for (const req of frame.roles) {
    if (req.required && !roleMap.has(req.name)) {
      issues.push({
        path: `${pathPrefix}.roles`,
        predicate,
        code: 'missing_required_role',
        message: `Predicate '${predicate}' requires role '${req.name}'`
      });
    }

    if (roleMap.has(req.name) && req.vocabulary === 'predicate') {
      const value = roleMap.get(req.name);
      if (typeof value !== 'string' || value !== basicIdentifier(value) || !SEMANTIC_PROTOCOL_REGISTRY.predicates.includes(value)) {
        issues.push({
          path: `${pathPrefix}.roles.${req.name}`, predicate, code: 'unregistered_action',
          message: `Role '${req.name}' for predicate '${predicate}' must be a registered predicate identifier (e.g. 'read', 'update'); abstain if the action has no registered predicate`
        });
      }
    }

    if (roleMap.has(req.name) && req.allowedTermTypes?.length) {
      const term = roleMap.get(req.name);
      const termType = getTermType(term);
      if (!termType || !req.allowedTermTypes.includes(termType)) {
        issues.push({
          path: `${pathPrefix}.roles.${req.name}`,
          predicate,
          code: 'disallowed_term_type',
          message: `Role '${req.name}' for predicate '${predicate}' has ${termType ? `disallowed term type '${termType}'` : 'no typed term'}; expected one of [${req.allowedTermTypes.join(', ')}]`
        });
      }
    }
  }

  for (const [trigger, dependents] of Object.entries(frame.requiredWith ?? {})) {
    if (!roleMap.has(trigger)) continue;
    for (const dependent of dependents) {
      if (!roleMap.has(dependent)) issues.push({ path: `${pathPrefix}.roles`, predicate, code: 'dependent_role_missing', message: `Predicate '${predicate}' with role '${trigger}' also requires role '${dependent}'; if the source does not state it, use modality on the action's own predicate or abstain` });
    }
  }
  for (const [left, right] of frame.distinctRoles ?? []) {
    if (roleMap.has(left) && roleMap.has(right) && identityKey(roleMap.get(left)) === identityKey(roleMap.get(right))) {
      issues.push({ path: `${pathPrefix}.roles.${right}`, predicate, code: 'identical_roles', message: `Predicate '${predicate}' needs different '${left}' and '${right}'` });
    }
  }

  if (frame.atLeastOneOf?.length && !frame.atLeastOneOf.some((role) => roleMap.has(role))) {
    issues.push({ path: `${pathPrefix}.roles`, predicate, code: 'missing_required_role', message: `Predicate '${predicate}' requires at least one of [${frame.atLeastOneOf.join(', ')}]` });
  }

  return issues;
}

/**
 * Validates all clauses in a LunumSem against canonical semantic frames.
 */
export function validateSemFrames(sem: LunumSem): FrameValidationResult {
  const issues: FrameValidationIssue[] = [];

  function walk(clauses: LunumClause[] | undefined, prefix: string): void {
    for (const [index, clause] of (clauses ?? []).entries()) {
      const path = `${prefix}[${index}]`;
      issues.push(...validateClauseFrame(clause, path));
      if (clause.conditions?.length) walk(clause.conditions, `${path}.conditions`);
      if (clause.consequences?.length) walk(clause.consequences, `${path}.consequences`);
    }
  }

  walk(sem.clauses, 'clauses');
  return {
    valid: issues.length === 0,
    issues
  };
}
