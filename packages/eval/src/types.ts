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
  timeoutMs: number;
  metadata?: Record<string, unknown>;
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
  goldSem: LunumSem;
  protectedLiterals?: string[];
  tags?: string[];
}

export interface ItemResult {
  id: string;
  status: 'passed' | 'failed' | 'error';
  rawOutput: string;
  parsedSem?: LunumSem;
  realizedText?: string;
  exact?: boolean;
  featureRecall?: number;
  featurePrecision?: number;
  protectedLiteralCoverage?: number;
  missingFeatures?: string[];
  nearSemantic?: boolean;
  nearSemanticSimilarity?: number;
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

export interface ExperimentItem {
  id: string;
  goldSem?: Record<string, unknown>;
  protectedLiterals?: string[];
  targetLanguage?: string;
  sourceText?: string;
  sourceLanguage?: string;
  [key: string]: unknown;
}
