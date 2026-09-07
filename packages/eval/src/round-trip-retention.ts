/**
 * Round-trip retention experiments for multilingual parse+realize cycles.
 *
 * Runs parse→realize round-trips on all 4 languages (EN/EL/ES/ID) against
 * at least 2 local models and publishes per-language pass/fail metrics.
 *
 * Workflow for each item:
 * 1. Start from gold Sem (already parsed)
 * 2. Realize gold Sem to each target language via local model
 * 3. Parse the realized text back with each local model
 * 4. Compare parsed-back Sem against gold Sem
 * 5. Score: predicate match, role match, protected literal preservation
 * 6. Publish per-language pass/fail metrics
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareSem, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { RealizationEngine, type RealizationLanguage } from './realization.js';
import { OpenAICompatibleModel } from './model.js';
import { parsePrompt, realizePrompt } from './prompts.js';
import { parseStrictJsonObject } from './strict-json.js';
import { findWorkspaceRoot, writeJson } from './io.js';
import type { ExperimentManifest, ExperimentItem, ModelProfile } from './types.js';

// ── Types ──────────────────────────────────────────────────────────

export interface RoundTripMetric {
  language: RealizationLanguage;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  errorItems: number;
  retentionRate: number;
  avgPredicateMatch: number;
  avgRoleMatch: number;
  avgProtectedLiteralPreservation: number;
  meanLatencyMs: number;
}

export interface RoundTripReport {
  experimentId: string;
  runId: string;
  languages: RealizationLanguage[];
  models: string[];
  totalItems: number;
  totalPassed: number;
  totalFailed: number;
  totalErrors: number;
  overallRetentionRate: number;
  languageMetrics: Record<RealizationLanguage, RoundTripMetric>;
  /** Per-model retention profiles computed from experiment results */
  modelProfiles: Record<string, ModelRetentionProfile>;
  /** Best model for each language (highest retention rate) */
  bestModelsByLanguage: Partial<Record<RealizationLanguage, string[]>>;
  baselineThreshold: number;
  regressionDetected: boolean;
  generatedAt: number;
}

/** Retention profile for a single model across all languages */
export interface ModelRetentionProfile {
  /** Model identifier */
  modelId: string;
  /** Concrete model/router identifier from the evaluated profile */
  modelName: string;
  /** Generation settings required to distinguish reproducible profiles */
  settings: {
    temperature: number;
    seed?: number;
    timeoutMs: number;
  };
  /** Total items evaluated across all languages */
  totalItems: number;
  /** Total items passed across all languages */
  totalPassed: number;
  /** Total items failed across all languages */
  totalFailed: number;
  /** Total errors across all languages */
  totalErrors: number;
  /** Overall retention rate */
  retentionRate: number;
  /** Average predicate match across all languages */
  avgPredicateMatch: number;
  /** Average role match across all languages */
  avgRoleMatch: number;
  /** Average protected literal preservation across all languages */
  avgProtectedLiteralPreservation: number;
  /** Mean latency in milliseconds */
  meanLatencyMs: number;
  /** Per-language breakdown */
  languageBreakdown: Record<RealizationLanguage, ModelLanguageProfile>;
  /** Whether this model passes the baseline threshold overall */
  passesBaseline: boolean;
}

/** Retention profile for a single model on a single language */
export interface ModelLanguageProfile {
  language: RealizationLanguage;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  errorItems: number;
  retentionRate: number;
  avgPredicateMatch: number;
  avgRoleMatch: number;
  avgProtectedLiteralPreservation: number;
  meanLatencyMs: number;
}

export interface RoundTripResult {
  id: string;
  language: RealizationLanguage;
  model: string;
  status: 'passed' | 'failed' | 'error';
  sourceText: string;
  goldSemSchema: string;
  realizedText: string;
  parsedBackSem: LunumSem | null;
  predicateMatch: number;
  roleMatch: number;
  protectedLiteralPreservation: number;
  retention: boolean;
  latencyMs: number;
  error?: string;
}

interface ModelSelectionCandidate {
  modelId: string;
  total: number;
  passed: number;
  failed: number;
}

/** Select every top-scoring model; error-only candidates are not evaluated. */
export function selectBestModelIds(candidates: ModelSelectionCandidate[]): string[] {
  const evaluated = candidates.filter(candidate => candidate.passed + candidate.failed > 0);
  if (evaluated.length === 0) return [];
  const bestRate = Math.max(...evaluated.map(candidate => candidate.passed / candidate.total));
  return evaluated
    .filter(candidate => candidate.passed / candidate.total === bestRate)
    .map(candidate => candidate.modelId)
    .sort();
}

/** Keep report filenames inside one directory without losing readable safe IDs. */
export function modelProfileReportFilename(modelId: string): string {
  if (!modelId.trim()) throw new Error('Model profile id must be non-empty');
  const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(modelId)
    ? modelId
    : `encoded-${Buffer.from(modelId, 'utf8').toString('base64url')}`;
  return `model-profile-${safeId}.md`;
}

// ── JSON extraction helper ────────────────────────────────────────

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
    throw new Error('Model output must be exactly one JSON object (optionally in one JSON code fence)');
  }
  return parseStrictJsonObject(candidate);
}

// ── Scoring helpers ────────────────────────────────────────────────

function scorePredicateMatch(goldSem: LunumSem, parsedBack: LunumSem): number {
  if (!goldSem?.clauses?.length && !parsedBack?.clauses?.length) return 1;
  if (!goldSem?.clauses?.length || !parsedBack?.clauses?.length) return 0;

  const goldPredicates = new Set(goldSem.clauses.map((c: any) => c.predicate).filter(Boolean));
  const parsedPredicates = new Set(parsedBack.clauses.map((c: any) => c.predicate).filter(Boolean));

  if (goldPredicates.size === 0) return 1;

  let matched = 0;
  for (const pred of goldPredicates) {
    if (parsedPredicates.has(pred)) matched++;
  }
  return matched / goldPredicates.size;
}

function scoreRoleMatch(goldSem: LunumSem, parsedBack: LunumSem): number {
  if (!goldSem?.clauses?.length || !parsedBack?.clauses?.length) {
    return goldSem.clauses?.length === parsedBack.clauses?.length ? 1 : 0;
  }

  let totalRoles = 0;
  let matchedRoles = 0;
  const minLen = Math.min(goldSem.clauses.length, parsedBack.clauses.length);

  for (let i = 0; i < minLen; i++) {
    const origRoles = Object.keys(goldSem.clauses[i]?.roles ?? {});
    const parsedRoles = Object.keys(parsedBack.clauses[i]?.roles ?? {});
    totalRoles += origRoles.length;
    for (const role of origRoles) {
      if (parsedRoles.includes(role)) matchedRoles++;
    }
  }

  return totalRoles > 0 ? matchedRoles / totalRoles : 1;
}

function scoreLiteralPreservation(literals: string[], realizedText: string, parsedBackText: string): number {
  if (!literals.length) return 1;

  const combined = (realizedText + ' ' + parsedBackText).toLowerCase();
  const found = literals.filter(l => combined.includes(l.toLowerCase())).length;
  return found / literals.length;
}

// ── Main experiment runner ────────────────────────────────────────

/**
 * Run round-trip retention experiments across all 4 languages and models.
 * For each item:
 * 1. Realize gold Sem to target language via model
 * 2. Parse back the realized text via model
 * 3. Compare parsed-back Sem against gold Sem
 * 4. Score and classify pass/fail
 */
export async function runRoundTripRetentionExperiment(
  manifest: ExperimentManifest,
  root: string,
  dataset: ExperimentItem[],
  modelProfiles: ModelProfile[]
): Promise<{ results: RoundTripResult[]; report: RoundTripReport }> {
  const profileIds = modelProfiles.map(profile => profile.id);
  if (profileIds.some(id => !id.trim())) throw new Error('Model profile ids must be non-empty');
  if (new Set(profileIds).size !== profileIds.length) {
    throw new Error('Model profile ids must be unique');
  }

  const engine = new RealizationEngine();
  const languages: RealizationLanguage[] = ['en', 'el', 'es', 'id'];
  const results: RoundTripResult[] = [];

  // Per-language, per-model accumulators
  type LangModelKey = `${RealizationLanguage}-${string}`;
  const stats = new Map<LangModelKey, {
    total: number; passed: number; failed: number; errors: number;
    predicateMatches: number[]; roleMatches: number[]; literalPreservations: number[]; latencies: number[];
  }>();

  for (const lang of languages) {
    for (const profile of modelProfiles) {
      const key = `${lang}-${profile.id}` as LangModelKey;
      stats.set(key, {
        total: 0, passed: 0, failed: 0, errors: 0,
        predicateMatches: [], roleMatches: [], literalPreservations: [], latencies: []
      });
    }
  }

  // Initialize model clients
  const models = modelProfiles.map(p => new OpenAICompatibleModel(p));

  // Run round-trip for each item × language × model
  for (const item of dataset.slice(0, manifest.limits.maxItems)) {
    const goldSem = (item.goldSem ?? item.goldenSem) as LunumSem;
    const sourceText = item.sourceText ?? '';
    const literals = item.protectedLiterals ?? [];

    if (!goldSem) continue;

    for (const lang of languages) {
      for (let mIdx = 0; mIdx < models.length; mIdx++) {
        const profile = modelProfiles[mIdx]!;
        const key = `${lang}-${profile.id}` as LangModelKey;
        const s = stats.get(key)!;
        s.total++;
        const started = performance.now();

        try {
          // Step 1: Realize gold Sem to target language via model
          const realizeP = realizePrompt(
            { sourceText, goldSem, targetLanguage: lang, protectedLiterals: literals } as any,
            lang === 'en' ? 'English' : lang === 'el' ? 'Greek' : lang === 'es' ? 'Spanish' : 'Indonesian'
          );

          const realizeCompletion = await models[mIdx]!.complete(
            realizeP.system,
            realizeP.user
          ).catch(err => { throw new Error(`realize: ${err.message}`); });
          const rawRealizeOutput = realizeCompletion.content;

          let cleanRealizedText = rawRealizeOutput.trim();
          try {
            const json = extractJson(cleanRealizedText) as any;
            if (json && typeof json === 'object') {
              cleanRealizedText = String(json.realizedText ?? json.text ?? json.result ?? cleanRealizedText).trim();
            }
          } catch {
            // Not JSON, use rawRealizeOutput
          }

          // Step 2: Parse back the realized text via model
          const parseP = parsePrompt({
            sourceText: cleanRealizedText,
            sourceLanguage: lang
          } as any);

          const parsedCompletion = await models[mIdx]!.complete(
            parseP.system,
            parseP.user
          ).catch(err => { throw new Error(`parse: ${err.message}`); });
          const parsedRaw = parsedCompletion.content;

          const parsedJson = extractJson(parsedRaw);
          const parsedBack = parsedJson as LunumSem;
          const validation = validateSem(parsedBack);
          if (!validation.ok) throw new Error(`parse validation failed: ${validation.errors.join('; ')}`);

          // Step 3: Compare parsed-back Sem against gold Sem
          const comparison = compareSem(goldSem, parsedBack);
          const predicateMatch = comparison.featureRecall ?? 0;
          const roleMatch = scoreRoleMatch(goldSem, parsedBack);
          const literalPreservation = scoreLiteralPreservation(literals, cleanRealizedText, sourceText);

          // Pass threshold: predicate match >= 0.8, role match >= 0.7, literal preservation >= 0.6
          const retention = predicateMatch >= 0.8 && roleMatch >= 0.7 && literalPreservation >= 0.6;

          if (retention) s.passed++;
          else s.failed++;

          s.predicateMatches.push(predicateMatch);
          s.roleMatches.push(roleMatch);
          s.literalPreservations.push(literalPreservation);
          s.latencies.push(performance.now() - started);

          results.push({
            id: item.id,
            language: lang,
            model: profile!.id,
            status: retention ? 'passed' : 'failed',
            sourceText,
            goldSemSchema: goldSem.schema ?? 'unknown',
            realizedText: cleanRealizedText,
            parsedBackSem: parsedBack,
            predicateMatch,
            roleMatch,
            protectedLiteralPreservation: literalPreservation,
            retention,
            latencyMs: performance.now() - started
          });
        } catch (error) {
          s.errors++;
          results.push({
            id: item.id,
            language: lang,
            model: profile!.id,
            status: 'error',
            sourceText,
            goldSemSchema: goldSem.schema ?? 'unknown',
            realizedText: '',
            parsedBackSem: null,
            predicateMatch: 0,
            roleMatch: 0,
            protectedLiteralPreservation: 0,
            retention: false,
            latencyMs: performance.now() - started,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  // Compute per-language metrics (averaged across models)
  const languageMetrics: Record<RealizationLanguage, RoundTripMetric> = {
    en: { language: 'en', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    el: { language: 'el', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    es: { language: 'es', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    id: { language: 'id', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any
  };

  for (const lang of languages) {
    const langStats = { total: 0, passed: 0, failed: 0, errors: 0, predicateMatches: [] as number[], roleMatches: [] as number[], literalPreservations: [] as number[], latencies: [] as number[] };

    for (const profile of modelProfiles) {
      const key = `${lang}-${profile.id}` as LangModelKey;
      const s = stats.get(key);
      if (s) {
        langStats.total += s.total;
        langStats.passed += s.passed;
        langStats.failed += s.failed;
        langStats.errors += s.errors;
        langStats.predicateMatches.push(...s.predicateMatches);
        langStats.roleMatches.push(...s.roleMatches);
        langStats.literalPreservations.push(...s.literalPreservations);
        langStats.latencies.push(...s.latencies);
      }
    }

    const retentionRate = langStats.total > 0 ? langStats.passed / langStats.total : 0;
    const avgPredicateMatch = langStats.predicateMatches.length > 0
      ? langStats.predicateMatches.reduce((a, b) => a + b, 0) / langStats.predicateMatches.length : 0;
    const avgRoleMatch = langStats.roleMatches.length > 0
      ? langStats.roleMatches.reduce((a, b) => a + b, 0) / langStats.roleMatches.length : 0;
    const avgLiteralPreservation = langStats.literalPreservations.length > 0
      ? langStats.literalPreservations.reduce((a, b) => a + b, 0) / langStats.literalPreservations.length : 0;
    const avgLatency = langStats.latencies.length > 0
      ? langStats.latencies.reduce((a, b) => a + b, 0) / langStats.latencies.length : 0;

    languageMetrics[lang] = {
      language: lang,
      totalItems: langStats.total,
      passedItems: langStats.passed,
      failedItems: langStats.failed,
      errorItems: langStats.errors,
      retentionRate,
      avgPredicateMatch,
      avgRoleMatch,
      avgProtectedLiteralPreservation: avgLiteralPreservation,
      meanLatencyMs: avgLatency
    };
  }

  // Compute overall summary
  const totalItems = results.length;
  const totalPassed = results.filter(r => r.status === 'passed').length;
  const totalFailed = results.filter(r => r.status === 'failed').length;
  const totalErrors = results.filter(r => r.status === 'error').length;
  const overallRetentionRate = totalItems > 0 ? totalPassed / totalItems : 0;

  const baselineThreshold = manifest.gates?.minimumExactRate ?? 0.5;
  const regressionDetected = overallRetentionRate < baselineThreshold;

  // Compute per-model retention profiles
  const modelRetentionProfiles: Record<string, ModelRetentionProfile> = {};
  const bestModelsByLanguage: Partial<Record<RealizationLanguage, string[]>> = {};

  for (const profile of modelProfiles) {
    const langStatsPerModel: Record<string, { total: number; passed: number; failed: number; errors: number; predicateMatches: number[]; roleMatches: number[]; literalPreservations: number[]; latencies: number[] }> = {};

    for (const lang of languages) {
      const key = `${lang}-${profile.id}` as LangModelKey;
      const s = stats.get(key);
      if (s) {
        if (!langStatsPerModel[profile.id]) {
          langStatsPerModel[profile.id] = { total: 0, passed: 0, failed: 0, errors: 0, predicateMatches: [] as number[], roleMatches: [] as number[], literalPreservations: [] as number[], latencies: [] as number[] };
        }
        const m = langStatsPerModel[profile.id]!;
        m.total += s.total;
        m.passed += s.passed;
        m.failed += s.failed;
        m.errors += s.errors;
        m.predicateMatches.push(...s.predicateMatches);
        m.roleMatches.push(...s.roleMatches);
        m.literalPreservations.push(...s.literalPreservations);
        m.latencies.push(...s.latencies);
      }
    }

    const overall = langStatsPerModel[profile.id] ?? { total: 0, passed: 0, failed: 0, errors: 0, predicateMatches: [], roleMatches: [], literalPreservations: [], latencies: [] };
    const overallRetentionRate = overall.total > 0 ? overall.passed / overall.total : 0;

    const languageBreakdown: Record<RealizationLanguage, ModelLanguageProfile> = {
      en: { language: 'en', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
      el: { language: 'el', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
      es: { language: 'es', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
      id: { language: 'id', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any
    };

    let bestLangForModel: RealizationLanguage = 'en';
    let bestLangRate = -1;

    for (const lang of languages) {
      const key = `${lang}-${profile.id}` as LangModelKey;
      const s = stats.get(key);
      if (s) {
        const lr = s.total > 0 ? s.passed / s.total : 0;
        const apm = s.predicateMatches.length > 0 ? s.predicateMatches.reduce((a, b) => a + b, 0) / s.predicateMatches.length : 0;
        const arm = s.roleMatches.length > 0 ? s.roleMatches.reduce((a, b) => a + b, 0) / s.roleMatches.length : 0;
        const alp = s.literalPreservations.length > 0 ? s.literalPreservations.reduce((a, b) => a + b, 0) / s.literalPreservations.length : 0;
        const ml = s.latencies.length > 0 ? s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length : 0;

        languageBreakdown[lang] = {
          language: lang,
          totalItems: s.total,
          passedItems: s.passed,
          failedItems: s.failed,
          errorItems: s.errors,
          retentionRate: lr,
          avgPredicateMatch: apm,
          avgRoleMatch: arm,
          avgProtectedLiteralPreservation: alp,
          meanLatencyMs: ml
        };

        if (lr > bestLangRate) {
          bestLangRate = lr;
          bestLangForModel = lang;
        }
      }
    }



    const avgPredicateMatch = overall.predicateMatches.length > 0
      ? overall.predicateMatches.reduce((a, b) => a + b, 0) / overall.predicateMatches.length : 0;
    const avgRoleMatch = overall.roleMatches.length > 0
      ? overall.roleMatches.reduce((a, b) => a + b, 0) / overall.roleMatches.length : 0;
    const avgLiteralPreservation = overall.literalPreservations.length > 0
      ? overall.literalPreservations.reduce((a, b) => a + b, 0) / overall.literalPreservations.length : 0;
    const avgLatency = overall.latencies.length > 0
      ? overall.latencies.reduce((a, b) => a + b, 0) / overall.latencies.length : 0;

    modelRetentionProfiles[profile.id] = {
      modelId: profile.id,
      modelName: profile.model,
      settings: {
        temperature: profile.temperature,
        ...(profile.seed === undefined ? {} : { seed: profile.seed }),
        timeoutMs: profile.timeoutMs
      },
      totalItems: overall.total,
      totalPassed: overall.passed,
      totalFailed: overall.failed,
      totalErrors: overall.errors,
      retentionRate: overallRetentionRate,
      avgPredicateMatch,
      avgRoleMatch,
      avgProtectedLiteralPreservation: avgLiteralPreservation,
      meanLatencyMs: avgLatency,
      languageBreakdown,
      passesBaseline: overallRetentionRate >= baselineThreshold
    };
  }

  // Compute best model for each language
  for (const lang of languages) {
    const candidates = modelProfiles.map(profile => {
      const key = `${lang}-${profile.id}` as LangModelKey;
      const s = stats.get(key);
      return {
        modelId: profile.id,
        total: s?.total ?? 0,
        passed: s?.passed ?? 0,
        failed: s?.failed ?? 0
      };
    });
    const bestModelIds = selectBestModelIds(candidates);
    if (bestModelIds.length > 0) bestModelsByLanguage[lang] = bestModelIds;
  }

  const report: RoundTripReport = {
    experimentId: manifest.id,
    runId: new Date().toISOString().replace(/[:.]/gu, '-'),
    languages,
    models: modelProfiles.map(p => p.id),
    totalItems,
    totalPassed,
    totalFailed,
    totalErrors,
    overallRetentionRate,
    languageMetrics,
    modelProfiles: modelRetentionProfiles,
    bestModelsByLanguage,
    baselineThreshold,
    regressionDetected,
    generatedAt: Date.now()
  };

  // Write report to disk
  const outputDir = path.join(root, manifest.outputDirectory ?? 'reports/round-trip-retention');
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `${manifest.id}-report.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // Write model profile reports
  for (const modelId of Object.keys(modelRetentionProfiles)) {
    const profile = modelRetentionProfiles[modelId]!;
    let md = `# Model Retention Profile: ${modelId}

## Overall
- Total Items: ${profile.totalItems}
- Passed: ${profile.totalPassed}
- Failed: ${profile.totalFailed}
- Errors: ${profile.totalErrors}
- Retention Rate: ${(profile.retentionRate * 100).toFixed(1)}%
- Avg Predicate Match: ${profile.avgPredicateMatch.toFixed(3)}
- Avg Role Match: ${profile.avgRoleMatch.toFixed(3)}
- Avg Protected Literal Preservation: ${profile.avgProtectedLiteralPreservation.toFixed(3)}
- Mean Latency: ${profile.meanLatencyMs.toFixed(2)}ms
- Passes Baseline: ${profile.passesBaseline ? 'Yes' : 'No'}

## Per-Language Breakdown
`;
    for (const lang of languages) {
      const lb = profile.languageBreakdown[lang as RealizationLanguage];
      md += `### ${lang.toUpperCase()}
- Items: ${lb.totalItems}
- Passed: ${lb.passedItems}
- Retention Rate: ${(lb.retentionRate * 100).toFixed(1)}%
- Avg Predicate Match: ${lb.avgPredicateMatch.toFixed(3)}
- Avg Role Match: ${lb.avgRoleMatch.toFixed(3)}
- Avg Protected Literal Preservation: ${lb.avgProtectedLiteralPreservation.toFixed(3)}
- Mean Latency: ${lb.meanLatencyMs.toFixed(2)}ms

`;
    }
    const profilePath = path.resolve(outputDir, modelProfileReportFilename(modelId));
    if (path.dirname(profilePath) !== path.resolve(outputDir)) {
      throw new Error(`Model profile report path escaped output directory: ${modelId}`);
    }
    await writeFile(profilePath, md, 'utf-8');
  }

  // Write best models by language
  let bestMd = '# Best Model by Language\n\n';
  for (const lang of languages) {
    const bestModelIds = bestModelsByLanguage[lang];
    if (bestModelIds?.length) {
      const bestModel = bestModelIds[0]!;
      const profile = modelRetentionProfiles[bestModel];
      const langProfile = profile?.languageBreakdown[lang as RealizationLanguage];
      if (langProfile) {
        bestMd += `## ${lang.toUpperCase()}: ${bestModelIds.join(', ')}\n`;
        bestMd += `- Retention Rate: ${(langProfile.retentionRate * 100).toFixed(1)}%\n`;
        bestMd += `- Avg Predicate Match: ${langProfile.avgPredicateMatch.toFixed(3)}\n`;
        bestMd += `- Avg Role Match: ${langProfile.avgRoleMatch.toFixed(3)}\n\n`;
      }
    } else {
      bestMd += `## ${lang.toUpperCase()}: no evaluated model\n\n`;
    }
  }
  await writeFile(path.join(outputDir, 'best-models-by-language.md'), bestMd, 'utf-8');

  // Write per-language markdown reports
  for (const lang of languages) {
    const m = languageMetrics[lang];
    const md = `# Round-Trip Retention Report: ${lang.toUpperCase()}

- Items: ${m.totalItems}
- Passed: ${m.passedItems}
- Failed: ${m.failedItems}
- Errors: ${m.errorItems}
- Retention Rate: ${(m.retentionRate * 100).toFixed(1)}%
- Avg Predicate Match: ${m.avgPredicateMatch.toFixed(3)}
- Avg Role Match: ${m.avgRoleMatch.toFixed(3)}
- Avg Protected Literal Preservation: ${m.avgProtectedLiteralPreservation.toFixed(3)}
- Mean Latency: ${m.meanLatencyMs.toFixed(2)}ms
`;
    await writeFile(path.join(outputDir, `report-${lang}.md`), md, 'utf-8');
  }

  return { results, report };
}

// ── Export ─────────────────────────────────────────────────────────

export const roundTripRetentionExports = [
  runRoundTripRetentionExperiment
] as const;
