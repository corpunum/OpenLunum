/**
 * False-positive review runner (#332).
 *
 * Scores the #328 mutation corpus
 * (`datasets/adversarial/mutation-false-positive-v1.jsonl`) against the
 * parse prompt used everywhere else in this package (`./prompts.js`'s
 * `parsePrompt`) and the same near-semantic scorer `parse-experiment.ts`
 * already uses (`compareSem` / `NearSemanticFingerprintGenerator` from
 * `@corpunum/lunum`). No new scoring logic, no new thresholds -- see the
 * module doc comment on `../../core/src/near-semantic-fingerprints.ts` /
 * `parse-experiment.ts` for the existing 0.8 near-semantic threshold reused
 * here unchanged.
 *
 * The defining move (#332, following on from #253/#328): each mutated item
 * carries a `sourceItemId` pointing at the ORIGINAL item it was minimally
 * mutated from, and its own `goldSem` describing the CHANGED meaning. For
 * every item this runner:
 *
 *   1. Parses the mutated `sourceText` with the real parse prompt (through
 *      an injected transport -- see `FalsePositiveReviewClient` below; this
 *      module makes no live model calls itself).
 *   2. Scores the resulting Sem against the SOURCE item's `goldSem`. Any
 *      match here (exact fingerprint, or near-semantic-only) is a FALSE
 *      POSITIVE: the near-semantic scorer accepted a variant whose meaning
 *      genuinely differs, by dataset construction (see
 *      `MutationDatasetItem.semanticDifference`).
 *   3. Separately scores the resulting Sem against the MUTATION's OWN
 *      `goldSem`. This is a diagnostic signal, not part of the
 *      false-positive count: it distinguishes "the scorer correctly
 *      tracked the change" (own gold matched, source gold did not) from
 *      "the scorer got lost entirely" (neither gold matched).
 *
 * Infrastructure-error handling mirrors the #253 execution program (see
 * issue #253's "Evidence controls adopted" comment, point 4): a transport
 * failure from `client.complete()` itself (non-200, timeout, malformed
 * response envelope -- i.e. anything `OpenAICompatibleModel.complete()`
 * throws before a `ModelCompletion` is obtained) is infrastructure, not a
 * model result, and INVALIDATES THE WHOLE RUN rather than being recorded
 * as a per-item outcome and skipped. A diagnostic raw record is appended
 * documenting the abort, then a `FalsePositiveReviewInfrastructureError` is
 * thrown; no summary/report is written for an aborted run. By contrast, a
 * model producing malformed or schema-invalid output over a successful
 * HTTP 200 response is a genuine per-item model failure (`status:
 * 'failed'`), not infrastructure, and does not abort the run.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compareSem, NearSemanticFingerprintGenerator, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File, writeJson } from './io.js';
import { OpenAICompatibleModel } from './model.js';
import { parsePrompt } from './prompts.js';
import {
  planFalsePositiveReviewExecution,
  validateFalsePositiveReviewManifest,
  type FalsePositiveReviewManifest
} from './false-positive-review-manifest.js';
import type { CompletionUsage, DatasetItem, ModelCompletion, ModelProfile } from './types.js';

export type FalsePositiveReviewItemStatus = 'passed' | 'failed';
export type FalsePositiveReviewOutcome = 'correct' | 'false_positive' | 'false_positive_and_own_matched' | 'lost';

export interface FalsePositiveReviewClient {
  complete(system: string, user: string): Promise<ModelCompletion>;
}

export interface FalsePositiveReviewMatchResult {
  exact: boolean;
  /** near-semantic AND NOT exact, matching `parse-experiment.ts`'s `nearOnly` convention. */
  nearSemanticOnly: boolean;
  nearSemanticScore: number;
  featureRecall: number;
  featurePrecision: number;
  missingFeatures: string[];
}

export interface FalsePositiveReviewRawRecord {
  runId: string;
  manifestId: string;
  itemId: string;
  sourceItemId: string;
  mutationType: string;
  semanticDifference: string;
  sourceLanguage: string;
  attempt: number;
  systemPromptSha256: string;
  userPromptSha256: string;
  rawOutput: string;
  parsedSem: LunumSem | null;
  finishReason: string | null;
  usage: CompletionUsage | null;
  unavailableFields: string[];
  /** 'passed' = a schema-valid Sem was obtained (parse succeeded); 'failed' = malformed/invalid model output (a genuine model failure, not infrastructure). */
  status: FalsePositiveReviewItemStatus;
  errorClass: string | null;
  errorMessage: string | null;
  latencyMs: number;
  /** Comparison against the SOURCE item's goldSem. A match here is a false positive. Null when status !== 'passed'. */
  sourceMatch: FalsePositiveReviewMatchResult | null;
  /** Comparison against this mutation's OWN goldSem (the changed meaning). Diagnostic only. Null when status !== 'passed'. */
  ownMatch: FalsePositiveReviewMatchResult | null;
  /** True iff sourceMatch.exact || sourceMatch.nearSemanticOnly. Null when status !== 'passed'. */
  falsePositive: boolean | null;
  /** True iff ownMatch.exact || ownMatch.nearSemanticOnly. Null when status !== 'passed'. */
  ownGoldMatched: boolean | null;
  outcome: FalsePositiveReviewOutcome | null;
}

export interface FalsePositiveReviewBreakdown {
  key: string;
  totalItems: number;
  parsedItems: number;
  invalidItems: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
  ownGoldExactCount: number;
  ownGoldNearOnlyCount: number;
  ownGoldMatchedCount: number;
  ownGoldMatchRate: number;
}

export interface FalsePositiveReviewLatencyStats {
  count: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
}

export interface FalsePositiveReviewSummary {
  runId: string;
  manifestId: string;
  baselineCommit: string;
  mutationDatasetSha256: string;
  sourceDatasetSha256: string;
  systemPromptSha256: string;
  itemCount: number;
  plannedItemCount: number;
  parseCalls: number;
  totalModelCalls: number;
  parsedItems: number;
  invalidItems: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
  ownGoldMatchedCount: number;
  ownGoldMatchRate: number;
  outcomeCounts: Record<FalsePositiveReviewOutcome, number>;
  byMutationType: FalsePositiveReviewBreakdown[];
  byLanguage: FalsePositiveReviewBreakdown[];
  latencyMs: FalsePositiveReviewLatencyStats;
  errorTaxonomy: Record<string, number>;
  generatedAt: number;
}

interface FalsePositiveReviewCliOptions {
  root?: string;
  outputRoot?: string;
  client?: FalsePositiveReviewClient;
  modelProfilePath?: string;
  mockFixturePath?: string;
}

interface FalsePositiveReviewMockFixtureResponse {
  content?: string;
  finishReason?: string | null;
  usage?: CompletionUsage | null;
  error?: string;
}

interface MutationDatasetItem extends DatasetItem {
  mutationType: string;
  sourceItemId: string;
  semanticDifference: string;
}

/**
 * Thrown when a transport-level (infrastructure) failure occurs. Distinct
 * from a per-item model failure: an infrastructure error means no result
 * for the affected item -- or any item after it -- can be trusted, so the
 * whole run is invalid. Callers must not treat a run that threw this as
 * partial evidence; re-run after fixing the underlying infrastructure.
 */
export class FalsePositiveReviewInfrastructureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FalsePositiveReviewInfrastructureError';
  }
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertContainedPath(root: string, candidate: string, label: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolvedCandidate;
  }

  throw new Error(`${label} must stay within ${resolvedRoot}`);
}

/** Classifies a transport-level failure (thrown by `client.complete()` itself) for the abort diagnostic record. Every branch here is infrastructure by construction -- see module doc comment. */
function classifyTransportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (/http\s+5\d\d/u.test(lower)) return 'http_5xx';
  if (/http\s+429/u.test(lower)) return 'http_429_rate_limited';
  if (lower.includes('slot') && (lower.includes('busy') || lower.includes('unavailable'))) return 'slot_busy';
  if (lower.includes('out of memory') || /\boom\b/u.test(lower)) return 'oom';
  if (/http\s+\d+/u.test(lower)) return 'http';
  if (lower.includes('timeout') || lower.includes('aborted')) return 'timeout';
  if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('fetch failed') || lower.includes('enotfound')) return 'network';
  if (lower.includes('did not contain choices')) return 'malformed_response_envelope';
  return 'unexpected_transport_error';
}

/** Classifies a genuine per-item model failure (JSON extraction / schema validation over an already-successful HTTP response). Never infrastructure. */
function classifyModelFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('no json object found')) return 'no_json_in_output';
  if (lower.includes('unexpected token') || lower.includes('json.parse')) return 'malformed_json';
  if (lower.includes('validation failed')) return 'schema_validation_failed';
  return 'unexpected_model_failure';
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * fraction) - 1));
  return sortedValues[index] ?? 0;
}

function latencyStats(values: number[]): FalsePositiveReviewLatencyStats {
  if (values.length === 0) return { count: 0, minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: total / sorted.length
  };
}

async function createDefaultClient(root: string, modelProfilePath?: string): Promise<FalsePositiveReviewClient> {
  if (!modelProfilePath || !modelProfilePath.trim()) {
    throw new Error('false-positive-review CLI requires --profile <model-profile> when no test-only mock fixture is provided');
  }
  const resolvedProfile = path.isAbsolute(modelProfilePath) ? modelProfilePath : path.join(root, modelProfilePath);
  const profile = await readJson<ModelProfile>(resolvedProfile);
  return new OpenAICompatibleModel(profile);
}

async function createMockClient(root: string, mockFixturePath: string): Promise<FalsePositiveReviewClient> {
  const resolvedFixture = assertContainedPath(
    root,
    path.isAbsolute(mockFixturePath) ? mockFixturePath : path.join(root, mockFixturePath),
    'mock fixture'
  );
  const responses = await readJson<FalsePositiveReviewMockFixtureResponse[]>(resolvedFixture);
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error(`mock fixture must be a non-empty JSON array: ${resolvedFixture}`);
  }

  let index = 0;
  return {
    async complete(): Promise<ModelCompletion> {
      const next = responses[index++] as FalsePositiveReviewMockFixtureResponse | undefined;
      if (!next) throw new Error('mock client exhausted');
      if (typeof next.error === 'string' && next.error.trim()) {
        throw new Error(next.error);
      }
      if (typeof next.content !== 'string') {
        throw new Error(`mock fixture entry ${index} must provide a content string or an error`);
      }
      return {
        content: next.content,
        finishReason: typeof next.finishReason === 'string' ? next.finishReason : null,
        usage: next.usage ?? null
      };
    }
  };
}

function scoreAgainst(
  generator: NearSemanticFingerprintGenerator,
  gold: LunumSem,
  parsed: LunumSem,
  protectedLiterals: string[]
): FalsePositiveReviewMatchResult {
  const comparison = compareSem(gold, parsed);
  const nearResult = generator.compareSem(gold, parsed, { protectedLiterals });
  const nearSemanticOnly = !comparison.exactFingerprint && nearResult.similar;
  return {
    exact: comparison.exactFingerprint,
    nearSemanticOnly,
    nearSemanticScore: nearResult.similarity,
    featureRecall: comparison.featureRecall,
    featurePrecision: comparison.featurePrecision,
    missingFeatures: comparison.missingFeatures
  };
}

function classifyOutcome(falsePositive: boolean, ownGoldMatched: boolean): FalsePositiveReviewOutcome {
  if (falsePositive && ownGoldMatched) return 'false_positive_and_own_matched';
  if (falsePositive) return 'false_positive';
  if (ownGoldMatched) return 'correct';
  return 'lost';
}

function emptyBreakdown(key: string): FalsePositiveReviewBreakdown {
  return {
    key,
    totalItems: 0,
    parsedItems: 0,
    invalidItems: 0,
    falsePositiveCount: 0,
    falsePositiveRate: 0,
    ownGoldExactCount: 0,
    ownGoldNearOnlyCount: 0,
    ownGoldMatchedCount: 0,
    ownGoldMatchRate: 0
  };
}

function accumulate(breakdown: FalsePositiveReviewBreakdown, record: FalsePositiveReviewRawRecord): void {
  breakdown.totalItems += 1;
  if (record.status === 'passed') {
    breakdown.parsedItems += 1;
    if (record.falsePositive) breakdown.falsePositiveCount += 1;
    if (record.ownMatch?.exact) breakdown.ownGoldExactCount += 1;
    if (record.ownMatch?.nearSemanticOnly) breakdown.ownGoldNearOnlyCount += 1;
    if (record.ownGoldMatched) breakdown.ownGoldMatchedCount += 1;
  } else {
    breakdown.invalidItems += 1;
  }
}

function finalizeBreakdown(breakdown: FalsePositiveReviewBreakdown): FalsePositiveReviewBreakdown {
  return {
    ...breakdown,
    falsePositiveRate: breakdown.parsedItems > 0 ? breakdown.falsePositiveCount / breakdown.parsedItems : 0,
    ownGoldMatchRate: breakdown.parsedItems > 0 ? breakdown.ownGoldMatchedCount / breakdown.parsedItems : 0
  };
}

/**
 * Recomputes the entire summary from raw per-item records plus run
 * metadata. Pure and deterministic: never reads model output itself,
 * never re-scores anything -- every field it produces is already present
 * on the passed-in records. This exists so the summary can always be
 * independently reproduced from the committed raw JSONL alone (the same
 * evidence-integrity property `retention-cli.ts#recomputeRetentionSummary`
 * provides), rather than trusted from the runner's own bookkeeping.
 */
export function recomputeFalsePositiveReviewSummary(
  records: FalsePositiveReviewRawRecord[],
  metadata: {
    runId: string;
    manifestId: string;
    baselineCommit: string;
    mutationDatasetSha256: string;
    sourceDatasetSha256: string;
    systemPromptSha256: string;
    plannedItemCount: number;
    parseCalls: number;
    totalModelCalls: number;
  }
): FalsePositiveReviewSummary {
  // One record per item is expected (maxAttemptsPerItem is normally 1 for
  // this review; if a manifest ever raises it, only the terminal attempt
  // per item -- first 'passed', else the last recorded attempt -- counts
  // toward aggregates, mirroring recomputeRetentionSummary's per-item
  // terminal-status selection).
  const byItem = new Map<string, FalsePositiveReviewRawRecord[]>();
  for (const record of records) {
    const group = byItem.get(record.itemId) ?? [];
    group.push(record);
    byItem.set(record.itemId, group);
  }

  const terminalRecords: FalsePositiveReviewRawRecord[] = [];
  for (const group of byItem.values()) {
    const ordered = [...group].sort((a, b) => a.attempt - b.attempt);
    const passed = ordered.find((record) => record.status === 'passed');
    terminalRecords.push(passed ?? ordered[ordered.length - 1]!);
  }
  terminalRecords.sort((a, b) => a.itemId.localeCompare(b.itemId));

  const overall = emptyBreakdown('overall');
  const byMutationType = new Map<string, FalsePositiveReviewBreakdown>();
  const byLanguage = new Map<string, FalsePositiveReviewBreakdown>();
  const outcomeCounts: Record<FalsePositiveReviewOutcome, number> = {
    correct: 0,
    false_positive: 0,
    false_positive_and_own_matched: 0,
    lost: 0
  };
  const errorTaxonomy: Record<string, number> = {};
  const latencies: number[] = [];

  for (const record of terminalRecords) {
    accumulate(overall, record);
    const mutationBreakdown = byMutationType.get(record.mutationType) ?? emptyBreakdown(record.mutationType);
    accumulate(mutationBreakdown, record);
    byMutationType.set(record.mutationType, mutationBreakdown);

    const languageBreakdown = byLanguage.get(record.sourceLanguage) ?? emptyBreakdown(record.sourceLanguage);
    accumulate(languageBreakdown, record);
    byLanguage.set(record.sourceLanguage, languageBreakdown);

    if (record.outcome) outcomeCounts[record.outcome] += 1;
    if (record.status === 'failed' && record.errorClass) {
      errorTaxonomy[record.errorClass] = (errorTaxonomy[record.errorClass] ?? 0) + 1;
    }
  }

  // Latency is reported over EVERY recorded attempt, not just terminal
  // ones -- every attempt cost real wall-clock time.
  for (const record of records) latencies.push(record.latencyMs);

  return {
    runId: metadata.runId,
    manifestId: metadata.manifestId,
    baselineCommit: metadata.baselineCommit,
    mutationDatasetSha256: metadata.mutationDatasetSha256,
    sourceDatasetSha256: metadata.sourceDatasetSha256,
    systemPromptSha256: metadata.systemPromptSha256,
    itemCount: terminalRecords.length,
    plannedItemCount: metadata.plannedItemCount,
    parseCalls: metadata.parseCalls,
    totalModelCalls: metadata.totalModelCalls,
    parsedItems: overall.parsedItems,
    invalidItems: overall.invalidItems,
    falsePositiveCount: overall.falsePositiveCount,
    falsePositiveRate: overall.parsedItems > 0 ? overall.falsePositiveCount / overall.parsedItems : 0,
    ownGoldMatchedCount: overall.ownGoldMatchedCount,
    ownGoldMatchRate: overall.parsedItems > 0 ? overall.ownGoldMatchedCount / overall.parsedItems : 0,
    outcomeCounts,
    byMutationType: [...byMutationType.values()].map(finalizeBreakdown).sort((a, b) => a.key.localeCompare(b.key)),
    byLanguage: [...byLanguage.values()].map(finalizeBreakdown).sort((a, b) => a.key.localeCompare(b.key)),
    latencyMs: latencyStats(latencies),
    errorTaxonomy,
    generatedAt: Date.now()
  };
}

function renderMarkdownReport(summary: FalsePositiveReviewSummary): string {
  const lines: string[] = [
    `# False-positive review: ${summary.manifestId}`,
    '',
    `- Run: ${summary.runId}`,
    `- Baseline commit: ${summary.baselineCommit}`,
    `- Mutation dataset sha256: ${summary.mutationDatasetSha256}`,
    `- Source dataset sha256: ${summary.sourceDatasetSha256}`,
    `- Prompt sha256: ${summary.systemPromptSha256}`,
    `- Items: ${summary.itemCount} (planned ${summary.plannedItemCount})`,
    `- Parsed (schema-valid): ${summary.parsedItems}`,
    `- Invalid model output: ${summary.invalidItems}`,
    '',
    '## Overall',
    '',
    `- False-positive rate (match against SOURCE gold, among parsed items): **${(summary.falsePositiveRate * 100).toFixed(1)}%** (${summary.falsePositiveCount}/${summary.parsedItems})`,
    `- Own-gold match rate (scorer correctly tracked the mutation's own change): ${(summary.ownGoldMatchRate * 100).toFixed(1)}% (${summary.ownGoldMatchedCount}/${summary.parsedItems})`,
    `- Outcomes: correct=${summary.outcomeCounts.correct}, false_positive=${summary.outcomeCounts.false_positive}, false_positive_and_own_matched=${summary.outcomeCounts.false_positive_and_own_matched}, lost=${summary.outcomeCounts.lost}`,
    '',
    '## By mutation category',
    '',
    '| Category | Items | Parsed | False-positive rate | Own-gold match rate |',
    '|---|---|---|---|---|',
    ...summary.byMutationType.map((row) =>
      `| ${row.key} | ${row.totalItems} | ${row.parsedItems} | ${(row.falsePositiveRate * 100).toFixed(1)}% (${row.falsePositiveCount}/${row.parsedItems}) | ${(row.ownGoldMatchRate * 100).toFixed(1)}% (${row.ownGoldMatchedCount}/${row.parsedItems}) |`
    ),
    '',
    '## By language',
    '',
    '| Language | Items | Parsed | False-positive rate | Own-gold match rate |',
    '|---|---|---|---|---|',
    ...summary.byLanguage.map((row) =>
      `| ${row.key} | ${row.totalItems} | ${row.parsedItems} | ${(row.falsePositiveRate * 100).toFixed(1)}% (${row.falsePositiveCount}/${row.parsedItems}) | ${(row.ownGoldMatchRate * 100).toFixed(1)}% (${row.ownGoldMatchedCount}/${row.parsedItems}) |`
    ),
    '',
    '## Latency',
    '',
    `- p50: ${summary.latencyMs.p50Ms.toFixed(2)}ms, p95: ${summary.latencyMs.p95Ms.toFixed(2)}ms, mean: ${summary.latencyMs.meanMs.toFixed(2)}ms (${summary.latencyMs.count} attempts)`,
    '',
    '## Error taxonomy (invalid model output only; infrastructure errors invalidate the whole run and are not summarized here)',
    '',
    ...(Object.keys(summary.errorTaxonomy).length > 0
      ? Object.entries(summary.errorTaxonomy).map(([errorClass, count]) => `- ${errorClass}: ${count}`)
      : ['- None'])
  ];
  return `${lines.join('\n')}\n`;
}

export async function runFalsePositiveReviewCli(
  manifestPath: string,
  options: FalsePositiveReviewCliOptions = {}
): Promise<{ summary: FalsePositiveReviewSummary; outputDirectory: string; rawRecords: FalsePositiveReviewRawRecord[] }> {
  const root = options.root ?? await findWorkspaceRoot();
  const manifest = await readJson<FalsePositiveReviewManifest>(manifestPath);
  const validatedManifest = validateFalsePositiveReviewManifest(manifest);

  const mutationDatasetPath = path.isAbsolute(validatedManifest.mutationDataset.path)
    ? validatedManifest.mutationDataset.path
    : path.join(root, validatedManifest.mutationDataset.path);
  const sourceDatasetPath = path.isAbsolute(validatedManifest.sourceDataset.path)
    ? validatedManifest.sourceDataset.path
    : path.join(root, validatedManifest.sourceDataset.path);

  const mutationActualHash = await sha256File(mutationDatasetPath);
  if (mutationActualHash !== validatedManifest.mutationDataset.sha256) {
    throw new Error(`Mutation dataset hash mismatch: expected ${validatedManifest.mutationDataset.sha256}, got ${mutationActualHash}`);
  }
  const sourceActualHash = await sha256File(sourceDatasetPath);
  if (sourceActualHash !== validatedManifest.sourceDataset.sha256) {
    throw new Error(`Source dataset hash mismatch: expected ${validatedManifest.sourceDataset.sha256}, got ${sourceActualHash}`);
  }

  const mutationDataset = (await loadDataset(mutationDatasetPath)) as MutationDatasetItem[];
  const sourceDataset = await loadDataset(sourceDatasetPath);
  const plan = planFalsePositiveReviewExecution(validatedManifest, mutationDataset, sourceDataset);

  const requestedOutputRoot = options.outputRoot ?? path.join('reports', 'evaluations', 'false-positive-review');
  const outputRoot = assertContainedPath(root, path.isAbsolute(requestedOutputRoot) ? requestedOutputRoot : path.join(root, requestedOutputRoot), 'output root');
  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const outputDirectory = path.join(outputRoot, runId);
  const rawDirectory = path.join(outputDirectory, 'raw');
  await mkdir(rawDirectory, { recursive: true });

  const client = options.client
    ?? (options.mockFixturePath ? await createMockClient(root, options.mockFixturePath) : await createDefaultClient(root, options.modelProfilePath));

  const rawRecordsPath = path.join(rawDirectory, 'items.jsonl');
  await writeFile(rawRecordsPath, '', 'utf8');
  const rawRecords: FalsePositiveReviewRawRecord[] = [];
  const recordLine = async (record: FalsePositiveReviewRawRecord): Promise<void> => {
    rawRecords.push(record);
    await appendFile(rawRecordsPath, `${JSON.stringify(record)}\n`, 'utf8');
  };

  const sourceById = new Map(sourceDataset.map((item) => [item.id, item] as const));
  const generator = new NearSemanticFingerprintGenerator(0.8);
  let systemPromptSha256 = '';

  // Deterministic ordering: plannedItemIds is exactly validatedManifest.expectedItemIds
  // (the dataset-authored order in the frozen manifest), never re-sorted or
  // re-derived from iteration order of a Map/Set.
  for (const itemId of plan.plannedItemIds) {
    const item = mutationDataset.find((entry) => entry.id === itemId);
    if (!item) throw new Error(`planned item missing from mutation dataset: ${itemId}`);
    const sourceItemId = plan.sourceItemIdByItemId.get(itemId)!;
    const sourceItem = sourceById.get(sourceItemId);
    if (!sourceItem) throw new Error(`planned item ${itemId}: source item ${sourceItemId} missing from source dataset`);

    for (let attempt = 1; attempt <= plan.maxAttemptsPerItem; attempt += 1) {
      const promptBody = parsePrompt(item);
      systemPromptSha256 = sha256Text(promptBody.system);
      const userPromptSha256 = sha256Text(promptBody.user);
      const started = performance.now();

      let completion: ModelCompletion;
      try {
        completion = await client.complete(promptBody.system, promptBody.user);
      } catch (error) {
        // Infrastructure failure: no further items can be trusted for this
        // run. Record a diagnostic line, then abort -- do NOT drop the item
        // and continue (see module doc comment / #253 evidence controls).
        await recordLine({
          runId,
          manifestId: validatedManifest.id,
          itemId,
          sourceItemId,
          mutationType: item.mutationType,
          semanticDifference: item.semanticDifference,
          sourceLanguage: item.sourceLanguage,
          attempt,
          systemPromptSha256,
          userPromptSha256,
          rawOutput: '',
          parsedSem: null,
          finishReason: null,
          usage: null,
          unavailableFields: ['finishReason', 'usage'],
          status: 'failed',
          errorClass: `infrastructure:${classifyTransportError(error)}`,
          errorMessage: error instanceof Error ? error.message : String(error),
          latencyMs: performance.now() - started,
          sourceMatch: null,
          ownMatch: null,
          falsePositive: null,
          ownGoldMatched: null,
          outcome: null
        });
        throw new FalsePositiveReviewInfrastructureError(
          `false-positive review aborted: infrastructure failure on item ${itemId} attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}. This run is INVALID; fix the underlying infrastructure and re-run in full.`,
          { cause: error }
        );
      }

      const latencyMs = performance.now() - started;

      try {
        const parsed = extractJson(completion.content);
        const validation = validateSem(parsed);
        if (!validation.ok) throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
        const parsedSem = parsed as LunumSem;

        if (!sourceItem.goldSem || !item.goldSem) throw new Error('false-positive review requires gold Sem for both source and target');
        const sourceMatch = scoreAgainst(generator, sourceItem.goldSem, parsedSem, sourceItem.protectedLiterals ?? []);
        const ownMatch = scoreAgainst(generator, item.goldSem, parsedSem, item.protectedLiterals ?? []);
        const falsePositive = sourceMatch.exact || sourceMatch.nearSemanticOnly;
        const ownGoldMatched = ownMatch.exact || ownMatch.nearSemanticOnly;

        await recordLine({
          runId,
          manifestId: validatedManifest.id,
          itemId,
          sourceItemId,
          mutationType: item.mutationType,
          semanticDifference: item.semanticDifference,
          sourceLanguage: item.sourceLanguage,
          attempt,
          systemPromptSha256,
          userPromptSha256,
          rawOutput: completion.content,
          parsedSem,
          finishReason: completion.finishReason,
          usage: completion.usage,
          unavailableFields: [
            ...(completion.finishReason === null ? ['finishReason'] : []),
            ...(completion.usage === null ? ['usage'] : [])
          ],
          status: 'passed',
          errorClass: null,
          errorMessage: null,
          latencyMs,
          sourceMatch,
          ownMatch,
          falsePositive,
          ownGoldMatched,
          outcome: classifyOutcome(falsePositive, ownGoldMatched)
        });
        break;
      } catch (error) {
        await recordLine({
          runId,
          manifestId: validatedManifest.id,
          itemId,
          sourceItemId,
          mutationType: item.mutationType,
          semanticDifference: item.semanticDifference,
          sourceLanguage: item.sourceLanguage,
          attempt,
          systemPromptSha256,
          userPromptSha256,
          rawOutput: completion.content,
          parsedSem: null,
          finishReason: completion.finishReason,
          usage: completion.usage,
          unavailableFields: [
            ...(completion.finishReason === null ? ['finishReason'] : []),
            ...(completion.usage === null ? ['usage'] : [])
          ],
          status: 'failed',
          errorClass: classifyModelFailure(error),
          errorMessage: error instanceof Error ? error.message : String(error),
          latencyMs,
          sourceMatch: null,
          ownMatch: null,
          falsePositive: null,
          ownGoldMatched: null,
          outcome: null
        });
        // Genuine model failure, not infrastructure: fall through to the
        // next attempt (if any) rather than aborting the run.
      }
    }
  }

  const summary = recomputeFalsePositiveReviewSummary(rawRecords, {
    runId,
    manifestId: validatedManifest.id,
    baselineCommit: validatedManifest.baselineCommit,
    mutationDatasetSha256: validatedManifest.mutationDataset.sha256,
    sourceDatasetSha256: validatedManifest.sourceDataset.sha256,
    systemPromptSha256,
    plannedItemCount: plan.plannedItemIds.length,
    parseCalls: plan.parseCalls,
    totalModelCalls: plan.totalModelCalls
  });

  await writeJson(path.join(outputDirectory, 'manifest.snapshot.json'), validatedManifest);
  await writeJson(path.join(outputDirectory, 'summary.json'), summary);
  await writeJson(path.join(outputDirectory, 'environment.json'), {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    runId,
    manifestId: validatedManifest.id,
    outputRoot,
    modelProfile: options.mockFixturePath ? { mockFixturePath: options.mockFixturePath } : options.modelProfilePath ?? null,
    startedAt: new Date().toISOString()
  });
  await writeFile(path.join(outputDirectory, 'report.md'), renderMarkdownReport(summary), 'utf8');

  return { summary, outputDirectory, rawRecords };
}

export async function runFalsePositiveReviewCliEntrypoint(argv: string[], root: string): Promise<{ outputDirectory: string; summary: FalsePositiveReviewSummary }> {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const manifest = flag('manifest') ?? argv[0];
  if (!manifest) throw new Error('false-positive-review requires --manifest <path> or a positional manifest path');
  const profile = flag('profile');
  const mockFixture = flag('mock-fixture');
  if (profile && mockFixture) {
    throw new Error('false-positive-review accepts either --profile <file> or test-only --mock-fixture <file>, not both');
  }
  const outputRoot = flag('output-root');

  const resolvedManifest = path.isAbsolute(manifest) ? manifest : path.join(root, manifest);
  const options: FalsePositiveReviewCliOptions = { root };
  if (profile) options.modelProfilePath = profile;
  if (mockFixture) options.mockFixturePath = mockFixture;
  if (outputRoot) options.outputRoot = outputRoot;

  const { outputDirectory, summary } = await runFalsePositiveReviewCli(resolvedManifest, options);
  return { outputDirectory, summary };
}
