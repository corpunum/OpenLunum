export type Risk = 'low' | 'medium' | 'high' | 'unknown';
export type Primitive = string | number | boolean | null;

export interface LunumTermObject {
  type: string;
  id?: string;
  value?: unknown;
  language?: string;
  ref?: string;
  [key: string]: unknown;
}

export type LunumTerm = Primitive | LunumTermObject | LunumTerm[];

export interface LunumClause {
  predicate: string;
  roles: Record<string, LunumTerm>;
  negated?: boolean;
  modality?: string | null;
  time?: LunumTerm;
  conditions?: LunumClause[];
  consequences?: LunumClause[];
  annotations?: Record<string, unknown>;
}

// Extended types for time, quantity, uncertainty, reference, modality
export interface ExtendedLunumClause {
  predicate: string;
  roles: Record<string, LunumTerm>;
  negated?: boolean;
  modality?: string | null;
  time?: LunumTerm;
  conditions?: LunumClause[];
  consequences?: LunumClause[];
  annotations?: Record<string, unknown>;
  // Extended fields
  timeTyped?: unknown;
  modalityTyped?: unknown;
  quantity?: unknown;
  uncertainty?: unknown;
  reference?: unknown;
}

export interface LunumSem {
  schema: string;
  world: string;
  kind: string;
  clauses: LunumClause[];
  references?: LunumTermObject[];
  provenance?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface EligibilityDecision {
  eligible: boolean;
  category: string;
  risk: Risk;
  confidence: number;
  reasons: string[];
}

/**
 * The trust state of a semantic parse. A candidate is structurally valid but
 * must not be treated as a durable or automatically served semantic memory.
 */
export type SemanticTrustStatus = 'candidate' | 'promoted' | 'abstained';

export interface SemanticTrustDecision {
  status: SemanticTrustStatus;
  /** Confidence recomputed from evidence, never accepted from a caller score. */
  confidence: number;
  /** True only when the candidate has passed every automatic-promotion gate. */
  promoted: boolean;
  /** Candidate must remain natural-only until a reviewer resolves these reasons. */
  requiresHumanReview: boolean;
  reasons: string[];
}

export interface LunumRendering {
  code: string;
  profile: string;
  tokens: number | null;
  tokenCounter?: string;
}

export interface LunumRecord {
  recordVersion: string;
  source: {
    text: string;
    language: string | null;
    role: string | null;
    ref: string | null;
  };
  sem: LunumSem;
  /** Exact semantic fingerprint (lfp:*). Surface and near-semantic fingerprints are separate concepts. */
  fingerprint: string;
  /** Protocol-canonical identity fingerprint (lfp:2.0); absent for unresolved candidates. */
  semanticFingerprint?: string;
  /** Source-text identity fingerprint (lsf:*), for deduplication only. */
  surfaceFingerprint?: string;
  nearSemanticFingerprint?: string;
  renderings: Record<string, LunumRendering>;
  policy: EligibilityDecision;
  meta: Record<string, unknown>;
}

export interface LunumSidecar {
  lunumCode: string | null;
  lunumSem: LunumSem | null;
  /** Compatibility slot; lunumMeta.fingerprintKind disambiguates surface vs exact semantic. */
  lunumFp: string | null;
  lunumMeta: Record<string, unknown> & { eligible: boolean };
}

export interface ContextMessage {
  role?: string;
  content?: string;
  source?: { text?: string };
  record?: Partial<LunumRecord>;
  lunumCode?: string | null;
  lunum_code?: string | null;
  lunumMeta?: Partial<EligibilityDecision>;
  lunum_meta?: Partial<EligibilityDecision>;
}

export interface FeatureBreakdown {
  matched: string[];
  missing: string[];
  extra: string[];
}

export interface InvariantExplanation {
  code: string;
  path: string;
  detail: string;
  severity: 'hard' | 'soft';
}

export interface ComparisonExplanation {
  features: FeatureBreakdown;
  invariants: InvariantExplanation[];
  scores: {
    featureRecall: number;
    featurePrecision: number;
    featureRecallReason: string;
    featurePrecisionReason: string;
  };
  reasoning: string[];
  summary: string;
}
