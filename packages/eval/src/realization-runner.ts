/**
 * Realization experiment runner with protected-literal scoring
 *
 * Runs Lunum-Sem -> natural language realization across English, Greek,
 * Spanish, and Indonesian, scoring each with protected-literal coverage
 * and publishing per-language metrics reports.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RealizationEngine, type RealizationLanguage } from './realization.js';
import { ProtectedLiteralDetector, SemanticScorer } from './protected-literal-scoring.js';
import { writeJson, findWorkspaceRoot } from './io.js';
import type { ExperimentManifest, ExperimentItem, ItemResult } from './types.js';
import type { LunumRecord, LunumSem } from '@corpunum/lunum';

// ── Types ──────────────────────────────────────────────────────────

export interface RealizationMetric {
  /** Language code */
  language: RealizationLanguage;
  /** Total items attempted */
  total: number;
  /** Items that passed */
  passed: number;
  /** Items that failed */
  failed: number;
  /** Items with errors */
  errors: number;
  /** Pass rate (0-1) */
  passRate: number;
  /** Average protected-literal coverage (0-1) */
  avgProtectedLiteralCoverage: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Semantic scorer averages */
  semanticScores: {
    completeness: number;
    consistency: number;
    predicateClarity: number;
    roleCoverage: number;
    protectedLiteralPreservation: number;
    overall: number;
  };
}

export interface RealizationReport {
  /** Experiment ID */
  experimentId: string;
  /** Languages tested */
  languages: RealizationLanguage[];
  /** Total records processed */
  totalRecords: number;
  /** Per-language metrics */
  metrics: Record<RealizationLanguage, RealizationMetric>;
  /** Per-language pass rates for reporting */
  passRates: Record<RealizationLanguage, number>;
  /** Overall summary */
  summary: {
    totalItems: number;
    totalPassed: number;
    totalFailed: number;
    totalErrors: number;
    overallPassRate: number;
    avgProtectedLiteralCoverage: number;
    avgLatencyMs: number;
  };
  /** Timestamp */
  generatedAt: number;
}

// ── Realization Runner ─────────────────────────────────────────────

/**
 * Run realization experiments across all supported languages.
 */
export async function runRealizationExperiment(
  manifest: ExperimentManifest,
  root: string,
  dataset: ExperimentItem[]
): Promise<{ results: ItemResult[]; report: RealizationReport; output: string }> {
  const engine = new RealizationEngine();
  const detector = new ProtectedLiteralDetector();
  const scorer = new SemanticScorer();
  const languages: RealizationLanguage[] = ['en', 'el', 'es', 'id'];
  const results: ItemResult[] = [];

  // Per-language accumulators
  const langStats = new Map<RealizationLanguage, {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    literalCoverages: number[];
    latencies: number[];
    semanticScores: {
      completeness: number;
      consistency: number;
      predicateClarity: number;
      roleCoverage: number;
      protectedLiteralPreservation: number;
      overall: number;
    }[];
  }>();

  for (const lang of languages) {
    langStats.set(lang, {
      total: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      literalCoverages: [],
      latencies: [],
      semanticScores: []
    });
  }

  // Run realization for each language
  for (const lang of languages) {
    const stats = langStats.get(lang)!;

    for (const item of dataset.slice(0, manifest.limits.maxItems)) {
      stats.total++;
      const started = performance.now();

      try {
        // Create a LunumRecord from the experiment item
        const record = createRecordFromItem(item as any);
        if (!record) continue;

        // Realize to target language
        const realization = engine.realize(record, lang);

        // Detect protected literals in the source
        const detectedLiterals = detector.detect(record);

        // Score the semantic content
        const semanticScore = scorer.score(record, detectedLiterals);

        // Calculate protected literal coverage
        const sourceLiterals = item.protectedLiterals ?? [];
        const coverage = literalCoverage(realization.text, sourceLiterals);

        // Determine pass/fail
        const passed = coverage === 1;
        if (passed) stats.passed++;
        else stats.failed++;

        stats.literalCoverages.push(coverage);
        stats.latencies.push(performance.now() - started);
        stats.semanticScores.push({
          completeness: semanticScore.components.completeness,
          consistency: semanticScore.components.consistency,
          predicateClarity: semanticScore.components.predicateClarity,
          roleCoverage: semanticScore.components.roleCoverage,
          protectedLiteralPreservation: semanticScore.components.protectedLiteralPreservation,
          overall: semanticScore.overall
        });

        results.push({
          id: item.id,
          status: passed ? 'passed' : 'failed',
          rawOutput: realization.text,
          realizedText: realization.text.trim(),
          exact: passed,
          featureRecall: coverage,
          featurePrecision: coverage,
          protectedLiteralCoverage: coverage,
          latencyMs: performance.now() - started
        });
      } catch (error) {
        stats.errors++;
        results.push({
          id: item.id,
          status: 'error',
          rawOutput: '',
          error: error instanceof Error ? error.message : String(error),
          latencyMs: performance.now() - started
        });
      }
    }
  }

  // Compute per-language metrics
  const metrics: Record<RealizationLanguage, RealizationMetric> = {} as any;
  const passRates: Record<RealizationLanguage, number> = {} as any;

  for (const lang of languages) {
    const stats = langStats.get(lang)!;
    const passRate = stats.total > 0 ? stats.passed / stats.total : 0;
    const avgLiteralCoverage = stats.literalCoverages.length > 0
      ? stats.literalCoverages.reduce((a, b) => a + b, 0) / stats.literalCoverages.length
      : 0;
    const avgLatencyMs = stats.latencies.length > 0
      ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
      : 0;

    // Average semantic scores
    const avgSemantic = stats.semanticScores.length > 0
      ? {
          completeness: stats.semanticScores.reduce((s, sc) => s + sc.completeness, 0) / stats.semanticScores.length,
          consistency: stats.semanticScores.reduce((s, sc) => s + sc.consistency, 0) / stats.semanticScores.length,
          predicateClarity: stats.semanticScores.reduce((s, sc) => s + sc.predicateClarity, 0) / stats.semanticScores.length,
          roleCoverage: stats.semanticScores.reduce((s, sc) => s + sc.roleCoverage, 0) / stats.semanticScores.length,
          protectedLiteralPreservation: stats.semanticScores.reduce((s, sc) => s + sc.protectedLiteralPreservation, 0) / stats.semanticScores.length
        }
      : { completeness: 0, consistency: 0, predicateClarity: 0, roleCoverage: 0, protectedLiteralPreservation: 0 };

    // Compute weighted overall semantic score
    const overallSemantic =
      avgSemantic.completeness * 0.3 +
      avgSemantic.consistency * 0.25 +
      avgSemantic.predicateClarity * 0.2 +
      avgSemantic.roleCoverage * 0.15 +
      avgSemantic.protectedLiteralPreservation * 0.2;

    const semanticWithOverall = { ...avgSemantic, overall: overallSemantic };

    metrics[lang] = {
      language: lang,
      total: stats.total,
      passed: stats.passed,
      failed: stats.failed,
      errors: stats.errors,
      passRate,
      avgProtectedLiteralCoverage: Math.round(avgLiteralCoverage * 1000) / 1000,
      avgLatencyMs: Math.round(avgLatencyMs),
      semanticScores: {
        ...semanticWithOverall,
        overall: Math.round(semanticWithOverall.overall * 1000) / 1000
      }
    };

    passRates[lang] = Math.round(passRate * 1000) / 1000;
  }

  // Compute overall summary
  const totalItems = results.length;
  const totalPassed = results.filter(r => r.status === 'passed').length;
  const totalFailed = results.filter(r => r.status === 'failed').length;
  const totalErrors = results.filter(r => r.status === 'error').length;
  const overallPassRate = totalItems > 0 ? totalPassed / totalItems : 0;
  const allCoverages = results
    .filter(r => r.protectedLiteralCoverage !== undefined)
    .map(r => r.protectedLiteralCoverage!);
  const avgProtectedLiteralCoverage = allCoverages.length > 0
    ? allCoverages.reduce((a, b) => a + b, 0) / allCoverages.length
    : 0;
  const allLatencies = results.map(r => r.latencyMs);
  const avgLatencyMs = allLatencies.length > 0
    ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
    : 0;

  const report: RealizationReport = {
    experimentId: manifest.id,
    languages,
    totalRecords: totalItems,
    metrics,
    passRates,
    summary: {
      totalItems,
      totalPassed,
      totalFailed,
      totalErrors,
      overallPassRate: Math.round(overallPassRate * 1000) / 1000,
      avgProtectedLiteralCoverage: Math.round(avgProtectedLiteralCoverage * 1000) / 1000,
      avgLatencyMs: Math.round(avgLatencyMs)
    },
    generatedAt: Date.now()
  };

  // Write report to disk
  const outputDir = path.join(root, manifest.outputDirectory ?? 'reports/realization');
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `${manifest.id}-report.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  return { results, report, output: reportPath };
}

/**
 * Write a human-readable realization report summary.
 */
export function writeRealizationReport(report: RealizationReport, outputDir: string): void {
  const lines: string[] = [];
  lines.push('# Realization Experiment Report');
  lines.push('');
  lines.push(`Experiment: ${report.experimentId}`);
  lines.push(`Languages: ${report.languages.join(', ')}`);
  lines.push(`Total Records: ${report.totalRecords}`);
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total Items: ${report.summary.totalItems}`);
  lines.push(`- Passed: ${report.summary.totalPassed}`);
  lines.push(`- Failed: ${report.summary.totalFailed}`);
  lines.push(`- Errors: ${report.summary.totalErrors}`);
  lines.push(`- Overall Pass Rate: ${(report.summary.overallPassRate * 100).toFixed(1)}%`);
  lines.push(`- Avg Protected-Literal Coverage: ${(report.summary.avgProtectedLiteralCoverage * 100).toFixed(1)}%`);
  lines.push(`- Avg Latency: ${report.summary.avgLatencyMs}ms`);
  lines.push('');
  lines.push('## Per-Language Metrics');
  lines.push('');

  for (const lang of report.languages) {
    const m = report.metrics[lang];
    lines.push(`### ${lang.toUpperCase()}`);
    lines.push('');
    lines.push(`- Total: ${m.total}`);
    lines.push(`- Passed: ${m.passed}`);
    lines.push(`- Failed: ${m.failed}`);
    lines.push(`- Errors: ${m.errors}`);
    lines.push(`- Pass Rate: ${(m.passRate * 100).toFixed(1)}%`);
    lines.push(`- Avg Protected-Literal Coverage: ${(m.avgProtectedLiteralCoverage * 100).toFixed(1)}%`);
    lines.push(`- Avg Latency: ${m.avgLatencyMs}ms`);
    lines.push(`- Semantic Scores:`);
    lines.push(`  - Completeness: ${m.semanticScores.completeness.toFixed(3)}`);
    lines.push(`  - Consistency: ${m.semanticScores.consistency.toFixed(3)}`);
    lines.push(`  - Predicate Clarity: ${m.semanticScores.predicateClarity.toFixed(3)}`);
    lines.push(`  - Role Coverage: ${m.semanticScores.roleCoverage.toFixed(3)}`);
    lines.push(`  - Protected-Literal Preservation: ${m.semanticScores.protectedLiteralPreservation.toFixed(3)}`);
    lines.push(`  - Overall: ${m.semanticScores.overall.toFixed(3)}`);
    lines.push('');
  }

  const filePath = path.join(outputDir, `${report.experimentId}-summary.md`);
  // Use synchronous write for this utility function
  import('node:fs').then(fs => fs.writeFileSync(filePath, lines.join('\n'), 'utf-8'));
}

// ── Helpers ────────────────────────────────────────────────────────

function createRecordFromItem(item: ExperimentItem): LunumRecord | null {
  if (!item.sourceText || !item.sourceLanguage) return null;

  const sem = (item.goldSem ?? item.goldenSem) as LunumSem;
  if (!sem) return null;

  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: {
      text: item.sourceText,
      language: item.sourceLanguage,
      role: null,
      ref: null
    },
    sem,
    fingerprint: `fp-${item.id}`,
    renderings: {},
    policy: {
      eligible: true,
      category: 'realization',
      risk: 'low' as const,
      confidence: 0.9,
      reasons: ['realization experiment']
    },
    meta: {}
  } as LunumRecord;
}

function literalCoverage(text: string, literals: string[]): number {
  if (!literals.length) return 1;
  const lowerText = text.toLowerCase();
  const found = literals.filter((literal) => lowerText.includes(literal.toLowerCase())).length;
  return found / literals.length;
}
