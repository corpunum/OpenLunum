import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { OpenAICompatibleModel } from './model.js';
import { findWorkspaceRoot, readJson, sha256File, writeJson } from './io.js';
import { planRetentionExecution, validateRetentionManifest, type RetentionCoverageManifest } from './retention-manifest.js';
import type { CompletionUsage, ExperimentItem, ModelCompletion } from './types.js';

export type RetentionStageName = 'realization' | 'parse-back';
export type RetentionStageStatus = 'passed' | 'failed' | 'error';

export interface RetentionStageClient {
  complete(system: string, user: string): Promise<ModelCompletion>;
}

export interface RetentionStageRawRecord {
  runId: string;
  manifestId: string;
  itemId: string;
  attempt: number;
  stage: RetentionStageName;
  sourceLanguage: string;
  targetLanguage: string;
  systemPromptSha256: string;
  userPromptSha256: string;
  rawOutput: string;
  extractedPayload: Record<string, unknown> | null;
  realizedText: string | null;
  parsedText: string | null;
  finishReason: string | null;
  usage: CompletionUsage | null;
  unavailableFields: string[];
  status: RetentionStageStatus;
  errorClass: string | null;
  errorMessage: string | null;
  latencyMs: number;
}

export interface RetentionPercentileStats {
  count: number;
  minMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
}

export interface RetentionItemSummary {
  itemId: string;
  status: RetentionStageStatus;
  attempts: number;
  latencyMs: number;
}

export interface RetentionCliSummary {
  runId: string;
  manifestId: string;
  baselineCommit: string;
  datasetSha256: string;
  itemCount: number;
  plannedItemCount: number;
  realizationCalls: number;
  parseBackCalls: number;
  totalModelCalls: number;
  passedItems: number;
  failedItems: number;
  errorItems: number;
  itemLatencyMs: RetentionPercentileStats;
  realizationLatencyMs: RetentionPercentileStats;
  parseBackLatencyMs: RetentionPercentileStats;
  errorTaxonomy: Record<string, number>;
  unavailableFields: Record<string, number>;
  generatedAt: number;
}

interface AttemptRecord {
  realization?: RetentionStageRawRecord;
  parseBack?: RetentionStageRawRecord;
}

interface RetentionCliOptions {
  root?: string;
  outputRoot?: string;
  client?: RetentionStageClient;
  modelProfilePath?: string;
  mockFixturePath?: string;
}

interface RetentionModelProfile {
  schema: 'openlunum-model-profile/0.1';
  id: string;
  provider: 'openai-compatible';
  baseUrl: string;
  model: string;
  temperature: number;
  seed?: number;
  maxTokens?: number;
  noThink?: boolean;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
}

interface RetentionMockFixtureResponse {
  content?: string;
  finishReason?: string | null;
  usage?: CompletionUsage | null;
  error?: string;
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

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function stats(values: number[]): RetentionPercentileStats {
  if (values.length === 0) {
    return { count: 0, minMs: 0, p50Ms: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, meanMs: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.50),
    p90Ms: percentile(sorted, 0.90),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: total / sorted.length
  };
}

function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('output root')) return 'output_root_containment';
  if (lower.includes('dataset')) return 'dataset_validation';
  if (lower.includes('manifest')) return 'manifest_validation';
  if (lower.includes('timeout')) return 'timeout';
  if (lower.includes('http')) return 'http';
  if (lower.includes('invalid json') || lower.includes('no json object found') || lower.includes('unexpected token')) return 'malformed_output';
  if (lower.includes('parse-back')) return 'parse_back';
  if (lower.includes('realization')) return 'realization';
  if (lower.includes('coverage')) return 'coverage';
  return 'unexpected';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parsePossibleJson(text: string): { payload: Record<string, unknown> | null; rawText: string } {
  const trimmed = text.trim();
  if (!trimmed) return { payload: null, rawText: '' };

  try {
    const parsed = JSON.parse(trimmed);
    return { payload: asRecord(parsed), rawText: trimmed };
  } catch {
    return { payload: null, rawText: trimmed };
  }
}

function realizationPrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: [
      'Perform a faithful realization pass for retention evidence.',
      'Return either a JSON object with realizedText or plain text only.',
      'Do not invent facts.'
    ].join(' '),
    user: JSON.stringify({
      id: item.id,
      sourceLanguage: item.sourceLanguage,
      sourceText: item.sourceText,
      protectedLiterals: item.protectedLiterals ?? []
    })
  };
}

function parseBackPrompt(item: ExperimentItem, realizedText: string): { system: string; user: string } {
  return {
    system: [
      'Parse the realized text back into a compact JSON object.',
      'Return exactly one JSON object with parsedText and sourceLanguage.',
      'Do not add commentary.'
    ].join(' '),
    user: JSON.stringify({
      id: item.id,
      sourceLanguage: item.sourceLanguage,
      realizedText
    })
  };
}

function readDatasetItems(file: string): Promise<ExperimentItem[]> {
  return readFile(file, 'utf8').then((content) => {
    const trimmed = content.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as ExperimentItem[];
    }
    return trimmed.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
      try {
        return JSON.parse(line) as ExperimentItem;
      } catch (error) {
        throw new Error(`Invalid JSONL at ${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
}

async function createDefaultClient(root: string, modelProfilePath?: string): Promise<RetentionStageClient> {
  if (!modelProfilePath || !modelProfilePath.trim()) {
    throw new Error('retention CLI requires --profile <model-profile> when no test-only mock fixture is provided');
  }

  const resolvedProfile = path.isAbsolute(modelProfilePath)
    ? modelProfilePath
    : path.join(root, modelProfilePath);
  const profile = await readJson<RetentionModelProfile>(resolvedProfile);
  return new OpenAICompatibleModel(profile);
}

async function createMockClient(root: string, mockFixturePath: string): Promise<RetentionStageClient> {
  const resolvedFixture = assertContainedPath(
    root,
    path.isAbsolute(mockFixturePath) ? mockFixturePath : path.join(root, mockFixturePath),
    'mock fixture'
  );
  const responses = await readJson<RetentionMockFixtureResponse[]>(resolvedFixture);
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error(`mock fixture must be a non-empty JSON array: ${resolvedFixture}`);
  }

  let index = 0;
  return {
    async complete(): Promise<ModelCompletion> {
      const next = responses[index++] as RetentionMockFixtureResponse | undefined;
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

function buildAttemptMap(records: RetentionStageRawRecord[]): Map<string, Map<number, AttemptRecord>> {
  const grouped = new Map<string, Map<number, AttemptRecord>>();

  for (const record of records) {
    const itemGroup = grouped.get(record.itemId) ?? new Map<number, AttemptRecord>();
    const attemptGroup = itemGroup.get(record.attempt) ?? {};
    attemptGroup[record.stage === 'realization' ? 'realization' : 'parseBack'] = record;
    itemGroup.set(record.attempt, attemptGroup);
    grouped.set(record.itemId, itemGroup);
  }

  return grouped;
}

export function recomputeRetentionSummary(
  records: RetentionStageRawRecord[],
  metadata: {
    runId: string;
    manifestId: string;
    baselineCommit: string;
    datasetSha256: string;
    plannedItemCount: number;
    realizationCalls: number;
    parseBackCalls: number;
    totalModelCalls: number;
  }
): RetentionCliSummary {
  const stageLatencies = {
    realization: [] as number[],
    parseBack: [] as number[]
  };
  const itemLatencies: number[] = [];
  const errorTaxonomy: Record<string, number> = {};
  const unavailableFields: Record<string, number> = {};

  for (const record of records) {
    const stageKey = record.stage === 'realization' ? 'realization' : 'parseBack';
    stageLatencies[stageKey].push(record.latencyMs);
    for (const field of record.unavailableFields) {
      unavailableFields[field] = (unavailableFields[field] ?? 0) + 1;
    }
    if (record.errorClass) {
      const label = record.errorClass;
      errorTaxonomy[label] = (errorTaxonomy[label] ?? 0) + 1;
    }
  }

  const attemptsByItem = buildAttemptMap(records);
  const itemSummaries: RetentionItemSummary[] = [];

  for (const [itemId, attempts] of attemptsByItem) {
    const orderedAttempts = [...attempts.entries()].sort((a, b) => a[0] - b[0]);
    let finalStatus: RetentionStageStatus = 'failed';
    let itemLatency = 0;
    let passed = false;

    for (const [, attempt] of orderedAttempts) {
      const realization = attempt.realization;
      const parseBack = attempt.parseBack;
      if (realization) itemLatency += realization.latencyMs;
      if (parseBack) itemLatency += parseBack.latencyMs;

      if (!realization || realization.status === 'error') {
        finalStatus = realization?.status ?? 'error';
        continue;
      }
      if (!parseBack || parseBack.status === 'error') {
        finalStatus = parseBack?.status ?? 'error';
        continue;
      }
      if (realization.status === 'passed' && parseBack.status === 'passed') {
        finalStatus = 'passed';
        passed = true;
        break;
      }
      finalStatus = 'failed';
    }

    itemSummaries.push({
      itemId,
      status: passed ? 'passed' : finalStatus,
      attempts: orderedAttempts.length,
      latencyMs: itemLatency
    });
    itemLatencies.push(itemLatency);
  }

  const passedItems = itemSummaries.filter((item) => item.status === 'passed').length;
  const failedItems = itemSummaries.filter((item) => item.status === 'failed').length;
  const errorItems = itemSummaries.filter((item) => item.status === 'error').length;

  return {
    runId: metadata.runId,
    manifestId: metadata.manifestId,
    baselineCommit: metadata.baselineCommit,
    datasetSha256: metadata.datasetSha256,
    itemCount: itemSummaries.length,
    plannedItemCount: metadata.plannedItemCount,
    realizationCalls: metadata.realizationCalls,
    parseBackCalls: metadata.parseBackCalls,
    totalModelCalls: metadata.totalModelCalls,
    passedItems,
    failedItems,
    errorItems,
    itemLatencyMs: stats(itemLatencies),
    realizationLatencyMs: stats(stageLatencies.realization),
    parseBackLatencyMs: stats(stageLatencies.parseBack),
    errorTaxonomy,
    unavailableFields,
    generatedAt: Date.now()
  };
}

export async function runRetentionCli(
  manifestPath: string,
  options: RetentionCliOptions = {}
): Promise<{ summary: RetentionCliSummary; outputDirectory: string; rawRecords: RetentionStageRawRecord[] }> {
  const root = options.root ?? await findWorkspaceRoot();
  const manifest = await readJson<RetentionCoverageManifest>(manifestPath);
  const validatedManifest = validateRetentionManifest(manifest);

  const datasetPath = path.isAbsolute(validatedManifest.dataset.path)
    ? validatedManifest.dataset.path
    : path.join(root, validatedManifest.dataset.path);
  const actualHash = await sha256File(datasetPath);
  if (actualHash !== validatedManifest.dataset.sha256) {
    throw new Error(`Dataset hash mismatch: expected ${validatedManifest.dataset.sha256}, got ${actualHash}`);
  }

  const dataset = await readDatasetItems(datasetPath);
  const plan = planRetentionExecution(validatedManifest, dataset);
  const requestedOutputRoot = options.outputRoot ?? path.join('reports', 'evaluations', 'retention');
  const outputRoot = assertContainedPath(root, path.isAbsolute(requestedOutputRoot) ? requestedOutputRoot : path.join(root, requestedOutputRoot), 'output root');
  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const outputDirectory = path.join(outputRoot, runId);
  const rawDirectory = path.join(outputDirectory, 'raw');
  await mkdir(rawDirectory, { recursive: true });

  const client = options.client
    ?? (options.mockFixturePath ? await createMockClient(root, options.mockFixturePath) : await createDefaultClient(root, options.modelProfilePath));

  const rawRecords: RetentionStageRawRecord[] = [];
  const recordLine = async (stage: RetentionStageRawRecord): Promise<void> => {
    rawRecords.push(stage);
    const file = path.join(rawDirectory, `${stage.stage}.jsonl`);
    await appendFile(file, `${JSON.stringify(stage)}\n`, 'utf8');
  };

  for (const itemId of plan.plannedItemIds) {
    const item = dataset.find((entry) => entry.id === itemId);
    if (!item) {
      throw new Error(`planned item missing from dataset: ${itemId}`);
    }

    for (let attempt = 1; attempt <= plan.maxAttemptsPerItem; attempt += 1) {
      const realizationPromptBody = realizationPrompt(item);
      const realizationStarted = performance.now();
      try {
        const completion = await client.complete(realizationPromptBody.system, realizationPromptBody.user);
        const { payload, rawText } = parsePossibleJson(completion.content);
        const realizedText = typeof payload?.realizedText === 'string'
          ? payload.realizedText
          : typeof payload?.text === 'string'
            ? payload.text
            : rawText;
        const realizationRecord: RetentionStageRawRecord = {
          runId,
          manifestId: validatedManifest.id,
          itemId,
          attempt,
          stage: 'realization',
          sourceLanguage: String(item.sourceLanguage ?? ''),
          targetLanguage: String(item.sourceLanguage ?? ''),
          systemPromptSha256: sha256Text(realizationPromptBody.system),
          userPromptSha256: sha256Text(realizationPromptBody.user),
          rawOutput: completion.content,
          extractedPayload: payload,
          realizedText,
          parsedText: null,
          finishReason: completion.finishReason,
          usage: completion.usage,
          unavailableFields: [
            ...(completion.finishReason === null ? ['finishReason'] : []),
            ...(completion.usage === null ? ['usage'] : [])
          ],
          status: realizedText.trim() ? 'passed' : 'failed',
          errorClass: realizedText.trim() ? null : 'empty_output',
          errorMessage: realizedText.trim() ? null : 'realization produced empty output',
          latencyMs: performance.now() - realizationStarted
        };
        await recordLine(realizationRecord);

        if (realizationRecord.status !== 'passed') {
          continue;
        }

        const parsePromptBody = parseBackPrompt(item, realizedText);
        const parseStarted = performance.now();
        try {
          const parseCompletion = await client.complete(parsePromptBody.system, parsePromptBody.user);
          const { payload: parsePayload, rawText: parseRawText } = parsePossibleJson(parseCompletion.content);
          const parsedText = typeof parsePayload?.parsedText === 'string'
            ? parsePayload.parsedText
            : typeof parsePayload?.text === 'string'
              ? parsePayload.text
              : '';
          const parseRecord: RetentionStageRawRecord = {
            runId,
            manifestId: validatedManifest.id,
            itemId,
            attempt,
            stage: 'parse-back',
            sourceLanguage: String(item.sourceLanguage ?? ''),
            targetLanguage: String(item.sourceLanguage ?? ''),
            systemPromptSha256: sha256Text(parsePromptBody.system),
            userPromptSha256: sha256Text(parsePromptBody.user),
            rawOutput: parseCompletion.content,
            extractedPayload: parsePayload,
            realizedText: null,
            parsedText: parsedText || parseRawText,
            finishReason: parseCompletion.finishReason,
            usage: parseCompletion.usage,
            unavailableFields: [
              ...(parseCompletion.finishReason === null ? ['finishReason'] : []),
              ...(parseCompletion.usage === null ? ['usage'] : [])
            ],
            status: parsePayload && (typeof parsePayload.parsedText === 'string' || typeof parsePayload.text === 'string')
              ? 'passed'
              : 'failed',
            errorClass: parsePayload && (typeof parsePayload.parsedText === 'string' || typeof parsePayload.text === 'string')
              ? null
              : 'validation_error',
            errorMessage: parsePayload && (typeof parsePayload.parsedText === 'string' || typeof parsePayload.text === 'string')
              ? null
              : 'parse-back output must be a JSON object with parsedText or text',
            latencyMs: performance.now() - parseStarted
          };
          await recordLine(parseRecord);

          if (parseRecord.status === 'passed') {
            break;
          }
        } catch (error) {
          await recordLine({
            runId,
            manifestId: validatedManifest.id,
            itemId,
            attempt,
            stage: 'parse-back',
            sourceLanguage: String(item.sourceLanguage ?? ''),
            targetLanguage: String(item.sourceLanguage ?? ''),
            systemPromptSha256: sha256Text(parsePromptBody.system),
            userPromptSha256: sha256Text(parsePromptBody.user),
            rawOutput: '',
            extractedPayload: null,
            realizedText: null,
            parsedText: null,
            finishReason: null,
            usage: null,
            unavailableFields: ['finishReason', 'usage'],
            status: 'error',
            errorClass: classifyError(error),
            errorMessage: error instanceof Error ? error.message : String(error),
            latencyMs: performance.now() - parseStarted
          });
        }
      } catch (error) {
        await recordLine({
          runId,
          manifestId: validatedManifest.id,
          itemId,
          attempt,
          stage: 'realization',
          sourceLanguage: String(item.sourceLanguage ?? ''),
          targetLanguage: String(item.sourceLanguage ?? ''),
          systemPromptSha256: sha256Text(realizationPromptBody.system),
          userPromptSha256: sha256Text(realizationPromptBody.user),
          rawOutput: '',
          extractedPayload: null,
          realizedText: null,
          parsedText: null,
          finishReason: null,
          usage: null,
          unavailableFields: ['finishReason', 'usage'],
          status: 'error',
          errorClass: classifyError(error),
          errorMessage: error instanceof Error ? error.message : String(error),
          latencyMs: performance.now() - realizationStarted
        });
      }
    }
  }

  const summary = recomputeRetentionSummary(rawRecords, {
    runId,
    manifestId: validatedManifest.id,
    baselineCommit: validatedManifest.baselineCommit,
    datasetSha256: validatedManifest.dataset.sha256,
    plannedItemCount: plan.plannedItemIds.length,
    realizationCalls: plan.realizationCalls,
    parseBackCalls: plan.parseBackCalls,
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
    startedAt: new Date().toISOString()
  });
  await writeFile(
    path.join(outputDirectory, 'report.md'),
    [
      `# Retention run ${validatedManifest.id}`,
      '',
      `- Run: ${runId}`,
      `- Items: ${summary.itemCount}`,
      `- Passed: ${summary.passedItems}`,
      `- Failed: ${summary.failedItems}`,
      `- Errors: ${summary.errorItems}`,
      `- Realization p95 ms: ${summary.realizationLatencyMs.p95Ms.toFixed(3)}`,
      `- Parse-back p95 ms: ${summary.parseBackLatencyMs.p95Ms.toFixed(3)}`
    ].join('\n') + '\n',
    'utf8'
  );

  return { summary, outputDirectory, rawRecords };
}
