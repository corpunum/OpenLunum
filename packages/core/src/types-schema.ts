// Auto-generated from schemas/*.json — do not edit manually.
// Regenerate with: node scripts/schema-to-ts.cjs

export interface ExperimentSchema {
  schema: "openlunum-experiment/0.1";
  id: Id;
  area: Area;
  task: Task;
  hypothesis: string;
  baselineCommit: string;
  dataset?: Dataset;
  modelProfile?: string;
  targetLanguage?: string;
  limits: Limits;
  gates: Gates;
  outputDirectory: string;
  deterministic?: boolean;
  retrievalConfig?: {     k?: number,     mode?: "exact" | "near-semantic" };
  integrationConfig?: {     selectedIntegration: string,     fixtureId: string };
}

export interface LunumRecordSchema {
  recordVersion: "lunum-record/0.1-draft";
  source: {     text: string,     language?: string | null,     role?: string | null,     ref?: string | null };
  sem: {     schema: "lunum-sem/0.1-draft",     world: string,     kind: string,     clauses: Clause[],     references?: {     uri: string,     type?: string,     label?: string }[],     provenance?: Record<string, unknown>,     annotations?: Coverage };
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
  references?: {     uri: string,     type?: string,     label?: string }[];
  provenance?: Record<string, unknown>;
  annotations?: Coverage;
}

export type Term = Record<string, unknown>;
export type Clause = {     predicate: string,     roles: Record<string, unknown>,     negated?: boolean,     modality?: string | null,     time?: unknown,     conditions?: Clause[],     consequences?: Clause[],     annotations?: Coverage };

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

export interface ProtectedEvalSchema {
  schema: "openlunum-protected-eval/0.1";
  id: Id;
  version: string;
  datasetId: string;
  dataset: Dataset;
  instructions: string;
  coverage: Coverage;
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

export interface ReportValidationSchema {
  $ref?: unknown;
  schema: "openlunum-experiment/0.1";
  id: Id;
  area: string;
  task: Task;
  hypothesis: string;
  baselineCommit: string;
  dataset: Dataset;
  modelProfile: string;
  limits: Limits;
  gates: Gates;
  outputDirectory: string;
}

export interface SharedSchema {

}

export type Dataset = {     path: string,     sha256: string,     license?: string,     envVar?: string };
export type Limits = {     maxItems: number,     maxAttemptsPerItem: number,     maxModelCalls: number };
export type Gates = {     minimumFeatureRecall: number,     minimumExactRate: number,     requireProtectedLiteralCoverage: boolean };
export type Id = string;
export type Task = "parse" | "realize" | "render" | "context" | "retrieval" | "integration" | "conformance" | "infrastructure";
export type Area = "semantic-contract" | "multilingual-parse" | "realization" | "rendering" | "context" | "retrieval" | "integration" | "infrastructure";
export type Coverage = {     tasks: Task[],     languages: string[],     categories: string[] };
