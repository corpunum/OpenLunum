import crypto from 'node:crypto';
import { SEM_SCHEMA } from './constants.js';
import { stableStringify } from './canonicalize.js';
import { semanticFingerprint, SEMANTIC_IDENTITY_FINGERPRINT_VERSION } from './fingerprint.js';
import {
  CANONICAL_SEMANTIC_FRAMES,
  SEMANTIC_FRAME_REGISTRY_VERSION,
  validateSemFrames,
} from './frame-registry.js';
import {
  SEMANTIC_PROTOCOL_REGISTRY,
  SEMANTIC_PROTOCOL_VERSION,
  normalizeSemanticCandidate,
} from './semantic-registry.js';
import { evaluateSemanticTrust, validateSemanticCandidate } from './policy.js';
import {
  GROUNDING_CONTRACT_VERSION,
  evaluateGroundingProposals,
} from './grounding.js';
import type { GroundingEvaluation, GroundingProposal } from './grounding.js';
import type { LunumSem, SemanticTrustDecision } from './types.js';

/** Version of the agent-facing contract, separate from the Sem wire schema. */
export const AGENT_NATIVE_CONTRACT_VERSION = 'lunum-agent/0.1' as const;
export const AGENT_EXTRACTION_INSTRUCTIONS_VERSION = 'agent-extraction-instructions/0.1' as const;

// SHA-256 of schemas/lunum-sem.schema.json at this protocol version. Keep
// this explicit so an agent can bind its candidate to the actual wire schema,
// while the descriptor hash below fingerprints the core structural checks.
export const SEMANTIC_TRANSPORT_SCHEMA_SHA256 = '8aef5fdfa6feccd1b8bc22ec41df64d0c363b537df3df7b03e61a8e7663ed593' as const;

/** Stable description of the structural transport contract enforced by core. */
const TRANSPORT_SCHEMA_DESCRIPTOR = Object.freeze({
  schema: SEM_SCHEMA,
  required: Object.freeze(['schema', 'world', 'kind', 'clauses']),
  clause: Object.freeze({ required: Object.freeze(['predicate', 'roles']), arrays: Object.freeze(['conditions', 'consequences']) }),
  term: Object.freeze({ typed: true, quantityValue: 'finite-number', dateValue: 'string-or-number' }),
});

function sha256Value(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function sha256Text(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const TRANSPORT_SCHEMA_HASH = sha256Value(TRANSPORT_SCHEMA_DESCRIPTOR);
const FRAME_REGISTRY_HASH = sha256Value(CANONICAL_SEMANTIC_FRAMES);
const PROTOCOL_REGISTRY_HASH = sha256Value(SEMANTIC_PROTOCOL_REGISTRY);
const CANONICAL_RULES = Object.freeze([
  'Use only registered protocol symbols or explicit x- extensions.',
  'Use the canonical frame roles exactly; unexpected roles fail exact identity.',
  'deadline encodes time in roles.time, not clause.time.',
  'conditions and consequences are clause arrays, not role lookalikes.',
  'prohibition uses negated=true, not a duplicate negative modality.',
]);
const EXTRACTION_SEM_TEMPLATE = `{"schema":"${SEM_SCHEMA}","world":"real","kind":"simple_fact","clauses":[{"predicate":"<registered-predicate>","roles":{},"negated":false}]}`;

export interface ExtractionContract {
  contractVersion: typeof AGENT_NATIVE_CONTRACT_VERSION;
  transport: {
    schema: typeof SEM_SCHEMA;
    schemaHash: string;
    descriptorHash: string;
    descriptor: typeof TRANSPORT_SCHEMA_DESCRIPTOR;
  };
  protocol: {
    version: typeof SEMANTIC_PROTOCOL_VERSION;
    registryHash: string;
    registry: typeof SEMANTIC_PROTOCOL_REGISTRY;
  };
  identity: {
    version: typeof SEMANTIC_IDENTITY_FINGERPRINT_VERSION;
    exactIdentityRequires: readonly string[];
  };
  instructions: { version: typeof AGENT_EXTRACTION_INSTRUCTIONS_VERSION; hash: string; semTemplate: string };
  frames: {
    version: typeof SEMANTIC_FRAME_REGISTRY_VERSION;
    registryHash: string;
    framedPredicates: readonly string[];
    registry: typeof CANONICAL_SEMANTIC_FRAMES;
    unframedBehavior: string;
  };
  grounding: {
    version: typeof GROUNDING_CONTRACT_VERSION;
    identityBehavior: string;
    proposalFields: readonly string[];
    evidenceFields: readonly string[];
  };
  canonicalRules: readonly string[];
  groundingRules: readonly string[];
  abstentionRules: readonly string[];
}

/** Generate the machine-readable extraction contract from core registries. */
export function getExtractionContract(): ExtractionContract {
  return {
    contractVersion: AGENT_NATIVE_CONTRACT_VERSION,
    transport: { schema: SEM_SCHEMA, schemaHash: SEMANTIC_TRANSPORT_SCHEMA_SHA256, descriptorHash: TRANSPORT_SCHEMA_HASH, descriptor: TRANSPORT_SCHEMA_DESCRIPTOR },
    protocol: { version: SEMANTIC_PROTOCOL_VERSION, registryHash: PROTOCOL_REGISTRY_HASH, registry: SEMANTIC_PROTOCOL_REGISTRY },
    identity: {
      version: SEMANTIC_IDENTITY_FINGERPRINT_VERSION,
      exactIdentityRequires: Object.freeze(['structural-validity', 'protocol-canonicality', 'canonical-frame', 'grounded-identity', 'classified-identity-fields']),
    },
    frames: {
      version: SEMANTIC_FRAME_REGISTRY_VERSION,
      registryHash: FRAME_REGISTRY_HASH,
      framedPredicates: Object.freeze(Object.keys(CANONICAL_SEMANTIC_FRAMES).sort()),
      registry: CANONICAL_SEMANTIC_FRAMES,
      unframedBehavior: 'candidate-only; abstain in exact-identity extraction; no lfp:2.1',
    },
    grounding: {
      version: GROUNDING_CONTRACT_VERSION,
      identityBehavior: 'agent proposals receive deterministic gnd keys for evidence only; unresolved proposals remain grounding-pending and cannot grant lfp:2.1',
      proposalFields: Object.freeze(['path', 'termType', 'head', 'modifiers']),
      evidenceFields: Object.freeze(['surface', 'language']),
    },
    instructions: {
      version: AGENT_EXTRACTION_INSTRUCTIONS_VERSION,
      hash: sha256Value({ version: AGENT_EXTRACTION_INSTRUCTIONS_VERSION, canonicalRules: CANONICAL_RULES, semTemplate: EXTRACTION_SEM_TEMPLATE }),
      semTemplate: EXTRACTION_SEM_TEMPLATE,
    },
    canonicalRules: CANONICAL_RULES,
    groundingRules: Object.freeze([
      'Open instance identifiers remain data and are never inferred equivalent.',
      'A semantic reference requires ref or id; surface-evidence references do not establish identity.',
      'Ungrounded or unresolved references fail closed for exact identity.',
    ]),
    abstentionRules: Object.freeze([
      'Abstain when meaning is ambiguous, unsupported, ungrounded, or requires invented protocol symbols.',
      'Retain source text and provenance even when candidate semantics are rejected.',
      'Caller confidence never promotes a candidate.',
    ]),
  };
}

export type AgentExtractorType = 'agent' | 'codex_agent' | 'human' | 'other';

const AGENT_EXTRACTOR_TYPES: readonly AgentExtractorType[] = ['agent', 'codex_agent', 'human', 'other'];

function isAgentExtractorType(value: unknown): value is AgentExtractorType {
  return typeof value === 'string' && AGENT_EXTRACTOR_TYPES.includes(value as AgentExtractorType);
}

export interface AgentExtractionProvenance {
  extractorType: AgentExtractorType;
  extractorId?: string;
  contractVersion?: string;
  contractHash?: string;
  schemaHash?: string;
  frameRegistryHash?: string;
  promptVersion?: string;
  implementationSha?: string;
  evaluationId?: string;
  sourceHash?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SubmitCandidateInput {
  sourceText: string;
  sourceLanguage?: string | null;
  candidateSem: unknown;
  provenance: AgentExtractionProvenance;
}

export interface SubmitGroundedCandidateInput extends SubmitCandidateInput {
  /** Structured agent proposal; it is evidence and remains unresolved here. */
  grounding: readonly GroundingProposal[];
}

export interface CandidateSubmissionResult {
  source: { text: string; language: string | null; sha256: string };
  provenance: AgentExtractionProvenance & { contractVersion: string; contractHash: string; schemaHash: string; frameRegistryHash: string; sourceHash: string; timestamp: string };
  transportValid: boolean;
  structuralValid: boolean;
  protocolCanonical: boolean;
  frameValid: boolean;
  grounded: boolean;
  candidateIdentityAvailable: boolean;
  semanticFingerprint: string | null;
  promotable: boolean;
  trust: SemanticTrustDecision;
  failureClass: string | null;
  diagnostics: string[];
  sem: LunumSem | null;
}

export interface GroundedCandidateSubmissionResult extends CandidateSubmissionResult {
  grounding: GroundingEvaluation;
}

function failureClass(input: { structuralValid: boolean; protocolCanonical: boolean; frameValid: boolean; grounded: boolean; candidateIdentityAvailable: boolean; diagnostics: readonly string[] }): string | null {
  if (!input.structuralValid) return 'transport_or_structural_invalid';
  if (!input.protocolCanonical) return 'protocol_noncanonical';
  if (!input.frameValid) return 'frame_noncanonical';
  if (!input.grounded) return 'ungrounded_identity';
  if (!input.candidateIdentityAvailable) return 'semantic_identity_unavailable';
  return null;
}

/**
 * Validate an agent proposal without trusting its confidence or provenance.
 * This function never promotes a candidate merely because it is schema-valid.
 */
export function submitCandidate(input: SubmitCandidateInput): CandidateSubmissionResult {
  if (!input || typeof input !== 'object' || !isAgentExtractorType(input.provenance?.extractorType)) {
    throw new TypeError('invalid_provenance: extractorType must be one of agent, codex_agent, human, or other');
  }
  const sourceText = input.sourceText ?? '';
  const sourceHash = sha256Text(sourceText);
  const contract = getExtractionContract();
  const suppliedProvenance = input.provenance;
  const provenance = {
    ...suppliedProvenance,
    contractVersion: contract.contractVersion,
    contractHash: sha256Value(contract),
    schemaHash: contract.transport.schemaHash,
    frameRegistryHash: contract.frames.registryHash,
    sourceHash,
    timestamp: suppliedProvenance.timestamp ?? new Date().toISOString(),
  };
  const structural = validateSemanticCandidate(input.candidateSem);
  const transportValid = structural.ok;
  if (!structural.ok) {
    const trust: SemanticTrustDecision = { status: 'abstained', confidence: 0, promoted: false, requiresHumanReview: true, reasons: structural.errors.map((error) => `invalid_sem:${error}`) };
    return {
      source: { text: sourceText, language: input.sourceLanguage ?? null, sha256: sourceHash }, provenance,
      transportValid, structuralValid: false, protocolCanonical: false, frameValid: false, grounded: false,
      candidateIdentityAvailable: false, semanticFingerprint: null, promotable: false, trust,
      failureClass: 'transport_or_structural_invalid', diagnostics: structural.errors, sem: null,
    };
  }

  const normalization = normalizeSemanticCandidate(input.candidateSem, { strict: true });
  const sem = normalization.sem;
  const protocolCanonical = Boolean(sem && normalization.canonical);
  const frameResult = sem ? validateSemFrames(sem) : { valid: false, issues: [] };
  const frameValid = frameResult.valid;
  const grounded = !normalization.issues.some((issue) => issue.path.startsWith('references') && issue.severity === 'error');
  let identity: string | null = null;
  const diagnostics = [
    ...normalization.issues.map((issue) => issue.message),
    ...frameResult.issues.map((issue) => issue.message),
  ];
  if (sem && protocolCanonical && frameValid && grounded) {
    try { identity = semanticFingerprint(sem); } catch (error) { diagnostics.push(error instanceof Error ? error.message : String(error)); }
  }
  const candidateIdentityAvailable = identity !== null;
  const trust = sem
    ? evaluateSemanticTrust({ sem, sourceText, canonicalProtocol: protocolCanonical, normalizationIssues: normalization.issues, knownPredicates: new Set(SEMANTIC_PROTOCOL_REGISTRY.predicates) })
    : { status: 'abstained' as const, confidence: 0, promoted: false, requiresHumanReview: true, reasons: ['missing_sem'] };
  const failure = failureClass({ structuralValid: true, protocolCanonical, frameValid, grounded, candidateIdentityAvailable, diagnostics });
  return {
    source: { text: sourceText, language: input.sourceLanguage ?? null, sha256: sourceHash }, provenance,
    transportValid, structuralValid: true, protocolCanonical, frameValid, grounded,
    candidateIdentityAvailable, semanticFingerprint: identity, promotable: trust.promoted && candidateIdentityAvailable,
    trust, failureClass: failure, diagnostics, sem,
  };
}

/**
 * Submit a candidate together with an agent-generated grounding proposal.
 * Structured proposals make composition explicit, but do not establish
 * synonymy or durable identity without an external, versioned resolution.
 */
export function submitCandidateWithGrounding(input: SubmitGroundedCandidateInput): GroundedCandidateSubmissionResult {
  const base = submitCandidate(input);
  const grounding = evaluateGroundingProposals(input.candidateSem, input.grounding);
  if (grounding.status === 'pending') {
    return {
      ...base,
      candidateIdentityAvailable: false,
      semanticFingerprint: null,
      failureClass: 'grounding_pending',
      diagnostics: [...base.diagnostics, 'agent grounding is a proposal only; exact identity requires an external resolution'],
      grounding,
    };
  }
  return {
    ...base,
    candidateIdentityAvailable: false,
    semanticFingerprint: null,
    failureClass: 'grounding_invalid',
    diagnostics: [...base.diagnostics, ...grounding.issues],
    grounding,
  };
}
