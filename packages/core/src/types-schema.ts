// Auto-generated from schemas/*.json — do not edit manually.
// Regenerate with: node scripts/schema-to-ts.cjs

export interface ExperimentSchema {
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

export interface LunumRecordSchema {
  recordVersion: "lunum-record/0.1-draft";
  source: {     text: string,     language?: string | null,     role?: string | null,     ref?: string | null };
  sem: {     schema: "lunum-sem/0.1-draft",     world: string,     kind: string,     clauses: Clause[],     references?: Reference[],     provenance?: Record<string, unknown>,     annotations?: Record<string, unknown> };
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
  references?: Reference[];
  provenance?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export type Term = Record<string, unknown>;
export type Clause = {     predicate: string,     roles: Record<string, unknown>,     negated?: boolean,     modality?: {     type?: "epistemic" | "deontic" | "alethic" | "temporal",     value?: "necessity" | "possibility" | "permission" | "obligation" | "prohibition" | "ability" },     time?: {     type?: "instant" | "duration" | "interval",     value?: unknown,     unit?: string,     precision?: "exact" | "approximate" | "estimated" },     quantity?: {     value?: number,     unit?: string,     precision?: "exact" | "approximate" | "estimated" | "range",     range?: {     min?: number,     max?: number } },     uncertainty?: {     level?: "high" | "medium" | "low" | "none",     type?: "epistemic" | "alethic" | "statistical",     confidence?: number },     conditions?: Clause[],     consequences?: Clause[],     annotations?: Record<string, unknown> };
export type Time = {     type?: "instant" | "duration" | "interval",     value?: unknown,     unit?: string,     precision?: "exact" | "approximate" | "estimated" };
export type Modality = {     type?: "epistemic" | "deontic" | "alethic" | "temporal",     value?: "necessity" | "possibility" | "permission" | "obligation" | "prohibition" | "ability" };
export type Quantity = {     value?: number,     unit?: string,     precision?: "exact" | "approximate" | "estimated" | "range",     range?: {     min?: number,     max?: number } };
export type Uncertainty = {     level?: "high" | "medium" | "low" | "none",     type?: "epistemic" | "alethic" | "statistical",     confidence?: number };
export type Reference = {     id?: string,     type?: "document" | "section" | "paragraph" | "sentence" | "entity" | "external",     value?: unknown,     url?: string };

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

export interface ReportValidationSchema {
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
