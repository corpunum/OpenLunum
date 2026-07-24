import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeJson } from './io.js';

export type TestLunumV1Language = 'en' | 'el' | 'es' | 'id';
export type TestLunumV1SuiteId = 'parse' | 'retention' | 'mutation' | 'cross-lingual' | 'robustness' | 'reproducibility';
export type TestLunumV1SemanticKind =
  | 'claim'
  | 'conditional_instruction'
  | 'event'
  | 'fact'
  | 'instruction'
  | 'measurement'
  | 'preference'
  | 'project_state'
  | 'query'
  | 'report'
  | 'rule'
  | 'safety_constraint'
  | 'statement'
  | 'test';

export const TESTLUNUMV1_LANGUAGE_INVENTORY = Object.freeze([
  'en',
  'el',
  'es',
  'id'
] satisfies readonly TestLunumV1Language[]);

export const TESTLUNUMV1_MODEL_SLOTS = Object.freeze([
  'model-a',
  'model-b'
] as const);

export const TESTLUNUMV1_REPEAT_LABELS = Object.freeze([
  'official',
  'repeat-1',
  'repeat-2'
] as const);

export const TESTLUNUMV1_SEMANTIC_KIND_INVENTORY = Object.freeze([
  'claim',
  'conditional_instruction',
  'event',
  'fact',
  'instruction',
  'measurement',
  'preference',
  'project_state',
  'query',
  'report',
  'rule',
  'safety_constraint',
  'statement',
  'test'
] satisfies readonly TestLunumV1SemanticKind[]);

export interface TestLunumV1CallBudget {
  itemCount: number;
  languageCount: number;
  modelSlotCount: number;
  repeatLabelCount: number;
  stageCount: number;
  total: number;
}

export interface TestLunumV1SuiteManifest {
  schema: 'openlunum-testlunumv1-suite-manifest/0.1';
  id: TestLunumV1SuiteId;
  orderedItemIds: readonly string[];
  semanticKinds: readonly TestLunumV1SemanticKind[];
  languages: readonly TestLunumV1Language[];
  modelSlots: readonly string[];
  repeatLabels: readonly string[];
  stageCount: number;
  callBudget: TestLunumV1CallBudget;
}

export interface TestLunumV1SyntheticUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
}

export interface TestLunumV1SyntheticRawRecord {
  runId: string;
  protocolVersion: string;
  evaluatedSha: string;
  evidenceSha: string;
  assignmentId: string;
  piWorkerId: string;
  piWorkerModel: string;
  suite: TestLunumV1SuiteId;
  itemId: string;
  semanticKind: TestLunumV1SemanticKind;
  sourceLanguage: TestLunumV1Language;
  targetLanguage: TestLunumV1Language;
  targetModelProfileId: string;
  targetModelProfileSha256: string;
  datasetPath: string;
  datasetSha256: string;
  attempt: number;
  plannedRepeat: string;
  repeatLabel: string;
  modelSlot: string;
  systemPromptSha256: string;
  userPrompt: string;
  rawOutput: string;
  extractedPayload: Record<string, unknown> | null;
  parsedSem: Record<string, unknown> | null;
  goldSem: Record<string, unknown> | null;
  status: 'passed' | 'failed' | 'error';
  exact: boolean;
  nearSemanticOnly: boolean;
  nearSemanticScore: number | null;
  featurePrecision: number | null;
  featureRecall: number | null;
  featureF1: number | null;
  predicateMatch: number | null;
  roleMatch: number | null;
  literalPreservation: number | null;
  clauseCountDelta: number | null;
  missingFeatures: string[];
  extraFeatures: string[];
  latencyMs: number;
  timeToFirstTokenMs: number | null;
  usage: TestLunumV1SyntheticUsage | null;
  compaction: {
    sourceTokens: number | null;
    semTokens: number | null;
    semanticCompactionPct: number | null;
  } | null;
  finishReason: string | null;
  errorClass: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string;
  mutationFamily?: string | null;
  languagePair?: string | null;
}

export interface TestLunumV1BundleInput {
  runId: string;
  protocolVersion: string;
  evaluatedSha: string;
  evidenceSha: string;
  assignmentId: string;
  datasetPath: string;
  datasetSha256: string;
  promptSchemaSha256: string;
  repositoryStateSha256: string;
  outputRoot: string;
  piWorkerId: string;
  piWorkerModel: string;
  piWorkerSessionId: string;
  targetModelProfiles: readonly { id: string; sha256: string }[];
  suiteManifests: readonly TestLunumV1SuiteManifest[];
  rawRecords: readonly TestLunumV1SyntheticRawRecord[];
  generatedAt: string;
}

export interface TestLunumV1BundleSummary {
  runId: string;
  assignmentId: string;
  protocolVersion: string;
  evaluatedSha: string;
  evidenceSha: string;
  datasetSha256: string;
  promptSchemaSha256: string;
  repositoryStateSha256: string;
  totalRecords: number;
  passedRecords: number;
  failedRecords: number;
  errorRecords: number;
  exactRecords: number;
  nearSemanticOnlyRecords: number;
  bySuite: Record<string, { total: number; passed: number; failed: number; error: number }>;
  byLanguage: Record<TestLunumV1Language, { total: number; passed: number; failed: number; error: number }>;
  bySemanticKind: Record<string, { total: number; passed: number; failed: number; error: number }>;
  byModelSlot: Record<string, { total: number; passed: number; failed: number; error: number }>;
  byWorker: Record<string, { total: number; passed: number; failed: number; error: number }>;
  byMutationFamily: Record<string, { total: number; passed: number; failed: number; error: number }>;
  errorClasses: Record<string, number>;
  latency: {
    count: number;
    minMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    meanMs: number;
  };
  totalCallBudget: number;
  generatedAt: string;
}

export interface TestLunumV1BundleResult {
  outputDirectory: string;
  summary: TestLunumV1BundleSummary;
  semanticKindInventory: Record<TestLunumV1SemanticKind, number>;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }
  return value;
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertNonEmptyTrimmedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertUniqueStrings(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = assertNonEmptyTrimmedString(value, `${label} entry`);
    if (seen.has(normalized)) {
      throw new Error(`${label} contains duplicate entries: ${normalized}`);
    }
    seen.add(normalized);
  }
  if (values.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return values;
}

function countByKey(records: readonly TestLunumV1SyntheticRawRecord[], key: (record: TestLunumV1SyntheticRawRecord) => string): Record<string, { total: number; passed: number; failed: number; error: number }> {
  const counts: Record<string, { total: number; passed: number; failed: number; error: number }> = {};
  for (const record of records) {
    const group = key(record);
    const entry = counts[group] ?? { total: 0, passed: 0, failed: 0, error: 0 };
    entry.total += 1;
    entry[record.status] += 1;
    counts[group] = entry;
  }
  return counts;
}

function countByLanguage(records: readonly TestLunumV1SyntheticRawRecord[]): Record<TestLunumV1Language, { total: number; passed: number; failed: number; error: number }> {
  const counts: Record<TestLunumV1Language, { total: number; passed: number; failed: number; error: number }> = {
    en: { total: 0, passed: 0, failed: 0, error: 0 },
    el: { total: 0, passed: 0, failed: 0, error: 0 },
    es: { total: 0, passed: 0, failed: 0, error: 0 },
    id: { total: 0, passed: 0, failed: 0, error: 0 }
  };
  for (const record of records) {
    const entry = counts[record.sourceLanguage];
    entry.total += 1;
    entry[record.status] += 1;
  }
  return counts;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function summarizeLatencies(values: number[]): TestLunumV1BundleSummary['latency'] {
  if (values.length === 0) {
    return { count: 0, minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.50),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: total / sorted.length
  };
}

function validateSemanticKindInventory(inventory: readonly TestLunumV1SemanticKind[]): readonly TestLunumV1SemanticKind[] {
  assertUniqueStrings(inventory, 'semantic kind inventory');
  for (const kind of inventory) {
    if (!TESTLUNUMV1_SEMANTIC_KIND_INVENTORY.includes(kind)) {
      throw new Error(`Unknown semantic kind in inventory: ${kind}`);
    }
  }
  return inventory;
}

export function createTestLunumV1SuiteManifest(input: {
  id: TestLunumV1SuiteId;
  orderedItemIds: readonly string[];
  semanticKinds: readonly TestLunumV1SemanticKind[];
  languages: readonly TestLunumV1Language[];
  modelSlots: readonly string[];
  repeatLabels: readonly string[];
  stageCount: number;
}): TestLunumV1SuiteManifest {
  const orderedItemIds = assertUniqueStrings(input.orderedItemIds, `${input.id} itemIds`);
  const semanticKinds = validateSemanticKindInventory(input.semanticKinds);
  const languages = assertUniqueStrings(input.languages, `${input.id} languages`) as readonly TestLunumV1Language[];
  const modelSlots = assertUniqueStrings(input.modelSlots, `${input.id} modelSlots`);
  const repeatLabels = assertUniqueStrings(input.repeatLabels, `${input.id} repeatLabels`);
  const stageCount = assertPositiveInteger(input.stageCount, `${input.id} stageCount`);
  const callBudget: TestLunumV1CallBudget = {
    itemCount: orderedItemIds.length,
    languageCount: languages.length,
    modelSlotCount: modelSlots.length,
    repeatLabelCount: repeatLabels.length,
    stageCount,
    total: orderedItemIds.length * modelSlots.length * repeatLabels.length * stageCount
  };

  return deepFreeze({
    schema: 'openlunum-testlunumv1-suite-manifest/0.1' as const,
    id: input.id,
    orderedItemIds,
    semanticKinds,
    languages,
    modelSlots,
    repeatLabels,
    stageCount,
    callBudget
  });
}

export const TESTLUNUMV1_SUITE_MANIFESTS = deepFreeze([
  createTestLunumV1SuiteManifest({
    id: 'parse',
    orderedItemIds: ['parse-en-preference', 'parse-el-preference', 'parse-es-preference', 'parse-id-preference'],
    semanticKinds: ['preference'],
    languages: TESTLUNUMV1_LANGUAGE_INVENTORY,
    modelSlots: TESTLUNUMV1_MODEL_SLOTS,
    repeatLabels: ['official'],
    stageCount: 1
  }),
  createTestLunumV1SuiteManifest({
    id: 'retention',
    orderedItemIds: ['retention-en-preference', 'retention-el-conditional', 'retention-es-safety', 'retention-id-state'],
    semanticKinds: ['preference', 'conditional_instruction', 'safety_constraint', 'project_state'],
    languages: TESTLUNUMV1_LANGUAGE_INVENTORY,
    modelSlots: TESTLUNUMV1_MODEL_SLOTS,
    repeatLabels: ['official'],
    stageCount: 2
  }),
  createTestLunumV1SuiteManifest({
    id: 'mutation',
    orderedItemIds: [
      'mutation-negation',
      'mutation-modality',
      'mutation-condition',
      'mutation-role-swap',
      'mutation-literal-change',
      'mutation-temporal-change'
    ],
    semanticKinds: ['preference', 'conditional_instruction', 'safety_constraint', 'statement', 'fact', 'event'],
    languages: TESTLUNUMV1_LANGUAGE_INVENTORY,
    modelSlots: TESTLUNUMV1_MODEL_SLOTS,
    repeatLabels: ['official'],
    stageCount: 1
  }),
  createTestLunumV1SuiteManifest({
    id: 'cross-lingual',
    orderedItemIds: ['cross-en-el', 'cross-en-es', 'cross-en-id', 'cross-el-es'],
    semanticKinds: ['statement', 'fact', 'report'],
    languages: TESTLUNUMV1_LANGUAGE_INVENTORY,
    modelSlots: TESTLUNUMV1_MODEL_SLOTS,
    repeatLabels: ['official'],
    stageCount: 1
  }),
  createTestLunumV1SuiteManifest({
    id: 'robustness',
    orderedItemIds: ['robustness-fenced-json', 'robustness-preamble', 'robustness-truncation', 'robustness-http-error'],
    semanticKinds: ['test', 'statement'],
    languages: TESTLUNUMV1_LANGUAGE_INVENTORY,
    modelSlots: TESTLUNUMV1_MODEL_SLOTS,
    repeatLabels: ['official'],
    stageCount: 1
  }),
  createTestLunumV1SuiteManifest({
    id: 'reproducibility',
    orderedItemIds: ['reproducibility-en', 'reproducibility-el', 'reproducibility-es', 'reproducibility-id'],
    semanticKinds: ['preference', 'statement', 'instruction', 'query'],
    languages: TESTLUNUMV1_LANGUAGE_INVENTORY,
    modelSlots: TESTLUNUMV1_MODEL_SLOTS,
    repeatLabels: TESTLUNUMV1_REPEAT_LABELS,
    stageCount: 1
  })
]);

export function validateTestLunumV1SuiteManifest(manifest: TestLunumV1SuiteManifest): TestLunumV1SuiteManifest {
  if (manifest.schema !== 'openlunum-testlunumv1-suite-manifest/0.1') {
    throw new Error('Unsupported testLunumv1 suite manifest schema');
  }
  const validated = createTestLunumV1SuiteManifest({
    id: manifest.id,
    orderedItemIds: manifest.orderedItemIds,
    semanticKinds: manifest.semanticKinds,
    languages: manifest.languages,
    modelSlots: manifest.modelSlots,
    repeatLabels: manifest.repeatLabels,
    stageCount: manifest.stageCount
  });
  if (validated.callBudget.total !== manifest.callBudget.total) {
    throw new Error(`call budget mismatch for ${manifest.id}: ${validated.callBudget.total} !== ${manifest.callBudget.total}`);
  }
  return validated;
}

export function validateTestLunumV1SuiteManifests(manifests: readonly TestLunumV1SuiteManifest[]): readonly TestLunumV1SuiteManifest[] {
  assertUniqueStrings(manifests.map((manifest) => manifest.id), 'suite manifest ids');
  return deepFreeze(manifests.map((manifest) => validateTestLunumV1SuiteManifest(manifest)));
}

export function computeTestLunumV1CallBudget(manifests: readonly TestLunumV1SuiteManifest[]): TestLunumV1CallBudget {
  const validated = validateTestLunumV1SuiteManifests(manifests);
  const total = validated.reduce((sum, manifest) => sum + manifest.callBudget.total, 0);
  const itemCount = validated.reduce((sum, manifest) => sum + manifest.callBudget.itemCount, 0);
  const languageCount = validated.reduce((sum, manifest) => sum + manifest.callBudget.languageCount, 0);
  const modelSlotCount = validated.reduce((sum, manifest) => sum + manifest.callBudget.modelSlotCount, 0);
  const repeatLabelCount = validated.reduce((sum, manifest) => sum + manifest.callBudget.repeatLabelCount, 0);
  const stageCount = validated.reduce((sum, manifest) => sum + manifest.callBudget.stageCount, 0);
  return {
    itemCount,
    languageCount,
    modelSlotCount,
    repeatLabelCount,
    stageCount,
    total
  };
}

export function validateTestLunumV1RawRecords(
  records: readonly TestLunumV1SyntheticRawRecord[],
  manifests: readonly TestLunumV1SuiteManifest[]
): readonly TestLunumV1SyntheticRawRecord[] {
  const validatedManifests = validateTestLunumV1SuiteManifests(manifests);
  const manifestBySuite = new Map(validatedManifests.map((manifest) => [manifest.id, manifest]));
  const seen = new Set<string>();

  for (const record of records) {
    const manifest = manifestBySuite.get(record.suite);
    if (!manifest) {
      throw new Error(`unknown suite in raw record: ${record.suite}`);
    }
    if (!manifest.orderedItemIds.includes(record.itemId)) {
      throw new Error(`raw record item id ${record.itemId} is not declared by suite ${record.suite}`);
    }
    if (!manifest.semanticKinds.includes(record.semanticKind)) {
      throw new Error(`raw record semantic kind ${record.semanticKind} is not declared by suite ${record.suite}`);
    }
    if (!manifest.languages.includes(record.sourceLanguage)) {
      throw new Error(`raw record source language ${record.sourceLanguage} is not declared by suite ${record.suite}`);
    }
    if (!manifest.modelSlots.includes(record.modelSlot)) {
      throw new Error(`raw record model slot ${record.modelSlot} is not declared by suite ${record.suite}`);
    }
    if (!manifest.repeatLabels.includes(record.repeatLabel)) {
      throw new Error(`raw record repeat label ${record.repeatLabel} is not declared by suite ${record.suite}`);
    }
    const key = [
      record.runId,
      record.suite,
      record.itemId,
      record.sourceLanguage,
      record.targetLanguage,
      record.targetModelProfileId,
      record.modelSlot,
      record.repeatLabel,
      record.attempt
    ].join('|');
    if (seen.has(key)) {
      throw new Error(`duplicate raw record: ${key}`);
    }
    seen.add(key);
  }

  return records;
}

export function buildTestLunumV1SemanticKindInventory(
  manifests: readonly TestLunumV1SuiteManifest[],
  records: readonly TestLunumV1SyntheticRawRecord[]
): Record<TestLunumV1SemanticKind, number> {
  validateTestLunumV1SuiteManifests(manifests);
  const counts: Record<TestLunumV1SemanticKind, number> = Object.fromEntries(
    TESTLUNUMV1_SEMANTIC_KIND_INVENTORY.map((kind) => [kind, 0])
  ) as Record<TestLunumV1SemanticKind, number>;
  for (const record of records) {
    counts[record.semanticKind] += 1;
  }
  return counts;
}

function csvRows(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n') + '\n';
}

function markdownList(lines: string[]): string {
  return lines.join('\n') + '\n';
}

function sortRecordKeys<T extends Record<string, unknown>>(value: T): T {
  const sorted = {} as Record<string, unknown>;
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted as T;
}

function deriveSummary(
  input: TestLunumV1BundleInput,
  manifests: readonly TestLunumV1SuiteManifest[],
  records: readonly TestLunumV1SyntheticRawRecord[]
): TestLunumV1BundleSummary {
  const bySuite = countByKey(records, (record) => record.suite);
  const byLanguage = countByLanguage(records);
  const bySemanticKind = countByKey(records, (record) => record.semanticKind);
  const byModelSlot = countByKey(records, (record) => record.modelSlot);
  const byWorker = countByKey(records, (record) => record.piWorkerId);
  const byMutationFamily = countByKey(records, (record) => record.mutationFamily ?? 'none');
  const errorClasses: Record<string, number> = {};
  const latencyValues = records.map((record) => record.latencyMs);

  for (const record of records) {
    if (record.errorClass) {
      errorClasses[record.errorClass] = (errorClasses[record.errorClass] ?? 0) + 1;
    }
  }

  return {
    runId: input.runId,
    assignmentId: input.assignmentId,
    protocolVersion: input.protocolVersion,
    evaluatedSha: input.evaluatedSha,
    evidenceSha: input.evidenceSha,
    datasetSha256: input.datasetSha256,
    promptSchemaSha256: input.promptSchemaSha256,
    repositoryStateSha256: input.repositoryStateSha256,
    totalRecords: records.length,
    passedRecords: records.filter((record) => record.status === 'passed').length,
    failedRecords: records.filter((record) => record.status === 'failed').length,
    errorRecords: records.filter((record) => record.status === 'error').length,
    exactRecords: records.filter((record) => record.exact).length,
    nearSemanticOnlyRecords: records.filter((record) => record.nearSemanticOnly).length,
    bySuite,
    byLanguage,
    bySemanticKind,
    byModelSlot,
    byWorker,
    byMutationFamily,
    errorClasses,
    latency: summarizeLatencies(latencyValues),
    totalCallBudget: computeTestLunumV1CallBudget(manifests).total,
    generatedAt: input.generatedAt
  };
}

function formatRatio(counts: { total: number; passed: number; failed: number; error: number }): string {
  const passRate = counts.total > 0 ? counts.passed / counts.total : 0;
  return `${counts.total} (${counts.passed} passed, ${counts.failed} failed, ${counts.error} error, ${passRate.toFixed(3)} pass)`;
}

function suiteSummaryMarkdown(manifest: TestLunumV1SuiteManifest, counts: { total: number; passed: number; failed: number; error: number }): string {
  return markdownList([
    `# Suite: ${manifest.id}`,
    '',
    `- Items: ${manifest.callBudget.itemCount}`,
    `- Languages: ${manifest.languages.join(', ')}`,
    `- Model slots: ${manifest.modelSlots.join(', ')}`,
    `- Repeat labels: ${manifest.repeatLabels.join(', ')}`,
    `- Stage count: ${manifest.stageCount}`,
    `- Call budget: ${manifest.callBudget.total}`,
    `- Records: ${formatRatio(counts)}`,
    `- Semantic kinds: ${manifest.semanticKinds.join(', ')}`
  ]);
}

function workerSummaryMarkdown(workerId: string, summary: TestLunumV1BundleSummary, input: TestLunumV1BundleInput): string {
  return markdownList([
    `# Worker: ${workerId}`,
    '',
    `- Assignment: ${input.assignmentId}`,
    `- Pi model: ${input.piWorkerModel}`,
    `- Session: ${input.piWorkerSessionId}`,
    `- Run: ${summary.runId}`,
    `- Total records: ${summary.totalRecords}`,
    `- Total call budget: ${summary.totalCallBudget}`
  ]);
}

function buildOverallScorecard(summary: TestLunumV1BundleSummary): string {
  return markdownList([
    '# Overall Scorecard',
    '',
    `- Records: ${summary.totalRecords}`,
    `- Passed: ${summary.passedRecords}`,
    `- Failed: ${summary.failedRecords}`,
    `- Errors: ${summary.errorRecords}`,
    `- Exact: ${summary.exactRecords}`,
    `- Near-only: ${summary.nearSemanticOnlyRecords}`,
    `- Total call budget: ${summary.totalCallBudget}`,
    `- Latency p95 ms: ${summary.latency.p95Ms.toFixed(3)}`
  ]);
}

function buildFocusRecommendations(summary: TestLunumV1BundleSummary): string {
  const topErrors = Object.entries(summary.errorClasses).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const failureSuites = Object.entries(summary.bySuite).sort((a, b) => b[1].failed - a[1].failed).slice(0, 3);
  const firstError = topErrors[0];
  const firstFailureSuite = failureSuites[0];
  const recommendations = [
    firstError
      ? `1. Reduce ${firstError[0]} errors first; they are the highest synthetic failure class.`
      : '1. Keep the synthetic bundle stable and add a live-evidence run next.',
    firstFailureSuite
      ? `2. Inspect ${firstFailureSuite[0]} coverage; it currently has the highest failure count.`
      : '2. Add more suite diversity before changing the scoring contract.',
    summary.nearSemanticOnlyRecords > summary.exactRecords
      ? '3. Tighten canonical exactness; near-semantic-only cases dominate exact matches.'
      : '3. Preserve the current exactness contract and expand the raw inventory first.'
  ];
  return markdownList(['# Focus Recommendations', '', ...recommendations]);
}

function buildIndependentVerdict(summary: TestLunumV1BundleSummary): string {
  return markdownList([
    '# Independent Evaluator Verdict',
    '',
    '- Status: INCOMPLETE',
    '- Reason: synthetic bundle only; no live audit evidence was run.',
    `- Records: ${summary.totalRecords}`,
    `- Call budget: ${summary.totalCallBudget}`
  ]);
}

export async function generateTestLunumV1Bundle(
  input: TestLunumV1BundleInput
): Promise<TestLunumV1BundleResult> {
  const suiteManifests = validateTestLunumV1SuiteManifests(input.suiteManifests);
  const rawRecords = validateTestLunumV1RawRecords(input.rawRecords, suiteManifests);
  const outputDirectory = path.join(input.outputRoot, input.runId);
  const summary = deriveSummary(input, suiteManifests, rawRecords);
  const semanticKindInventory = buildTestLunumV1SemanticKindInventory(suiteManifests, rawRecords);

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(path.join(outputDirectory, 'raw'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'endpoint-probes'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'models'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'workers'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'model-worker-matrix'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'languages'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'suites'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'tables'), { recursive: true });
  await mkdir(path.join(outputDirectory, 'failure-gallery'), { recursive: true });

  const runManifest = {
    schema: 'openlunum-testlunumv1-run/0.1',
    bundleKind: 'synthetic',
    runId: input.runId,
    assignmentId: input.assignmentId,
    protocolVersion: input.protocolVersion,
    evaluatedSha: input.evaluatedSha,
    evidenceSha: input.evidenceSha,
    datasetSha256: input.datasetSha256,
    datasetPath: input.datasetPath,
    promptSchemaSha256: input.promptSchemaSha256,
    repositoryStateSha256: input.repositoryStateSha256,
    targetModelProfiles: input.targetModelProfiles,
    suiteManifests,
    callBudget: summary.totalCallBudget,
    semanticKindInventory,
    generatedAt: input.generatedAt
  };

  await writeJson(path.join(outputDirectory, 'run-manifest.json'), runManifest);
  await writeJson(path.join(outputDirectory, 'summary.json'), summary);
  await writeJson(path.join(outputDirectory, 'dataset-inventory.json'), {
    runId: input.runId,
    assignmentId: input.assignmentId,
    totalRecords: summary.totalRecords,
    byLanguage: summary.byLanguage,
    bySemanticKind: summary.bySemanticKind,
    bySuite: summary.bySuite,
    semanticKindInventory,
    callBudget: summary.totalCallBudget
  });
  await writeJson(path.join(outputDirectory, 'semantic-kind-inventory.json'), {
    runId: input.runId,
    assignmentId: input.assignmentId,
    inventory: TESTLUNUMV1_SEMANTIC_KIND_INVENTORY,
    counts: semanticKindInventory
  });
  await writeFile(path.join(outputDirectory, 'dataset-hashes.txt'), `${input.datasetPath} ${input.datasetSha256}\n`, 'utf8');
  await writeFile(path.join(outputDirectory, 'prompt-schema-hashes.txt'), `prompt-schema ${input.promptSchemaSha256}\n`, 'utf8');
  await writeFile(
    path.join(outputDirectory, 'README.md'),
    markdownList([
      '# testLunumv1 Synthetic Result Bundle',
      '',
      `- Run: ${input.runId}`,
      `- Assignment: ${input.assignmentId}`,
      `- Protocol version: ${input.protocolVersion}`,
      `- Evaluated SHA: ${input.evaluatedSha}`,
      `- Evidence SHA: ${input.evidenceSha}`,
      `- Dataset SHA: ${input.datasetSha256}`,
      `- Prompt schema SHA: ${input.promptSchemaSha256}`,
      `- Repository state SHA: ${input.repositoryStateSha256}`,
      '',
      'This bundle is synthetic and fail-closed. It is suitable for validating bundle generation, inventory coverage, and recomputation only.'
    ]),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'environment.md'),
    markdownList([
      '# Environment',
      '',
      `- Worker: ${input.piWorkerId}`,
      `- Worker model: ${input.piWorkerModel}`,
      `- Worker session: ${input.piWorkerSessionId}`,
      `- Target models: ${input.targetModelProfiles.map((model) => model.id).join(', ')}`,
      `- Generated at: ${input.generatedAt}`
    ]),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'repository-state.md'),
    markdownList([
      '# Repository State',
      '',
      `- Evaluated SHA: ${input.evaluatedSha}`,
      `- Evidence SHA: ${input.evidenceSha}`,
      `- Repository state SHA: ${input.repositoryStateSha256}`,
      `- Dataset SHA: ${input.datasetSha256}`,
      `- Prompt schema SHA: ${input.promptSchemaSha256}`
    ]),
    'utf8'
  );

  const recordsBySuite = new Map<TestLunumV1SuiteId, TestLunumV1SyntheticRawRecord[]>();
  for (const suite of TESTLUNUMV1_SUITE_MANIFESTS) {
    recordsBySuite.set(suite.id, []);
  }
  const recordsByLanguage = new Map<TestLunumV1Language, TestLunumV1SyntheticRawRecord[]>();
  for (const language of TESTLUNUMV1_LANGUAGE_INVENTORY) {
    recordsByLanguage.set(language, []);
  }
  const recordsByModel = new Map<string, TestLunumV1SyntheticRawRecord[]>();
  for (const model of input.targetModelProfiles) {
    recordsByModel.set(model.id, []);
  }
  const recordsByWorker = new Map<string, TestLunumV1SyntheticRawRecord[]>();
  recordsByWorker.set(input.piWorkerId, []);

  for (const record of rawRecords) {
    recordsBySuite.get(record.suite)?.push(record);
    recordsByLanguage.get(record.sourceLanguage)?.push(record);
    recordsByModel.get(record.targetModelProfileId)?.push(record);
    recordsByWorker.get(record.piWorkerId)?.push(record);
  }

  const writeJsonlGroup = async (filePath: string, records: readonly TestLunumV1SyntheticRawRecord[]): Promise<void> => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, records.map((record) => JSON.stringify(record)).join('\n') + (records.length > 0 ? '\n' : ''), 'utf8');
  };

  for (const model of input.targetModelProfiles) {
    const modelRecords = rawRecords.filter((record) => record.targetModelProfileId === model.id);

    const parseSuites: TestLunumV1SuiteId[] = ['parse', 'retention', 'mutation'];
    for (const suiteId of parseSuites) {
      for (const language of TESTLUNUMV1_LANGUAGE_INVENTORY) {
        const languageRecords = modelRecords.filter((record) => record.suite === suiteId && record.sourceLanguage === language);
        await writeJsonlGroup(path.join(outputDirectory, 'raw', suiteId, model.id, `${model.id}__${language}.jsonl`), languageRecords);
      }
    }

    const crossLingualRecords = modelRecords.filter((record) => record.suite === 'cross-lingual');
    const crossLingualPairs = new Map<string, TestLunumV1SyntheticRawRecord[]>();
    for (const record of crossLingualRecords) {
      const pair = record.languagePair ?? `${record.sourceLanguage}-${record.targetLanguage}`;
      const pairRecords = crossLingualPairs.get(pair) ?? [];
      pairRecords.push(record);
      crossLingualPairs.set(pair, pairRecords);
    }
    for (const [pair, pairRecords] of crossLingualPairs) {
      await writeJsonlGroup(path.join(outputDirectory, 'raw', 'cross-lingual', model.id, `${model.id}__${pair}.jsonl`), pairRecords);
    }

    const robustnessRecords = modelRecords.filter((record) => record.suite === 'robustness');
    await writeJsonlGroup(path.join(outputDirectory, 'raw', 'robustness', model.id, `${model.id}.jsonl`), robustnessRecords);

    for (const repeatLabel of TESTLUNUMV1_REPEAT_LABELS) {
      const reproducibilityRecords = modelRecords.filter((record) => record.suite === 'reproducibility' && record.repeatLabel === repeatLabel);
      await writeJsonlGroup(path.join(outputDirectory, 'raw', 'reproducibility', model.id, `${model.id}__${repeatLabel}.jsonl`), reproducibilityRecords);
    }
  }

  for (const model of input.targetModelProfiles) {
    const probePath = path.join(outputDirectory, 'endpoint-probes', `${model.id}.jsonl`);
    const probeRecord = {
      runId: input.runId,
      modelId: model.id,
      profileSha256: model.sha256,
      status: 'synthetic',
      probe: 'not-run',
      detail: 'Synthetic bundle does not perform endpoint probes.'
    };
    await writeFile(probePath, `${JSON.stringify(probeRecord)}\n`, 'utf8');
  }

  for (const model of input.targetModelProfiles) {
    const counts = {
      total: rawRecords.filter((record) => record.targetModelProfileId === model.id).length,
      passed: rawRecords.filter((record) => record.targetModelProfileId === model.id && record.status === 'passed').length,
      failed: rawRecords.filter((record) => record.targetModelProfileId === model.id && record.status === 'failed').length,
      error: rawRecords.filter((record) => record.targetModelProfileId === model.id && record.status === 'error').length
    };
    await writeFile(
      path.join(outputDirectory, 'models', `${model.id}.md`),
      markdownList([
        `# Model: ${model.id}`,
        '',
        `- Profile SHA-256: ${model.sha256}`,
        `- Records: ${formatRatio(counts)}`,
        `- Exact records: ${rawRecords.filter((record) => record.targetModelProfileId === model.id && record.exact).length}`,
        `- Near-only records: ${rawRecords.filter((record) => record.targetModelProfileId === model.id && record.nearSemanticOnly).length}`
      ]),
      'utf8'
    );

    await writeFile(
      path.join(outputDirectory, 'workers', `${input.piWorkerId}.md`),
      workerSummaryMarkdown(input.piWorkerId, summary, input),
      'utf8'
    );

    await writeFile(
      path.join(outputDirectory, 'model-worker-matrix', `${input.piWorkerId}__${model.id}.md`),
      markdownList([
        `# Worker / Model Matrix: ${input.piWorkerId} x ${model.id}`,
        '',
        `- Total records: ${counts.total}`,
        `- Passed: ${counts.passed}`,
        `- Failed: ${counts.failed}`,
        `- Errors: ${counts.error}`,
        `- Exact: ${rawRecords.filter((record) => record.targetModelProfileId === model.id && record.exact).length}`,
        `- Near-only: ${rawRecords.filter((record) => record.targetModelProfileId === model.id && record.nearSemanticOnly).length}`,
        `- Attribution: model=${model.id}, worker=${input.piWorkerId}, dataset=${input.datasetSha256}`
      ]),
      'utf8'
    );
  }

  for (const [language, languageRecords] of recordsByLanguage) {
    const counts = summary.byLanguage[language];
    await writeFile(
      path.join(outputDirectory, 'languages', `${language}.md`),
      markdownList([
        `# Language: ${language}`,
        '',
        `- Records: ${formatRatio(counts)}`,
        `- Semantic kinds: ${Array.from(new Set(languageRecords.map((record) => record.semanticKind))).join(', ') || 'none'}`,
        `- Target models: ${Array.from(new Set(languageRecords.map((record) => record.targetModelProfileId))).join(', ') || 'none'}`
      ]),
      'utf8'
    );
  }

  for (const manifest of suiteManifests) {
    const counts = recordsBySuite.get(manifest.id) ?? [];
    const suiteCounts = {
      total: counts.length,
      passed: counts.filter((record) => record.status === 'passed').length,
      failed: counts.filter((record) => record.status === 'failed').length,
      error: counts.filter((record) => record.status === 'error').length
    };
    await writeFile(
      path.join(outputDirectory, 'suites', `${manifest.id}.md`),
      suiteSummaryMarkdown(manifest, suiteCounts),
      'utf8'
    );
  }

  const byModelRows = input.targetModelProfiles.map((model) => {
    const modelRecords = rawRecords.filter((record) => record.targetModelProfileId === model.id);
    return [model.id, modelRecords.length, modelRecords.filter((record) => record.status === 'passed').length, modelRecords.filter((record) => record.status === 'failed').length, modelRecords.filter((record) => record.status === 'error').length];
  });
  await writeFile(path.join(outputDirectory, 'tables', 'by-model.csv'), csvRows(['model', 'total', 'passed', 'failed', 'error'], byModelRows), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'by-worker.csv'), csvRows(['worker', 'total', 'passed', 'failed', 'error'], [[input.piWorkerId, summary.totalRecords, summary.passedRecords, summary.failedRecords, summary.errorRecords]]), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'by-model-worker.csv'), csvRows(['worker', 'model', 'total', 'passed', 'failed', 'error'], input.targetModelProfiles.map((model) => [input.piWorkerId, model.id, rawRecords.filter((record) => record.targetModelProfileId === model.id).length, rawRecords.filter((record) => record.targetModelProfileId === model.id && record.status === 'passed').length, rawRecords.filter((record) => record.targetModelProfileId === model.id && record.status === 'failed').length, rawRecords.filter((record) => record.targetModelProfileId === model.id && record.status === 'error').length])), 'utf8');
  const languageRows = TESTLUNUMV1_LANGUAGE_INVENTORY.map((language) => {
    const counts = summary.byLanguage[language];
    return [language, counts.total, counts.passed, counts.failed, counts.error];
  });
  await writeFile(path.join(outputDirectory, 'tables', 'by-language.csv'), csvRows(['language', 'total', 'passed', 'failed', 'error'], languageRows), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'by-semantic-kind.csv'), csvRows(['semanticKind', 'total', 'passed', 'failed', 'error'], Object.entries(summary.bySemanticKind).map(([kind, counts]) => [kind, counts.total, counts.passed, counts.failed, counts.error])), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'by-mutation-family.csv'), csvRows(['mutationFamily', 'total', 'passed', 'failed', 'error'], Object.entries(summary.byMutationFamily).map(([family, counts]) => [family, counts.total, counts.passed, counts.failed, counts.error])), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'latency.csv'), csvRows(['metric', 'value'], [['count', summary.latency.count], ['minMs', summary.latency.minMs], ['p50Ms', summary.latency.p50Ms], ['p95Ms', summary.latency.p95Ms], ['maxMs', summary.latency.maxMs], ['meanMs', summary.latency.meanMs]]), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'tokens.csv'), csvRows(['metric', 'value'], [['promptTokens', 0], ['completionTokens', 0], ['totalTokens', 0], ['cachedTokens', 0], ['reasoningTokens', 0]]), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'errors.csv'), csvRows(['errorClass', 'count'], Object.entries(summary.errorClasses).length > 0 ? Object.entries(summary.errorClasses).map(([errorClass, count]) => [errorClass, count]) : [['none', 0]]), 'utf8');
  await writeFile(path.join(outputDirectory, 'tables', 'overall.csv'), csvRows(['runId', 'total', 'passed', 'failed', 'error', 'exact', 'nearOnly', 'callBudget'], [[summary.runId, summary.totalRecords, summary.passedRecords, summary.failedRecords, summary.errorRecords, summary.exactRecords, summary.nearSemanticOnlyRecords, summary.totalCallBudget]]), 'utf8');

  const failureLines = rawRecords
    .filter((record) => record.status !== 'passed')
    .map((record) => `- ${record.suite}/${record.itemId} [${record.sourceLanguage}->${record.targetLanguage}] (${record.status}${record.errorClass ? `, ${record.errorClass}` : ''})`);
  await writeFile(
    path.join(outputDirectory, 'failure-gallery', 'index.md'),
    markdownList(['# Failure Gallery', '', ...(failureLines.length > 0 ? failureLines : ['- None'])]),
    'utf8'
  );

  await writeFile(path.join(outputDirectory, 'overall-scorecard.md'), buildOverallScorecard(summary), 'utf8');
  await writeFile(path.join(outputDirectory, 'focus-recommendations.md'), buildFocusRecommendations(summary), 'utf8');
  await writeFile(path.join(outputDirectory, 'independent-evaluator-verdict.md'), buildIndependentVerdict(summary), 'utf8');

  await writeFile(
    path.join(outputDirectory, 'run-manifest.json'),
    `${JSON.stringify(sortRecordKeys(runManifest as Record<string, unknown>), null, 2)}\n`,
    'utf8'
  );

  return {
    outputDirectory,
    summary,
    semanticKindInventory
  };
}

export function createSyntheticTestLunumV1BundleInput(): TestLunumV1BundleInput {
  const generatedAt = '2026-07-23T00:00:00.000Z';
  const runId = 'synthetic-testlunumv1-run';
  const assignmentId = '2026-07-24-308-audit-suite-manifests-bundle';
  const evaluatedSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const evidenceSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const datasetSha256 = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  const promptSchemaSha256 = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
  const repositoryStateSha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const piWorkerId = 'audit-instrumentation';
  const piWorkerModel = 'openai/gpt-5.4-mini';
  const piWorkerSessionId = 'synthetic-session';
  const targetModelProfiles = [
    { id: 'model-a', sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' },
    { id: 'model-b', sha256: '1111111111111111111111111111111111111111111111111111111111111111' }
  ] as const;

  const rawRecords: TestLunumV1SyntheticRawRecord[] = [];
  const baseSemantics: Record<TestLunumV1SemanticKind, Record<string, unknown>> = {
    claim: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'claim', clauses: [] },
    conditional_instruction: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'conditional_instruction', clauses: [] },
    event: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [] },
    fact: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact', clauses: [] },
    instruction: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'instruction', clauses: [] },
    measurement: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'measurement', clauses: [] },
    preference: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] },
    project_state: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'project_state', clauses: [] },
    query: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'query', clauses: [] },
    report: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'report', clauses: [] },
    rule: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'rule', clauses: [] },
    safety_constraint: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'safety_constraint', clauses: [] },
    statement: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [] },
    test: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'test', clauses: [] }
  };

  const suiteToItems: Record<TestLunumV1SuiteId, Array<{ itemId: string; semanticKind: TestLunumV1SemanticKind; sourceLanguage: TestLunumV1Language; targetLanguage: TestLunumV1Language; mutationFamily?: string; languagePair?: string; }>> = {
    parse: [
      { itemId: 'parse-en-preference', semanticKind: 'preference', sourceLanguage: 'en', targetLanguage: 'en' },
      { itemId: 'parse-el-preference', semanticKind: 'preference', sourceLanguage: 'el', targetLanguage: 'el' },
      { itemId: 'parse-es-preference', semanticKind: 'preference', sourceLanguage: 'es', targetLanguage: 'es' },
      { itemId: 'parse-id-preference', semanticKind: 'preference', sourceLanguage: 'id', targetLanguage: 'id' }
    ],
    retention: [
      { itemId: 'retention-en-preference', semanticKind: 'preference', sourceLanguage: 'en', targetLanguage: 'en' },
      { itemId: 'retention-el-conditional', semanticKind: 'conditional_instruction', sourceLanguage: 'el', targetLanguage: 'el' },
      { itemId: 'retention-es-safety', semanticKind: 'safety_constraint', sourceLanguage: 'es', targetLanguage: 'es' },
      { itemId: 'retention-id-state', semanticKind: 'project_state', sourceLanguage: 'id', targetLanguage: 'id' }
    ],
    mutation: [
      { itemId: 'mutation-negation', semanticKind: 'preference', sourceLanguage: 'en', targetLanguage: 'en', mutationFamily: 'negation' },
      { itemId: 'mutation-modality', semanticKind: 'conditional_instruction', sourceLanguage: 'el', targetLanguage: 'el', mutationFamily: 'modality' },
      { itemId: 'mutation-condition', semanticKind: 'safety_constraint', sourceLanguage: 'es', targetLanguage: 'es', mutationFamily: 'condition' },
      { itemId: 'mutation-role-swap', semanticKind: 'statement', sourceLanguage: 'id', targetLanguage: 'id', mutationFamily: 'role-swap' },
      { itemId: 'mutation-literal-change', semanticKind: 'fact', sourceLanguage: 'en', targetLanguage: 'en', mutationFamily: 'literal-change' },
      { itemId: 'mutation-temporal-change', semanticKind: 'event', sourceLanguage: 'el', targetLanguage: 'el', mutationFamily: 'temporal-change' }
    ],
    'cross-lingual': [
      { itemId: 'cross-en-el', semanticKind: 'statement', sourceLanguage: 'en', targetLanguage: 'el', languagePair: 'en-el' },
      { itemId: 'cross-en-es', semanticKind: 'fact', sourceLanguage: 'en', targetLanguage: 'es', languagePair: 'en-es' },
      { itemId: 'cross-en-id', semanticKind: 'report', sourceLanguage: 'en', targetLanguage: 'id', languagePair: 'en-id' },
      { itemId: 'cross-el-es', semanticKind: 'statement', sourceLanguage: 'el', targetLanguage: 'es', languagePair: 'el-es' }
    ],
    robustness: [
      { itemId: 'robustness-fenced-json', semanticKind: 'test', sourceLanguage: 'en', targetLanguage: 'en' },
      { itemId: 'robustness-preamble', semanticKind: 'test', sourceLanguage: 'el', targetLanguage: 'el' },
      { itemId: 'robustness-truncation', semanticKind: 'test', sourceLanguage: 'es', targetLanguage: 'es' },
      { itemId: 'robustness-http-error', semanticKind: 'test', sourceLanguage: 'id', targetLanguage: 'id' }
    ],
    reproducibility: [
      { itemId: 'reproducibility-en', semanticKind: 'preference', sourceLanguage: 'en', targetLanguage: 'en' },
      { itemId: 'reproducibility-el', semanticKind: 'statement', sourceLanguage: 'el', targetLanguage: 'el' },
      { itemId: 'reproducibility-es', semanticKind: 'instruction', sourceLanguage: 'es', targetLanguage: 'es' },
      { itemId: 'reproducibility-id', semanticKind: 'query', sourceLanguage: 'id', targetLanguage: 'id' }
    ]
  };

  const stageBySuite: Record<TestLunumV1SuiteId, number> = {
    parse: 1,
    retention: 2,
    mutation: 1,
    'cross-lingual': 1,
    robustness: 1,
    reproducibility: 1
  };

  for (const [suite, items] of Object.entries(suiteToItems) as Array<[TestLunumV1SuiteId, typeof suiteToItems.parse]>) {
    for (const item of items) {
      for (const model of targetModelProfiles) {
        const repeatLabels = suite === 'reproducibility' ? TESTLUNUMV1_REPEAT_LABELS : ['official'];
        for (const repeatLabel of repeatLabels) {
          const attempts = stageBySuite[suite];
          for (let attempt = 1; attempt <= attempts; attempt += 1) {
            const status = suite === 'robustness' && attempt === 1 && model.id === 'model-b' ? 'error' : attempt === attempts ? 'passed' : 'failed';
            rawRecords.push({
              runId,
              protocolVersion: '1.0.0',
              evaluatedSha,
              evidenceSha,
              assignmentId,
              piWorkerId,
              piWorkerModel,
              suite,
              itemId: item.itemId,
              semanticKind: item.semanticKind,
              sourceLanguage: item.sourceLanguage,
              targetLanguage: item.targetLanguage,
              targetModelProfileId: model.id,
              targetModelProfileSha256: model.sha256,
              datasetPath: 'datasets/testlunumv1/synthetic.jsonl',
              datasetSha256,
              attempt,
              plannedRepeat: repeatLabel,
              repeatLabel,
              modelSlot: model.id,
              systemPromptSha256: '2222222222222222222222222222222222222222222222222222222222222222',
              userPrompt: JSON.stringify({ itemId: item.itemId, suite, language: item.sourceLanguage }),
              rawOutput: JSON.stringify({ suite, itemId: item.itemId, model: model.id, repeatLabel }),
              extractedPayload: { suite, itemId: item.itemId, model: model.id, repeatLabel },
              parsedSem: suite === 'parse' ? baseSemantics.preference : baseSemantics[item.semanticKind],
              goldSem: baseSemantics[item.semanticKind],
              status,
              exact: status === 'passed' && suite !== 'mutation',
              nearSemanticOnly: suite === 'mutation' && status === 'passed',
              nearSemanticScore: status === 'passed' ? (suite === 'mutation' ? 0.86 : 1) : null,
              featurePrecision: status === 'passed' ? 1 : 0,
              featureRecall: status === 'passed' ? 1 : 0,
              featureF1: status === 'passed' ? 1 : 0,
              predicateMatch: status === 'passed' ? 1 : 0,
              roleMatch: status === 'passed' ? 1 : 0,
              literalPreservation: status === 'passed' ? 1 : 0,
              clauseCountDelta: 0,
              missingFeatures: status === 'passed' ? [] : ['mock-missing-feature'],
              extraFeatures: status === 'passed' ? [] : ['mock-extra-feature'],
              latencyMs: attempt * 5 + (suite === 'robustness' ? 15 : 0),
              timeToFirstTokenMs: null,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                cachedTokens: 0,
                reasoningTokens: 0
              },
              compaction: {
                sourceTokens: 0,
                semTokens: 0,
                semanticCompactionPct: 0
              },
              finishReason: status === 'error' ? null : 'stop',
              errorClass: status === 'error' ? 'synthetic_error' : null,
              errorMessage: status === 'error' ? 'Synthetic failure for bundle validation' : null,
              startedAt: generatedAt,
              completedAt: generatedAt,
              mutationFamily: item.mutationFamily ?? null,
              languagePair: item.languagePair ?? null
            });
          }
        }
      }
    }
  }

  return {
    runId,
    protocolVersion: '1.0.0',
    evaluatedSha,
    evidenceSha,
    assignmentId,
    datasetPath: 'datasets/testlunumv1/synthetic.jsonl',
    datasetSha256,
    promptSchemaSha256,
    repositoryStateSha256,
    outputRoot: 'reports/evaluations/testLunumv1',
    piWorkerId,
    piWorkerModel,
    piWorkerSessionId,
    targetModelProfiles,
    suiteManifests: TESTLUNUMV1_SUITE_MANIFESTS,
    rawRecords,
    generatedAt
  };
}
