import type { LunumSem } from '@corpunum/lunum';

export type WorkArea = 'semantic-contract' | 'multilingual-parse' | 'realization' | 'rendering' | 'context' | 'retrieval' | 'integration' | 'infrastructure';
export type ExperimentTask = 'parse' | 'realize' | 'render' | 'context' | 'retrieval' | 'integration' | 'conformance' | 'infrastructure';

export interface ModelProfile {
  schema: 'openlunum-model-profile/0.1';
  id: string;
  provider: 'openai-compatible';
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  temperature: number;
  seed?: number;
  maxTokens?: number;
  noThink?: boolean;
  /** Provider-neutral chat-template parameters; adapters may ignore unsupported keys. */
  chatTemplateKwargs?: Record<string, unknown>;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
}

/** Provider-neutral request for constrained structured output.
 *
 * The semantic evaluator may request one of these capabilities, but the
 * semantic core never knows how an individual provider transports it.
 */
export interface StructuredOutputCapability {
  mode: 'json_schema' | 'json_object' | 'grammar' | 'prompt';
  schema?: Record<string, unknown>;
  grammar?: string;
  strict?: boolean;
  fallback?: 'json_object' | 'prompt';
}

export interface ModelCompletionOptions {
  structuredOutput?: StructuredOutputCapability;
}

export interface CompletionUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
}

export interface ModelCompletion {
  content: string;
  finishReason: string | null;
  usage: CompletionUsage | null;
  /** Final answer channel only; reasoning/thinking is never included here. */
  /** Provider response envelope retained for evidence, with private reasoning fields redacted. */
  rawResponse?: unknown;
  /** Exact non-secret request body sent to the provider. */
  rawRequest?: unknown;
}

/** Minimal, non-secret identity evidence obtained from GET /models before a run. */
export interface ModelIdentityEvidence {
  requestedModel: string;
  /** Exact model id returned by the provider's model discovery response. */
  reportedModelId?: string;
  advertisedModelIds: string[];
  verified: boolean;
  endpoint?: string;
  modelFileIdentity?: {
    source: string;
    fileName: string;
    fileSizeBytes: number;
    modifiedAt: string;
  };
  verificationError?: string;
}

/** Inputs required to decide whether a parse run can be treated as live evidence. */
export interface ParseRunProvenance {
  startedAt: string;
  completedAt: string;
  codeCommit: string | null;
  baselineCommit: string;
  baselineCommitResolvable: boolean;
  datasetPath: string;
  datasetSha256: string;
  modelProfileSha256: string;
  modelProfileId: string;
  modelIdentity: ModelIdentityEvidence;
  effectiveSystemPromptSha256: string | null;
  workingTreeClean?: boolean;
  promptVersion: string;
  schemaVersion: string;
  schemaSha256?: string;
  structuredOutputMode?: string;
  decoding?: Record<string, unknown>;
  evidenceValid: boolean;
  invalidReasons: string[];
}

/**
 * Result of an opt-in streaming completion (see OpenAICompatibleModel.completeStreaming).
 * Extends ModelCompletion with timing instrumentation only obtainable by observing
 * server-sent-event chunk arrival: time-to-first-token, total generation wall time,
 * and time-per-output-token derived from the two. R14.1.
 */
export interface StreamingModelCompletion extends ModelCompletion {
  /** Milliseconds from request start to the first content-bearing chunk. Null if no content chunk was ever received. */
  ttftMs: number | null;
  /** Milliseconds from request start to stream completion (last chunk / [DONE]). */
  totalMs: number;
  /** Milliseconds per output token after the first, i.e. (totalMs - ttftMs) / (tokenCount - 1). Null when it cannot be computed (fewer than 2 tokens, or no TTFT). */
  tpotMs: number | null;
  /** Number of output tokens the timing was derived from: server-reported usage.completionTokens when available, else the count of content-bearing SSE chunks. */
  tokenCount: number;
}

export interface ExperimentManifest {
  schema: 'openlunum-experiment/0.1';
  id: string;
  area: WorkArea;
  task: ExperimentTask;
  deterministic?: boolean;
  hypothesis: string;
  baselineCommit: string;
  dataset?: { path: string; sha256: string };
  modelProfile?: string;
  targetLanguage?: string;
  limits: { maxItems: number; maxAttemptsPerItem: number; maxModelCalls: number };
  gates: { minimumFeatureRecall: number; minimumExactRate: number; requireProtectedLiteralCoverage: boolean };
  outputDirectory: string;
}

export interface DatasetItem {
  id: string;
  semanticGroup?: string;
  sourceLanguage: string;
  sourceText: string;
  targetLanguage?: string;
  /** Abstention fixtures encode no gold Sem at runtime and set expectedOutcome=abstain. */
  goldSem: LunumSem;
  expectedOutcome?: 'parse' | 'abstain';
  protectedLiterals?: string[];
  tags?: string[];
}

export interface ItemResult {
  id: string;
  status: 'passed' | 'failed' | 'error';
  rawOutput: string;
  /** Decoded provider envelope when a response was received but normalization failed. */
  rawResponse?: unknown;
  rawRequest?: unknown;
  /** SHA-256 of the exact system message sent for this item. */
  systemPromptSha256?: string;
  /** SHA-256 of the user message sent for this item. Raw output is retained separately. */
  userPromptSha256?: string;
  /** Every request attempt, including attempts superseded by a later retry. */
  attempts?: ParseAttemptEvidence[];
  completion?: ModelCompletion;
  parsedSem?: LunumSem;
  abstained?: boolean;
  realizedText?: string;
  exact?: boolean;
  nearSemantic?: boolean;
  nearSemanticScore?: number;
  featureRecall?: number;
  featurePrecision?: number;
  /** Per-feature extraction diagnostics; never substitutes for exact match. */
  featureMetrics?: Record<string, { expected: number; matched: number; observed: number; recall: number; precision: number }>;
  protectedLiteralCoverage?: number;
  /** Placement-aware protected literal checks (see protected-literal-placement.ts). Diagnostic only, not a gate input. */
  protectedLiteralPlacement?: Array<{
    literal: string;
    status: 'placed' | 'wrong-role' | 'missing' | 'literal-not-in-gold';
    expectedPaths: string[];
    candidatePaths: string[];
    satisfied: boolean;
  }>;
  /** Fraction of protectedLiteralPlacement checks with status 'placed'; 1 when there are none. */
  protectedLiteralPlacementCoverage?: number;
  missingFeatures?: string[];
  result?: Record<string, unknown>;
  error?: string | undefined;
  latencyMs: number;
  queryId?: string;
  candidateIds?: string[];
  expectedRelevantIds?: string[];
  rankedResultIds?: string[];
  mode?: 'exact' | 'near-semantic';
  selectedIntegration?: string;
  integrationVersion?: string;
  entrypointType?: 'in-process' | 'executable';
  fixtureId?: string;
  environmentRequirements?: Record<string, unknown>;
  resultStatus?: 'success' | 'failed' | 'error';
  artifacts?: Record<string, unknown>;
  failureReason?: string;
  reciprocalRank?: number;
  meanReciprocalRank?: number;
  falsePositives?: string[];
  falseNegatives?: string[];
  hasFalseEquivalence?: boolean;
  isNearSemantic?: boolean;
}

/** Retained request-level evidence for parse retries. */
export interface ParseAttemptEvidence {
  attempt: number;
  status: 'passed' | 'failed' | 'error';
  rawOutput: string;
  rawResponse?: unknown;
  rawRequest?: unknown;
  systemPromptSha256: string | null;
  userPromptSha256: string | null;
  error?: string;
  latencyMs: number;
}

export interface ExperimentItem {
  id: string;
  goldSem?: Record<string, unknown>;
  protectedLiterals?: string[];
  targetLanguage?: string;
  sourceText?: string;
  sourceLanguage?: string;
  [key: string]: unknown;
}
