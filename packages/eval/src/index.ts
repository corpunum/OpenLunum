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

// Crash and disk-pressure recovery simulation (R14.4)
export {
  FAILURE_INJECTIONS,
  simulateDiskPressure,
  simulateCrashRecovery,
  validateRecoveryResult,
  generateRecoveryReport,
  runCrashRecoverySimulation,
} from './crash-recovery-simulation.js';
export type {
  FailureScenario as CrashFailureScenario,
  RecoveryOutcome,
  FailureInjection,
  RecoveryResult,
  DiskPressureSimulation,
  CrashRecoveryReport,
} from './crash-recovery-simulation.js';

// Compaction execution runner (R7)
export {
  DEFAULT_RUN_CONFIG,
  COMPACTION_TASKS,
  simulateCompactionMeasurement,
  runCompactionBenchmark,
} from './compaction-execution-runner.js';
export type {
  ExecutionMode,
  ContextMode as CompactionContextMode,
  CompactionTask,
  CompactionMeasurement,
  CompactionRunConfig,
  CompactionExecutionReport,
  CompactionModeSummary,
} from './compaction-execution-runner.js';

// Retention pass runner (R3.3)
export {
  DEFAULT_PASS_CONFIG,
  RETENTION_TEST_ITEMS,
  simulatePass,
  runRetentionPasses,
  runMultiItemRetention,
} from './retention-pass-runner.js';
export type {
  RetentionPassConfig,
  PassResult,
  RetentionDriftReport,
  MultiItemRetentionReport,
} from './retention-pass-runner.js';

// Parse threshold validation (R2)
export {
  GATE_KEYS,
  SAMPLE_SCOPED_RESULTS,
  validateScope,
  detectRegressions as detectParseRegressions,
  runValidation,
  runSampleValidation,
} from './parse-threshold-validation.js';
export type {
  ValidationScope,
  ScopedParseResults,
  GateViolation,
  ScopeValidation,
  RegressionEntry,
  ValidationReport,
} from './parse-threshold-validation.js';

// Profile execution validation (R8.7)
export {
  PROFILE_CONFIGS,
  simulateExecution,
  checkCompatibility,
  runProfileValidation,
} from './profile-execution-validation.js';
export type {
  ModelFamily,
  ProfileConfig,
  ExecutionResult,
  CompatibilityCheck,
  ProfileValidationReport,
} from './profile-execution-validation.js';

// Multilingual parse model-family simulation runner (R2.10)
export {
  PARSE_MODEL_FAMILY_RUNNER_VERSION,
  MODEL_FAMILIES,
  TEST_LANGUAGES,
  DEFAULT_PARSE_FAMILY_GATES,
  simulateParseRun,
  checkParseFamilyGates,
  runModelFamilyParseSuite,
} from './parse-model-family-runner.js';
export type {
  ParseModelFamilyId,
  TestLanguageCode,
  ParseDifficulty,
  ModelFamilyProfile as ParseModelFamilyProfile,
  TestLanguageProfile,
  ParseRunMetrics,
  ParseRunResult,
  ParseFamilyGateConfig,
  ParseFamilyGateCheck,
  ParseFamilySummary,
  ParseLanguageSummary,
  ModelFamilyParseSuiteReport,
} from './parse-model-family-runner.js';

// Retention execution validation (R3.8)
export {
  COMPLEXITY_LEVELS,
  SEMANTIC_CATEGORIES,
  RETENTION_LANGUAGES,
  FEATURE_PRESERVATION_THRESHOLD,
  simulateRetentionRun,
  runRetentionExecutionSuite,
} from './retention-execution-runner.js';
export type {
  ExecutionComplexityLevel,
  RetentionExecutionCategory,
  RetentionExecutionLanguage,
  RetentionExecutionMetrics,
  RetentionExecutionCategorySummary,
  RetentionExecutionLanguageSummary,
  RetentionExecutionComplexitySummary,
  RetentionExecutionReport,
} from './retention-execution-runner.js';

// Compaction gate validation (R7.10)
export {
  COMPACTION_QUALITY_GATES,
  CONTEXT_MODES,
  evaluateGate,
  runCompactionGateValidation,
} from './compaction-gate-validation.js';
export type {
  CompactionGateId,
  GateThresholdDirection,
  CompactionQualityGate,
  GateContextMode,
  ContextModeDescriptor,
  GateEvaluationResult,
  ModeGateSummary,
  CompactionReadinessVerdict,
  CompactionGateValidationReport,
} from './compaction-gate-validation.js';

// Operational load execution simulation runner (R14.9)
export {
  LOAD_LEVELS as OPERATIONAL_LOAD_LEVELS,
  OPERATION_TYPES as OPERATIONAL_OPERATION_TYPES,
  simulateLoadTest,
  runOperationalLoadSuite,
} from './operational-load-runner.js';
export type {
  OperationalLoadLevelName,
  OperationalOperationName,
  OperationalLoadLevel,
  OperationalOperationProfile,
  OperationalLatencyMetrics,
  OperationalLoadMeasurement,
  OperationalOperationSummary,
  OperationalLevelSummary,
  OperationalLoadReport,
} from './operational-load-runner.js';

// Threshold calibration execution runner (R5.8)
export {
  SEMANTIC_CHANGE_TYPES,
  THRESHOLD_LEVELS,
  simulateCalibrationRun,
  runThresholdCalibrationSuite,
} from './threshold-calibration-runner.js';
export type {
  CalibrationChangeType,
  CalibrationChangeProfile,
  CalibrationThresholdName,
  CalibrationThresholdLevel,
  CalibrationRunMetrics,
  CalibrationRunResult,
  ChangeTypeSummary,
  ThresholdLevelSummary,
  ThresholdCalibrationReport,
} from './threshold-calibration-runner.js';

// Safety gate runner (R6.8)
export {
  SAFETY_GATE_TYPES,
  RISK_LEVELS as SAFETY_GATE_RISK_LEVELS,
  GATE_SCENARIOS,
  simulateGateExecution,
  runSafetyGateSuite,
} from './safety-gate-runner.js';
export type {
  SafetyGateType,
  SafetyGateRiskLevel,
  SafetyGateScenario,
  SafetyGateProfile,
  SafetyGateExecutionResult,
  SafetyGateSummary,
  SafetyRiskSummary,
  SafetyGateReport,
} from './safety-gate-runner.js';

// Retrieval execution validation (R9.8)
export {
  RETRIEVAL_STRATEGIES,
  CORPUS_SIZES,
  QUERY_COMPLEXITIES,
  simulateRetrievalExecution,
  runRetrievalExecutionSuite,
} from './retrieval-execution-validation.js';
export type {
  RetrievalStrategyName as RetrievalExecStrategyName,
  RetrievalCorpusSize,
  RetrievalQueryComplexity,
  RetrievalStrategyProfile,
  RetrievalCorpusProfile,
  RetrievalQueryProfile,
  RetrievalExecutionMetrics,
  RetrievalStrategySummary,
  RetrievalCorpusSummary,
  RetrievalExecutionReport,
} from './retrieval-execution-validation.js';

// Canonicalization edge cases (R4.7)
export {
  EDGE_CASE_CATEGORIES,
  simulateEdgeCaseValidation,
  runCanonicalizationEdgeCaseSuite,
} from './canonicalization-edge-cases.js';
export type {
  EdgeCaseCategory,
  CanonicalizationOutcome,
  EdgeCaseProfile,
  EdgeCaseScenario,
  EdgeCaseResult,
  EdgeCategorySummary,
  CanonicalizationEdgeCaseReport,
} from './canonicalization-edge-cases.js';

// Profile regression runner (R8.8)
export {
  REGRESSION_PROFILES,
  REGRESSION_METRICS,
  simulateRegressionTest,
  runProfileRegressionSuite,
} from './profile-regression-runner.js';
export type {
  RegressionProfileId,
  RegressionMetricName,
  RegressionProfile,
  RegressionMetric,
  RegressionTestResult,
  ProfileRegressionSummary,
  RegressionReport,
} from './profile-regression-runner.js';

// Parse coverage validation (R2.11)
export {
  LANGUAGE_GROUPS,
  PARSE_INPUT_TYPES,
  simulateParseCoverage,
  runParseCoverageValidation,
} from './parse-coverage-validation.js';
export type {
  ParseLanguageGroup,
  ParseInputType,
  LanguageGroupProfile,
  ParseInputProfile,
  ParseCoverageResult,
  LanguageGroupSummary,
  InputTypeSummary,
  ParseCoverageReport,
} from './parse-coverage-validation.js';

// Operational failover runner (R14.10)
export {
  FAILOVER_SCENARIOS,
  simulateFailoverTest,
  runOperationalFailoverSuite,
} from './operational-failover-runner.js';
export type {
  FailoverScenarioName,
  FailoverOutcome,
  FailoverScenarioProfile,
  FailoverTestResult,
  FailoverScenarioSummary,
  OperationalFailoverReport,
} from './operational-failover-runner.js';

// Parse error recovery (R2.12)
export {
  PARSE_ERROR_PROFILES,
  simulateParseErrorRecovery,
  runParseErrorRecoverySuite,
} from './parse-error-recovery.js';
export type {
  ParseErrorCategory,
  RecoveryAction,
  ParseErrorProfile,
  ParseErrorRecoveryResult,
  ParseErrorCategorySummary,
  ParseErrorRecoveryReport,
} from './parse-error-recovery.js';

// Retrieval performance bounds (R9.9)
export {
  RETRIEVAL_WORKLOADS,
  simulateRetrievalPerformance,
  runRetrievalPerformanceSuite,
} from './retrieval-performance-bounds.js';
export type {
  RetrievalWorkloadName,
  LatencyTier,
  RetrievalWorkloadProfile,
  RetrievalPerformanceResult,
  WorkloadPerformanceSummary,
  RetrievalPerformanceReport,
} from './retrieval-performance-bounds.js';

// Compaction boundary stress (R7.12)
export {
  BOUNDARY_CATEGORIES,
  STRESS_DIMENSIONS,
  simulateBoundaryStress,
  runCompactionBoundaryStressSuite,
} from './compaction-boundary-stress.js';
export type {
  BoundaryCategory,
  StressDimension,
  BoundaryCategoryProfile,
  StressDimensionProfile,
  BoundaryStressResult,
  BoundaryCategorySummary,
  CompactionBoundaryStressReport,
} from './compaction-boundary-stress.js';

// Degradation cascade simulation (R14.11)
export {
  CASCADE_SCENARIOS,
  ISOLATION_CHECKS,
  simulateCascadeStep,
  runDegradationCascadeSuite,
} from './degradation-cascade-simulation.js';
export type {
  CascadeScenarioName,
  IsolationCheckName,
  CascadeScenarioProfile,
  IsolationCheckProfile,
  CascadeStepResult,
  CascadeScenarioSummary,
  DegradationCascadeReport,
} from './degradation-cascade-simulation.js';

// Parse ambiguity resolution (R2.13)
export {
  AMBIGUITY_PROFILES,
  RESOLUTION_STRATEGIES,
  simulateAmbiguityResolution,
  runParseAmbiguityResolutionSuite,
} from './parse-ambiguity-resolution.js';
export type {
  AmbiguityType,
  ResolutionStrategy,
  AmbiguityProfile,
  ResolutionStrategyProfile,
  AmbiguityResolutionResult,
  AmbiguityTypeSummary,
  ParseAmbiguityResolutionReport,
} from './parse-ambiguity-resolution.js';

// Profile compatibility migration (R8.9)
export {
  MIGRATION_PATHS,
  COMPATIBILITY_DIMENSIONS,
  simulateMigrationTest,
  runProfileCompatibilityMigrationSuite,
} from './profile-compatibility-migration.js';
export type {
  MigrationPathId,
  CompatibilityDimension,
  MigrationPathProfile,
  CompatibilityDimensionProfile,
  MigrationTestResult,
  MigrationPathSummary,
  ProfileCompatibilityMigrationReport,
} from './profile-compatibility-migration.js';

// Compaction regression runner (R7.11)
export {
  COMPACTION_STRATEGIES,
  COMPACTION_REGRESSION_METRICS,
  simulateCompactionRegression,
  runCompactionRegressionSuite,
} from './compaction-regression-runner.js';
export type {
  CompactionStrategyName,
  CompactionRegressionMetric,
  CompactionStrategyProfile,
  CompactionRegressionMetricProfile,
  CompactionRegressionResult,
  CompactionStrategySummary,
  CompactionRegressionReport,
} from './compaction-regression-runner.js';
