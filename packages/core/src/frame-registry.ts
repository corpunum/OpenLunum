import type { LunumClause, LunumSem, LunumTerm } from './types.js';
import { basicIdentifier, SEMANTIC_PROTOCOL_REGISTRY } from './semantic-registry.js';

export const SEMANTIC_FRAME_REGISTRY_VERSION = 'lunum-frame/0.1' as const;

export interface FrameRoleRequirement {
  name: string;
  required: boolean;
  allowedTermTypes?: readonly string[];
  description?: string;
}

export interface PredicateFrameDefinition {
  predicate: string;
  roles: readonly FrameRoleRequirement[];
  atLeastOneOf?: readonly string[];
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
      ...(frame.predicate === 'send' ? ['recipient|destination (mutually exclusive)'] : []),
      ...(frame.predicate === 'delete' ? ['theme|object|target (mutually exclusive)'] : [])
    ];
    return `${frame.predicate}(${required.length ? required.join(', ') : 'no required roles'}${extras.length ? `; ${extras.join('; ')}` : ''})`;
  }).join('\n');
}

export interface FrameValidationIssue {
  path: string;
  predicate: string;
  code: 'missing_required_role' | 'unregistered_role' | 'disallowed_term_type' | 'role_conflict' | 'unexpected_role' | 'unframed_predicate' | 'duplicate_semantic_channel';
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
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'count', required: false, allowedTermTypes: ['quantity'] },
      { name: 'theme', required: false }
    ]),
    atLeastOneOf: Object.freeze(['count', 'theme']),
    description: 'An agent attempts an action again, with a count or action theme.'
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
      { name: 'theme', required: true }
    ]),
    description: 'An agent permits a recipient to perform an action or access a theme.'
  }),
  prohibit: Object.freeze({
    predicate: 'prohibit',
    roles: Object.freeze([
      { name: 'agent', required: true, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'recipient', required: false, allowedTermTypes: ['actor', 'entity', 'system'] },
      { name: 'theme', required: true }
    ]),
    description: 'An agent forbids a recipient from performing an action or accessing a theme.'
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

  const exclusiveGroups: readonly (readonly string[])[] = predicate === 'send'
    ? [['recipient', 'destination']]
    : predicate === 'delete'
      ? [['theme', 'object', 'target']]
      : [];
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
