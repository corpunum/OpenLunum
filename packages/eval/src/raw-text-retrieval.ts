/** End-to-end retrieval boundary: raw text enters on both sides; Sem is never supplied by the dataset. */

import { fingerprintSem, NearSemanticFingerprintGenerator, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export const RAW_TEXT_RETRIEVAL_VERSION = '0.1.0';
export interface RawTextMemory { id: string; text: string; language: string }
export interface RawTextQuery { id: string; text: string; language: string; targetLanguage?: string; expectedMemoryIds: string[] }
export interface RawTextExtractionInput { id: string; text: string; language: string; kind: 'memory' | 'query' }
export type RawTextExtractor = (input: RawTextExtractionInput) => LunumSem | null | Promise<LunumSem | null>;

export interface RawTextRetrievalQueryResult {
  queryId: string; queryLanguage: string; targetLanguage: string | null; expectedMemoryIds: string[];
  retrievedMemoryIds: string[]; matchedMemoryIds: string[]; extracted: boolean; candidateCount: number;
  extractionError?: string; semanticMatchingFailures: string[]; rankingFailures: string[];
  precision: number; recall: number; f1: number; top1Correct: boolean;
}
export interface RawTextRetrievalMetrics {
  queries: number; memoryCount: number; queryExtractionFailures: number; memoryExtractionFailures: number;
  semanticMatchingFailures: number; rankingFailures: number; truePositives: number; falsePositives: number;
  falseNegatives: number; trueNegatives: number; precision: number; recall: number; f1: number;
  top1Accuracy: number; topKRecall: number; falsePositiveRate: number;
  byLanguagePair: Record<string, { queries: number; precision: number; recall: number; f1: number; topKRecall: number; falsePositiveRate: number }>;
}
export interface RawTextRetrievalReport { version: string; threshold: number; topK: number; inputMode: 'raw-text-only'; metrics: RawTextRetrievalMetrics; queryResults: RawTextRetrievalQueryResult[] }

interface ExtractedMemory { memory: RawTextMemory; sem: LunumSem | null; error?: string }
function metrics(tp: number, fp: number, fn: number, tn: number): Pick<RawTextRetrievalMetrics, 'precision' | 'recall' | 'f1' | 'falsePositiveRate'> {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return { precision, recall, f1: precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0, falsePositiveRate: fp + tn > 0 ? fp / (fp + tn) : 0 };
}
async function extract(input: RawTextExtractionInput, extractor: RawTextExtractor): Promise<{ sem: LunumSem | null; error?: string }> {
  try {
    const value = await extractor(input);
    if (value === null) return { sem: null, error: 'extractor abstained' };
    const validation = validateSem(value);
    if (!validation.ok) return { sem: null, error: `invalid extracted Sem: ${validation.errors.join('; ')}` };
    return { sem: value };
  } catch (error) { return { sem: null, error: error instanceof Error ? error.message : String(error) }; }
}

export async function runRawTextRetrievalEvaluation(input: { memories: RawTextMemory[]; queries: RawTextQuery[]; extract: RawTextExtractor; threshold?: number; topK?: number }): Promise<RawTextRetrievalReport> {
  const threshold = input.threshold ?? 0.8;
  const topK = input.topK ?? 5;
  const near = new NearSemanticFingerprintGenerator(threshold);
  const extractedMemories: ExtractedMemory[] = [];
  for (const memory of input.memories) {
    const result = await extract({ ...memory, kind: 'memory' }, input.extract);
    extractedMemories.push({ memory, sem: result.sem, ...(result.error ? { error: result.error } : {}) });
  }
  const queryResults: RawTextRetrievalQueryResult[] = [];
  for (const query of input.queries) {
    const queryExtraction = await extract({ ...query, kind: 'query' }, input.extract);
    if (!queryExtraction.sem) {
      queryResults.push({ queryId: query.id, queryLanguage: query.language, targetLanguage: query.targetLanguage ?? null, expectedMemoryIds: [...query.expectedMemoryIds], retrievedMemoryIds: [], matchedMemoryIds: [], extracted: false, candidateCount: 0, extractionError: queryExtraction.error ?? 'extractor abstained', semanticMatchingFailures: [...query.expectedMemoryIds], rankingFailures: [], precision: 1, recall: 0, f1: 0, top1Correct: false });
      continue;
    }
    const candidates: Array<{ id: string; score: number }> = [];
    const matchingFailures: string[] = [];
    for (const entry of extractedMemories) {
      if (query.targetLanguage && entry.memory.language !== query.targetLanguage) continue;
      if (!entry.sem) { if (query.expectedMemoryIds.includes(entry.memory.id)) matchingFailures.push(entry.memory.id); continue; }
      const exact = fingerprintSem(queryExtraction.sem) === fingerprintSem(entry.sem);
      const comparison = exact ? null : near.compareSem(queryExtraction.sem, entry.sem);
      const score = exact ? 1 : (comparison?.similar ? comparison.similarity : -1);
      if (score >= threshold) candidates.push({ id: entry.memory.id, score });
      else if (query.expectedMemoryIds.includes(entry.memory.id)) matchingFailures.push(entry.memory.id);
    }
    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const retrievedMemoryIds = candidates.slice(0, topK).map((candidate) => candidate.id);
    const expected = new Set(query.expectedMemoryIds);
    const matchedMemoryIds = retrievedMemoryIds.filter((id) => expected.has(id));
    const fp = retrievedMemoryIds.filter((id) => !expected.has(id)).length;
    const fn = query.expectedMemoryIds.filter((id) => !retrievedMemoryIds.includes(id)).length;
    const rankingFailures = query.expectedMemoryIds.filter((id) => !matchingFailures.includes(id) && !retrievedMemoryIds.includes(id));
    queryResults.push({ queryId: query.id, queryLanguage: query.language, targetLanguage: query.targetLanguage ?? null, expectedMemoryIds: [...query.expectedMemoryIds], retrievedMemoryIds, matchedMemoryIds, extracted: true, candidateCount: candidates.length, semanticMatchingFailures: matchingFailures, rankingFailures, ...metrics(matchedMemoryIds.length, fp, fn, 0), top1Correct: retrievedMemoryIds[0] !== undefined && expected.has(retrievedMemoryIds[0]) });
  }
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  for (const result of queryResults) {
    const expected = new Set(result.expectedMemoryIds);
    tp += result.matchedMemoryIds.length;
    fp += result.retrievedMemoryIds.filter((id) => !expected.has(id)).length;
    fn += result.expectedMemoryIds.filter((id) => !result.retrievedMemoryIds.includes(id)).length;
    tn += Math.max(0, extractedMemories.length - result.retrievedMemoryIds.length - result.expectedMemoryIds.length);
  }
  const byLanguagePair: RawTextRetrievalMetrics['byLanguagePair'] = {};
  const buckets = new Map<string, RawTextRetrievalQueryResult[]>();
  for (const result of queryResults) { const key = `${result.queryLanguage}-${result.targetLanguage ?? '*'}`; buckets.set(key, [...(buckets.get(key) ?? []), result]); }
  for (const [pair, results] of buckets) {
    const pairTp = results.reduce((sum, result) => sum + result.matchedMemoryIds.length, 0);
    const pairFp = results.reduce((sum, result) => sum + result.retrievedMemoryIds.filter((id) => !result.expectedMemoryIds.includes(id)).length, 0);
    const pairFn = results.reduce((sum, result) => sum + result.expectedMemoryIds.filter((id) => !result.retrievedMemoryIds.includes(id)).length, 0);
    const pairTn = results.reduce((sum, result) => sum + Math.max(0, extractedMemories.length - result.retrievedMemoryIds.length - result.expectedMemoryIds.length), 0);
    byLanguagePair[pair] = { queries: results.length, ...metrics(pairTp, pairFp, pairFn, pairTn), topKRecall: results.length > 0 ? results.reduce((sum, result) => sum + result.recall, 0) / results.length : 0 };
  }
  return { version: RAW_TEXT_RETRIEVAL_VERSION, threshold, topK, inputMode: 'raw-text-only', metrics: { queries: queryResults.length, memoryCount: input.memories.length, queryExtractionFailures: queryResults.filter((result) => !result.extracted).length, memoryExtractionFailures: extractedMemories.filter((entry) => !entry.sem).length, semanticMatchingFailures: queryResults.reduce((sum, result) => sum + result.semanticMatchingFailures.length, 0), rankingFailures: queryResults.reduce((sum, result) => sum + result.rankingFailures.length, 0), truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: tn, ...metrics(tp, fp, fn, tn), top1Accuracy: queryResults.length > 0 ? queryResults.filter((result) => result.top1Correct).length / queryResults.length : 0, topKRecall: queryResults.length > 0 ? queryResults.reduce((sum, result) => sum + result.recall, 0) / queryResults.length : 0, byLanguagePair }, queryResults };
}
