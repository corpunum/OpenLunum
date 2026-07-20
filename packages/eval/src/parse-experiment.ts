/**
 * Parse experiment runner for EN/EL/ES/ID
 *
 * Runs parse experiments against local models and publishes
 * per-language metrics reports with cross-language comparisons.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSem, compareSem, fingerprintSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

// Near-semantic matching threshold: when feature recall >= this, count as near-match
const NEAR_SEMANTIC_THRESHOLD = 0.7;

/**
 * Determine if two LunumSem records are near-semantic matches.
 * A near-match has high feature recall but may differ in identifiers
 * (e.g., 'delete' vs 'remove_file' for the same predicate).
 */
function isNearSemanticMatch(gold: LunumSem, parsed: LunumSem, comparison: ReturnType<typeof compareSem>): boolean {
  // Already an exact match
  if (comparison.exactFingerprint) return true;
  // High feature recall indicates near-semantic match
  return comparison.featureRecall >= NEAR_SEMANTIC_THRESHOLD;
}
import { findWorkspaceRoot, loadDataset, readJson, sha256File, validateManifest, validateProfile, writeJson } from './io.js';
import { OpenAICompatibleModel } from './model.js';
import { parsePrompt } from './prompts.js';
import type { ExperimentManifest, ItemResult, ModelProfile, DatasetItem, ExperimentItem } from './types.js';

// Supported parse languages
export type ParseLanguage = 'en' | 'el' | 'es' | 'id';
export const PARSE_LANGUAGES: ParseLanguage[] = ['en', 'el', 'es', 'id'];
export const PARSE_LANGUAGE_LABELS: Record<ParseLanguage, string> = {
  en: 'English',
  el: 'Greek',
  es: 'Spanish',
  id: 'Indonesian'
};

// ── Language-specific metrics ──────────────────────────────────────

export interface LanguageMetrics {
  language: ParseLanguage;
  languageLabel: string;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  errorItems: number;
  exactRate: number;
  featureRecall: number;
  featurePrecision: number;
  meanLatencyMs: number;
  fingerprintMatches: number;
  exactFingerprintCount: number;
  nearSemanticRate: number;
  nearSemanticMatches: number;
}

// ── Experiment report ──────────────────────────────────────────────

export interface ParseExperimentReport {
  experimentId: string;
  runId: string;
  task: string;
  totalItems: number;
  totalPassed: number;
  totalFailed: number;
  totalErrors: number;
  overallExactRate: number;
  overallFeatureRecall: number;
  overallFeaturePrecision: number;
  overallMeanLatencyMs: number;
  overallNearSemanticRate: number;
  languageMetrics: LanguageMetrics[];
  crossLanguageComparison: CrossLanguageComparison;
  languageBreakdown: Record<ParseLanguage, number[]>;
  failureModes: Record<string, number>;
}

export interface CrossLanguageComparison {
  languagesIncluded: ParseLanguage[];
  bestExactLanguage: ParseLanguage | null;
  bestRecallLanguage: ParseLanguage | null;
  bestNearSemanticLanguage: ParseLanguage | null;
  fastestLanguage: ParseLanguage | null;
  consistencyScore: number; // How consistent are results across languages
  variance: Record<string, number>;
}

// ── JSON extraction helper ─────────────────────────────────────────

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

// ── Run parse experiment ───────────────────────────────────────────

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

  const fullDataset = (await loadDataset(datasetPath)) as DatasetItem[];
  const items = fullDataset.slice(0, manifest.limits.maxItems);
  const profile = await readJson<ModelProfile>(modelProfilePath);
  validateProfile(profile);

  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const outputRoot = path.isAbsolute(manifest.outputDirectory)
    ? manifest.outputDirectory
    : path.join(root, manifest.outputDirectory);
  const output = path.join(outputRoot, runId);
  await mkdir(output, { recursive: true });

  // Group items by language
  const byLanguage = new Map<ParseLanguage, DatasetItem[]>();
  for (const lang of PARSE_LANGUAGES) {
    byLanguage.set(lang, []);
  }
  for (const item of items) {
    const lang = item.sourceLanguage as ParseLanguage;
    if (byLanguage.has(lang)) {
      byLanguage.get(lang)!.push(item);
    }
  }

  // Run parse experiments per language
  const languageResults = new Map<ParseLanguage, ItemResult[]>();
  for (const [lang, langItems] of byLanguage) {
    if (langItems.length === 0) continue;

    const model = new OpenAICompatibleModel(profile);
    const results: ItemResult[] = [];
    let calls = 0;

    for (const item of langItems) {
      if (calls >= manifest.limits.maxModelCalls) break;
      let finalResult: ItemResult | null = null;

      for (let attempt = 1; attempt <= manifest.limits.maxAttemptsPerItem && calls < manifest.limits.maxModelCalls; attempt += 1) {
        const started = performance.now();
        let rawOutput = '';
        try {
          const promptText = parsePrompt(item).user;
          calls += 1;
          rawOutput = await model.complete('You are a precise Lunum experiment runner. Reply only with valid JSON.', promptText);

          const parsed = extractJson(rawOutput);
          const validation = validateSem(parsed);
          if (!validation.ok) throw new Error(`Validation failed: ${validation.errors.join('; ')}`);

          const parsedSem = parsed as LunumSem;
          const comparison = compareSem(item.goldSem as LunumSem, parsedSem);

          const nearMatch = isNearSemanticMatch(item.goldSem as LunumSem, parsedSem, comparison);

          finalResult = {
            id: item.id,
            status: comparison.exactFingerprint ? 'passed' : 'failed',
            rawOutput,
            parsedSem,
            exact: comparison.exactFingerprint,
            featureRecall: comparison.featureRecall,
            featurePrecision: comparison.featurePrecision,
            nearSemantic: nearMatch,
            nearSemanticSimilarity: comparison.featureRecall,
            missingFeatures: comparison.missingFeatures,
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

    languageResults.set(lang, results);
  }

  // ── Compute metrics ────────────────────────────────────────────

  const languageMetrics: LanguageMetrics[] = [];
  const languageBreakdown: Record<ParseLanguage, number[]> = {
    en: [0, 0, 0, 0], // [passed, failed, error, total]
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
  let totalFeatureRecall = 0;
  let totalFeaturePrecision = 0;
  let totalNearSemanticRate = 0;
  let totalLatencyMs = 0;

  for (const lang of PARSE_LANGUAGES) {
    const results = languageResults.get(lang) ?? [];
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const errors = results.filter(r => r.status === 'error').length;

    const exactCount = results.filter(r => r.exact === true).length;
    const exactRate = total > 0 ? exactCount / total : 0;
    const nearSemCount = results.filter(r => r.nearSemantic === true).length;
    const nearSemRate = total > 0 ? nearSemCount / total : 0;
    const avgRecall = total > 0 ? results.reduce((s, r) => s + (r.featureRecall ?? 0), 0) / total : 0;
    const avgPrecision = total > 0 ? results.reduce((s, r) => s + (r.featurePrecision ?? 0), 0) / total : 0;
    const avgLatency = total > 0 ? results.reduce((s, r) => s + r.latencyMs, 0) / total : 0;

    const metrics: LanguageMetrics = {
      language: lang,
      languageLabel: PARSE_LANGUAGE_LABELS[lang],
      totalItems: total,
      passedItems: passed,
      failedItems: failed,
      errorItems: errors,
      exactRate,
      featureRecall: avgRecall,
      featurePrecision: avgPrecision,
      meanLatencyMs: avgLatency,
      fingerprintMatches: exactCount,
      exactFingerprintCount: exactCount,
      nearSemanticRate: nearSemRate,
      nearSemanticMatches: nearSemCount
    };
    languageMetrics.push(metrics);

    languageBreakdown[lang] = [passed, failed, errors, total];
    totalItems += total;
    totalPassed += passed;
    totalFailed += failed;
    totalErrors += errors;
    totalExactRate += exactRate;
    totalFeatureRecall += avgRecall;
    totalFeaturePrecision += avgPrecision;
    totalNearSemanticRate += nearSemRate;
    totalLatencyMs += avgLatency;

    // Track failure modes
    for (const result of results) {
      if (result.status === 'failed' && result.missingFeatures && result.missingFeatures.length > 0) {
        for (const feature of result.missingFeatures) {
          failureModes[feature] = (failureModes[feature] ?? 0) + 1;
        }
      }
      if (result.status === 'error') {
        failureModes[`error: ${result.error?.slice(0, 50) ?? 'unknown'}`] =
          (failureModes[`error: ${result.error?.slice(0, 50) ?? 'unknown'}`] ?? 0) + 1;
      }
    }
  }

  // ── Cross-language comparison ──────────────────────────────────

  const languagesIncluded = languageMetrics.filter(m => m.totalItems > 0).map(m => m.language);
  const bestExact: ParseLanguage | null = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, lang) => {
        const m = languageMetrics.find(l => l.language === lang)!;
        const bestMetrics = languageMetrics.find(l => l.language === best);
        return m.exactRate > (bestMetrics?.exactRate ?? 0) ? lang : best;
      }, languagesIncluded[0]!)
    : null;

  const bestRecall: ParseLanguage | null = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, lang) => {
        const m = languageMetrics.find(l => l.language === lang)!;
        const bestMetrics = languageMetrics.find(l => l.language === best);
        return m.featureRecall > (bestMetrics?.featureRecall ?? 0) ? lang : best;
      }, languagesIncluded[0]!)
    : null;

  const bestNearSemantic: ParseLanguage | null = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, lang) => {
        const m = languageMetrics.find(l => l.language === lang)!;
        const bestMetrics = languageMetrics.find(l => l.language === best);
        return m.nearSemanticRate > (bestMetrics?.nearSemanticRate ?? 0) ? lang : best;
      }, languagesIncluded[0]!)
    : null;

  const fastest: ParseLanguage | null = languagesIncluded.length > 0
    ? languagesIncluded.reduce<ParseLanguage>((best, lang) => {
        const m = languageMetrics.find(l => l.language === lang)!;
        const bestMetrics = languageMetrics.find(l => l.language === best);
        return m.meanLatencyMs < (bestMetrics?.meanLatencyMs ?? Infinity) ? lang : best;
      }, languagesIncluded[0]!)
    : null;

  // Consistency score: 1.0 if all languages have same exact rate, 0.0 if max-min spread
  const exactRates = languageMetrics.filter(m => m.totalItems > 0).map(m => m.exactRate);
  const consistencyScore = exactRates.length > 1
    ? 1 - (Math.max(...exactRates) - Math.min(...exactRates))
    : 1;

  const variance = languagesIncluded.length > 1
    ? {
        exactRateVariance: computeVariance(exactRates),
        recallVariance: computeVariance(languageMetrics.filter(m => m.totalItems > 0).map(m => m.featureRecall)),
        latencyVariance: computeVariance(languageMetrics.filter(m => m.totalItems > 0).map(m => m.meanLatencyMs))
      }
    : { exactRateVariance: 0, recallVariance: 0, latencyVariance: 0 };

  const crossLanguageComparison: CrossLanguageComparison = {
    languagesIncluded,
    bestExactLanguage: bestExact,
    bestRecallLanguage: bestRecall,
    bestNearSemanticLanguage: bestNearSemantic,
    fastestLanguage: fastest,
    consistencyScore,
    variance
  };

  // ── Build report ───────────────────────────────────────────────

  const report: ParseExperimentReport = {
    experimentId: manifest.id,
    runId,
    task: manifest.task,
    totalItems,
    totalPassed,
    totalFailed,
    totalErrors,
    overallExactRate: totalItems > 0 ? totalExactRate / PARSE_LANGUAGES.filter(l => languageResults.has(l)).length : 0,
    overallFeatureRecall: totalItems > 0 ? totalFeatureRecall / PARSE_LANGUAGES.filter(l => languageResults.has(l)).length : 0,
    overallFeaturePrecision: totalItems > 0 ? totalFeaturePrecision / PARSE_LANGUAGES.filter(l => languageResults.has(l)).length : 0,
    overallNearSemanticRate: totalItems > 0 ? totalNearSemanticRate / PARSE_LANGUAGES.filter(l => languageResults.has(l)).length : 0,
    overallMeanLatencyMs: totalItems > 0 ? totalLatencyMs / PARSE_LANGUAGES.filter(l => languageResults.has(l)).length : 0,
    languageMetrics,
    crossLanguageComparison,
    languageBreakdown,
    failureModes
  };

  // ── Write outputs ──────────────────────────────────────────────

  // Write per-language results
  for (const [lang, results] of languageResults) {
    const resultPath = path.join(output, `parse-results-${lang}.jsonl`);
    await writeFile(resultPath, '', 'utf8');
    for (const result of results) {
      await appendFile(resultPath, `${JSON.stringify(result)}\n`, 'utf8');
    }
  }

  // Write cross-language summary
  await writeJson(path.join(output, 'parse-summary.json'), report);

  // Write per-language markdown reports
  for (const metrics of languageMetrics) {
    const md = `# Parse Report: ${metrics.languageLabel} (${metrics.language})

- Items: ${metrics.totalItems}
- Passed: ${metrics.passedItems}
- Failed: ${metrics.failedItems}
- Errors: ${metrics.errorItems}
- Exact Rate: ${metrics.exactRate.toFixed(4)}
- Feature Recall: ${metrics.featureRecall.toFixed(4)}
- Feature Precision: ${metrics.featurePrecision.toFixed(4)}
- Mean Latency: ${metrics.meanLatencyMs.toFixed(2)}ms
- Fingerprint Matches: ${metrics.fingerprintMatches}
`;
    await writeFile(path.join(output, `report-${metrics.language}.md`), md, 'utf8');
  }

  // Write cross-language comparison report
  const crossMd = `# Cross-Language Parse Comparison

## Overview
- Experiment: ${manifest.id}
- Run: ${runId}
- Total Items: ${totalItems}
- Total Passed: ${totalPassed}
- Total Failed: ${totalFailed}
- Total Errors: ${totalErrors}

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Semantic Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|-------------------|--------|-----------|--------------|
${languageMetrics.map(m => `| ${m.languageLabel} (${m.language}) | ${m.totalItems} | ${m.passedItems} | ${m.exactRate.toFixed(4)} | ${m.nearSemanticRate.toFixed(4)} | ${m.featureRecall.toFixed(4)} | ${m.featurePrecision.toFixed(4)} | ${m.meanLatencyMs.toFixed(2)} |`).join('\n')}

## Cross-Language Analysis
- Best Exact Rate: ${crossLanguageComparison.bestExactLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.bestExactLanguage] : 'N/A'}
- Best Recall: ${crossLanguageComparison.bestRecallLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.bestRecallLanguage] : 'N/A'}
- Best Near-Semantic Rate: ${crossLanguageComparison.bestNearSemanticLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.bestNearSemanticLanguage] : 'N/A'}
- Fastest: ${crossLanguageComparison.fastestLanguage ? PARSE_LANGUAGE_LABELS[crossLanguageComparison.fastestLanguage] : 'N/A'}
- Consistency Score: ${crossLanguageComparison.consistencyScore.toFixed(4)}

## Variance
- Exact Rate Variance: ${variance.exactRateVariance.toFixed(6)}
- Recall Variance: ${variance.recallVariance.toFixed(6)}
- Latency Variance: ${variance.latencyVariance.toFixed(6)}

## Failure Modes
${Object.entries(failureModes).map(([mode, count]) => `- ${mode}: ${count}`).join('\n') || '- None'}
`;
  await writeFile(path.join(output, 'cross-language-report.md'), crossMd, 'utf8');

  // Write experiment snapshot
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

function computeVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

// ── CLI entry ──────────────────────────────────────────────────────

export async function runParseExperimentCli(): Promise<string> {
  // cli.ts passes the manifest as argv[3] (argv[2] is the subcommand 'parse-experiment')
  const manifestArg = process.argv[3];
  if (!manifestArg) throw new Error('Usage: node cli.js parse-experiment <manifest-path>');
  const root = await findWorkspaceRoot();
  const resolved = path.isAbsolute(manifestArg) ? manifestArg : path.join(root, manifestArg);
  const { outputDirectory } = await runParseExperiment(resolved);
  console.log(outputDirectory);
  return outputDirectory;
}
