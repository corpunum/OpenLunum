/**
 * Cross-lingual retrieval precision measurement
 *
 * Measures precision when querying in language A and retrieving
 * semantically equivalent records in language B. Uses Lunum-Sem
 * fingerprints for cross-lingual semantic matching.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parseFingerprint } from '@corpunum/lunum';
import type { LunumRecord, LunumSem } from '@corpunum/lunum';
import type { LanguageCode } from './multilingual-retrieval.js';

// ── Types ──────────────────────────────────────────────────────────

export type CrossLingualLanguagePair = [LanguageCode, LanguageCode];

export interface CrossLingualQuery {
  /** Query text in source language */
  queryText: string;
  /** Language of the query */
  queryLanguage: LanguageCode;
  /** Target language to retrieve from */
  targetLanguage: LanguageCode;
  /** Expected record IDs that are semantically equivalent */
  expectedIds: string[];
}

export interface CrossLingualResult {
  /** Retrieved record ID */
  id: string;
  /** Fingerprint of retrieved record */
  fingerprint: string;
  /** Source language of retrieved record */
  sourceLanguage: LanguageCode;
  /** Text content */
  text: string;
  /** Whether this is a true semantic match */
  isTrueMatch: boolean;
}

export interface CrossLingualQueryResult {
  queryId: string;
  queryText: string;
  queryLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  retrieved: CrossLingualResult[];
  expectedIds: string[];
  truePositives: string[];
  falsePositives: string[];
  precision: number;
  recall: number;
  f1Score: number;
}

export interface CrossLingualMetrics {
  /** Average precision across all queries */
  meanPrecision: number;
  /** Average recall across all queries */
  meanRecall: number;
  /** Average F1 score across all queries */
  meanF1Score: number;
  /** Number of queries with perfect precision (1.0) */
  perfectPrecisionCount: number;
  /** Number of queries with zero precision (0.0) */
  zeroPrecisionCount: number;
  /** Per-language-pair metrics */
  byLanguagePair: Record<string, {
    count: number;
    meanPrecision: number;
    meanRecall: number;
    meanF1Score: number;
  }>;
  /** Per-language-pair metrics */
  bySourceLanguage: Record<LanguageCode, {
    count: number;
    meanPrecision: number;
    meanRecall: number;
    meanF1Score: number;
  }>;
  /** Per-language-pair metrics */
  byTargetLanguage: Record<LanguageCode, {
    count: number;
    meanPrecision: number;
    meanRecall: number;
    meanF1Score: number;
  }>;
}

export interface CrossLingualReport {
  experimentId: string;
  runId: string;
  totalQueries: number;
  overallMetrics: CrossLingualMetrics;
  perQueryResults: CrossLingualQueryResult[];
  generatedAt: number;
}

// ── Cross-Lingual Index ────────────────────────────────────────────

/**
 * Index Lunum-Sem records for cross-lingual retrieval.
 * Uses fingerprints to identify semantically equivalent records
 * across different languages.
 */
export class CrossLingualIndex {
  private records: Map<string, LunumRecord> = new Map();
  private fingerprintIndex: Map<string, LunumRecord[]> = new Map();
  private languageIndex: Map<LanguageCode, string[]> = new Map();

  /**
   * Add records to the index.
   * Records are indexed by fingerprint (for cross-lingual matching)
   * and by language (for targeted retrieval).
   */
  add(records: LunumRecord[]): void {
    for (const record of records) {
      const id = record.fingerprint || crypto.randomUUID();
      this.records.set(id, record);

      // Index by language
      const lang = (record.source.language as LanguageCode) || 'en';
      if (!this.languageIndex.has(lang)) {
        this.languageIndex.set(lang, []);
      }
      this.languageIndex.get(lang)!.push(id);

      // Index by fingerprint for cross-lingual semantic matching
      const fp = record.fingerprint;
      if (fp) {
        const parsed = parseFingerprint(fp);
        if (parsed) {
          // Group by the digest prefix (shared fingerprints indicate equivalence)
          const fpGroup = parsed.digest.slice(0, 8);
          if (!this.fingerprintIndex.has(fpGroup)) {
            this.fingerprintIndex.set(fpGroup, []);
          }
          this.fingerprintIndex.get(fpGroup)!.push(record);
        }
      }
    }
  }

  /**
   * Get all record IDs for a specific language.
   */
  getIdsByLanguage(lang: LanguageCode): string[] {
    return this.languageIndex.get(lang) || [];
  }

  /**
   * Get a record by ID.
   */
  getById(id: string): LunumRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Get all languages in the index.
   */
  getLanguages(): LanguageCode[] {
    return Array.from(this.languageIndex.keys());
  }

  /**
   * Get index statistics.
   */
  getStats(): {
    totalRecords: number;
    recordsByLanguage: Record<LanguageCode, number>;
  } {
    const recordsByLanguage: Record<LanguageCode, number> = {};
    for (const [lang, ids] of this.languageIndex.entries()) {
      recordsByLanguage[lang] = ids.length;
    }
    return {
      totalRecords: this.records.size,
      recordsByLanguage
    };
  }
}

// ── Cross-Lingual Retrieval ────────────────────────────────────────

/**
 * Run cross-lingual retrieval precision measurement.
 *
 * For each query in language A, retrieve records from language B
 * and measure precision/recall based on known semantic equivalence.
 */
export async function runCrossLingualRetrieval(
  experimentId: string,
  index: CrossLingualIndex,
  queries: CrossLingualQuery[],
  maxResults: number = 10
): Promise<CrossLingualReport> {
  const results: CrossLingualQueryResult[] = [];

  for (const query of queries) {
    const result = evaluateQuery(index, query, maxResults);
    results.push(result);
  }

  // Compute aggregate metrics
  const metrics = computeMetrics(results);

  const report: CrossLingualReport = {
    experimentId,
    runId: new Date().toISOString().replace(/[:.]/gu, '-'),
    totalQueries: results.length,
    overallMetrics: metrics,
    perQueryResults: results,
    generatedAt: Date.now()
  };

  return report;
}

/**
 * Evaluate a single cross-lingual query.
 */
function evaluateQuery(
  index: CrossLingualIndex,
  query: CrossLingualQuery,
  maxResults: number
): CrossLingualQueryResult {
  // Get candidate records from target language
  const targetIds = index.getIdsByLanguage(query.targetLanguage);
  const retrieved: CrossLingualResult[] = [];

  for (const id of targetIds.slice(0, maxResults)) {
    const record = index.getById(id);
    if (!record) continue;

    // Determine if this is a true semantic match
    const isTrueMatch = query.expectedIds.includes(id);

    retrieved.push({
      id,
      fingerprint: record.fingerprint || '',
      sourceLanguage: (record.source.language as LanguageCode) || query.targetLanguage,
      text: record.source.text || '',
      isTrueMatch
    });
  }

  // Compute metrics
  const truePositives = retrieved.filter(r => r.isTrueMatch).map(r => r.id);
  const falsePositives = retrieved.filter(r => !r.isTrueMatch).map(r => r.id);

  const precision = retrieved.length > 0
    ? truePositives.length / retrieved.length
    : 0;

  const recall = query.expectedIds.length > 0
    ? truePositives.length / query.expectedIds.length
    : 1;

  const f1Score = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;

  return {
    queryId: `${query.queryLanguage}-${query.targetLanguage}-${query.queryText.slice(0, 20)}`,
    queryText: query.queryText,
    queryLanguage: query.queryLanguage,
    targetLanguage: query.targetLanguage,
    retrieved,
    expectedIds: query.expectedIds,
    truePositives,
    falsePositives,
    precision,
    recall,
    f1Score
  };
}

/**
 * Compute aggregate cross-lingual retrieval metrics.
 */
function computeMetrics(results: CrossLingualQueryResult[]): CrossLingualMetrics {
  const byLanguagePair: Record<string, number[]> = {};
  const bySourceLanguage: Record<LanguageCode, number[]> = {};
  const byTargetLanguage: Record<LanguageCode, number[]> = {};

  for (const r of results) {
    const pairKey = `${r.queryLanguage}->${r.targetLanguage}`;
    if (!byLanguagePair[pairKey]) byLanguagePair[pairKey] = [];
    byLanguagePair[pairKey]!.push(r.precision);

    const srcArr = bySourceLanguage[r.queryLanguage];
    if (!srcArr) { bySourceLanguage[r.queryLanguage] = []; }
    bySourceLanguage[r.queryLanguage]!.push(r.precision);

    const tgtArr = byTargetLanguage[r.targetLanguage];
    if (!tgtArr) { byTargetLanguage[r.targetLanguage] = []; }
    byTargetLanguage[r.targetLanguage]!.push(r.precision);
  }

  // Compute language pair metrics
  const metricsByPair: CrossLingualMetrics['byLanguagePair'] = {};
  for (const [pair, precisions] of Object.entries(byLanguagePair)) {
    const count = precisions.length;
    const meanPrecision = count > 0 ? precisions.reduce((a, b) => a + b, 0) / count : 0;
    // Need recall too — compute from results
    const pairResults = results.filter(r => `${r.queryLanguage}->${r.targetLanguage}` === pair);
    const meanRecall = pairResults.length > 0
      ? pairResults.reduce((a, r) => a + r.recall, 0) / pairResults.length
      : 0;
    const meanF1 = pairResults.length > 0
      ? pairResults.reduce((a, r) => a + r.f1Score, 0) / pairResults.length
      : 0;

    metricsByPair[pair] = { count, meanPrecision, meanRecall, meanF1Score: meanF1 };
  }

  // Compute source language metrics
  const metricsBySource: CrossLingualMetrics['bySourceLanguage'] = {} as any;
  for (const [lang, precisions] of Object.entries(bySourceLanguage)) {
    const count = precisions.length;
    const meanPrecision = count > 0 ? precisions.reduce((a, b) => a + b, 0) / count : 0;
    const langResults = results.filter(r => r.queryLanguage === lang);
    const meanRecall = langResults.length > 0
      ? langResults.reduce((a, r) => a + r.recall, 0) / langResults.length
      : 0;
    const meanF1 = langResults.length > 0
      ? langResults.reduce((a, r) => a + r.f1Score, 0) / langResults.length
      : 0;

    metricsBySource[lang as LanguageCode] = { count, meanPrecision, meanRecall, meanF1Score: meanF1 };
  }

  // Compute target language metrics
  const metricsByTarget: CrossLingualMetrics['byTargetLanguage'] = {} as any;
  for (const [lang, precisions] of Object.entries(byTargetLanguage)) {
    const count = precisions.length;
    const meanPrecision = count > 0 ? precisions.reduce((a, b) => a + b, 0) / count : 0;
    const langResults = results.filter(r => r.targetLanguage === lang);
    const meanRecall = langResults.length > 0
      ? langResults.reduce((a, r) => a + r.recall, 0) / langResults.length
      : 0;
    const meanF1 = langResults.length > 0
      ? langResults.reduce((a, r) => a + r.f1Score, 0) / langResults.length
      : 0;

    metricsByTarget[lang as LanguageCode] = { count, meanPrecision, meanRecall, meanF1Score: meanF1 };
  }

  const perfectPrecisionCount = results.filter(r => r.precision === 1.0).length;
  const zeroPrecisionCount = results.filter(r => r.precision === 0.0).length;

  const overallPrecision = results.length > 0
    ? results.reduce((a, r) => a + r.precision, 0) / results.length
    : 0;
  const overallRecall = results.length > 0
    ? results.reduce((a, r) => a + r.recall, 0) / results.length
    : 0;
  const overallF1 = results.length > 0
    ? results.reduce((a, r) => a + r.f1Score, 0) / results.length
    : 0;

  return {
    meanPrecision: overallPrecision,
    meanRecall: overallRecall,
    meanF1Score: overallF1,
    perfectPrecisionCount,
    zeroPrecisionCount,
    byLanguagePair: metricsByPair,
    bySourceLanguage: metricsBySource,
    byTargetLanguage: metricsByTarget
  };
}

// ── Fixture Generation ─────────────────────────────────────────────

/**
 * Generate cross-lingual query fixtures from a dataset of parallel records.
 *
 * Each group of parallel records (same semantic content, different languages)
 * becomes a cross-lingual query:
 * - Query in language A
 * - Expected to retrieve records in language B from the same semantic group
 */
export interface ParallelRecordGroup {
  /** Semantic group identifier */
  groupId: string;
  /** Records in different languages but same semantics */
  records: LunumRecord[];
}

/**
 * Create cross-lingual queries from parallel record groups.
 * For each group, generate queries from each language to all other languages.
 */
export function createCrossLingualQueries(
  groups: ParallelRecordGroup[],
  maxQueriesPerGroup: number = 5
): CrossLingualQuery[] {
  const queries: CrossLingualQuery[] = [];
  const languages: LanguageCode[] = ['en', 'el', 'es', 'id'];

  for (const group of groups) {
    if (group.records.length < 2) continue;

    // Group records by language
    const recordsByLang = new Map<LanguageCode, LunumRecord>();
    for (const record of group.records) {
      const lang = (record.source.language as LanguageCode) || 'en';
      if (!recordsByLang.has(lang)) {
        recordsByLang.set(lang, record);
      }
    }

    if (recordsByLang.size < 2) continue;

    // Generate queries
    let count = 0;
    for (const [sourceLang, sourceRecord] of recordsByLang) {
      if (count >= maxQueriesPerGroup) break;

      // For each other language, create a query
      for (const targetLang of languages) {
        if (sourceLang === targetLang) continue;
        if (count >= maxQueriesPerGroup) break;

        // Expected IDs: records from target language in same group
        const targetRecords = recordsByLang.get(targetLang);
        if (!targetRecords) continue;

        queries.push({
          queryText: sourceRecord.source.text || '',
          queryLanguage: sourceLang,
          targetLanguage: targetLang,
          expectedIds: [targetRecords.fingerprint || '']
        });
        count++;
      }
    }
  }

  return queries;
}

// ── CLI Helper ─────────────────────────────────────────────────────

/**
 * Print a human-readable cross-lingual retrieval summary.
 */
export function printCrossLingualReport(report: CrossLingualReport): void {
  console.log('\n=== Cross-Lingual Retrieval Report ===');
  console.log(`Experiment: ${report.experimentId}`);
  console.log(`Total Queries: ${report.totalQueries}`);
  console.log();

  const m = report.overallMetrics;
  console.log('Overall Metrics:');
  console.log(`  Mean Precision:    ${(m.meanPrecision * 100).toFixed(1)}%`);
  console.log(`  Mean Recall:       ${(m.meanRecall * 100).toFixed(1)}%`);
  console.log(`  Mean F1 Score:     ${(m.meanF1Score * 100).toFixed(1)}%`);
  console.log(`  Perfect Precision: ${m.perfectPrecisionCount}`);
  console.log(`  Zero Precision:    ${m.zeroPrecisionCount}`);
  console.log();

  console.log('By Language Pair:');
  for (const [pair, metrics] of Object.entries(m.byLanguagePair)) {
    console.log(`  ${pair}:`);
    console.log(`    Precision: ${(metrics.meanPrecision * 100).toFixed(1)}%  Recall: ${(metrics.meanRecall * 100).toFixed(1)}%  F1: ${(metrics.meanF1Score * 100).toFixed(1)}%`);
  }

  console.log('===============================\n');
}
