/**
 * testLunumv1 real evidence bundle generator (#315).
 *
 * Generates the complete testLunumv1 protocol directory layout under
 * `reports/evaluations/testLunumv1/<RUN_ID>/` purely by recomputing every
 * aggregate from an array of `TestLunumV1AuditRecord` (the raw JSONL record
 * contract produced by the #314 adapter, `./testlunumv1-audit-records.js`).
 *
 * This module deliberately reuses the low-level, pure rendering helpers the
 * #309 synthetic bundle module (`./testlunumv1-bundle.js`) already exports
 * (`csvRows`, `markdownList`, `formatRatio`, `percentile`, `sortRecordKeys`)
 * instead of re-implementing CSV escaping, markdown rendering, ratio
 * formatting, percentile math, or deterministic JSON key sorting a second
 * time. It does NOT reuse `generateTestLunumV1Bundle` itself, because that
 * function's directory/report/CSV structure is keyed to
 * `TestLunumV1SyntheticRawRecord` fields that simply do not exist on
 * `TestLunumV1AuditRecord` (no `semanticKind`, no `targetLanguage`, no
 * `mutationFamily`, a different suite-id vocabulary, a `modelSlotId` /
 * `targetModelProfileId` split instead of a single `modelSlot`, etc.) --
 * threading real records through that function would require fabricating
 * values for fields the real pipeline never captures, which the #314 adapter
 * explicitly refuses to do (see its module doc comment). Every grouping and
 * aggregate below is instead recomputed directly from the fields that
 * `TestLunumV1AuditRecord` actually carries.
 *
 * ## Unavailable instrumentation
 *
 * Per #314, `usage`, `finishReason`, `systemPromptSha256`, and
 * `userPromptSha256` are always `null` on every real record today (the #313
 * executor's transport contract never captures them). Rather than hardcode
 * that fact, this module recomputes availability from the records it is
 * given: if every record's value for one of these fields is `null`, the
 * corresponding report/CSV cell renders the literal string `"N/A"`; if a
 * future executor revision starts threading real values through, this module
 * picks them up automatically. `N/A` is never rendered as `0`, an empty
 * string, or an omitted cell/row.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeJson } from './io.js';
import { csvRows, formatRatio, markdownList, percentile, sortRecordKeys } from './testlunumv1-bundle.js';
import type { TestLunumV1AuditRecord } from './testlunumv1-audit-records.js';
import { TESTLUNUMV1_AUDIT_RECORD_SCHEMA } from './testlunumv1-audit-records.js';

export const TESTLUNUMV1_REAL_RUN_MANIFEST_SCHEMA = 'openlunum-testlunumv1-run/0.1' as const;

/** The literal string every report/CSV renders in place of an unavailable instrumentation value. Never `0`, `''`, or an omitted cell. */
export const NOT_AVAILABLE = 'N/A' as const;

type StatusCounts = { total: number; passed: number; failed: number; error: number };

function emptyCounts(): StatusCounts {
  return { total: 0, passed: 0, failed: 0, error: 0 };
}

export interface TestLunumV1RealBundleInput {
  /** The run identifier; every record's `runId` must equal this exactly. */
  runId: string;
  protocolVersion: string;
  evaluatedSha: string;
  repositoryStateSha256: string;
  outputRoot: string;
  generatedAt: string;
  records: readonly TestLunumV1AuditRecord[];
}

export interface TestLunumV1RealLatencyStats {
  count: number;
  minMs: number | typeof NOT_AVAILABLE;
  p50Ms: number | typeof NOT_AVAILABLE;
  p90Ms: number | typeof NOT_AVAILABLE;
  p95Ms: number | typeof NOT_AVAILABLE;
  p99Ms: number | typeof NOT_AVAILABLE;
  maxMs: number | typeof NOT_AVAILABLE;
  meanMs: number | typeof NOT_AVAILABLE;
  stddevMs: number | typeof NOT_AVAILABLE;
}

export interface TestLunumV1RealBundleSummary {
  runId: string;
  protocolVersion: string;
  evaluatedSha: string;
  datasetPath: string;
  datasetSha256: string;
  repositoryStateSha256: string;
  totalRecords: number;
  passedRecords: number;
  failedRecords: number;
  errorRecords: number;
  exactRecords: number;
  nearSemanticOnlyRecords: number;
  bySuite: Record<string, StatusCounts>;
  byLanguage: Record<string, StatusCounts>;
  byModel: Record<string, StatusCounts>;
  byWorker: Record<string, StatusCounts>;
  byModelWorker: Record<string, StatusCounts>;
  byModelSlot: Record<string, StatusCounts>;
  errorClasses: Record<string, number>;
  instrumentation: {
    usageAvailable: boolean;
    finishReasonAvailable: boolean;
    systemPromptHashAvailable: boolean;
    userPromptHashAvailable: boolean;
  };
  latency: TestLunumV1RealLatencyStats;
  generatedAt: string;
}

export interface TestLunumV1RealBundleResult {
  outputDirectory: string;
  summary: TestLunumV1RealBundleSummary;
}

function assertNonEmptyTrimmedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function computeLatencyStats(values: readonly number[]): TestLunumV1RealLatencyStats {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: NOT_AVAILABLE,
      p50Ms: NOT_AVAILABLE,
      p90Ms: NOT_AVAILABLE,
      p95Ms: NOT_AVAILABLE,
      p99Ms: NOT_AVAILABLE,
      maxMs: NOT_AVAILABLE,
      meanMs: NOT_AVAILABLE,
      stddevMs: NOT_AVAILABLE
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    minMs: sorted[0]!,
    p50Ms: percentile(sorted, 0.5),
    p90Ms: percentile(sorted, 0.9),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1]!,
    meanMs: mean,
    stddevMs: Math.sqrt(variance)
  };
}

function countByKey(records: readonly TestLunumV1AuditRecord[], key: (record: TestLunumV1AuditRecord) => string): Record<string, StatusCounts> {
  const counts: Record<string, StatusCounts> = {};
  for (const record of records) {
    const group = key(record);
    const entry = counts[group] ?? emptyCounts();
    entry.total += 1;
    entry[record.status] += 1;
    counts[group] = entry;
  }
  return counts;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Recomputes whether *any* record in the run carries a non-null value for `field` -- never hardcoded, so a future adapter revision that starts threading real values through is picked up automatically. */
function anyNonNull<K extends keyof TestLunumV1AuditRecord>(records: readonly TestLunumV1AuditRecord[], field: K): boolean {
  return records.some((record) => record[field] !== null && record[field] !== undefined);
}

function renderCell(value: string | number | null): string | number {
  return value === null ? NOT_AVAILABLE : value;
}

function deriveSummary(input: TestLunumV1RealBundleInput, records: readonly TestLunumV1AuditRecord[], datasetPath: string, datasetSha256: string): TestLunumV1RealBundleSummary {
  const bySuite = countByKey(records, (record) => record.suiteId);
  const byLanguage = countByKey(records, (record) => record.sourceLanguage);
  const byModel = countByKey(records, (record) => record.targetModelProfileId);
  const byWorker = countByKey(records, (record) => record.piWorkerId);
  const byModelSlot = countByKey(records, (record) => record.modelSlotId);
  const byModelWorker = countByKey(records, (record) => `${record.piWorkerId}__${record.targetModelProfileId}`);

  const errorClasses: Record<string, number> = {};
  for (const record of records) {
    if (record.errorClass !== 'none') {
      errorClasses[record.errorClass] = (errorClasses[record.errorClass] ?? 0) + 1;
    }
  }

  return {
    runId: input.runId,
    protocolVersion: input.protocolVersion,
    evaluatedSha: input.evaluatedSha,
    datasetPath,
    datasetSha256,
    repositoryStateSha256: input.repositoryStateSha256,
    totalRecords: records.length,
    passedRecords: records.filter((record) => record.status === 'passed').length,
    failedRecords: records.filter((record) => record.status === 'failed').length,
    errorRecords: records.filter((record) => record.status === 'error').length,
    exactRecords: records.filter((record) => record.exact).length,
    nearSemanticOnlyRecords: records.filter((record) => record.nearSemanticOnly).length,
    bySuite,
    byLanguage,
    byModel,
    byWorker,
    byModelWorker,
    byModelSlot,
    errorClasses,
    instrumentation: {
      usageAvailable: anyNonNull(records, 'usage'),
      finishReasonAvailable: anyNonNull(records, 'finishReason'),
      systemPromptHashAvailable: anyNonNull(records, 'systemPromptSha256'),
      userPromptHashAvailable: anyNonNull(records, 'userPromptSha256')
    },
    latency: computeLatencyStats(records.map((record) => record.latencyMs)),
    generatedAt: input.generatedAt
  };
}

interface FocusCandidate {
  label: string;
  /** Lower is worse, on the same `[0, 1]` scale as a pass rate. */
  score: number;
  count: number;
}

/**
 * Builds the pool of candidate focus areas: one per suite, one per language
 * (both scored as `passed / total`, so a low score means a low pass rate),
 * and one per non-`'none'` error class (scored as `1 - (count / totalRecords)`,
 * projecting "how much of the run this error class consumed" onto the same
 * worse-is-lower `[0, 1]` scale as a pass rate, so all three candidate kinds
 * are directly comparable).
 */
function buildFocusCandidates(summary: TestLunumV1RealBundleSummary): FocusCandidate[] {
  const candidates: FocusCandidate[] = [];
  for (const [suiteId, counts] of Object.entries(summary.bySuite)) {
    candidates.push({ label: `suite:${suiteId}`, score: counts.total > 0 ? counts.passed / counts.total : 1, count: counts.total });
  }
  for (const [language, counts] of Object.entries(summary.byLanguage)) {
    candidates.push({ label: `language:${language}`, score: counts.total > 0 ? counts.passed / counts.total : 1, count: counts.total });
  }
  for (const [errorClass, count] of Object.entries(summary.errorClasses)) {
    candidates.push({ label: `error-class:${errorClass}`, score: summary.totalRecords > 0 ? 1 - count / summary.totalRecords : 1, count });
  }
  return candidates;
}

/**
 * Selects exactly three focus recommendations, deterministically: the three
 * candidates with the lowest score (worst pass rate / highest error-class
 * share) win; ties are broken by higher record count first (more evidence
 * wins), then by ascending alphabetical label. If fewer than three distinct
 * candidates exist, deterministic filler recommendations pad the list out to
 * exactly three so the scorecard always carries three lines.
 */
function selectFocusRecommendations(summary: TestLunumV1RealBundleSummary): string[] {
  const candidates = buildFocusCandidates(summary);
  const ranked = [...candidates].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.count !== b.count) return b.count - a.count;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  const lines: string[] = ranked.slice(0, 3).map((candidate, index) => {
    const passRatePct = (candidate.score * 100).toFixed(1);
    return `${index + 1}. Investigate ${candidate.label} first -- worst-ranked focus area (score ${passRatePct}%, ${candidate.count} record${candidate.count === 1 ? '' : 's'}).`;
  });

  let filler = 1;
  while (lines.length < 3) {
    lines.push(`${lines.length + 1}. No further distinct suite/language/error-class candidates were available (filler recommendation ${filler}); expand raw record diversity before drawing further conclusions.`);
    filler += 1;
  }

  return lines;
}

function buildOverallScorecard(summary: TestLunumV1RealBundleSummary): string {
  const latencyLine = (label: string, value: number | typeof NOT_AVAILABLE): string =>
    `- ${label}: ${value === NOT_AVAILABLE ? NOT_AVAILABLE : value.toFixed(3)}`;
  return markdownList([
    '# Overall Scorecard',
    '',
    `- Run: ${summary.runId}`,
    `- Records: ${summary.totalRecords}`,
    `- Passed: ${summary.passedRecords}`,
    `- Failed: ${summary.failedRecords}`,
    `- Errors: ${summary.errorRecords}`,
    `- Exact: ${summary.exactRecords}`,
    `- Near-only: ${summary.nearSemanticOnlyRecords}`,
    '',
    '## Latency (ms)',
    '',
    latencyLine('count', summary.latency.count),
    latencyLine('min', summary.latency.minMs),
    latencyLine('p50', summary.latency.p50Ms),
    latencyLine('p90', summary.latency.p90Ms),
    latencyLine('p95', summary.latency.p95Ms),
    latencyLine('p99', summary.latency.p99Ms),
    latencyLine('max', summary.latency.maxMs),
    latencyLine('mean', summary.latency.meanMs),
    latencyLine('stddev', summary.latency.stddevMs),
    '',
    '## Instrumentation availability',
    '',
    `- usage: ${summary.instrumentation.usageAvailable ? 'available' : NOT_AVAILABLE}`,
    `- finishReason: ${summary.instrumentation.finishReasonAvailable ? 'available' : NOT_AVAILABLE}`,
    `- systemPromptSha256: ${summary.instrumentation.systemPromptHashAvailable ? 'available' : NOT_AVAILABLE}`,
    `- userPromptSha256: ${summary.instrumentation.userPromptHashAvailable ? 'available' : NOT_AVAILABLE}`
  ]);
}

function buildFocusRecommendationsMarkdown(summary: TestLunumV1RealBundleSummary): string {
  return markdownList([
    '# Focus Recommendations',
    '',
    'Selection rule: the three suite/language/error-class combinations with the',
    'worst pass rate win (error classes are scored as `1 - (occurrence count /',
    'total records)`, projecting them onto the same worse-is-lower `[0, 1]`',
    'scale as a pass rate). Ties are broken by record count (higher wins --',
    'more evidence), then alphabetically by label ascending. Exactly three',
    'recommendations are always produced; deterministic filler text pads out',
    'runs with fewer than three distinct candidates.',
    '',
    ...selectFocusRecommendations(summary)
  ]);
}

function groupSummaryMarkdown(title: string, counts: StatusCounts, extraLines: string[] = []): string {
  return markdownList([`# ${title}`, '', `- Records: ${formatRatio(counts)}`, ...extraLines]);
}

export async function generateTestLunumV1RealBundle(input: TestLunumV1RealBundleInput): Promise<TestLunumV1RealBundleResult> {
  const runId = assertNonEmptyTrimmedString(input.runId, 'runId');
  if (input.records.length === 0) {
    throw new Error('testLunumv1 real bundle generator: records must not be empty');
  }

  for (const record of input.records) {
    if (record.schema !== TESTLUNUMV1_AUDIT_RECORD_SCHEMA) {
      throw new Error(`testLunumv1 real bundle generator: unsupported record schema ${record.schema}`);
    }
    if (record.runId !== runId) {
      throw new Error(`testLunumv1 real bundle generator: record runId ${record.runId} does not match input runId ${runId}`);
    }
  }

  const datasetPaths = uniqueSorted(input.records.map((record) => record.datasetPath));
  const datasetShas = uniqueSorted(input.records.map((record) => record.datasetSha256));
  if (datasetPaths.length !== 1) {
    throw new Error(`testLunumv1 real bundle generator: records disagree on datasetPath: ${datasetPaths.join(', ')}`);
  }
  if (datasetShas.length !== 1) {
    throw new Error(`testLunumv1 real bundle generator: records disagree on datasetSha256: ${datasetShas.join(', ')}`);
  }
  const datasetPath = datasetPaths[0]!;
  const datasetSha256 = datasetShas[0]!;

  const records = [...input.records].sort((a, b) => {
    const keyA = [a.suiteId, a.itemId, a.modelSlotId, String(a.stage).padStart(8, '0'), a.repeatLabel, a.stageName, a.executionId].join(' ');
    const keyB = [b.suiteId, b.itemId, b.modelSlotId, String(b.stage).padStart(8, '0'), b.repeatLabel, b.stageName, b.executionId].join(' ');
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  const outputDirectory = path.join(input.outputRoot, runId);
  const summary = deriveSummary(input, records, datasetPath, datasetSha256);

  for (const dir of ['raw', 'endpoint-probes', 'models', 'workers', 'model-worker-matrix', 'languages', 'suites', 'tables', 'failure-gallery']) {
    await mkdir(path.join(outputDirectory, dir), { recursive: true });
  }

  const suiteIds = uniqueSorted(records.map((record) => record.suiteId));
  const languages = uniqueSorted(records.map((record) => record.sourceLanguage));
  const workerIds = uniqueSorted(records.map((record) => record.piWorkerId));
  const modelSlotIds = uniqueSorted(records.map((record) => record.modelSlotId));
  const targetModelProfiles = uniqueSorted(records.map((record) => record.targetModelProfileId)).map((profileId) => {
    const example = records.find((record) => record.targetModelProfileId === profileId)!;
    return { id: profileId, sha256: example.targetModelProfileSha256 };
  });

  const runManifest = {
    schema: TESTLUNUMV1_REAL_RUN_MANIFEST_SCHEMA,
    bundleKind: 'real',
    runId,
    protocolVersion: input.protocolVersion,
    evaluatedSha: input.evaluatedSha,
    datasetSha256,
    datasetPath,
    promptSchemaSha256: NOT_AVAILABLE,
    repositoryStateSha256: input.repositoryStateSha256,
    targetModelProfiles,
    modelSlotIds,
    suiteIds,
    languages,
    workerIds,
    recordCount: summary.totalRecords,
    generatedAt: input.generatedAt
  };

  await writeFile(
    path.join(outputDirectory, 'run-manifest.json'),
    `${JSON.stringify(sortRecordKeys(runManifest as unknown as Record<string, unknown>), null, 2)}\n`,
    'utf8'
  );
  await writeJson(path.join(outputDirectory, 'summary.json'), summary);
  await writeJson(path.join(outputDirectory, 'dataset-inventory.json'), {
    runId,
    totalRecords: summary.totalRecords,
    byLanguage: summary.byLanguage,
    bySuite: summary.bySuite,
    byModel: summary.byModel
  });
  await writeFile(path.join(outputDirectory, 'dataset-hashes.txt'), `${datasetPath} ${datasetSha256}\n`, 'utf8');
  await writeFile(
    path.join(outputDirectory, 'prompt-schema-hashes.txt'),
    markdownList([
      `system-prompt-sha256 ${summary.instrumentation.systemPromptHashAvailable ? uniqueSorted(records.filter((r) => r.systemPromptSha256 !== null).map((r) => r.systemPromptSha256!)).join(',') : NOT_AVAILABLE}`,
      `user-prompt-sha256 ${summary.instrumentation.userPromptHashAvailable ? uniqueSorted(records.filter((r) => r.userPromptSha256 !== null).map((r) => r.userPromptSha256!)).join(',') : NOT_AVAILABLE}`
    ]),
    'utf8'
  );

  await writeFile(
    path.join(outputDirectory, 'README.md'),
    markdownList([
      '# testLunumv1 Real Result Bundle',
      '',
      `- Run: ${runId}`,
      `- Protocol version: ${input.protocolVersion}`,
      `- Evaluated SHA: ${input.evaluatedSha}`,
      `- Dataset SHA: ${datasetSha256}`,
      `- Repository state SHA: ${input.repositoryStateSha256}`,
      '',
      'This bundle is generated purely by recomputing aggregates from the raw',
      '#314 audit JSONL records (`TestLunumV1AuditRecord`); no value is carried',
      'over unaggregated from the #313 executor or #314 adapter stages. Fields',
      'the underlying pipeline never captures (usage, finishReason, prompt',
      `hashes) render as the literal string \`${NOT_AVAILABLE}\` throughout.`
    ]),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'environment.md'),
    markdownList([
      '# Environment',
      '',
      `- Workers: ${workerIds.join(', ')}`,
      `- Target models: ${targetModelProfiles.map((model) => model.id).join(', ')}`,
      `- Model slots: ${modelSlotIds.join(', ')}`,
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
      `- Repository state SHA: ${input.repositoryStateSha256}`,
      `- Dataset SHA: ${datasetSha256}`,
      `- Prompt schema SHA: ${NOT_AVAILABLE}`
    ]),
    'utf8'
  );

  for (const model of targetModelProfiles) {
    await writeFile(
      path.join(outputDirectory, 'endpoint-probes', `${model.id}.jsonl`),
      `${JSON.stringify({ runId, modelId: model.id, profileSha256: model.sha256, status: NOT_AVAILABLE, probe: 'not-instrumented', detail: 'The #313 executor does not perform endpoint probes.' })}\n`,
      'utf8'
    );
  }

  const writeJsonlGroup = async (filePath: string, groupRecords: readonly TestLunumV1AuditRecord[]): Promise<void> => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${groupRecords.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  };

  const rawGroups = new Map<string, TestLunumV1AuditRecord[]>();
  for (const record of records) {
    const key = `${record.suiteId}__${record.targetModelProfileId}__${record.modelSlotId}__${record.sourceLanguage}`;
    const list = rawGroups.get(key) ?? [];
    list.push(record);
    rawGroups.set(key, list);
  }
  for (const [key, groupRecords] of rawGroups) {
    const [suiteId, modelId, modelSlotId, language] = key.split('__');
    await writeJsonlGroup(
      path.join(outputDirectory, 'raw', suiteId!, modelId!, `${modelSlotId}__${language}.jsonl`),
      groupRecords
    );
  }

  for (const model of targetModelProfiles) {
    const modelRecords = records.filter((record) => record.targetModelProfileId === model.id);
    const counts = summary.byModel[model.id] ?? emptyCounts();
    await writeFile(
      path.join(outputDirectory, 'models', `${model.id}.md`),
      groupSummaryMarkdown(`Model: ${model.id}`, counts, [
        `- Profile SHA-256: ${model.sha256}`,
        `- Exact records: ${modelRecords.filter((record) => record.exact).length}`,
        `- Near-only records: ${modelRecords.filter((record) => record.nearSemanticOnly).length}`,
        `- Latency stats: ${JSON.stringify(computeLatencyStats(modelRecords.map((record) => record.latencyMs)))}`
      ]),
      'utf8'
    );
  }

  for (const workerId of workerIds) {
    const workerRecords = records.filter((record) => record.piWorkerId === workerId);
    const counts = summary.byWorker[workerId] ?? emptyCounts();
    await writeFile(
      path.join(outputDirectory, 'workers', `${workerId}.md`),
      groupSummaryMarkdown(`Worker: ${workerId}`, counts, [
        `- Worker model: ${uniqueSorted(workerRecords.map((record) => record.piWorkerModel)).join(', ')}`
      ]),
      'utf8'
    );
  }

  for (const workerId of workerIds) {
    for (const model of targetModelProfiles) {
      const key = `${workerId}__${model.id}`;
      const counts = summary.byModelWorker[key] ?? emptyCounts();
      if (counts.total === 0) continue;
      await writeFile(
        path.join(outputDirectory, 'model-worker-matrix', `${workerId}__${model.id}.md`),
        groupSummaryMarkdown(`Worker / Model Matrix: ${workerId} x ${model.id}`, counts, [
          `- Attribution: model=${model.id}, worker=${workerId}, dataset=${datasetSha256}`
        ]),
        'utf8'
      );
    }
  }

  for (const language of languages) {
    const languageRecords = records.filter((record) => record.sourceLanguage === language);
    const counts = summary.byLanguage[language] ?? emptyCounts();
    await writeFile(
      path.join(outputDirectory, 'languages', `${language}.md`),
      groupSummaryMarkdown(`Language: ${language}`, counts, [
        `- Suites: ${uniqueSorted(languageRecords.map((record) => record.suiteId)).join(', ')}`,
        `- Target models: ${uniqueSorted(languageRecords.map((record) => record.targetModelProfileId)).join(', ')}`
      ]),
      'utf8'
    );
  }

  for (const suiteId of suiteIds) {
    const suiteRecords = records.filter((record) => record.suiteId === suiteId);
    const counts = summary.bySuite[suiteId] ?? emptyCounts();
    await writeFile(
      path.join(outputDirectory, 'suites', `${suiteId}.md`),
      groupSummaryMarkdown(`Suite: ${suiteId}`, counts, [
        `- Languages: ${uniqueSorted(suiteRecords.map((record) => record.sourceLanguage)).join(', ')}`,
        `- Items: ${uniqueSorted(suiteRecords.map((record) => record.itemId)).join(', ')}`
      ]),
      'utf8'
    );
  }

  await writeFile(
    path.join(outputDirectory, 'tables', 'overall.csv'),
    csvRows(['runId', 'total', 'passed', 'failed', 'error', 'exact', 'nearOnly'], [[summary.runId, summary.totalRecords, summary.passedRecords, summary.failedRecords, summary.errorRecords, summary.exactRecords, summary.nearSemanticOnlyRecords]]),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-suite.csv'),
    csvRows(['suite', 'total', 'passed', 'failed', 'error'], Object.entries(summary.bySuite).map(([suite, counts]) => [suite, counts.total, counts.passed, counts.failed, counts.error])),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-language.csv'),
    csvRows(['language', 'total', 'passed', 'failed', 'error'], Object.entries(summary.byLanguage).map(([language, counts]) => [language, counts.total, counts.passed, counts.failed, counts.error])),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-model.csv'),
    csvRows(['model', 'total', 'passed', 'failed', 'error'], Object.entries(summary.byModel).map(([model, counts]) => [model, counts.total, counts.passed, counts.failed, counts.error])),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-worker.csv'),
    csvRows(['worker', 'total', 'passed', 'failed', 'error'], Object.entries(summary.byWorker).map(([worker, counts]) => [worker, counts.total, counts.passed, counts.failed, counts.error])),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-model-worker.csv'),
    csvRows(['worker', 'model', 'total', 'passed', 'failed', 'error'], Object.entries(summary.byModelWorker).map(([key, counts]) => {
      const [worker, model] = key.split('__');
      return [worker!, model!, counts.total, counts.passed, counts.failed, counts.error];
    })),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-model-slot.csv'),
    csvRows(['modelSlot', 'total', 'passed', 'failed', 'error'], Object.entries(summary.byModelSlot).map(([slot, counts]) => [slot, counts.total, counts.passed, counts.failed, counts.error])),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'latency.csv'),
    csvRows(['metric', 'value'], [
      ['count', summary.latency.count],
      ['minMs', renderCell(summary.latency.minMs === NOT_AVAILABLE ? null : summary.latency.minMs)],
      ['p50Ms', renderCell(summary.latency.p50Ms === NOT_AVAILABLE ? null : summary.latency.p50Ms)],
      ['p90Ms', renderCell(summary.latency.p90Ms === NOT_AVAILABLE ? null : summary.latency.p90Ms)],
      ['p95Ms', renderCell(summary.latency.p95Ms === NOT_AVAILABLE ? null : summary.latency.p95Ms)],
      ['p99Ms', renderCell(summary.latency.p99Ms === NOT_AVAILABLE ? null : summary.latency.p99Ms)],
      ['maxMs', renderCell(summary.latency.maxMs === NOT_AVAILABLE ? null : summary.latency.maxMs)],
      ['meanMs', renderCell(summary.latency.meanMs === NOT_AVAILABLE ? null : summary.latency.meanMs)],
      ['stddevMs', renderCell(summary.latency.stddevMs === NOT_AVAILABLE ? null : summary.latency.stddevMs)]
    ]),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'tokens.csv'),
    csvRows(['metric', 'value'], [
      ['promptTokens', summary.instrumentation.usageAvailable ? 'see raw records' : NOT_AVAILABLE],
      ['completionTokens', summary.instrumentation.usageAvailable ? 'see raw records' : NOT_AVAILABLE],
      ['totalTokens', summary.instrumentation.usageAvailable ? 'see raw records' : NOT_AVAILABLE],
      ['cachedTokens', summary.instrumentation.usageAvailable ? 'see raw records' : NOT_AVAILABLE],
      ['reasoningTokens', summary.instrumentation.usageAvailable ? 'see raw records' : NOT_AVAILABLE]
    ]),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, 'tables', 'by-error-class.csv'),
    csvRows(['errorClass', 'count'], Object.entries(summary.errorClasses).length > 0 ? Object.entries(summary.errorClasses).map(([errorClass, count]) => [errorClass, count]) : [['none', 0]]),
    'utf8'
  );

  const failedOrErrored = records.filter((record) => record.status !== 'passed');
  await writeFile(
    path.join(outputDirectory, 'tables', 'failures.csv'),
    csvRows(
      ['executionId', 'suiteId', 'itemId', 'modelSlotId', 'targetModelProfileId', 'sourceLanguage', 'stageName', 'status', 'errorClass', 'errorMessage'],
      failedOrErrored.map((record) => [record.executionId, record.suiteId, record.itemId, record.modelSlotId, record.targetModelProfileId, record.sourceLanguage, record.stageName, record.status, record.errorClass, renderCell(record.errorMessage)])
    ),
    'utf8'
  );

  const failureLines = failedOrErrored.map((record) =>
    `- ${record.suiteId}/${record.itemId} [${record.sourceLanguage}] model=${record.targetModelProfileId} stage=${record.stageName} (${record.status}, ${record.errorClass}${record.errorMessage ? `: ${record.errorMessage}` : ''})`
  );
  await writeFile(
    path.join(outputDirectory, 'failure-gallery', 'index.md'),
    markdownList(['# Failure Gallery', '', ...(failureLines.length > 0 ? failureLines : ['- None'])]),
    'utf8'
  );

  await writeFile(path.join(outputDirectory, 'overall-scorecard.md'), buildOverallScorecard(summary), 'utf8');
  await writeFile(path.join(outputDirectory, 'focus-recommendations.md'), buildFocusRecommendationsMarkdown(summary), 'utf8');

  return { outputDirectory, summary };
}
