// Auto-generated from schemas/*.json — do not edit manually.
// Regenerate with: node scripts/schema-to-ts.cjs

export interface ExperimentSchema {
  schema: "openlunum-experiment/0.1";
  id: string;
  area: "semantic-contract" | "multilingual-parse" | "realization" | "rendering" | "context" | "retrieval" | "integration" | "infrastructure";
  task: "parse" | "realize" | "render" | "context";
  hypothesis: string;
  baselineCommit: string;
  dataset?: {     path: string,     sha256: string };
  modelProfile?: string;
  targetLanguage?: string;
  limits: {     maxItems: number,     maxAttemptsPerItem: number,     maxModelCalls: number };
  gates: {     minimumFeatureRecall: number,     minimumExactRate: number,     requireProtectedLiteralCoverage: boolean };
  outputDirectory: string;
  deterministic?: boolean;
}

export interface LunumRecordSchema {
  recordVersion: "lunum-record/0.1-draft";
  source: {     text: string,     language?: string | null,     role?: string | null,     ref?: string | null };
  sem: {     schema: "lunum-sem/0.1-draft",     world: string,     kind: string,     clauses: Clause[],     references?: Record<string, unknown>[],     provenance?: Record<string, unknown>,     annotations?: Record<string, unknown> };
  fingerprint: string;
  renderings: Record<string, unknown>;
  policy: {     eligible: boolean,     risk: "low" | "medium" | "high" | "unknown",     confidence: number,     reasons?: string[] };
  meta?: Record<string, unknown>;
}

export interface LunumSemSchema {
  schema: "lunum-sem/0.1-draft";
  world: string;
  kind: string;
  clauses: Clause[];
  references?: Record<string, unknown>[];
  provenance?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export type Term = Record<string, unknown>;
export type Clause = {     predicate: string,     roles: Record<string, unknown>,     negated?: boolean,     modality?: string | null,     time?: unknown,     conditions?: Clause[],     consequences?: Clause[],     annotations?: Record<string, unknown> };

export interface ModelProfileSchema {
  schema: "openlunum-model-profile/0.1";
  id: string;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  temperature: number;
  seed?: number;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
}

export interface RendererProfileSchema {
  schema: "openlunum-renderer-profile/0.1";
  id: string;
  semSchema: string;
  purpose: string;
  status: "design" | "experimental" | "prototype" | "verified";
  tokenStrategy: string;
  testedModels?: string[];
  limitations?: string[];
}
