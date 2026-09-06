import { createHash } from 'node:crypto';
import { canonicalizeSem, stableStringify, validateSem } from './canonicalize.js';
import { basicIdentifier, SEMANTIC_PROTOCOL_REGISTRY } from './semantic-registry.js';
import type { LunumSem, LunumTerm } from './types.js';
import { authenticatedGroundingResolutions } from './grounding-capability.js';

/**
 * Auxiliary open-concept grounding contract. This is deliberately separate
 * from Sem and lfp:2.1: an agent can propose a compositional grounding, but a
 * proposal is not proof of synonymy and never grants exact identity.
 */
export const GROUNDING_CONTRACT_VERSION = 'lunum-grounding/0.1' as const;

export interface GroundingSymbol {
  kind: 'symbol';
  namespace: string;
  key: string;
}

export type GroundingValue =
  | GroundingSymbol
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'text'; value: string };

export interface GroundingModifier {
  relation: GroundingSymbol;
  value: GroundingValue;
}

export interface GroundingProposal {
  /** Canonical semantic location, for example clauses[0].roles.theme. */
  path: string;
  /** Must agree with the target Sem term type. */
  termType: string;
  head: GroundingSymbol;
  modifiers?: readonly GroundingModifier[];
  /** Evidence only; never part of the grounding identity. */
  surface?: string;
  language?: string;
  /** Optional lexical lookup hint; never part of grounding identity. */
  partOfSpeech?: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
}

export interface CanonicalGroundingProposal {
  path: string;
  termType: string;
  head: GroundingSymbol;
  modifiers: GroundingModifier[];
  identity: string;
  groundingFingerprint: string;
  surface?: string;
  language?: string;
}

export interface GroundingValidation {
  valid: boolean;
  canonical: CanonicalGroundingProposal | null;
  issues: string[];
}

export interface GroundingEvaluation {
  status: 'pending' | 'invalid';
  exactIdentityAvailable: false;
  proposals: CanonicalGroundingProposal[];
  issues: string[];
}

export interface GroundingRegistryMatch {
  groundingFingerprint: string;
  canonicalId: string;
}

/** A caller-supplied adapter for an immutable, externally governed registry. */
export interface GroundingRegistry {
  registryId: string;
  version: string;
  snapshotHash: string;
  lookupExact(input: { groundingFingerprint: string; identity: string }): readonly GroundingRegistryMatch[];
}

export interface GroundingResolution {
  path: string;
  status: 'resolved' | 'unresolved' | 'ambiguous' | 'invalid';
  canonicalId?: string;
  groundingFingerprint?: string;
  registry?: { registryId: string; version: string; snapshotHash: string };
  issues: string[];
}

export interface MaterializedGrounding {
  status: 'resolved' | 'unresolved' | 'ambiguous' | 'invalid';
  sem: LunumSem | null;
  resolutions: GroundingResolution[];
  issues: string[];
}

// Grounding resolutions are capabilities minted by the provider cascade.
// Keeping this private prevents a caller from forging registry evidence and
// injecting an arbitrary `urn:<provider>:<id>` into an exact Sem.

const NAMESPACE = /^[a-z][a-z0-9._-]*$/u;
const PATH = /^clauses\[\d+\](?:\.(?:conditions|consequences)\[\d+\])*\.roles\.([a-z][a-z0-9_-]*)$/u;

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function symbol(value: unknown, path: string, issues: string[]): GroundingSymbol | null {
  if (!value || typeof value !== 'object') {
    issues.push(`${path} must be a symbol`);
    return null;
  }
  const input = value as Partial<GroundingSymbol>;
  if (input.kind !== 'symbol') issues.push(`${path}.kind must be symbol`);
  if (typeof input.namespace !== 'string' || !NAMESPACE.test(input.namespace)) issues.push(`${path}.namespace must be a lowercase namespace`);
  if (typeof input.key !== 'string' || !normalizeText(input.key)) issues.push(`${path}.key must be non-empty`);
  if (issues.some((issue) => issue.startsWith(path))) return null;
  return { kind: 'symbol', namespace: basicIdentifier(input.namespace!), key: basicIdentifier(input.key!) };
}

function value(input: unknown, path: string, issues: string[]): GroundingValue | null {
  if (!input || typeof input !== 'object') {
    issues.push(`${path} must be a typed grounding value`);
    return null;
  }
  const candidate = input as Record<string, unknown>;
  switch (candidate.kind) {
    case 'symbol': return symbol(candidate, path, issues);
    case 'number':
      if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) issues.push(`${path}.value must be finite`);
      return issues.some((issue) => issue.startsWith(path)) ? null : { kind: 'number', value: candidate.value as number };
    case 'boolean':
      if (typeof candidate.value !== 'boolean') issues.push(`${path}.value must be boolean`);
      return issues.some((issue) => issue.startsWith(path)) ? null : { kind: 'boolean', value: candidate.value as boolean };
    case 'text':
      if (typeof candidate.value !== 'string') issues.push(`${path}.value must be text`);
      return issues.some((issue) => issue.startsWith(path)) ? null : { kind: 'text', value: normalizeText(candidate.value as string) };
    default:
      issues.push(`${path}.kind is unsupported`);
      return null;
  }
}

function groundingIdentity(termType: string, head: GroundingSymbol, modifiers: readonly GroundingModifier[]): Record<string, unknown> {
  return { version: GROUNDING_CONTRACT_VERSION, termType, head, modifiers };
}

function modifierSortKey(modifier: GroundingModifier): string {
  return stableStringify(modifier);
}

/** Validate and deterministically canonicalize one compositional proposal. */
export function canonicalizeGroundingProposal(input: unknown): GroundingValidation {
  const issues: string[] = [];
  if (!input || typeof input !== 'object') return { valid: false, canonical: null, issues: ['grounding proposal must be an object'] };
  const proposal = input as Partial<GroundingProposal>;
  if (typeof proposal.path !== 'string' || !PATH.test(proposal.path)) issues.push('path must address exactly one clause role term');
  if (typeof proposal.termType !== 'string' || !SEMANTIC_PROTOCOL_REGISTRY.termTypes.includes(basicIdentifier(proposal.termType))) issues.push('termType must be a registered protocol term type');
  const head = symbol(proposal.head, 'head', issues);
  const modifiers: GroundingModifier[] = [];
  if (proposal.modifiers !== undefined && !Array.isArray(proposal.modifiers)) issues.push('modifiers must be an array');
  for (const [index, raw] of (Array.isArray(proposal.modifiers) ? proposal.modifiers : []).entries()) {
    if (!raw || typeof raw !== 'object') { issues.push(`modifiers[${index}] must be an object`); continue; }
    const item = raw as Partial<GroundingModifier>;
    const relation = symbol(item.relation, `modifiers[${index}].relation`, issues);
    const itemValue = value(item.value, `modifiers[${index}].value`, issues);
    if (relation && itemValue) modifiers.push({ relation, value: itemValue });
  }
  modifiers.sort((left, right) => modifierSortKey(left).localeCompare(modifierSortKey(right), 'en'));
  for (let index = 1; index < modifiers.length; index += 1) {
    if (modifierSortKey(modifiers[index - 1]!) === modifierSortKey(modifiers[index]!)) issues.push('duplicate modifiers are ambiguous');
  }
  if (!head || issues.length) return { valid: false, canonical: null, issues };
  const termType = basicIdentifier(proposal.termType!);
  const identity = groundingIdentity(termType, head, modifiers);
  const groundingFingerprint = `gnd:${GROUNDING_CONTRACT_VERSION.slice('lunum-'.length)}:sha256:${createHash('sha256').update(stableStringify(identity)).digest('hex').slice(0, 32)}`;
  return {
    valid: true,
    canonical: {
      path: proposal.path!, termType, head, modifiers, identity: stableStringify(identity), groundingFingerprint,
      ...(typeof proposal.surface === 'string' ? { surface: proposal.surface } : {}),
      ...(typeof proposal.language === 'string' ? { language: proposal.language } : {}),
    },
    issues: [],
  };
}

function termAtPath(sem: LunumSem, path: string): LunumTerm | null {
  const match = PATH.exec(path);
  if (!match) return null;
  const segments = path.split('.');
  let clause: any = sem.clauses[Number(/^clauses\[(\d+)\]/u.exec(segments[0]!)?.[1] ?? '-1')];
  if (!clause) return null;
  for (let index = 1; index < segments.length - 2; index += 1) {
    const nested = /^(conditions|consequences)\[(\d+)\]$/u.exec(segments[index]!);
    if (!nested) return null;
    clause = clause[nested[1]!]?.[Number(nested[2]!)] ?? null;
  }
  const role = match[1]!;
  return clause?.roles?.[role] ?? null;
}

function validRegistry(registry: GroundingRegistry): string[] {
  const issues: string[] = [];
  if (!registry || typeof registry !== 'object') return ['registry must be an object'];
  if (typeof registry.registryId !== 'string' || !normalizeText(registry.registryId)) issues.push('registryId must be non-empty');
  if (typeof registry.version !== 'string' || !normalizeText(registry.version)) issues.push('registry version must be non-empty');
  if (typeof registry.snapshotHash !== 'string' || !/^[0-9a-f]{64}$/u.test(registry.snapshotHash)) issues.push('registry snapshotHash must be a SHA-256 hex digest');
  if (typeof registry.lookupExact !== 'function') issues.push('registry must provide lookupExact');
  return issues;
}

function validRegistryReference(registry: GroundingResolution['registry']): string[] {
  if (!registry || typeof registry !== 'object') return ['registry provenance must be present'];
  const issues: string[] = [];
  if (typeof registry.registryId !== 'string' || !normalizeText(registry.registryId)) issues.push('registryId must be non-empty');
  if (typeof registry.version !== 'string' || !normalizeText(registry.version)) issues.push('registry version must be non-empty');
  if (typeof registry.snapshotHash !== 'string' || !/^[0-9a-f]{64}$/u.test(registry.snapshotHash)) issues.push('registry snapshotHash must be a SHA-256 hex digest');
  return issues;
}

function validCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s/:]+(?:[:/])[^\s]+$/u.test(value);
}

/** Resolve only exact registry assertions; fuzzy or nearest matches are never accepted. */
export function resolveGroundingProposal(input: unknown, registry: GroundingRegistry): GroundingResolution {
  const canonical = canonicalizeGroundingProposal(input);
  const path = canonical.canonical?.path ?? (input && typeof input === 'object' && typeof (input as { path?: unknown }).path === 'string' ? (input as { path: string }).path : '');
  const registryIssues = validRegistry(registry);
  if (!canonical.valid || !canonical.canonical || registryIssues.length) return {
    path, status: 'invalid',
    ...(registryIssues.length ? {} : { registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash } }),
    issues: [...canonical.issues, ...registryIssues],
  };
  let matches: readonly GroundingRegistryMatch[];
  try {
    matches = registry.lookupExact({ groundingFingerprint: canonical.canonical.groundingFingerprint, identity: canonical.canonical.identity });
  } catch (error) {
    return { path, status: 'invalid', registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: [`registry lookup failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (!Array.isArray(matches)) return { path, status: 'invalid', registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: ['registry lookup must return an array'] };
  const exact = matches.filter((match) => match && match.groundingFingerprint === canonical.canonical!.groundingFingerprint);
  const ids = [...new Set(exact.map((match) => match.canonicalId))];
  if (ids.length === 0) return { path, status: 'unresolved', registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: ['no exact registry grounding assertion'] };
  if (ids.length > 1) return { path, status: 'ambiguous', registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: ['registry returned multiple exact canonical IDs'] };
  if (!validCanonicalId(ids[0])) return { path, status: 'invalid', registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: ['registry canonicalId must be namespace-qualified'] };
  if (!ids[0]!.startsWith(`urn:${registry.registryId}:`)) return { path, status: 'invalid', registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: ['registry canonicalId is outside the resolver namespace'] };
  const resolution: GroundingResolution = { path, status: 'resolved', canonicalId: ids[0], groundingFingerprint: canonical.canonical.groundingFingerprint, registry: { registryId: registry.registryId, version: registry.version, snapshotHash: registry.snapshotHash }, issues: [] };
  authenticatedGroundingResolutions.add(resolution);
  return resolution;
}

/**
 * Materialize only resolver-produced IDs into the existing Sem term field.
 * Registry evidence is returned separately and remains outside lfp:2.1.
 */
export function materializeGroundingResolutions(sem: unknown, resolutions: readonly GroundingResolution[], proposals: readonly GroundingProposal[]): MaterializedGrounding {
  const structural = validateSem(sem);
  if (!structural.ok) return { status: 'invalid', sem: null, resolutions: [...resolutions], issues: structural.errors };
  if (resolutions.length !== proposals.length) return { status: 'invalid', sem: null, resolutions: [...resolutions], issues: ['each grounding resolution must be paired with its original proposal'] };
  if (resolutions.some((resolution) => !resolution || typeof resolution !== 'object' || !authenticatedGroundingResolutions.has(resolution))) {
    return { status: 'invalid', sem: null, resolutions: [...resolutions], issues: ['grounding resolution was not authenticated by the provider cascade'] };
  }
  if (resolutions.some((resolution) => resolution.status !== 'resolved' || !resolution.canonicalId)) return { status: resolutions.some((resolution) => resolution.status === 'ambiguous') ? 'ambiguous' : 'unresolved', sem: null, resolutions: [...resolutions], issues: ['all grounding resolutions must be resolved before materialization'] };
  const paths = new Set<string>();
  const copy = JSON.parse(JSON.stringify(sem)) as LunumSem;
  const issues: string[] = [];
  for (const [index, resolution] of resolutions.entries()) {
    const registry = resolution.registry;
    const canonicalId = resolution.canonicalId;
    if (validRegistryReference(registry).length > 0 || !canonicalId) {
      issues.push(`resolution lacks valid resolver registry provenance: ${resolution.path}`);
      continue;
    }
    if (!canonicalId.startsWith(`urn:${registry!.registryId}:`)) {
      issues.push(`resolution canonicalId is outside its resolver namespace: ${resolution.path}`);
      continue;
    }
    if (!validCanonicalId(canonicalId)) {
      issues.push(`resolution canonicalId is not a valid namespace-qualified identifier: ${resolution.path}`);
      continue;
    }
    const proposal = canonicalizeGroundingProposal(proposals[index]);
    if (!proposal.valid || !proposal.canonical || resolution.groundingFingerprint !== proposal.canonical.groundingFingerprint || resolution.path !== proposal.canonical.path) {
      issues.push(`resolution is not bound to its original grounding proposal: ${resolution.path}`);
      continue;
    }
    if (paths.has(resolution.path)) { issues.push(`duplicate resolution path: ${resolution.path}`); continue; }
    paths.add(resolution.path);
    const term = termAtPath(copy, resolution.path);
    if (!term || typeof term !== 'object' || Array.isArray(term) || typeof (term as Record<string, unknown>).type !== 'string') { issues.push(`resolution path does not resolve to a typed term: ${resolution.path}`); continue; }
    const target = term as Record<string, unknown>;
    if ('id' in target && 'ref' in target) { issues.push(`term has both id and ref: ${resolution.path}`); continue; }
    const field = 'ref' in target ? 'ref' : 'id';
    target[field] = resolution.canonicalId;
  }
  if (issues.length) return { status: 'invalid', sem: null, resolutions: [...resolutions], issues };
  return { status: 'resolved', sem: canonicalizeSem(copy), resolutions: [...resolutions], issues: [] };
}

/**
 * Validate proposals against a candidate Sem. Proposals remain pending: this
 * function intentionally cannot grant an lfp:2.1 identity.
 */
export function evaluateGroundingProposals(sem: unknown, proposals: readonly GroundingProposal[]): GroundingEvaluation {
  const structural = validateSem(sem);
  if (!structural.ok) return { status: 'invalid', exactIdentityAvailable: false, proposals: [], issues: structural.errors };
  const candidate = sem as LunumSem;
  const canonical: CanonicalGroundingProposal[] = [];
  const issues: string[] = [];
  const paths = new Set<string>();
  for (const [index, proposal] of proposals.entries()) {
    const result = canonicalizeGroundingProposal(proposal);
    if (!result.valid || !result.canonical) { issues.push(...result.issues.map((issue) => `proposals[${index}].${issue}`)); continue; }
    if (paths.has(result.canonical.path)) { issues.push(`proposals[${index}].path duplicates another proposal`); continue; }
    paths.add(result.canonical.path);
    const term = termAtPath(candidate, result.canonical.path);
    if (!term || typeof term !== 'object' || Array.isArray(term) || typeof (term as Record<string, unknown>).type !== 'string') {
      issues.push(`proposals[${index}].path does not resolve to a typed term`); continue;
    }
    if (basicIdentifier((term as Record<string, unknown>).type as string) !== result.canonical.termType) issues.push(`proposals[${index}].termType does not match the Sem term`);
    canonical.push(result.canonical);
  }
  return { status: issues.length ? 'invalid' : 'pending', exactIdentityAvailable: false, proposals: issues.length ? [] : canonical, issues };
}

/** Return a canonicalized copy without changing Sem or semantic identity. */
export function canonicalizeGroundingForEvidence(sem: LunumSem, proposals: readonly GroundingProposal[]): GroundingEvaluation & { sem: LunumSem } {
  const grounding = evaluateGroundingProposals(sem, proposals);
  return { ...grounding, sem: canonicalizeSem(sem) };
}
