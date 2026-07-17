export type Risk = 'low' | 'medium' | 'high' | 'unknown';
export type Primitive = string | number | boolean | null;

export interface Reference {
  id: string;
  type?: string;
  value?: unknown;
  language?: string;
  ref?: string;
}

export interface Quantity {
  value: number;
  unit: string;
  precision?: number;
  uncertainty?: number;
}

export interface Time {
  type: 'instant' | 'duration' | 'period';
  value?: unknown;
  precision?: 'exact' | 'approximate' | 'estimated';
  timezone?: string;
}

export interface Uncertainty {
  level: number;
  type?: 'probabilistic' | 'fuzzy' | 'ambiguous';
  confidence?: number;
}

export interface Modality {
  type: 'epistemic' | 'deontic' | 'alethic';
  value?: string;
  strength?: number;
}

export interface LunumTermObject {
  type: string;
  id?: string;
  value?: unknown;
  language?: string;
  ref?: string;
  [key: string]: unknown;
}

export type LunumTerm = Primitive | LunumTermObject | LunumTerm[] | Quantity | Time | Uncertainty | Modality;

export interface LunumClause {
  predicate: string;
  roles: Record<string, LunumTerm>;
  negated?: boolean;
  modality?: Modality | null;
  time?: Time;
  quantity?: Quantity;
  uncertainty?: Uncertainty;
  conditions?: LunumClause[];
  consequences?: LunumClause[];
  annotations?: Record<string, unknown>;
}

export interface LunumSem {
  schema: string;
  world: string;
  kind: string;
  clauses: LunumClause[];
  references?: Reference[];
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
  fingerprint: string;
  renderings: Record<string, LunumRendering>;
  policy: EligibilityDecision;
  meta: Record<string, unknown>;
}

export interface LunumSidecar {
  lunumCode: string | null;
  lunumSem: LunumSem | null;
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