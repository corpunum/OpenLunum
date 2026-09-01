import { DEFAULT_RENDERER, RECORD_SCHEMA, SEM_SCHEMA } from './constants.js';
import { canonicalizeSem } from './canonicalize.js';
import { fingerprintSem, surfaceFingerprint } from './fingerprint.js';
import { renderSem } from './render.js';
import {
  classifyEligibility,
  evaluateSemanticTrust,
  validateSemanticCandidate,
  type SemanticClassificationEvidence,
  type SemanticVerification,
} from './policy.js';
import type { ConfidenceEvidenceFactors } from './fallback-policy.js';
import type { LunumRecord, LunumSem, LunumSidecar, Risk } from './types.js';

const EN_STOP = new Set('the a an is are was were be been being to of and or for in on at with from by this that these those it its as do does did have has had'.split(' '));

export type TokenCounter = (text: string) => number;

export function roughTokenCount(text: unknown): number {
  return Math.max(1, Math.ceil(String(text ?? '').length / 4));
}

export const ROUGH_TOKEN_COUNTER: TokenCounter = (text: string) => roughTokenCount(text);

export function createTokenCounter(
  encode: (text: string) => { length: number } | number[] | readonly number[]
): TokenCounter {
  return (text: string) => {
    const result = encode(text);
    if (Array.isArray(result)) return result.length;
    if ('length' in result && typeof result.length === 'number') return result.length;
    return roughTokenCount(text);
  };
}

export function surfaceTelegraph(text: unknown): string {
  const tokens = String(text ?? '').normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return tokens.filter((token) => !EN_STOP.has(token)).join(' ');
}

export interface CreateRecordInput {
  sourceText?: string;
  sourceLanguage?: string | null;
  role?: string | null;
  sourceRef?: string | null;
  sem: LunumSem;
  category?: string;
  risk?: Risk;
  /** Legacy score; intentionally not trusted for promotion. */
  confidence?: number;
  /** Factor-level extraction evidence used to recompute promotion confidence. */
  confidenceEvidence?: ConfidenceEvidenceFactors;
  /** Corroborated category/risk decision; a bare category/risk claim is insufficient. */
  classificationEvidence?: SemanticClassificationEvidence;
  /** Independent model or human check that the Sem matches the source. */
  verification?: SemanticVerification;
  /** Explicit vocabulary for the extraction profile. Required for promotion. */
  knownPredicates?: ReadonlySet<string>;
  renderer?: string;
  generatedAt?: string;
}

export function createRecord(input: CreateRecordInput): LunumRecord {
  const candidateValidation = validateSemanticCandidate(input.sem);
  if (!candidateValidation.ok) {
    throw new TypeError(`Invalid Lunum-Sem candidate: ${candidateValidation.errors.join('; ')}`);
  }
  const canonical = canonicalizeSem(input.sem);
  const renderer = input.renderer ?? DEFAULT_RENDERER;
  const rendering = renderSem(canonical, { profile: renderer });
  const trust = evaluateSemanticTrust({
    sem: canonical,
    sourceText: input.sourceText,
    category: input.category ?? canonical.kind,
    risk: input.risk ?? 'unknown',
    confidenceEvidence: input.confidenceEvidence,
    classificationEvidence: input.classificationEvidence,
    verification: input.verification,
    knownPredicates: input.knownPredicates,
    callerConfidence: input.confidence,
  });
  const basePolicy = classifyEligibility({
    category: input.category ?? canonical.kind,
    risk: input.risk ?? 'unknown',
    confidence: trust.confidence,
    sourceText: input.sourceText ?? '',
    semantic: trust.promoted,
  });
  const policy = {
    ...basePolicy,
    eligible: basePolicy.eligible && trust.promoted,
    reasons: [...new Set([...basePolicy.reasons, ...trust.reasons])],
  };
  return {
    recordVersion: RECORD_SCHEMA,
    source: { text: input.sourceText ?? '', language: input.sourceLanguage ?? null, role: input.role ?? null, ref: input.sourceRef ?? null },
    sem: canonical,
    fingerprint: fingerprintSem(canonical),
    renderings: { [renderer]: { code: rendering.code, profile: renderer, tokens: null } },
    policy,
    meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      semantic: true,
      semanticTrustStatus: trust.status,
      semanticPromoted: trust.promoted,
      semanticTrust: trust,
    }
  };
}

export function deriveSurfaceSidecar(input: { role?: string; content?: string; category?: string; risk?: Risk; confidence?: number } = {}): LunumSidecar {
  const text = String(input.content ?? '').trim();
  if (!text) return { lunumCode: null, lunumSem: null, lunumFp: null, lunumMeta: { eligible: false, semantic: false, fingerprintKind: 'surface', reasons: ['empty'] } };
  const code = surfaceTelegraph(text);
  const policy = classifyEligibility({ category: input.category ?? 'unknown', risk: input.risk ?? 'unknown', confidence: input.confidence ?? 0.5, sourceText: text, semantic: false });
  return {
    lunumCode: code || null,
    lunumSem: {
      schema: SEM_SCHEMA,
      kind: 'surface_telegraph',
      world: input.role === 'system' ? 'tool' : 'real',
      clauses: [{ predicate: 'surface', roles: { text: { type: 'text', value: text } }, negated: false }],
      annotations: { semantic: false, warning: 'Heuristic surface record; not language-independent canonical semantics.' }
    },
    lunumFp: surfaceFingerprint(text),
    lunumMeta: { ...policy, semantic: false, fingerprintKind: 'surface', renderer: 'surface-telegraph/0.1', sourceChars: text.length, codeChars: code.length }
  };
}

export function deriveLunumSidecar(input: {
  role?: string;
  content?: string;
  sem?: LunumSem | null;
  category?: string | null;
  risk?: Risk;
  /** Legacy score; it cannot promote a candidate Sem. */
  confidence?: number | null;
  confidenceEvidence?: ConfidenceEvidenceFactors;
  classificationEvidence?: SemanticClassificationEvidence;
  verification?: SemanticVerification;
  knownPredicates?: ReadonlySet<string>;
} = {}): LunumSidecar {
  if (!input.sem) {
    return deriveSurfaceSidecar({
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      category: input.category ?? 'unknown',
      ...(input.risk !== undefined ? { risk: input.risk } : {}),
      confidence: input.confidence ?? 0.5
    });
  }
  const record = createRecord({
    ...(input.content !== undefined ? { sourceText: input.content } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    sem: input.sem,
    category: input.category ?? input.sem.kind,
    ...(input.risk !== undefined ? { risk: input.risk } : {}),
    ...(input.confidence != null ? { confidence: input.confidence } : {}),
    ...(input.confidenceEvidence !== undefined ? { confidenceEvidence: input.confidenceEvidence } : {}),
    ...(input.classificationEvidence !== undefined ? { classificationEvidence: input.classificationEvidence } : {}),
    ...(input.verification !== undefined ? { verification: input.verification } : {}),
    ...(input.knownPredicates !== undefined ? { knownPredicates: input.knownPredicates } : {}),
  });
  const rendering = Object.values(record.renderings)[0];
  if (!rendering) throw new Error('Record renderer produced no rendering');
  return {
    lunumCode: rendering.code,
    lunumSem: record.sem,
    lunumFp: record.fingerprint,
    lunumMeta: {
      ...record.policy,
      semantic: true,
      fingerprintKind: 'exact-semantic',
      trustedSemantics: (record.meta.semanticTrust as { promoted?: unknown } | undefined)?.promoted === true,
      semanticTrustStatus: (record.meta.semanticTrust as { status?: unknown } | undefined)?.status ?? 'candidate',
      renderer: rendering.profile,
      recordVersion: record.recordVersion,
    }
  };
}
