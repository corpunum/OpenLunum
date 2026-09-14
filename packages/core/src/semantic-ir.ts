import { buildCandidateSem, type CandidateBuilderInput, type CandidateBuilderResult } from './agent-builder.js';
import type { LunumClause, LunumTerm } from './types.js';

/** Versioned learned-extractor output. This is an input contract, not truth. */
export const SEMANTIC_IR_VERSION = 'lunum-ir/0.1' as const;

export interface SemanticIR {
  version: typeof SEMANTIC_IR_VERSION;
  outcome: 'parse' | 'abstain';
  abstentionReason?: 'unsupported' | 'ambiguous' | 'unresolved';
  world?: string;
  kind?: string;
  predicate?: string;
  roles?: Record<string, LunumTerm>;
  negated?: boolean;
  modality?: string | null;
  time?: LunumTerm;
  conditions?: LunumClause[];
  consequences?: LunumClause[];
  /** Evidence locations; never copied into Sem or identity. */
  sourceAnchors?: readonly { start: number; end: number; field: string }[];
  /** Unresolved open-concept evidence; never grants identity. */
  groundingHandles?: readonly { path: string; surface?: string; candidates?: readonly string[] }[];
}

export interface SemanticIRBuildResult {
  status: 'candidate' | 'abstained';
  sem: CandidateBuilderResult['sem'] | null;
  builder: CandidateBuilderResult | null;
  sourceAnchors: readonly { start: number; end: number; field: string }[];
  groundingHandles: readonly { path: string; surface?: string; candidates?: readonly string[] }[];
}

function fail(message: string): never { throw new TypeError(`invalid_semantic_ir:${message}`); }

/**
 * Convert an extractor IR into an untrusted candidate. No canonicalization,
 * grounding, identity, or promotion is implemented here; the existing core
 * builder/submission pipeline remains authoritative.
 */
export function buildCandidateFromSemanticIR(input: unknown): SemanticIRBuildResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('object_required');
  const ir = input as Partial<SemanticIR>;
  const allowedFields = new Set(['version', 'outcome', 'abstentionReason', 'world', 'kind', 'predicate', 'roles', 'negated', 'modality', 'time', 'conditions', 'consequences', 'sourceAnchors', 'groundingHandles']);
  const unknownFields = Object.keys(input as object).filter((field) => !allowedFields.has(field));
  if (unknownFields.length) fail(`unknown_fields:${unknownFields.sort().join(',')}`);
  if (ir.version !== SEMANTIC_IR_VERSION) fail('unsupported_version');
  const sourceAnchors = ir.sourceAnchors ?? [];
  const groundingHandles = ir.groundingHandles ?? [];
  if (!Array.isArray(sourceAnchors) || sourceAnchors.some((a) => !a || typeof a !== 'object' || !Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 0 || a.end < a.start || typeof a.field !== 'string')) fail('source_anchors_invalid');
  if (!Array.isArray(groundingHandles) || groundingHandles.some((h) => !h || typeof h !== 'object' || typeof h.path !== 'string')) fail('grounding_handles_invalid');
  if (ir.outcome === 'abstain') {
    if (!ir.abstentionReason) fail('abstention_reason_required');
    return { status: 'abstained', sem: null, builder: null, sourceAnchors: Object.freeze([...sourceAnchors]), groundingHandles: Object.freeze([...groundingHandles]) };
  }
  if (ir.outcome !== 'parse') fail('outcome_invalid');
  const required = ['world', 'kind', 'predicate', 'roles'] as const;
  for (const field of required) if (ir[field] === undefined) fail(`${field}_required`);
  const builderInput: CandidateBuilderInput = {
    world: ir.world!, kind: ir.kind!, predicate: ir.predicate!, roles: ir.roles!,
    ...(ir.negated === undefined ? {} : { negated: ir.negated }),
    ...(ir.modality === undefined ? {} : { modality: ir.modality }),
    ...(ir.time === undefined ? {} : { time: ir.time }),
    ...(ir.conditions === undefined ? {} : { conditions: ir.conditions }),
    ...(ir.consequences === undefined ? {} : { consequences: ir.consequences }),
  };
  const builder = buildCandidateSem(builderInput);
  return { status: 'candidate', sem: builder.sem, builder, sourceAnchors: Object.freeze([...sourceAnchors]), groundingHandles: Object.freeze([...groundingHandles]) };
}
