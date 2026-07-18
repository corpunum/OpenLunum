// Auto-generated from schemas/*.json — do not edit manually.
// Regenerate with: node scripts/schema-to-ts.cjs

export interface ExperimentSchema01 {
  schema: "openlunum-experiment/0.1";
  id: string;
  area: "semantic-contract" | "multilingual-parse" | "realization" | "rendering" | "context" | "retrieval" | "integration" | "infrastructure";
  task: "parse" | "realize" | "render" | "context" | "retrieval" | "integration" | "conformance" | "infrastructure";
  hypothesis: string;
  baselineCommit: string;
  dataset?: {     path: string,     sha256: string };
  modelProfile?: string;
  targetLanguage?: string;
  limits: {     maxItems: number,     maxAttemptsPerItem: number,     maxModelCalls: number };
  gates: {     minimumFeatureRecall: number,     minimumExactRate: number,     requireProtectedLiteralCoverage: boolean };
  outputDirectory: string;
  deterministic?: boolean;
  retrievalConfig?: {     k?: number,     mode?: "exact" | "near-semantic" };
  integrationConfig?: {     selectedIntegration: string,     fixtureId: string };
}

export interface LunumRecordSchema02 {
  recordVersion: "lunum-record/0.2";
  source: {     text: string,     language?: string | null,     role?: string | null,     ref?: string | null,     format?: "natural" | "structured" | "mixed" };
  sem: {     schema: "lunum-sem/0.2",     world: string,     kind: string,     clauses: v02Clause[],     references?: v02Reference[],     provenance?: {     source?: string,     author?: string,     timestamp?: string,     license?: string },     annotations?: {     confidence?: number,     tags?: string[],     notes?: string } };
  fingerprint: string;
  renderings: Record<string, unknown>;
  policy: {     eligible: boolean,     risk: "low" | "medium" | "high" | "unknown",     confidence: number,     reasons?: string[] };
  meta?: {     created?: string,     modified?: string,     schemaVersion?: "0.2" };
}

export interface LunumRecordSchema01 {
  recordVersion: "lunum-record/0.1-draft";
  source: {     text: string,     language?: string | null,     role?: string | null,     ref?: string | null };
  sem: {     schema: "lunum-sem/0.1-draft",     world: string,     kind: string,     clauses: v01Clause[],     references?: Record<string, unknown>[],     provenance?: Record<string, unknown>,     annotations?: Record<string, unknown> };
  fingerprint: string;
  renderings: Record<string, unknown>;
  policy: {     eligible: boolean,     risk: "low" | "medium" | "high" | "unknown",     confidence: number,     reasons?: string[] };
  meta?: Record<string, unknown>;
}

export interface LunumSemSchema02 {
  schema: "lunum-sem/0.2";
  world: string;
  kind: string;
  clauses: v02Clause[];
  references?: v02Reference[];
  provenance?: {     source?: string,     author?: string,     timestamp?: string,     license?: string };
  annotations?: {     confidence?: number,     tags?: string[],     notes?: string };
}

export type v02Term = Record<string, unknown>;
export type v02Reference = {     id: string,     url: string,     title?: string,     type?: string };
export type v02Clause = {     predicate: string,     roles: Record<string, unknown>,     negated?: boolean,     modality?: "certainty" | "possibility" | "necessity" | "obligation" | null,     time?: unknown,     conditions?: v02Clause[],     consequences?: v02Clause[],     annotations?: {     confidence?: number,     evidence?: string } };

export interface LunumSemSchema01 {
  schema: "lunum-sem/0.1-draft";
  world: string;
  kind: string;
  clauses: v01Clause[];
  references?: Record<string, unknown>[];
  provenance?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export type v01Term = Record<string, unknown>;
export type v01Clause = {     predicate: string,     roles: Record<string, unknown>,     negated?: boolean,     modality?: string | null,     time?: unknown,     conditions?: v01Clause[],     consequences?: v01Clause[],     annotations?: Record<string, unknown> };

export interface ModelProfileSchema01 {
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

export interface ProtectedEvalSchema01 {
  schema: "openlunum-protected-eval/0.1";
  id: string;
  version: string;
  datasetId: string;
  dataset: {     path: string,     sha256: string,     license: string,     envVar?: string };
  instructions: string;
  coverage: {     tasks: ("parse" | "realize" | "render" | "context" | "retrieval" | "integration" | "conformance" | "infrastructure")[],     languages: string[],     categories: string[] };
}

export interface RendererProfileSchema01 {
  schema: "openlunum-renderer-profile/0.1";
  id: string;
  semSchema: string;
  purpose: string;
  status: "design" | "experimental" | "prototype" | "verified";
  tokenStrategy: string;
  testedModels?: string[];
  limitations?: string[];
}

export interface ReportValidationSchema01 {
  schema: "openlunum-experiment/0.1";
  id: string;
  area: string;
  task: "parse" | "realize" | "render" | "context" | "retrieval" | "integration" | "conformance" | "infrastructure";
  hypothesis: string;
  baselineCommit: string;
  dataset: {     path: string,     sha256: string };
  modelProfile: string;
  limits: {     maxItems: number,     maxAttemptsPerItem: number,     maxModelCalls: number };
  gates: {     minimumFeatureRecall: number,     minimumExactRate: number,     requireProtectedLiteralCoverage: boolean };
  outputDirectory: string;
}
