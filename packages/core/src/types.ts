export type Risk = 'low' | 'medium' | 'high' | 'unknown';
export type Primitive = string | number | boolean | null;

// Typed structures for enhanced semantic precision
export interface Modality {
  type: 'epistemic' | 'deontic' | 'alethic' | 'temporal' | 'other';
  strength?: 'strong' | 'moderate' | 'weak' | 'possible' | 'necessary';
  source?: string;
}

export interface TimeStructure {
  type: 'absolute' | 'relative' | 'duration' | 'period' | 'temporal-phrase';
  value: string | number;
  unit?: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'decade' | 'century';
  reference?: string;
  temporalRelation?: 'before' | 'after' | 'during' | 'at' | 'since' | 'until';
}

export interface QuantityStructure {
  type: 'exact' | 'approximate' | 'range' | 'ratio';
  value: number | [number, number];
  unit?: string;
  precision?: number;
}

export interface UncertaintyStructure {
  type: 'probabilistic' | 'possibilistic' | 'epistemic' | 'aleatory';
  value: number | [number, number]; // 0-1 for probability, or range
  confidence?: number;
  source?: string;
}

export interface ReferenceStructure {
  type: 'entity' | 'event' | 'concept' | 'relation' | 'attribute';
  id: string;
  label?: string;
  context?: string;
}

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
  modality?: Modality;
  time?: TimeStructure;
  quantity?: QuantityStructure;
  uncertainty?: UncertaintyStructure;
  references?: ReferenceStructure[];
  conditions?: LunumClause[];
  consequences?: LunumClause[];
  annotations?: Record<string, unknown>;
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
