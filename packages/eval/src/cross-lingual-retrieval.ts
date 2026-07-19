/**
 * Cross-lingual retrieval precision measurement
 *
 * Measures precision when querying in language A and retrieving
 * semantically equivalent records in language B. Uses Lunum-Sem
 * structural equivalence for cross-lingual semantic matching.
 *
 * A record is considered semantically equivalent to another if they
 * share the same semantic group identifier (groupId) in their
 * annotations, regardless of language or surface text.
 */

import { mkdir, writeFile } from 'node:fs/promises';
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
 * Extract the semantic group ID from a record's annotations.
 * Returns undefined if no semantic group is specified.
 */
export function extractSemanticGroup(record: LunumRecord): string | undefined {
  const sem = record.sem as unknown as { annotations?: Record<string, unknown> };
  const annotations = sem?.annotations;
  if (!annotations || typeof annotations !== 'object') return undefined;
  const group = (annotations as any).groupId;
  if (typeof group === 'string' && group.length > 0) return group;
  // Fallback: use a hash of the canonicalized semantic content
  return undefined;
}

/**
 * Check if two records share the same semantic group.
 */
export function areSemanticallyEquivalent(a: LunumRecord, b: LunumRecord): boolean {
  const groupA = extractSemanticGroup(a);
  const groupB = extractSemanticGroup(b);
  if (groupA && groupB) return groupA === groupB;
  // Fallback: compare fingerprints
  if (a.fingerprint && b.fingerprint) {
    const fpA = a.fingerprint.split(':');
    const fpB = b.fingerprint.split(':');
    if (fpA.length >= 4 && fpB.length >= 4) {
      return fpA[3] === fpB[3]; // Same digest = same semantics
    }
  }
  return false;
}

/**
 * Index Lunum-Sem records for cross-lingual retrieval.
 * Records are indexed by language and by semantic group.
 */
export class CrossLingualIndex {
  private records: Map<string, LunumRecord> = new Map();
  private languageIndex: Map<LanguageCode, string[]> = new Map();
  private semanticGroupIndex: Map<string, string[]> = new Map();

  /**
   * Add records to the index.
   * Records are indexed by language and by semantic group ID.
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

      // Index by semantic group
      const groupId = extractSemanticGroup(record);
      if (groupId) {
        if (!this.semanticGroupIndex.has(groupId)) {
          this.semanticGroupIndex.set(groupId, []);
        }
        this.semanticGroupIndex.get(groupId)!.push(id);
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
   * Get all record IDs in the same semantic group.
   */
  getIdsBySemanticGroup(groupId: string): string[] {
    return this.semanticGroupIndex.get(groupId) || [];
  }

  /**
   * Get a record by ID.
   */
  getById(id: string): LunumRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Find semantically equivalent records in a target language.
   * Uses semantic group matching when available, falls back to
   * fingerprint comparison.
   */
  findEquivalentInLanguage(
    sourceRecord: LunumRecord,
    targetLang: LanguageCode
  ): LunumRecord[] {
    const targetIds = this.getIdsByLanguage(targetLang);
    const equivalents: LunumRecord[] = [];

    for (const id of targetIds) {
      const targetRecord = this.getById(id);
      if (!targetRecord) continue;
      if (areSemanticallyEquivalent(sourceRecord, targetRecord)) {
        equivalents.push(targetRecord);
      }
    }

    return equivalents;
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
    semanticGroups: number;
  } {
    const recordsByLanguage: Record<LanguageCode, number> = {};
    for (const [lang, ids] of this.languageIndex.entries()) {
      recordsByLanguage[lang] = ids.length;
    }
    return {
      totalRecords: this.records.size,
      recordsByLanguage,
      semanticGroups: this.semanticGroupIndex.size
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

    // Determine if this is a true semantic match using the query's expected IDs
    const isTrueMatch = query.expectedIds.some(expectedId => {
      // Direct match
      if (expectedId === id) return true;
      // Fingerprint digest match
      if (expectedId && record.fingerprint) {
        const fpParts = record.fingerprint.split(':');
        const expectedParts = expectedId.split(':');
        if (fpParts.length >= 4 && expectedParts.length >= 4) {
          return fpParts[3] === expectedParts[3];
        }
      }
      return false;
    });

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
 *
 * Uses semantic group IDs from annotations when available, falling back
 * to fingerprint comparison.
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
    const recordsByLang = new Map<LanguageCode, LunumRecord[]>();
    for (const record of group.records) {
      const lang = (record.source.language as LanguageCode) || 'en';
      if (!recordsByLang.has(lang)) {
        recordsByLang.set(lang, []);
      }
      recordsByLang.get(lang)!.push(record);
    }

    if (recordsByLang.size < 2) continue;

    // Generate queries
    let count = 0;
    for (const [sourceLang, sourceRecords] of recordsByLang) {
      if (count >= maxQueriesPerGroup) break;

      for (const targetLang of languages) {
        if (sourceLang === targetLang) continue;
        if (count >= maxQueriesPerGroup) break;

        const targetRecords = recordsByLang.get(targetLang);
        if (!targetRecords || targetRecords.length === 0) continue;

        // Build expected IDs from all target language records in this group
        const expectedIds = targetRecords.map(r => r.fingerprint || '');

        // Use the first source record as the query
        const sourceRecord = sourceRecords[0];
        if (!sourceRecord) continue;

        queries.push({
          queryText: sourceRecord.source.text || '',
          queryLanguage: sourceLang,
          targetLanguage: targetLang,
          expectedIds
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
