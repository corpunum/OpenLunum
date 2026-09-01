import type { LunumClause, LunumReference, LunumSem, LunumTerm } from './types.js';
import { canonicalizeSem, validateSem } from './canonicalize.js';

/**
 * Versioned protocol vocabulary. This is intentionally a protocol registry,
 * not an application ontology: instance identifiers remain open data.
 */
export const SEMANTIC_PROTOCOL_VERSION = 'lunum-protocol/0.1' as const;
export type ProtocolField = 'world' | 'kind' | 'predicate' | 'role' | 'term_type' | 'modality';

export interface ProtocolRegistry {
  version: typeof SEMANTIC_PROTOCOL_VERSION;
  worlds: readonly string[];
  kinds: readonly string[];
  predicates: readonly string[];
  roles: readonly string[];
  termTypes: readonly string[];
  modalities: readonly string[];
  aliases: Readonly<Record<ProtocolField, Readonly<Record<string, string>>>>;
}

const freezeMap = (entries: Record<string, string>): Readonly<Record<string, string>> => Object.freeze(entries);

/**
 * Closed protocol fields are deliberately small and extensible through the
 * explicit x- namespace. Domain nouns and product concepts do not belong here.
 */
export const SEMANTIC_PROTOCOL_REGISTRY: ProtocolRegistry = Object.freeze({
  version: SEMANTIC_PROTOCOL_VERSION,
  // These are the six worlds established by the original Lunum registry.
  // Hypothetical/counterfactual are not silently promoted into a seventh
  // world: they require an explicitly versioned protocol extension.
  worlds: Object.freeze(['real', 'fiction', 'tool', 'dream', 'belief', 'metaphor']),
  kinds: Object.freeze([
    'simple_fact', 'preference', 'instruction', 'command', 'plan', 'plan_instruction', 'event',
    'observation', 'belief_state', 'fiction', 'uncertainty', 'condition',
    'safety_constraint', 'project_state', 'tool_event', 'conditional_instruction'
  ]),
  predicates: Object.freeze([
    'prefer', 'request', 'confirm', 'delete', 'enable', 'disable', 'allow', 'prohibit',
    'require', 'believe', 'observe', 'remind', 'deadline', 'below', 'above', 'before',
    'after', 'share', 'store', 'access', 'send', 'receive', 'create', 'update', 'read',
    'write', 'deploy', 'notify', 'authenticate', 'grant', 'revoke', 'archive', 'translate',
    'state', 'approve', 'copy', 'publish', 'restart', 'retry', 'rotate', 'run', 'confirmed',
    'is_healthy', 'keep', 'wait', 'request_extension'
  ]),
  roles: Object.freeze([
    'agent', 'experiencer', 'subject', 'actor', 'recipient', 'object', 'theme', 'patient',
    'target', 'source', 'destination', 'location', 'time', 'manner', 'value', 'reason',
    'evidence', 'proposition', 'condition', 'consequence', 'threshold', 'amount', 'scope',
    'purpose', 'audience', 'visibility', 'instrument', 'channel', 'region', 'order', 'duration',
    'parallelism', 'result', 'benefit', 'capability', 'from', 'to', 'id', 'issuer', 'terms',
    'role', 'window', 'unit', 'count'
  ]),
  termTypes: Object.freeze([
    'actor', 'concept', 'object', 'metric', 'feature', 'project', 'quantity', 'date', 'time',
    'identifier', 'document', 'event', 'state', 'resource', 'service', 'location', 'url',
    'path', 'range', 'text', 'entity', 'group', 'release', 'environment', 'audience',
    'weekday', 'system', 'tool', 'place', 'signal', 'measure', 'access', 'credential', 'process',
    'task', 'transaction', 'collection'
  ]),
  modalities: Object.freeze([
    'fact', 'opinion', 'belief', 'possibility', 'necessity', 'obligation', 'permission',
    'ability', 'intention', 'certainty'
  ]),
  aliases: {
    world: freezeMap({ actual: 'real', existent: 'real' }),
    kind: freezeMap({ fact: 'simple_fact', statement: 'simple_fact', claim: 'simple_fact', belief: 'belief_state', agent_belief: 'belief_state', directive: 'instruction' }),
    // object/theme and subject/agent are intentionally not aliases: their
    // interchange changes argument binding in many predicates.
    role: freezeMap({ receiver: 'recipient', addressee: 'recipient' }),
    predicate: freezeMap({
      ask: 'request', inquire: 'request', client_request: 'request', customer_request: 'request',
      permit: 'allow', forbid: 'prohibit', keep_private: 'keep'
    }),
    term_type: freezeMap({ person: 'actor', human: 'actor', datetime: 'date' }),
    modality: freezeMap({ must: 'obligation', mandatory: 'obligation', required: 'obligation', must_not: 'obligation', shall_not: 'obligation', prohibited: 'obligation', forbidden: 'obligation', may: 'permission', allowed: 'permission', optional: 'permission', might: 'possibility', possible: 'possibility', certain: 'certainty', believed: 'belief' })
  }
});

export interface SemanticNormalizationIssue {
  path: string;
  field: ProtocolField | 'instance_identifier';
  code: 'alias_applied' | 'unknown_protocol_symbol' | 'extension_symbol' | 'symbol_collision';
  severity: 'warning' | 'error';
  message: string;
}

export interface SemanticNormalizationResult {
  status: 'canonical' | 'normalized' | 'noncanonical' | 'rejected';
  sem: LunumSem | null;
  issues: SemanticNormalizationIssue[];
  protocolVersion: typeof SEMANTIC_PROTOCOL_VERSION;
  canonical: boolean;
}

export interface NormalizeSemanticOptions {
  /** Reject unknown values in closed protocol fields instead of retaining a candidate. */
  strict?: boolean;
}

function isExtensionSymbol(value: string): boolean { return value.startsWith('x-'); }

function basicIdentifier(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, '_').toLocaleLowerCase('und');
}

function normalizeSymbol(value: string, field: ProtocolField): string {
  const basic = basicIdentifier(value);
  return SEMANTIC_PROTOCOL_REGISTRY.aliases[field][basic] ?? basic;
}

function registryValues(field: ProtocolField): readonly string[] {
  switch (field) {
    case 'world': return SEMANTIC_PROTOCOL_REGISTRY.worlds;
    case 'kind': return SEMANTIC_PROTOCOL_REGISTRY.kinds;
    case 'predicate': return SEMANTIC_PROTOCOL_REGISTRY.predicates;
    case 'role': return SEMANTIC_PROTOCOL_REGISTRY.roles;
    case 'term_type': return SEMANTIC_PROTOCOL_REGISTRY.termTypes;
    case 'modality': return SEMANTIC_PROTOCOL_REGISTRY.modalities;
  }
}

function mapSymbol(value: unknown, field: ProtocolField, path: string, issues: SemanticNormalizationIssue[], strict: boolean): string {
  if (typeof value !== 'string') {
    issues.push({ path, field, code: 'unknown_protocol_symbol', severity: 'error', message: `${field} must be a string` });
    return '';
  }
  const basic = basicIdentifier(value);
  const normalized = normalizeSymbol(value, field);
  if (normalized !== basic) {
    issues.push({ path, field, code: 'alias_applied', severity: 'warning', message: `${field} '${value}' normalized to protocol symbol '${normalized}'` });
  }
  if (!registryValues(field).includes(normalized)) {
    const extension = isExtensionSymbol(normalized);
    issues.push({
      path, field, code: extension ? 'extension_symbol' : 'unknown_protocol_symbol',
      severity: strict && !extension ? 'error' : 'warning',
      message: extension ? `${field} '${normalized}' is an explicit extension symbol` : `${field} '${normalized}' is not registered and remains unresolved`
    });
  }
  return normalized;
}

function normalizeTerm(term: LunumTerm, path: string, issues: SemanticNormalizationIssue[], strict: boolean): LunumTerm {
  if (Array.isArray(term)) return term.map((item, index) => normalizeTerm(item, `${path}[${index}]`, issues, strict));
  if (term === null || typeof term !== 'object') return term;
  const out: Record<string, unknown> = { ...term };
  if (typeof out.type === 'string') out.type = mapSymbol(out.type, 'term_type', `${path}.type`, issues, strict);
  // ids are open instance identifiers. The protocol cannot prove that two
  // differently named concepts, people, or resources are the same instance.
  if (typeof out.id === 'string' && out.id.trim().length === 0) {
    issues.push({ path: `${path}.id`, field: 'instance_identifier', code: 'unknown_protocol_symbol', severity: strict ? 'error' : 'warning', message: 'empty instance identifier cannot establish identity' });
  }
  if (Array.isArray(out.value)) out.value = out.value.map((item, index) => normalizeTerm(item as LunumTerm, `${path}.value[${index}]`, issues, strict));
  return out as LunumTerm;
}

function normalizeClause(clause: LunumClause, path: string, issues: SemanticNormalizationIssue[], strict: boolean): LunumClause {
  const roles: Record<string, LunumTerm> = {};
  for (const [rawRole, term] of Object.entries(clause.roles ?? {})) {
    const role = mapSymbol(rawRole, 'role', `${path}.roles.${rawRole}`, issues, strict);
    if (role in roles) {
      issues.push({ path: `${path}.roles.${rawRole}`, field: 'role', code: 'symbol_collision', severity: 'error', message: `role '${rawRole}' collides with another role after protocol normalization` });
      continue;
    }
    roles[role] = normalizeTerm(term, `${path}.roles.${rawRole}`, issues, strict);
  }
  const rawPredicate = basicIdentifier(clause.predicate);
  const predicate = mapSymbol(clause.predicate, 'predicate', `${path}.predicate`, issues, strict);
  if (rawPredicate === 'keep_private') {
    const existingVisibility = roles.visibility;
    if (existingVisibility !== undefined && existingVisibility !== 'private') {
      issues.push({ path: `${path}.roles.visibility`, field: 'role', code: 'symbol_collision', severity: 'error', message: 'keep_private conflicts with an explicit non-private visibility' });
    } else if (existingVisibility === undefined) {
      roles.visibility = 'private';
    }
  }
  const modality = clause.modality == null ? clause.modality : mapSymbol(clause.modality, 'modality', `${path}.modality`, issues, strict);
  const negativeDeontic = typeof clause.modality === 'string' && ['must_not', 'shall_not', 'prohibited', 'forbidden'].includes(basicIdentifier(clause.modality));
  if (negativeDeontic && clause.negated === true) {
    issues.push({ path: `${path}.modality`, field: 'modality', code: 'unknown_protocol_symbol', severity: 'error', message: 'negative modality and negated=true duplicate the prohibition encoding' });
  }
  return {
    ...clause,
    predicate,
    roles,
    negated: negativeDeontic ? true : clause.negated === true,
    ...(modality === undefined ? {} : { modality }),
    ...(clause.time === undefined ? {} : { time: normalizeTerm(clause.time, `${path}.time`, issues, strict) }),
    ...(clause.conditions ? { conditions: clause.conditions.map((item, index) => normalizeClause(item, `${path}.conditions[${index}]`, issues, strict)) } : {}),
    ...(clause.consequences ? { consequences: clause.consequences.map((item, index) => normalizeClause(item, `${path}.consequences[${index}]`, issues, strict)) } : {})
  };
}

function normalizeReferences(references: LunumReference[] | undefined, issues: SemanticNormalizationIssue[], strict: boolean): LunumReference[] | undefined {
  if (!references?.length) return references;
  return references.map((reference, index) => {
    const path = `references[${index}]`;
    const out: LunumReference = { ...reference };
    if (out.referenceKind !== undefined && out.referenceKind !== 'semantic' && out.referenceKind !== 'surface-evidence') {
      issues.push({ path: `${path}.referenceKind`, field: 'instance_identifier', code: 'unknown_protocol_symbol', severity: 'error', message: 'referenceKind must be semantic or surface-evidence' });
    }
    if (out.referenceKind === 'surface-evidence') {
      if (typeof out.sourceRef !== 'string' || !out.sourceRef.trim()) issues.push({ path: `${path}.sourceRef`, field: 'instance_identifier', code: 'unknown_protocol_symbol', severity: 'error', message: 'surface-evidence requires sourceRef' });
      if (typeof out.surface !== 'string') issues.push({ path: `${path}.surface`, field: 'instance_identifier', code: 'unknown_protocol_symbol', severity: 'error', message: 'surface-evidence requires surface text' });
      const span = out.span;
      if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start) {
        issues.push({ path: `${path}.span`, field: 'instance_identifier', code: 'unknown_protocol_symbol', severity: 'error', message: 'surface-evidence requires a valid half-open span' });
      }
      return out;
    }
    const grounded = typeof out.ref === 'string' ? out.ref : typeof out.id === 'string' ? out.id : '';
    if (!grounded.trim()) {
      issues.push({ path, field: 'instance_identifier', code: 'unknown_protocol_symbol', severity: strict ? 'error' : 'warning', message: 'reference has no grounded ref or id and cannot establish exact identity' });
    } else {
      if (typeof out.ref === 'string') out.ref = basicIdentifier(out.ref);
      if (typeof out.id === 'string') out.id = basicIdentifier(out.id);
    }
    return out;
  });
}

/** Normalize a structurally valid candidate into versioned protocol symbols. */
export function normalizeSemanticCandidate(value: unknown, options: NormalizeSemanticOptions = {}): SemanticNormalizationResult {
  const validation = validateSem(value);
  if (!validation.ok) {
    return {
      status: 'rejected', sem: null,
      issues: validation.errors.map((message) => ({ path: 'sem', field: 'kind' as const, code: 'unknown_protocol_symbol' as const, severity: 'error' as const, message })),
      protocolVersion: SEMANTIC_PROTOCOL_VERSION, canonical: false
    };
  }
  const strict = options.strict === true;
  const input = value as LunumSem;
  const issues: SemanticNormalizationIssue[] = [];
  const basic = canonicalizeSem(input);
  const references = normalizeReferences(input.references, issues, strict);
  const normalized: LunumSem = {
    ...basic,
    world: mapSymbol(input.world, 'world', 'world', issues, strict),
    kind: mapSymbol(input.kind, 'kind', 'kind', issues, strict),
    clauses: input.clauses.map((clause, index) => normalizeClause(clause, `clauses[${index}]`, issues, strict)),
    ...(references ? { references } : {})
  };
  const errors = issues.filter((issue) => issue.severity === 'error');
  const unknown = issues.some((issue) => issue.code === 'unknown_protocol_symbol' || issue.code === 'extension_symbol');
  const changed = issues.some((issue) => issue.code === 'alias_applied');
  return {
    status: errors.length > 0 ? 'rejected' : unknown ? 'noncanonical' : changed ? 'normalized' : 'canonical',
    sem: errors.length > 0 ? null : normalized,
    issues,
    protocolVersion: SEMANTIC_PROTOCOL_VERSION,
    // An applied, justified alias is now represented by the canonical symbol
    // and is safe for identity. Unresolved symbols remain noncanonical.
    canonical: errors.length === 0 && !unknown
  };
}

export function protocolVocabularyBlock(): string {
  const r = SEMANTIC_PROTOCOL_REGISTRY;
  return [
    'Controlled vocabulary (protocol registry):',
    `Protocol vocabulary (${r.version}; symbols, not English prose):`,
    `  Worlds: ${r.worlds.join(', ')}`,
    `  Kinds: ${r.kinds.join(', ')}`,
    `  Predicates: ${r.predicates.join(', ')}`,
    `  Roles: ${r.roles.join(', ')}`,
    `  Term types: ${r.termTypes.join(', ')}`,
    `  Role types: ${r.termTypes.join(', ')}`,
    `  Modalities: ${r.modalities.join(', ')}`,
    `  Modality values: ${r.modalities.join(', ')}`,
    '  Identifiers: assistant, concise_answers, files, power_saving, project, system, user (illustrative open ids only)',
    'Use a listed protocol symbol or an explicit x- extension.',
    'Instance ids are open identifiers: preserve source entities and do not alias names without evidence.',
    'Do not collapse object with theme, subject with agent, production with staging, public with private, must with may, or any role/predicate distinction merely because words are related.'
  ].join('\n');
}

export const semanticProtocolRegistry = SEMANTIC_PROTOCOL_REGISTRY;
