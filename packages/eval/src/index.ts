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

// Evidence supersession (R13.7)
export {
  createSupersession,
  createCorrection,
  buildSupersessionChain,
  validateNoHistoryRewriting,
  snapshotEvidence,
} from './evidence-supersession.js';
export type {
  SupersessionRecord,
  CorrectionEntry,
  SupersessionRegistry,
  HistoryValidation,
  EvidenceSnapshot,
} from './evidence-supersession.js';

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

// Performance bias control (R14.5)
export { shuffleTestOrder, thermalCooldown, detectCacheBias, runWithBiasControl, DEFAULT_BIAS_CONFIG } from './perf-bias-control.js';
export type { BiasReport, BiasControlConfig, BiasControlledResult } from './perf-bias-control.js';

// Red-team product flows (R15.5)
export { runProductFlowRedTeam, PRODUCT_FLOW_TEST_CASES } from './redteam-product-flows.js';
export type {
  ProductFlowTestCase,
  ProductFlowTestResult,
  ProductFlowCategorySummary,
  ProductFlowSummary,
} from './redteam-product-flows.js';

// Backup, restore and rollback (R14.8)
export {
  createBackup,
  verifyBackup,
  restoreBackup,
  rollbackToBackup,
} from './backup-restore.js';
export type {
  BackupManifest,
  BackupFileEntry,
  BackupVerification,
  RestoreResult,
  RollbackResult,
} from './backup-restore.js';

// Health/readiness probes and failover (R14.6)
export {
  checkHealth,
  semValidationProbe,
  fingerprintProbe,
  schemaRegistryProbe,
  ReadinessGate,
  FAILOVER_PROCEDURES,
} from './health-probes.js';
export type {
  HealthProbe,
  ProbeResult,
  HealthReport,
  FailoverProcedure,
} from './health-probes.js';

// SLO compliance (R14.7)
export { verifySloCompliance, runMeasuredSoak } from './slo-compliance.js';
export type { MarginReport, SloComplianceEntry, SloComplianceReport } from './slo-compliance.js';

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

// Supply-chain audit (R15.4)
export {
  verifyLockfileIntegrity,
  auditDependencyProvenance,
  checkForKnownVulnerabilities,
  verifyArtifactIntegrity,
  KNOWN_VULNERABILITIES,
} from './supply-chain-audit.js';
export type {
  LockfileVerification,
  PackageDep,
  ProvenanceReport,
  KnownVulnerability,
  VulnerablePackage,
  VulnerabilityReport,
  ArtifactVerification,
  SupplyChainReport,
} from './supply-chain-audit.js';

// Data lifecycle (R15.7)
export {
  classifyDataSensitivity,
  auditRetentionCompliance,
  generateDeletionManifest,
  DEFAULT_RETENTION_POLICIES,
} from './data-lifecycle.js';
export type {
  DataSensitivity,
  RetentionPolicy,
  ExpiredFile,
  RetentionComplianceResult,
  DeletionEntry,
  DeletionManifest,
  AuditEntry,
  AuditTrail,
} from './data-lifecycle.js';

// Cross-tokenizer compaction (R7.8)
export {
  estimateTokenCount,
  compareCrossTokenizer,
  TOKENIZER_PROFILES,
  PROFILE_VERSIONS,
} from './cross-tokenizer-compaction.js';
export type {
  TokenizerFamily,
  TokenizerProfile,
  CrossTokenizerResult,
  CrossTokenizerReport,
  ProfileVersionEntry,
} from './cross-tokenizer-compaction.js';

// Incident response (R15.6)
export {
  detectEvidenceTampering,
  quarantineEvidence,
  simulateIncident,
  INCIDENT_RUNBOOKS,
} from './incident-response.js';
export type {
  IncidentType,
  TamperDetectionResult,
  QuarantineEntry,
  QuarantineResult,
  RunbookStep,
  IncidentRunbook,
  SimulationResult,
} from './incident-response.js';

// Context mode quality (R7.4)
export {
  measureAccuracy,
  measureLiteralPreservation,
  measureRolePreservation,
  estimateTokenCost,
  compareContextModes,
  DEFAULT_QUALITY_TOLERANCES,
} from './context-mode-quality.js';
export type {
  ContextMode as EvalContextMode,
  QualityDimension,
  ModeQualityMeasurement,
  ModeQualityConfig,
  ModeComparisonReport,
} from './context-mode-quality.js';

// Long-context sessions (R7.5)
export {
  buildSessionTimeline,
  detectStaleRetrievals,
  runSessionScenario,
  SESSION_TEST_SCENARIOS,
  SessionMemory,
} from './long-context-sessions.js';
export type {
  SessionEvent,
  MemoryEntry,
  MemoryConflict,
  RetrievalAttempt,
  SessionTimeline,
  StaleReport,
  ScenarioResult,
} from './long-context-sessions.js';

// Retrieval category metrics (R9.4)
export {
  computeCategoryMetrics,
  computeLanguageMetrics,
  computeRankingQuality,
  generateRetrievalCategoryReport,
} from './retrieval-category-metrics.js';
export type {
  LanguagePair,
  SemanticCategory,
  CategoryMetrics,
  LanguageMetrics,
  RetrievalJudgment,
  RankingQualityMetrics,
  RetrievalCategoryReport,
} from './retrieval-category-metrics.js';

// Safety incident handling (R6.7)
export {
  createRollbackPlan,
  validateRollbackPlan,
  simulateSafetyIncident,
  SAFETY_DEFECT_SCENARIOS,
} from './safety-incident-handling.js';
export type {
  SafetyDefectType,
  SafetyDefect,
  RollbackStep,
  RollbackPlan,
  PlanValidation,
  IncidentPhaseName,
  IncidentPhase,
  IncidentTimeline,
} from './safety-incident-handling.js';

// Profile quality measurement (R8.3)
export {
  measureSemanticRetention,
  measureLiteralPreservation as measureProfileLiteralPreservation,
  measureCompressionRatio,
  evaluateProfile,
  compareProfiles,
  QUALITY_THRESHOLDS,
} from './profile-quality-measurement.js';
export type {
  ProfileId,
  QualityMetric as ProfileQualityMetric,
  ProfileMeasurement,
  ProfileQualityReport,
  CrossProfileComparison,
} from './profile-quality-measurement.js';

// Statistical conventions (R13.6)
export {
  CONVENTIONS_VERSION,
  DEFAULT_CONVENTIONS,
  computePercentile,
  computeMean,
  computeStdDev,
  computeMedian as computeConventionMedian,
  computeIQR,
  computeDescriptiveStats,
  verifyRecomputation,
} from './statistical-conventions.js';
export type {
  PercentileMethod,
  AggregationMethod,
  ConfidenceMethod,
  StatisticalConventions,
  DescriptiveStats,
} from './statistical-conventions.js';

// Independent evaluation infrastructure (R5.7)
export {
  DEFAULT_REVIEW_PROTOCOL,
  validateScorerChange,
  validateReview,
  detectRegressions,
  evaluateChangeReview,
} from './independent-eval.js';
export type {
  ChangeType,
  ReviewStatus,
  ScorerChange,
  EvalBenchmark,
  BenchmarkMetric,
  IndependentReview,
  ChangeReviewProtocol,
  ChangeReviewResult,
} from './independent-eval.js';

// External/separate-environment replication (R13.4)
export {
  REPLICATION_PACKAGES,
  validateReplicationPackage,
  checkEnvironmentCompatibility,
  compareResults,
  simulateReplication,
  runReplicationSuite,
} from './external-replication.js';
export type {
  ReplicationTarget,
  ReplicationStatus,
  ReplicationPackage,
  ReplicationExpectation,
  EnvironmentRequirement,
  ReplicationAttempt,
  EnvironmentDescriptor,
  ReplicationMeasurement,
  ReplicationReport,
} from './external-replication.js';

// Independent red-team review framework (R6.6)
export {
  ALL_ATTACK_CATEGORIES,
  validateFinding,
  validateSession,
  generateReport,
  SAMPLE_REVIEW_SESSION,
} from './redteam-independent-review.js';
export type {
  FindingSeverity,
  FindingStatus,
  AttackCategory,
  RedTeamFinding,
  RedTeamReviewSession,
  RedTeamReviewReport,
} from './redteam-independent-review.js';

// Security self-assessment framework (R15.2)
export {
  SECURITY_CONTROLS,
  assessControl,
  assessDomain,
  generateAssessmentReport,
  runSampleAssessment,
} from './security-self-assessment.js';
export type {
  SecurityDomain,
  MaturityLevel,
  EvidenceKind,
  SecurityControl,
  ControlAssessment,
  DomainAssessment,
  SecuritySelfAssessmentReport,
} from './security-self-assessment.js';
