/**
 * Barrel exports for @corpunum/lunum-eval.
 *
 * New public types should be exported here so consumers can import
 * from `@corpunum/lunum-eval` rather than from internal file paths.
 */

// Core types
export type {
  WorkArea,
  ExperimentTask,
  ModelProfile,
  CompletionUsage,
  ModelCompletion,
  StreamingModelCompletion,
  ExperimentManifest,
  DatasetItem,
  ItemResult,
  ExperimentItem,
} from './types.js';

// I/O utilities
export {
  findWorkspaceRoot,
  readJson,
  writeJson,
  sha256File,
  loadDataset,
  validateManifest,
  validateProfile,
} from './io.js';

// Evidence lineage (R13.7)
export {
  createLineageEdge,
  createLineageRecord,
  buildLineageIndex,
  queryLineage,
  addSupersessionToRegistry,
  saveLineageEdges,
  loadLineageEdges,
} from './evidence-lineage.js';
export type {
  LineageRelation,
  LineageEdge,
  LineageRecord,
  LineageQueryResult,
} from './evidence-lineage.js';

// Runner
export { runExperiment } from './runner.js';

// Model
export { OpenAICompatibleModel } from './model.js';

// Smoke testing
export { runSmoke } from './smoke.js';

// Retention
export { runRetentionCli } from './retention-cli.js';
export { runRetentionExperiment } from './retention-experiment.js';
export {
  scoreExactPreservation,
  scoreFeaturePreservation,
  scoreLiteralPreservation,
  scoreRolePreservation,
  scoreNegationPreservation,
  scoreModalityPreservation,
  evaluateRetentionGates,
  getRetentionGateNames,
  getGateThreshold,
} from './retention-gates.js';
export type {
  RetentionGateName,
  RetentionGateScore,
  RetentionGatesResult,
} from './retention-gates.js';
export {
  saveBaseline,
  loadBaseline,
  hasBaseline,
  compareRetentionAgainstBaseline,
  snapshotToBaseline,
} from './retention-baseline.js';
export type {
  RetentionBaseline,
  BaselineComparison,
  RetentionReportSnapshot,
} from './retention-baseline.js';

// Retrieval
export { runRetrievalExperiment } from './retrieval-runner.js';
export type {
  RetrievalFixture,
  RetrievalManifest,
  RetrievalItemResult,
} from './retrieval-runner.js';

// Retrieval ranking
export { computeFreshnessDecay, computeRankedScore, rankResults, DEFAULT_RANKING_WEIGHTS } from './retrieval-ranking.js';
export type { RankingSignal, RankingWeights, RankedResult } from './retrieval-ranking.js';

// Retrieval strategy comparison
export { compareStrategies, DEFAULT_HYBRID_WEIGHTS } from './retrieval-strategy-comparison.js';
export type { StrategyName, RetrievalDocument, StrategyMetrics, StrategyComparisonReport, RetrievalQuery, HybridWeights } from './retrieval-strategy-comparison.js';

// Context compaction
export { runBenchmark } from './context-compaction-benchmark.js';
export type {
  BenchmarkCategory,
  BenchmarkTask,
  BenchmarkResult,
  BenchmarkReport,
} from './context-compaction-benchmark.js';

// Compaction gates
export { evaluateCompactionGates, DEFAULT_COMPACTION_GATES } from './compaction-gates.js';
export type { CompactionGateConfig, GateVerdict, GateResult } from './compaction-gates.js';

// Threshold sweep
export { runThresholdSweep } from './threshold-sweep.js';
export type {
  PairLabel,
  LabeledPair,
  ScoredPair,
  ThresholdMetrics,
  ThresholdSweepDatasets,
  ThresholdSweepReport,
} from './threshold-sweep.js';

// Cross-lingual retrieval
export { runCrossLingualRetrieval } from './cross-lingual-retrieval.js';
export type {
  CrossLingualLanguagePair,
  CrossLingualQuery,
  CrossLingualResult,
  CrossLingualQueryResult,
  CrossLingualMetrics,
  CrossLingualReport,
  CrossLingualIndex,
} from './cross-lingual-retrieval.js';

// Model family eval
export {
  validateModelFamilyResult,
  validateModelFamilyBundle,
  buildBundle,
  hashProfileFile,
  computeMedian,
  summarizeSamples,
} from './model-family-eval.js';
export type {
  ModelFamilyId,
  ModelFamilyProfile,
  ParseSample,
  ModelFamilyResult,
  ModelFamilyBundle,
} from './model-family-eval.js';

// Multilingual expanded coverage
export { auditLanguageCoverage } from './multilingual-expanded-coverage.js';
export type { CoverageReport } from './multilingual-expanded-coverage.js';

// Protected literal scoring
export { protectedLiteralScoringExports } from './protected-literal-scoring.js';
export type {
  ProtectedLiteralRule,
  ProtectedLiteral,
  LiteralType,
  SemanticScore,
} from './protected-literal-scoring.js';
export {
  ProtectedLiteralDetector,
  SemanticScorer,
} from './protected-literal-scoring.js';

// Protected literal placement
export {
  collectLiteralPlacements,
  checkProtectedLiteralPlacement,
  protectedLiteralPlacementCoverage,
} from './protected-literal-placement.js';
export type {
  LiteralPlacement,
  ProtectedLiteralPlacementStatus,
  ProtectedLiteralPlacementCheck,
} from './protected-literal-placement.js';

// Round-trip consistency
export { roundtripConsistencyExports } from './roundtrip-consistency.js';
export type { RoundTripResult } from './roundtrip-consistency.js';
export { RoundTripChecker } from './roundtrip-consistency.js';

// False positive review
export { runFalsePositiveReviewCliEntrypoint } from './false-positive-review-cli.js';

// Red-team product flows (R15.5)
export { runProductFlowRedTeam, PRODUCT_FLOW_TEST_CASES } from './redteam-product-flows.js';
export type {
  ProductFlowTestCase,
  ProductFlowTestResult,
  ProductFlowCategorySummary,
  ProductFlowSummary,
} from './redteam-product-flows.js';

// Security contracts (R15.3)
export {
  auditForSecrets,
  verifyTenantIsolation,
  DEFAULT_SECRET_POLICY,
  LEAST_PRIVILEGE_POLICIES,
} from './security-contracts.js';
export type {
  SecretKind,
  SecretPolicy,
  SecretFinding,
  ComponentRole,
  PermissionSet,
  LeastPrivilegePolicy,
  EvalRunManifest,
  TenantIsolationContract,
  IsolationViolation,
  IsolationVerification,
} from './security-contracts.js';
