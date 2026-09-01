/**
 * Parse experiment runner for EN/EL/ES/ID.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { canonicalizeSem, compareSem, NearSemanticFingerprintGenerator, stableStringify, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File, validateManifest, validateProfile, writeJson } from './io.js';
import { effectiveSystemPrompt, ModelResponseError, OpenAICompatibleModel } from './model.js';
import { parsePrompt } from './prompts.js';
import { checkProtectedLiteralPlacement, protectedLiteralPlacementCoverage } from './protected-literal-placement.js';
import type { DatasetItem, ExperimentManifest, ItemResult, ModelCompletion, ModelIdentityEvidence, ModelProfile, ParseAttemptEvidence, ParseRunProvenance } from './types.js';

export type ParseLanguage = 'en' | 'el' | 'es' | 'id' | 'fr' | 'de' | 'ja' | 'zh' | 'pt' | 'ar';
export const PARSE_PROMPT_VERSION = 'parse-prompt/3';
export const PARSE_LANGUAGES: ParseLanguage[] = ['en', 'el', 'es', 'id', 'fr', 'de', 'ja', 'zh', 'pt', 'ar'];
export const PARSE_LANGUAGE_LABELS: Record<ParseLanguage, string> = {
  en: 'English',
  el: 'Greek',
  es: 'Spanish',
  id: 'Indonesian',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese',
  pt: 'Portuguese',
  ar: 'Arabic'
};

export interface LanguageMetrics {
  language: ParseLanguage;
  languageLabel: string;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  errorItems: number;
  exactRate: number;
  nearSemanticRate: number;
  featureRecall: number;
  featurePrecision: number;
  meanLatencyMs: number;
  fingerprintMatches: number;
  exactFingerprintCount: number;
  nearSemanticFingerprintCount: number;
  schemaValidityRate: number;
  canonicalExactRate: number;
  featureBreakdown: Record<string, FeatureMetric>;
  abstentionAccuracy: number | null;
}

export interface FeatureMetric {
  expected: number;
  matched: number;
  recall: number;
  precision: number;
}

export interface ParseExperimentReport {
  experimentId: string;
  runId: string;
  task: string;
  totalItems: number;
  totalPassed: number;
  totalFailed: number;
  totalErrors: number;
  overallExactRate: number;
  overallNearSemanticRate: number;
  overallFeatureRecall: number;
  overallFeaturePrecision: number;
  overallMeanLatencyMs: number;
  languageMetrics: LanguageMetrics[];
  crossLanguageComparison: CrossLanguageComparison;
  languageBreakdown: Record<ParseLanguage, number[]>;
  failureModes: Record<string, number>;
  featureBreakdown: Record<string, FeatureMetric>;
  abstentionAccuracy: number | null;
  provenance: ParseRunProvenance;
}

export interface CrossLanguageComparison {
  languagesIncluded: ParseLanguage[];
  bestExactLanguage: ParseLanguage | null;
  bestRecallLanguage: ParseLanguage | null;
  fastestLanguage: ParseLanguage | null;
  consistencyScore: number;
  variance: Record<string, number>;
}

export function extractStructuredJson(text: string): unknown {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
    throw new Error('Model output must be exactly one JSON object (optionally in one JSON code fence)');
  }
  return JSON.parse(candidate);
}

function computeVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isAbstention(value: unknown): value is { status: 'abstain'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.status === 'abstain'
    && typeof candidate.reason === 'string'
    && candidate.reason.trim().length > 0;
}

function semanticFeatureSets(sem: LunumSem): Record<string, Set<string>> {
  const canonical = canonicalizeSem(sem);
  const sets: Record<string, Set<string>> = {
    predicate: new Set(), role: new Set(), literal: new Set(), negation: new Set(), modality: new Set(),
    condition: new Set(), consequence: new Set(), reference: new Set()
  };
  const walk = (clauses: typeof canonical.clauses, prefix: string): void => {
    clauses.forEach((clause, index) => {
      const path = `${prefix}${index}`;
      sets.predicate!.add(`${path}:${clause.predicate}`);
      sets.negation!.add(`${path}:${clause.negated === true}`);
      if (clause.modality !== undefined) sets.modality!.add(`${path}:${String(clause.modality)}`);
      for (const [role, value] of Object.entries(clause.roles ?? {})) {
        const encoded = stableStringify(value);
        sets.role!.add(`${path}:${role}`);
        sets.literal!.add(`${path}:${role}:${encoded}`);
      }
      if (clause.conditions?.length) sets.condition!.add(`${path}:${clause.conditions.length}`);
      if (clause.consequences?.length) sets.consequence!.add(`${path}:${clause.consequences.length}`);
      walk(clause.conditions ?? [], `${path}.condition.`);
      walk(clause.consequences ?? [], `${path}.consequence.`);
    });
  };
  walk(canonical.clauses, '');
  for (const [index, reference] of (canonical.references ?? []).entries()) sets.reference!.add(`${index}:${stableStringify(reference)}`);
  return sets;
}

function featureMetrics(gold: LunumSem, actual: LunumSem): Record<string, FeatureMetric> {
  const expected = semanticFeatureSets(gold);
  const observed = semanticFeatureSets(actual);
  return Object.fromEntries(Object.keys(expected).map((name) => {
    const left = expected[name]!;
    const right = observed[name]!;
    const matched = [...left].filter((feature) => right.has(feature)).length;
    return [name, { expected: left.size, matched, recall: left.size > 0 ? matched / left.size : 1, precision: right.size > 0 ? matched / right.size : 1 }];
  }));
}

function gitCommit(root: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function gitWorkingTreeClean(root: string): boolean {
  try {
    // The operator may have unrelated, intentionally preserved work in the
    // checkout.  Attest the evaluated source/data scope, not an unrelated
    // report or integration edit elsewhere in the repository.
    const scoped = [
      'packages/core', 'packages/eval', 'schemas/model-profile.schema.json',
      'profiles/models/superqwen3.8-27b-abliterated-live.json',
      'datasets/dev/stage2-heldout-v1.jsonl', 'datasets/dev/stage2-heldout-v2.jsonl',
      'datasets/dev/stage2-retrieval-v1.jsonl', 'datasets/adversarial/critical-semantic-differences-v1.jsonl',
      'datasets/manifests/stage2-heldout-v1.json', 'datasets/manifests/stage2-heldout-v2.json',
      'datasets/manifests/stage2-retrieval-v1.json', 'datasets/manifests/critical-semantic-differences-v1.json',
      'experiments/parse-stage2-superqwen-diagnostic/experiment.json',
      'experiments/parse-stage2-superqwen-frozen/experiment.json'
    ];
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...scoped], { cwd: root, encoding: 'utf8' });
    return status.trim().length === 0;
  } catch {
    return false;
  }
}

function gitCommitResolvable(root: string, revision: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function advertisedModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const entries = (payload as { data?: unknown }).data;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
    ? [(entry as { id: string }).id]
    : []);
}

async function verifyModelIdentity(model: OpenAICompatibleModel, profile: ModelProfile): Promise<ModelIdentityEvidence> {
  try {
    const ids = advertisedModelIds(await model.doctor());
    const metadata = profile.metadata?.modelFile;
    const modelFileIdentity = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata as ModelIdentityEvidence['modelFileIdentity']
      : undefined;
    const identity: ModelIdentityEvidence = {
      requestedModel: profile.model,
      advertisedModelIds: ids,
      verified: ids.includes(profile.model),
      endpoint: profile.baseUrl,
      ...(modelFileIdentity ? { modelFileIdentity } : {})
    };
    if (ids.includes(profile.model)) identity.reportedModelId = profile.model;
    return identity;
  } catch (error) {
    return {
      requestedModel: profile.model,
      advertisedModelIds: [],
      verified: false,
      endpoint: profile.baseUrl,
      verificationError: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runParseExperiment(
  manifestPath: string
): Promise<{ report: ParseExperimentReport; outputDirectory: string }> {
  const root = await findWorkspaceRoot();
  const manifest = await readJson<ExperimentManifest>(manifestPath);
  validateManifest(manifest);
  if (!manifest.dataset) throw new Error('Parse experiment requires dataset');
  if (!manifest.modelProfile) throw new Error('Parse experiment requires modelProfile');

  const datasetPath = path.isAbsolute(manifest.dataset.path)
    ? manifest.dataset.path
    : path.join(root, manifest.dataset.path);
  const modelProfilePath = path.isAbsolute(manifest.modelProfile)
    ? manifest.modelProfile
    : path.join(root, manifest.modelProfile);

  const actualHash = await sha256File(datasetPath);
  if (actualHash !== manifest.dataset.sha256) {
    throw new Error(`Dataset hash mismatch: expected ${manifest.dataset.sha256}, got ${actualHash}`);
  }

  const items = ((await loadDataset(datasetPath)) as DatasetItem[]).slice(0, manifest.limits.maxItems);
  const profile = await readJson<ModelProfile>(modelProfilePath);
  validateProfile(profile);
  const schemaPath = path.join(root, 'schemas/lunum-sem.schema.json');
  const semSchema = await readJson<Record<string, unknown>>(schemaPath);
  const extractionSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://openlunum.org/schemas/semantic-extraction-result/0.1',
    title: 'OpenLunum semantic extraction result',
    oneOf: [semSchema, {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'reason'],
      properties: {
        status: { const: 'abstain' },
        reason: { type: 'string', minLength: 1 }
      }
    }]
  } as Record<string, unknown>;
  const schemaVersion = 'semantic-extraction-result/0.1';
  const schemaSha256 = sha256Text(stableStringify(extractionSchema));
  const structuredOutput = {
    mode: 'json_schema' as const,
    schema: extractionSchema,
    strict: true,
    fallback: 'json_object' as const
  };

  const startedAt = new Date().toISOString();
  const modelIdentity = await verifyModelIdentity(new OpenAICompatibleModel(profile), profile);
  const codeCommit = gitCommit(root);
  const baselineCommitResolvable = gitCommitResolvable(root, manifest.baselineCommit);
  const promptProbe = items[0] ? parsePrompt(items[0]) : null;
  const effectiveSystemPromptSha256 = promptProbe ? sha256Text(effectiveSystemPrompt(profile, promptProbe.system)) : null;

  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const outputRoot = path.isAbsolute(manifest.outputDirectory)
    ? manifest.outputDirectory
    : path.join(root, manifest.outputDirectory);
  const output = path.join(outputRoot, runId);
  await mkdir(output, { recursive: true });

  const byLanguage = new Map<ParseLanguage, DatasetItem[]>(PARSE_LANGUAGES.map((language) => [language, []]));
  for (const item of items) {
    const language = item.sourceLanguage as ParseLanguage;
    byLanguage.get(language)?.push(item);
  }

  const languageResults = new Map<ParseLanguage, ItemResult[]>();
  const nearSemantic = new NearSemanticFingerprintGenerator(0.8);
  let calls = 0;

  for (const [language, languageItems] of byLanguage) {
    if (languageItems.length === 0) continue;
    const model = new OpenAICompatibleModel(profile);
    const results: ItemResult[] = [];
    for (const item of languageItems) {
      if (calls >= manifest.limits.maxModelCalls) break;
      let finalResult: ItemResult | null = null;
      const attempts: ParseAttemptEvidence[] = [];

      for (let attempt = 1; attempt <= manifest.limits.maxAttemptsPerItem && calls < manifest.limits.maxModelCalls; attempt += 1) {
        const started = performance.now();
        let rawOutput = '';
        let rawRequest: unknown;
        let rawResponse: unknown;
        let completion: ModelCompletion | undefined;
        let systemPromptSha256: string | null = null;
        let userPromptSha256: string | null = null;
        try {
          const prompt = parsePrompt(item);
          const effectiveSystem = effectiveSystemPrompt(profile, prompt.system);
          systemPromptSha256 = sha256Text(effectiveSystem);
          userPromptSha256 = sha256Text(prompt.user);
          calls += 1;
          completion = await model.complete(prompt.system, prompt.user, { structuredOutput });
          rawOutput = completion.content;
          rawRequest = completion.rawRequest;
          rawResponse = completion.rawResponse;
          const parsed = extractStructuredJson(rawOutput);
          const expectedOutcome = item.expectedOutcome ?? 'parse';
          if (isAbstention(parsed)) {
            finalResult = {
              id: item.id,
              status: expectedOutcome === 'abstain' || item.goldSem === null ? 'passed' : 'failed',
              rawOutput,
              rawRequest,
              rawResponse,
              systemPromptSha256,
              userPromptSha256,
              abstained: true,
              ...(expectedOutcome === 'abstain' || item.goldSem === null ? {} : {
                featureRecall: 0,
                featurePrecision: 0,
                missingFeatures: ['model abstained for a representable item']
              }),
              completion,
              latencyMs: performance.now() - started
            };
            attempts.push({
              attempt,
              status: finalResult.status,
              rawOutput,
              rawRequest,
              rawResponse,
              systemPromptSha256,
              userPromptSha256,
              latencyMs: finalResult.latencyMs
            });
            break;
          }

          const validation = validateSem(parsed);
          if (!validation.ok) throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
          if (expectedOutcome === 'abstain' || item.goldSem === null) {
            finalResult = {
              id: item.id,
              status: 'failed',
              rawOutput,
              rawRequest,
              rawResponse,
              systemPromptSha256,
              userPromptSha256,
              parsedSem: parsed as LunumSem,
              abstained: false,
              featureRecall: 0,
              featurePrecision: 0,
              missingFeatures: ['expected abstention but model returned a semantic candidate'],
              completion,
              latencyMs: performance.now() - started
            };
            attempts.push({
              attempt,
              status: finalResult.status,
              rawOutput,
              rawRequest,
              rawResponse,
              systemPromptSha256,
              userPromptSha256,
              latencyMs: finalResult.latencyMs
            });
            break;
          }

          const goldSem = item.goldSem;
          const parsedSem = parsed as LunumSem;
          const comparison = compareSem(goldSem, parsedSem);
          const perFeature = featureMetrics(goldSem, parsedSem);
          const nearResult = nearSemantic.compareSem(goldSem, parsedSem, {
            protectedLiterals: item.protectedLiterals ?? []
          });
          const nearOnly = !comparison.exactFingerprint && nearResult.similar;

          // Placement-aware protected literal check (issue #329): verifies each
          // declared protectedLiteral lands in the same structural role it
          // occupies in goldSem, not merely anywhere in the serialised output.
          // Diagnostic only - does not affect status/exact/gates.
          const literalPlacement = checkProtectedLiteralPlacement(goldSem, parsedSem, item.protectedLiterals ?? []);

          finalResult = {
            id: item.id,
            status: comparison.exactFingerprint ? 'passed' : 'failed',
            rawOutput,
            rawRequest,
            rawResponse,
            systemPromptSha256,
            userPromptSha256,
            parsedSem,
            exact: comparison.exactFingerprint,
            nearSemantic: nearOnly,
            nearSemanticScore: nearResult.similarity,
            featureRecall: comparison.featureRecall,
            featurePrecision: comparison.featurePrecision,
            featureMetrics: perFeature,
            missingFeatures: comparison.missingFeatures,
            protectedLiteralPlacement: literalPlacement,
            protectedLiteralPlacementCoverage: protectedLiteralPlacementCoverage(literalPlacement),
            completion,
            latencyMs: performance.now() - started
          };
          attempts.push({
            attempt,
            status: finalResult.status,
            rawOutput,
            rawRequest,
            rawResponse,
            systemPromptSha256,
            userPromptSha256,
            latencyMs: finalResult.latencyMs
          });
          if (finalResult.status === 'passed') break;
        } catch (error) {
          const message = `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`;
          const latencyMs = performance.now() - started;
          if (error instanceof ModelResponseError) {
            rawResponse = error.rawResponse;
            rawRequest = error.rawRequest;
          }
          finalResult = {
            id: item.id,
            status: 'error',
            rawOutput,
            ...(rawRequest !== undefined ? { rawRequest } : {}),
            ...(rawResponse !== undefined ? { rawResponse } : {}),
            ...(completion ? { completion } : {}),
            ...(systemPromptSha256 ? { systemPromptSha256 } : {}),
            ...(userPromptSha256 ? { userPromptSha256 } : {}),
            error: message,
            latencyMs
          };
          attempts.push({
            attempt,
            status: 'error',
            rawOutput,
            ...(rawRequest !== undefined ? { rawRequest } : {}),
            ...(rawResponse !== undefined ? { rawResponse } : {}),
            systemPromptSha256,
            userPromptSha256,
            error: message,
            latencyMs
          });
        }
      }

      if (finalResult) results.push({ ...finalResult, attempts });
    }

    languageResults.set(language, results);
  }

  const languageMetrics: LanguageMetrics[] = [];
  const languageBreakdown: Record<ParseLanguage, number[]> = {
    en: [0, 0, 0, 0], el: [0, 0, 0, 0], es: [0, 0, 0, 0], id: [0, 0, 0, 0],
    fr: [0, 0, 0, 0], de: [0, 0, 0, 0], ja: [0, 0, 0, 0], zh: [0, 0, 0, 0],
    pt: [0, 0, 0, 0], ar: [0, 0, 0, 0]
  };
  const failureModes: Record<string, number> = {};
  const aggregateFeatures: Record<string, { expected: number; matched: number; observed: number }> = {};
  let totalItems = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;
  let totalExactRate = 0;
  let totalNearSemanticRate = 0;
  let totalFeatureRecall = 0;
  let totalFeaturePrecision = 0;
  let totalLatencyMs = 0;
  let abstentionExpected = 0;
  let abstentionCorrect = 0;

  for (const language of PARSE_LANGUAGES) {
    const results = languageResults.get(language) ?? [];
    const total = results.length;
    const passed = results.filter((result) => result.status === 'passed').length;
    const failed = results.filter((result) => result.status === 'failed').length;
    const errors = results.filter((result) => result.status === 'error').length;
    const exactCount = results.filter((result) => result.exact === true).length;
    const nearCount = results.filter((result) => result.nearSemantic === true).length;
    const exactRate = total > 0 ? exactCount / total : 0;
    const nearSemanticRate = total > 0 ? nearCount / total : 0;
    const featureRecall = total > 0 ? results.reduce((sum, result) => sum + (result.featureRecall ?? 0), 0) / total : 0;
    const featurePrecision = total > 0 ? results.reduce((sum, result) => sum + (result.featurePrecision ?? 0), 0) / total : 0;
    const meanLatencyMs = total > 0 ? results.reduce((sum, result) => sum + result.latencyMs, 0) / total : 0;
    const languageFeatures: Record<string, { expected: number; matched: number; observed: number }> = {};
    const languageItems = byLanguage.get(language) ?? [];
    const expectedAbstentions = languageItems.filter((item) => item.expectedOutcome === 'abstain' || item.goldSem === null).length;
    const correctAbstentions = results.filter((result, index) => {
      const item = languageItems[index];
      return (item?.expectedOutcome === 'abstain' || item?.goldSem === null) && result.abstained === true;
    }).length;
    abstentionExpected += expectedAbstentions;
    abstentionCorrect += correctAbstentions;
    for (const result of results) {
      for (const [name, values] of Object.entries(result.featureMetrics ?? {})) {
        const aggregate = aggregateFeatures[name] ?? { expected: 0, matched: 0, observed: 0 };
        aggregate.expected += values.expected;
        aggregate.matched += values.matched;
        aggregate.observed += values.expected * values.precision;
        aggregateFeatures[name] = aggregate;
        const local = languageFeatures[name] ?? { expected: 0, matched: 0, observed: 0 };
        local.expected += values.expected;
        local.matched += values.matched;
        local.observed += values.expected * values.precision;
        languageFeatures[name] = local;
      }
    }
    const breakdown = Object.fromEntries(Object.entries(languageFeatures).map(([name, values]) => [name, {
      expected: values.expected,
      matched: values.matched,
      recall: values.expected > 0 ? values.matched / values.expected : 1,
      precision: values.observed > 0 ? values.matched / values.observed : 1,
    }]));

    languageMetrics.push({
      language,
      languageLabel: PARSE_LANGUAGE_LABELS[language],
      totalItems: total,
      passedItems: passed,
      failedItems: failed,
      errorItems: errors,
      exactRate,
      nearSemanticRate,
      featureRecall,
      featurePrecision,
      meanLatencyMs,
      fingerprintMatches: exactCount,
      exactFingerprintCount: exactCount,
      nearSemanticFingerprintCount: nearCount
      ,schemaValidityRate: total > 0 ? results.filter((result) => result.status !== 'error').length / total : 0
      ,canonicalExactRate: exactRate
      ,featureBreakdown: breakdown
      ,abstentionAccuracy: expectedAbstentions > 0 ? correctAbstentions / expectedAbstentions : null
    });

    languageBreakdown[language] = [passed, failed, errors, total];
    totalItems += total;
    totalPassed += passed;
    totalFailed += failed;
    totalErrors += errors;
    totalExactRate += exactRate;
    totalNearSemanticRate += nearSemanticRate;
    totalFeatureRecall += featureRecall;
    totalFeaturePrecision += featurePrecision;
    totalLatencyMs += meanLatencyMs;

    for (const result of results) {
      if (result.status === 'failed') {
        for (const feature of result.missingFeatures ?? []) {
          failureModes[feature] = (failureModes[feature] ?? 0) + 1;
        }
      }
      if (result.status === 'error') {
        const mode = `error: ${result.error?.slice(0, 50) ?? 'unknown'}`;
        failureModes[mode] = (failureModes[mode] ?? 0) + 1;
      }
    }
  }

  const languagesIncluded = languageMetrics.filter((metrics) => metrics.totalItems > 0).map((metrics) => metrics.language);
  const bestExactLanguage = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, language) => {
        const current = languageMetrics.find((metrics) => metrics.language === language)!;
        const bestMetrics = languageMetrics.find((metrics) => metrics.language === best);
        return current.exactRate > (bestMetrics?.exactRate ?? 0) ? language : best;
      }, languagesIncluded[0]!)
    : null;
  const bestRecallLanguage = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, language) => {
        const current = languageMetrics.find((metrics) => metrics.language === language)!;
        const bestMetrics = languageMetrics.find((metrics) => metrics.language === best);
        return current.featureRecall > (bestMetrics?.featureRecall ?? 0) ? language : best;
      }, languagesIncluded[0]!)
    : null;
  const fastestLanguage = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, language) => {
        const current = languageMetrics.find((metrics) => metrics.language === language)!;
        const bestMetrics = languageMetrics.find((metrics) => metrics.language === best);
        return current.meanLatencyMs < (bestMetrics?.meanLatencyMs ?? Infinity) ? language : best;
      }, languagesIncluded[0]!)
    : null;

  const exactRates = languageMetrics.filter((metrics) => metrics.totalItems > 0).map((metrics) => metrics.exactRate);
  const consistencyScore = exactRates.length > 1 ? 1 - (Math.max(...exactRates) - Math.min(...exactRates)) : 1;
  const variance = languagesIncluded.length > 1
    ? {
        exactRateVariance: computeVariance(exactRates),
        recallVariance: computeVariance(languageMetrics.filter((metrics) => metrics.totalItems > 0).map((metrics) => metrics.featureRecall)),
        latencyVariance: computeVariance(languageMetrics.filter((metrics) => metrics.totalItems > 0).map((metrics) => metrics.meanLatencyMs))
      }
    : { exactRateVariance: 0, recallVariance: 0, latencyVariance: 0 };

  const crossLanguageComparison: CrossLanguageComparison = {
    languagesIncluded,
    bestExactLanguage,
    bestRecallLanguage,
    fastestLanguage,
    consistencyScore,
    variance
  };
  const featureBreakdown = Object.fromEntries(Object.entries(aggregateFeatures).map(([name, values]) => [name, {
    expected: values.expected,
    matched: values.matched,
    recall: values.expected > 0 ? values.matched / values.expected : 1,
    precision: values.observed > 0 ? values.matched / values.observed : 1,
  }]));
  const languageCount = languagesIncluded.length;
  const invalidReasons: string[] = [];
  const workingTreeClean = gitWorkingTreeClean(root);
  if (!codeCommit) invalidReasons.push('current git commit could not be resolved');
  if (!workingTreeClean) invalidReasons.push('working tree was dirty during the run; commit does not identify executed source');
  if (!baselineCommitResolvable) invalidReasons.push(`baselineCommit is not a resolvable commit: ${manifest.baselineCommit}`);
  if (!modelIdentity.verified) invalidReasons.push('endpoint did not verify the requested model through GET /models');
  if (!effectiveSystemPromptSha256) invalidReasons.push('no effective system prompt was captured');
  const provenance: ParseRunProvenance = {
    startedAt,
    completedAt: new Date().toISOString(),
    codeCommit,
    baselineCommit: manifest.baselineCommit,
    baselineCommitResolvable,
    datasetPath: manifest.dataset.path,
    datasetSha256: actualHash,
    modelProfileSha256: await sha256File(modelProfilePath),
    modelProfileId: profile.id,
    modelIdentity,
    effectiveSystemPromptSha256,
    workingTreeClean,
    promptVersion: PARSE_PROMPT_VERSION,
    schemaVersion,
    schemaSha256,
    structuredOutputMode: 'json-schema',
    decoding: {
      temperature: profile.temperature,
      ...(profile.seed !== undefined ? { seed: profile.seed } : {}),
      maxTokens: profile.maxTokens,
      chatTemplateKwargs: profile.chatTemplateKwargs ?? null
    },
    evidenceValid: invalidReasons.length === 0,
    invalidReasons
  };
  const report: ParseExperimentReport = {
    experimentId: manifest.id,
    runId,
    task: manifest.task,
    totalItems,
    totalPassed,
    totalFailed,
    totalErrors,
    overallExactRate: languageCount > 0 ? totalExactRate / languageCount : 0,
    overallNearSemanticRate: languageCount > 0 ? totalNearSemanticRate / languageCount : 0,
    overallFeatureRecall: languageCount > 0 ? totalFeatureRecall / languageCount : 0,
    overallFeaturePrecision: languageCount > 0 ? totalFeaturePrecision / languageCount : 0,
    overallMeanLatencyMs: languageCount > 0 ? totalLatencyMs / languageCount : 0,
    languageMetrics,
    crossLanguageComparison,
    languageBreakdown,
    failureModes,
    featureBreakdown,
    abstentionAccuracy: abstentionExpected > 0 ? abstentionCorrect / abstentionExpected : null,
    provenance
  };

  for (const [language, results] of languageResults) {
    const resultPath = path.join(output, `parse-results-${language}.jsonl`);
    await writeFile(resultPath, '', 'utf8');
    for (const result of results) await appendFile(resultPath, `${JSON.stringify(result)}\n`, 'utf8');
  }
  await writeJson(path.join(output, 'parse-summary.json'), report);

  for (const metrics of languageMetrics) {
    const markdown = `# Parse Report: ${metrics.languageLabel} (${metrics.language})

- Items: ${metrics.totalItems}
- Passed: ${metrics.passedItems}
- Failed: ${metrics.failedItems}
- Errors: ${metrics.errorItems}
- Exact Rate: ${metrics.exactRate.toFixed(4)}
- Near-Semantic-Only Rate: ${metrics.nearSemanticRate.toFixed(4)}
- Feature Recall: ${metrics.featureRecall.toFixed(4)}
- Feature Precision: ${metrics.featurePrecision.toFixed(4)}
- Mean Latency: ${metrics.meanLatencyMs.toFixed(2)}ms
- Exact Fingerprint Matches: ${metrics.exactFingerprintCount}
- Near-Semantic-Only Matches: ${metrics.nearSemanticFingerprintCount}
`;
    await writeFile(path.join(output, `report-${metrics.language}.md`), markdown, 'utf8');
  }

  const crossMarkdown = `# Cross-Language Parse Comparison

## Overview
- Experiment: ${manifest.id}
- Run: ${runId}
- Total Items: ${totalItems}
- Total Passed: ${totalPassed}
- Total Failed: ${totalFailed}
- Total Errors: ${totalErrors}

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
${languageMetrics.map((metrics) => `| ${metrics.languageLabel} (${metrics.language}) | ${metrics.totalItems} | ${metrics.passedItems} | ${metrics.exactRate.toFixed(4)} | ${metrics.nearSemanticRate.toFixed(4)} | ${metrics.featureRecall.toFixed(4)} | ${metrics.featurePrecision.toFixed(4)} | ${metrics.meanLatencyMs.toFixed(2)} |`).join('\n')}

## Cross-Language Analysis
- Best Exact Rate: ${crossLanguageComparison.bestExactLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.bestExactLanguage] : 'N/A'}
- Best Recall: ${crossLanguageComparison.bestRecallLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.bestRecallLanguage] : 'N/A'}
- Fastest: ${crossLanguageComparison.fastestLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.fastestLanguage] : 'N/A'}
- Overall Near-Semantic-Only Rate: ${report.overallNearSemanticRate.toFixed(4)}
- Consistency Score: ${crossLanguageComparison.consistencyScore.toFixed(4)}

## Variance
- Exact Rate Variance: ${variance.exactRateVariance.toFixed(6)}
- Recall Variance: ${variance.recallVariance.toFixed(6)}
- Latency Variance: ${variance.latencyVariance.toFixed(6)}

## Failure Modes
${Object.entries(failureModes).map(([mode, count]) => `- ${mode}: ${count}`).join('\n') || '- None'}
`;
  await writeFile(path.join(output, 'cross-language-report.md'), crossMarkdown, 'utf8');
  await writeJson(path.join(output, 'manifest.snapshot.json'), manifest);
  await writeJson(path.join(output, 'environment.json'), {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    modelProfile: profile,
    codeCommit,
    modelIdentity,
    prompt: {
      version: PARSE_PROMPT_VERSION,
      systemSha256: effectiveSystemPromptSha256,
    },
    decoding: {
      ...provenance.decoding,
      structuredOutputMode: provenance.structuredOutputMode
    },
    provenance
  });

  return { report, outputDirectory: output };
}

export async function runParseExperimentCli(): Promise<string> {
  const manifestArg = process.argv[3];
  if (!manifestArg) throw new Error('Usage: node cli.js parse-experiment <manifest-path>');
  const root = await findWorkspaceRoot();
  const resolved = path.isAbsolute(manifestArg) ? manifestArg : path.join(root, manifestArg);
  const { outputDirectory } = await runParseExperiment(resolved);
  console.log(outputDirectory);
  return outputDirectory;
}
