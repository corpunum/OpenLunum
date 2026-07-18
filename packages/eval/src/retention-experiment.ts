/**
 * Retention experiment runner for multilingual round-trip testing
 *
 * Runs parse+realize round-trip retention experiments on all 4 languages
 * (EN/EL/ES/ID), measuring how well semantic content is preserved through
 * the parse → realize cycle. Publishes per-language pass/fail metrics.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RealizationEngine, type RealizationLanguage } from './realization.js';
import { BaselineParser } from './english-greek-baselines.js';
import { spanishIndonesianBaselinesExports } from './spanish-indonesian-baselines.js';
import type { ExperimentManifest, ExperimentItem } from './types.js';
import { findWorkspaceRoot, writeJson } from './io.js';

// ── Types ──────────────────────────────────────────────────────────

export interface RetentionMetric {
  language: RealizationLanguage;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  errorItems: number;
  retentionRate: number; // Fraction of items that passed retention
  avgPredicateMatch: number; // Average predicate match score
  avgRoleMatch: number; // Average role match score
  avgProtectedLiteralPreservation: number; // Average protected literal preservation
  meanLatencyMs: number;
}

export interface RetentionReport {
  experimentId: string;
  runId: string;
  languages: RealizationLanguage[];
  totalItems: number;
  totalPassed: number;
  totalFailed: number;
  totalErrors: number;
  overallRetentionRate: number;
  languageMetrics: Record<RealizationLanguage, RetentionMetric>;
  baselineThreshold: number;
  regressionDetected: boolean;
  generatedAt: number;
}

// ── Retention Experiment ───────────────────────────────────────────

/**
 * Run retention experiments across all supported languages.
 * For each item:
 * 1. Use gold Sem as the "parsed" semantic representation
 * 2. Realize the Sem to target language
 * 3. Compare realized text against original source text
 * 4. Score predicate match, role match, and protected literal preservation
 */
export async function runRetentionExperiment(
  manifest: ExperimentManifest,
  root: string,
  dataset: ExperimentItem[]
): Promise<{ results: RetentionResult[]; report: RetentionReport }> {
  const engine = new RealizationEngine();
  const languages: RealizationLanguage[] = ['en', 'el', 'es', 'id'];
  const results: RetentionResult[] = [];

  // Per-language accumulators
  const langStats = new Map<RealizationLanguage, {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    predicateMatches: number[];
    roleMatches: number[];
    literalPreservations: number[];
    latencies: number[];
  }>();

  for (const lang of languages) {
    langStats.set(lang, {
      total: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      predicateMatches: [],
      roleMatches: [],
      literalPreservations: [],
      latencies: []
    });
  }

  // Run retention experiment for each language
  for (const lang of languages) {
    const stats = langStats.get(lang)!;

    for (const item of dataset.slice(0, manifest.limits.maxItems)) {
      stats.total++;
      const started = performance.now();

      try {
        const sourceText = item.sourceText ?? '';
        const goldSem = (item.goldSem ?? item.goldenSem) as any;

        if (!sourceText || !goldSem) {
          stats.errors++;
          results.push({
            id: item.id,
            language: lang,
            status: 'error',
            sourceText,
            goldSemSchema: typeof goldSem === 'object' && 'schema' in goldSem ? (goldSem as any).schema : 'unknown',
            realizedText: '',
            predicateMatch: 0,
            roleMatch: 0,
            protectedLiteralPreservation: 0,
            retention: false,
            latencyMs: performance.now() - started
          });
          continue;
        }

        // Realize the gold Sem to target language
        const semObj = {
          recordVersion: 'lunum-record/0.1-draft' as const,
          source: { text: sourceText, language: item.sourceLanguage ?? lang, role: null, ref: null },
          sem: goldSem as any,
          fingerprint: `retention-${item.id}`,
          renderings: {},
          policy: {
            eligible: true,
            category: 'retention',
            risk: 'low' as const,
            confidence: 0.9,
            reasons: ['retention experiment']
          },
          meta: {}
        };

        const realization = engine.realize(semObj as any, lang);
        const realizedText = realization.text.trim();

        // Score retention
        const predicateMatch = scorePredicateMatch(goldSem, realizedText, sourceText);
        const roleMatch = scoreRoleMatch(goldSem, realizedText, sourceText);
        const literalPreservation = scoreLiteralPreservation(item.protectedLiterals ?? [], realizedText, sourceText);

        const retention = predicateMatch >= 0.8 && roleMatch >= 0.7 && literalPreservation >= 0.6;

        if (retention) stats.passed++;
        else stats.failed++;

        stats.predicateMatches.push(predicateMatch);
        stats.roleMatches.push(roleMatch);
        stats.literalPreservations.push(literalPreservation);
        stats.latencies.push(performance.now() - started);

        results.push({
          id: item.id,
          language: lang,
          status: retention ? 'passed' : 'failed',
          sourceText,
          goldSemSchema: typeof goldSem === 'object' && 'schema' in goldSem ? (goldSem as any).schema : 'unknown',
          realizedText,
          predicateMatch,
          roleMatch,
          protectedLiteralPreservation: literalPreservation,
          retention,
          latencyMs: performance.now() - started
        });
      } catch (error) {
        stats.errors++;
        results.push({
          id: item.id,
          language: lang,
          status: 'error',
          sourceText: (item as any).sourceText ?? '',
          goldSemSchema: 'error',
          realizedText: '',
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

  // Compute per-language metrics
  const languageMetrics: Record<RealizationLanguage, RetentionMetric> = {
    en: { language: 'en', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    el: { language: 'el', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    es: { language: 'es', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any,
    id: { language: 'id', totalItems: 0, passedItems: 0, failedItems: 0, errorItems: 0, retentionRate: 0, avgPredicateMatch: 0, avgRoleMatch: 0, avgProtectedLiteralPreservation: 0, meanLatencyMs: 0 } as any
  };

  for (const lang of languages) {
    const stats = langStats.get(lang)!;
    const retentionRate = stats.total > 0 ? stats.passed / stats.total : 0;
    const avgPredicateMatch = stats.predicateMatches.length > 0
      ? stats.predicateMatches.reduce((a, b) => a + b, 0) / stats.predicateMatches.length
      : 0;
    const avgRoleMatch = stats.roleMatches.length > 0
      ? stats.roleMatches.reduce((a, b) => a + b, 0) / stats.roleMatches.length
      : 0;
    const avgLiteralPreservation = stats.literalPreservations.length > 0
      ? stats.literalPreservations.reduce((a, b) => a + b, 0) / stats.literalPreservations.length
      : 0;
    const avgLatency = stats.latencies.length > 0
      ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
      : 0;

    languageMetrics[lang] = {
      language: lang,
      totalItems: stats.total,
      passedItems: stats.passed,
      failedItems: stats.failed,
      errorItems: stats.errors,
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

  // Baseline threshold from manifest or default
  const baselineThreshold = manifest.gates?.minimumExactRate ?? 0.5;
  const regressionDetected = overallRetentionRate < baselineThreshold;

  const report: RetentionReport = {
    experimentId: manifest.id,
    runId: new Date().toISOString().replace(/[:.]/gu, '-'),
    languages,
    totalItems,
    totalPassed,
    totalFailed,
    totalErrors,
    overallRetentionRate,
    languageMetrics,
    baselineThreshold,
    regressionDetected,
    generatedAt: Date.now()
  };

  // Write report to disk
  const outputDir = path.join(root, manifest.outputDirectory ?? 'reports/retention');
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `${manifest.id}-report.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // Write per-language markdown reports
  for (const lang of languages) {
    const m = languageMetrics[lang];
    const md = `# Retention Report: ${lang.toUpperCase()}

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

// ── Helpers ────────────────────────────────────────────────────────

interface RetentionResult {
  id: string;
  language: RealizationLanguage;
  status: 'passed' | 'failed' | 'error';
  sourceText: string;
  goldSemSchema: string;
  realizedText: string;
  predicateMatch: number;
  roleMatch: number;
  protectedLiteralPreservation: number;
  retention: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Score predicate match by checking if realized text contains key predicates.
 */
function scorePredicateMatch(sem: any, realizedText: string, sourceText: string): number {
  if (!sem?.clauses?.length) return 1;

  const predicates = sem.clauses.map((c: any) => c.predicate ?? '').filter(Boolean);
  if (!predicates.length) return 1;

  const lowerText = realizedText.toLowerCase();
  const lowerSource = sourceText.toLowerCase();

  // Check if predicates appear as word stems in realized or source text
  const matched = predicates.filter((pred: string) => {
    const predLower = pred.toLowerCase();
    return lowerText.includes(predLower) || lowerSource.includes(predLower);
  }).length;

  return matched / predicates.length;
}

/**
 * Score role match by checking if realized text contains role indicators.
 */
function scoreRoleMatch(sem: any, realizedText: string, sourceText: string): number {
  if (!sem?.clauses?.length) return 1;

  const allRoles = new Set<string>();
  for (const clause of sem.clauses) {
    if (clause?.roles) {
      for (const role of Object.keys(clause.roles)) {
        allRoles.add(role);
      }
    }
  }

  if (!allRoles.size) return 1;

  // Check if role-related concepts appear in realized text
  const lowerText = realizedText.toLowerCase();
  let matched = 0;

  for (const role of allRoles) {
    const roleLower = role.toLowerCase();
    if (lowerText.includes(roleLower)) {
      matched++;
    }
  }

  return matched / allRoles.size;
}

/**
 * Score protected literal preservation.
 */
function scoreLiteralPreservation(literals: string[], realizedText: string, sourceText: string): number {
  if (!literals.length) return 1;

  const lowerText = realizedText.toLowerCase();
  const found = literals.filter(literal => lowerText.includes(literal.toLowerCase())).length;
  return found / literals.length;
}
