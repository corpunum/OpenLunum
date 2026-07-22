/**
 * Parse experiment runner for EN/EL/ES/ID.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareSem, NearSemanticFingerprintGenerator, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File, validateManifest, validateProfile, writeJson } from './io.js';
import { OpenAICompatibleModel } from './model.js';
import { parsePrompt } from './prompts.js';
import type { DatasetItem, ExperimentManifest, ItemResult, ModelProfile } from './types.js';

export type ParseLanguage = 'en' | 'el' | 'es' | 'id';
export const PARSE_LANGUAGES: ParseLanguage[] = ['en', 'el', 'es', 'id'];
export const PARSE_LANGUAGE_LABELS: Record<ParseLanguage, string> = {
  en: 'English',
  el: 'Greek',
  es: 'Spanish',
  id: 'Indonesian'
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
}

export interface CrossLanguageComparison {
  languagesIncluded: ParseLanguage[];
  bestExactLanguage: ParseLanguage | null;
  bestRecallLanguage: ParseLanguage | null;
  fastestLanguage: ParseLanguage | null;
  consistencyScore: number;
  variance: Record<string, number>;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

function computeVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
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

  for (const [language, languageItems] of byLanguage) {
    if (languageItems.length === 0) continue;
    const model = new OpenAICompatibleModel(profile);
    const results: ItemResult[] = [];
    let calls = 0;

    for (const item of languageItems) {
      if (calls >= manifest.limits.maxModelCalls) break;
      let finalResult: ItemResult | null = null;

      for (let attempt = 1; attempt <= manifest.limits.maxAttemptsPerItem && calls < manifest.limits.maxModelCalls; attempt += 1) {
        const started = performance.now();
        let rawOutput = '';
        try {
          const prompt = parsePrompt(item);
          calls += 1;
          const completion = await model.complete(prompt.system, prompt.user);
          rawOutput = completion.content;
          const parsed = extractJson(rawOutput);
          const validation = validateSem(parsed);
          if (!validation.ok) throw new Error(`Validation failed: ${validation.errors.join('; ')}`);

          const goldSem = item.goldSem as LunumSem;
          const parsedSem = parsed as LunumSem;
          const comparison = compareSem(goldSem, parsedSem);
          const nearResult = nearSemantic.compareSem(goldSem, parsedSem, {
            protectedLiterals: item.protectedLiterals ?? []
          });
          const nearOnly = !comparison.exactFingerprint && nearResult.similar;

          finalResult = {
            id: item.id,
            status: comparison.exactFingerprint ? 'passed' : 'failed',
            rawOutput,
            parsedSem,
            exact: comparison.exactFingerprint,
            nearSemantic: nearOnly,
            nearSemanticScore: nearResult.similarity,
            featureRecall: comparison.featureRecall,
            featurePrecision: comparison.featurePrecision,
            missingFeatures: comparison.missingFeatures,
            completion,
            latencyMs: performance.now() - started
          };
          if (finalResult.status === 'passed') break;
        } catch (error) {
          finalResult = {
            id: item.id,
            status: 'error',
            rawOutput,
            error: `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
            latencyMs: performance.now() - started
          };
        }
      }

      if (finalResult) results.push(finalResult);
    }

    languageResults.set(language, results);
  }

  const languageMetrics: LanguageMetrics[] = [];
  const languageBreakdown: Record<ParseLanguage, number[]> = {
    en: [0, 0, 0, 0],
    el: [0, 0, 0, 0],
    es: [0, 0, 0, 0],
    id: [0, 0, 0, 0]
  };
  const failureModes: Record<string, number> = {};
  let totalItems = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;
  let totalExactRate = 0;
  let totalNearSemanticRate = 0;
  let totalFeatureRecall = 0;
  let totalFeaturePrecision = 0;
  let totalLatencyMs = 0;

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
  const languageCount = languagesIncluded.length;
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
    failureModes
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
    startedAt: new Date().toISOString()
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
