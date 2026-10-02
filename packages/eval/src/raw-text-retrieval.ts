/** End-to-end retrieval boundary: raw text enters on both sides; Sem is never supplied by the dataset. */

import { NearSemanticFingerprintGenerator, semanticFingerprint, submitCandidate } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export const RAW_TEXT_RETRIEVAL_VERSION = '0.6.0';
export interface RawTextMemory { id: string; text: string; language: string }
export interface RawTextQuery {
  id: string; text: string; language: string; targetLanguage?: string;
  /** Expected records after routing. */
  expectedMemoryIds: string[];
  /** All semantically equivalent records, including routed-out languages. */
  semanticEquivalentMemoryIds?: string[];
}
export interface RawTextExtractionInput { id: string; text: string; language: string; kind: 'memory' | 'query' }
export type RawTextExtractor = (input: RawTextExtractionInput) => LunumSem | null | Promise<LunumSem | null>;

/** A baseline must consume the same raw text as the semantic system. */
export type RawTextBaseline = (input: {
  query: Omit<RawTextQuery, 'expectedMemoryIds' | 'semanticEquivalentMemoryIds'>;
  memories: RawTextMemory[];
  topK: number;
}) => string[] | Promise<string[]>;

export interface RawTextBaselineMetrics {
  precision: number; recall: number; f1: number; top1Accuracy: number;
  topKRecall: number; falsePositiveRate: number; examinedFalsePositiveRate: number | null; truePositives: number;
  falsePositives: number; falseNegatives: number; trueNegatives: number;
  failures: number;
  negativeQueryCount: number;
  negativeComparableQueryCount: number;
  examinedNegativePairs: number;
  unexaminedNegativePairs: number;
  positiveTop1Accuracy: number;
  negativeRejectionAccuracy: number;
}

export interface RawTextRetrievalQueryResult {
  queryId: string; queryLanguage: string; targetLanguage: string | null; expectedMemoryIds: string[]; semanticEquivalentMemoryIds: string[]; routedOutEquivalentMemoryIds: string[];
  retrievedMemoryIds: string[]; matchedMemoryIds: string[]; exactRetrievedMemoryIds: string[]; nearSemanticRetrievedMemoryIds: string[];
  extracted: boolean; routedCorpusCount: number; candidateCount: number; identityAvailableCandidateCount: number; identityUnavailableMemoryIds: string[];
  identityUnavailableExpectedMemoryIds: string[]; identityUnavailableNegativeMemoryIds: string[];
  examinedNegativePairs: number; unexaminedNegativePairs: number;
  extractionError?: string; semanticMatchingFailures: string[]; rankingFailures: string[];
  precision: number; recall: number; f1: number; falsePositiveRate: number; examinedFalsePositiveRate: number | null; top1Correct: boolean;
}
export interface RawTextRetrievalMetrics {
  queries: number; memoryCount: number; queryExtractionFailures: number; memoryExtractionFailures: number;
  queryIdentityAvailable: number; memoryIdentityAvailable: number;
  queryIdentityCoverage: number; memoryIdentityCoverage: number;
  routedRawCandidatePairs: number; identityAvailableCandidatePairs: number; identityUnavailableCandidatePairs: number;
  identityUnavailableExpectedCandidatePairs: number; identityUnavailableNegativeCandidatePairs: number;
  examinedNegativePairs: number; unexaminedNegativePairs: number;
  conditionalQueryCount: number; conditionalTop1Accuracy: number; conditionalRecall: number;
  semanticMatchingFailures: number; rankingFailures: number; truePositives: number; falsePositives: number;
  falseNegatives: number; trueNegatives: number; precision: number; recall: number; f1: number;
  exactRetrievedCount: number; nearSemanticRetrievedCount: number;
  top1Accuracy: number; topKRecall: number; falsePositiveRate: number; examinedFalsePositiveRate: number | null;
  positiveTop1Accuracy: number; negativeRejectionAccuracy: number;
  negativeQueryCount: number; negativeComparableQueryCount: number;
  byLanguagePair: Record<string, { queries: number; precision: number; recall: number; f1: number; topKRecall: number; falsePositiveRate: number; examinedFalsePositiveRate: number | null; examinedNegativePairs: number; unexaminedNegativePairs: number }>;
}
export interface RawTextRetrievalReport {
  version: string; threshold: number; topK: number; mode: 'exact' | 'near-semantic'; inputMode: 'raw-text-only'; retrievalBasis: 'candidate-identity-not-promoted';
  metrics: RawTextRetrievalMetrics; queryResults: RawTextRetrievalQueryResult[];
  baselines: Record<string, RawTextBaselineMetrics>;
}

function validateRetrievalInput(input: { memories: RawTextMemory[]; queries: RawTextQuery[]; threshold?: number; topK?: number; mode?: 'exact' | 'near-semantic' }): void {
  if (!input || !Array.isArray(input.memories) || !Array.isArray(input.queries)) throw new TypeError('memories and queries must be arrays');
  const memoryIds = new Set<string>();
  for (const [index, memory] of input.memories.entries()) {
    if (!memory || typeof memory.id !== 'string' || !memory.id.trim() || typeof memory.text !== 'string' || !memory.text.trim() || typeof memory.language !== 'string' || !memory.language.trim()) throw new TypeError(`invalid memory at index ${index}`);
    validateInputFields(memory, `memory ${memory.id}`, new Set(['id', 'text', 'language', 'type']));
    if ('type' in memory && memory.type !== 'memory') throw new TypeError(`invalid memory type at index ${index}`);
    if (memoryIds.has(memory.id)) throw new TypeError(`duplicate memory id: ${memory.id}`);
    memoryIds.add(memory.id);
  }
  const queryIds = new Set<string>();
  for (const [index, query] of input.queries.entries()) {
    if (!query || typeof query.id !== 'string' || !query.id.trim() || typeof query.text !== 'string' || !query.text.trim() || typeof query.language !== 'string' || !query.language.trim() || !Array.isArray(query.expectedMemoryIds) || query.expectedMemoryIds.some((id) => typeof id !== 'string')) throw new TypeError(`invalid query at index ${index}`);
    validateInputFields(query, `query ${query.id}`, new Set(['id', 'text', 'language', 'targetLanguage', 'expectedMemoryIds', 'semanticEquivalentMemoryIds', 'type']));
    if ('type' in query && query.type !== 'query') throw new TypeError(`invalid query type at index ${index}`);
    if (query.targetLanguage !== undefined && (typeof query.targetLanguage !== 'string' || !query.targetLanguage.trim())) throw new TypeError(`invalid query target language at index ${index}`);
    if (queryIds.has(query.id)) throw new TypeError(`duplicate query id: ${query.id}`);
    queryIds.add(query.id);
    const expected = new Set(query.expectedMemoryIds);
    if (expected.size !== query.expectedMemoryIds.length) throw new TypeError(`duplicate expected memory id in query: ${query.id}`);
    if ([...expected].some((id) => !memoryIds.has(id))) throw new TypeError(`query ${query.id} references an unknown expected memory`);
    if (query.targetLanguage) {
      const memoriesById = new Map(input.memories.map((memory) => [memory.id, memory]));
      if ([...expected].some((id) => memoriesById.get(id)?.language !== query.targetLanguage)) {
        throw new TypeError(`query ${query.id} expected IDs must belong to the target language route`);
      }
    }
    if (query.semanticEquivalentMemoryIds !== undefined) {
      if (!Array.isArray(query.semanticEquivalentMemoryIds) || query.semanticEquivalentMemoryIds.some((id) => typeof id !== 'string')) throw new TypeError(`invalid semantic equivalent IDs in query: ${query.id}`);
      if (new Set(query.semanticEquivalentMemoryIds).size !== query.semanticEquivalentMemoryIds.length) throw new TypeError(`duplicate semantic equivalent memory id in query: ${query.id}`);
      if (query.semanticEquivalentMemoryIds.some((id) => !memoryIds.has(id))) throw new TypeError(`query ${query.id} references an unknown semantic equivalent memory`);
      if (query.expectedMemoryIds.some((id) => !query.semanticEquivalentMemoryIds!.includes(id))) throw new TypeError(`query ${query.id} expected IDs must be semantic equivalents`);
    }
  }
  const threshold = input.threshold ?? 0.8;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new TypeError('threshold must be finite and between 0 and 1');
  const topK = input.topK ?? 5;
  if (!Number.isInteger(topK) || topK < 1) throw new TypeError('topK must be a positive integer');
  if (input.mode !== undefined && input.mode !== 'exact' && input.mode !== 'near-semantic') throw new TypeError('mode must be exact or near-semantic');
}

function validateInputFields(record: object, label: string, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(record)) {
    const normalized = key.replace(/[-_]/gu, '').toLowerCase();
    if (/^(?:(?:query|target|gold|expected))?sem(?:antic)?(?:gold)?$/u.test(normalized)) {
      throw new TypeError(`${label} contains forbidden semantic input field: ${key}`);
    }
    if (!allowed.has(key)) throw new TypeError(`${label} contains unknown input field: ${key}`);
  }
}

interface ExtractedMemory { memory: RawTextMemory; sem: LunumSem | null; error?: string }
function metrics(tp: number, fp: number, fn: number, tn: number, examinedTn = tn): Pick<RawTextRetrievalMetrics, 'precision' | 'recall' | 'f1' | 'falsePositiveRate' | 'examinedFalsePositiveRate'> {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return {
    precision,
    recall,
    f1: precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0,
    falsePositiveRate: fp + tn > 0 ? fp / (fp + tn) : 0,
    examinedFalsePositiveRate: fp + examinedTn > 0 ? fp / (fp + examinedTn) : null,
  };
}

function retrievalMetrics(
  results: Array<{ retrievedMemoryIds: string[]; expectedMemoryIds: string[]; candidateCount: number; failed?: boolean }>,
): RawTextBaselineMetrics {
  let tp = 0; let fp = 0; let fn = 0; let tn = 0; let examinedTn = 0; let unexaminedNegativePairs = 0;
  for (const result of results) {
    const expected = new Set(result.expectedMemoryIds);
    const retrieved = [...new Set(result.retrievedMemoryIds)];
    const matched = retrieved.filter(id => expected.has(id));
    tp += matched.length;
    fp += retrieved.filter(id => !expected.has(id)).length;
    fn += result.expectedMemoryIds.filter(id => !retrieved.includes(id)).length;
    const resultTn = Math.max(0, result.candidateCount - retrieved.length - expected.size + matched.length);
    tn += resultTn;
    if (result.failed) unexaminedNegativePairs += Math.max(0, result.candidateCount - expected.size);
    else examinedTn += resultTn;
  }
  const aggregate = metrics(tp, fp, fn, tn, examinedTn);
  const positiveResults = results.filter((result) => result.expectedMemoryIds.length > 0);
  const positiveTop1Accuracy = positiveResults.length > 0
    ? positiveResults.filter((result) => !result.failed && result.retrievedMemoryIds[0] !== undefined && result.expectedMemoryIds.includes(result.retrievedMemoryIds[0]!)).length / positiveResults.length
    : 0;
  const comparableNegativeResults = results.filter((result) => result.expectedMemoryIds.length === 0 && !result.failed && result.candidateCount > 0);
  return {
    ...aggregate,
    top1Accuracy: positiveTop1Accuracy,
    positiveTop1Accuracy,
    negativeRejectionAccuracy: comparableNegativeResults.length > 0
      ? comparableNegativeResults.filter((result) => result.retrievedMemoryIds.length === 0).length / comparableNegativeResults.length : 0,
    negativeQueryCount: results.filter((result) => result.expectedMemoryIds.length === 0).length,
    negativeComparableQueryCount: comparableNegativeResults.length,
    examinedNegativePairs: examinedTn + fp,
    unexaminedNegativePairs,
    topKRecall: results.filter((result) => result.expectedMemoryIds.length > 0).length > 0 ? results.reduce((sum, result) => {
      const expected = new Set(result.expectedMemoryIds);
      return sum + (expected.size === 0 ? 0 : result.retrievedMemoryIds.filter(id => expected.has(id)).length / expected.size);
    }, 0) / results.filter((result) => result.expectedMemoryIds.length > 0).length : 0,
    truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: tn,
    failures: results.filter(result => result.failed).length,
  };
}
async function extract(input: RawTextExtractionInput, extractor: RawTextExtractor): Promise<{ sem: LunumSem | null; error?: string }> {
  try {
    const value = await extractor(Object.freeze({ ...input }));
    if (value === null) return { sem: null, error: 'extractor abstained' };
    const submission = submitCandidate({
      sourceText: input.text,
      sourceLanguage: input.language,
      candidateSem: value,
      provenance: { extractorType: 'other' },
    });
    if (!submission.candidateIdentityAvailable || !submission.sem) {
      const reasons = [submission.failureClass, ...submission.diagnostics].filter(Boolean).join('; ');
      return { sem: null, error: `candidate identity unavailable: ${reasons || 'submitCandidate rejected the candidate'}` };
    }
    // This evaluator measures candidate identity. It deliberately does not
    // propagate submitCandidate trust or promotion decisions into retrieval.
    return { sem: submission.sem };
  } catch (error) { return { sem: null, error: error instanceof Error ? error.message : String(error) }; }
}

export async function runRawTextRetrievalEvaluation(input: {
  memories: RawTextMemory[]; queries: RawTextQuery[]; extract: RawTextExtractor;
  threshold?: number; topK?: number; mode?: 'exact' | 'near-semantic'; baselines?: Record<string, RawTextBaseline>;
}): Promise<RawTextRetrievalReport> {
  validateRetrievalInput(input);
  const threshold = input.threshold ?? 0.8;
  const topK = input.topK ?? 5;
  const mode = input.mode ?? 'exact';
  const near = mode === 'near-semantic' ? new NearSemanticFingerprintGenerator(threshold) : null;
  const extractedMemories: ExtractedMemory[] = [];
  for (const memory of input.memories) {
    const result = await extract({ id: memory.id, text: memory.text, language: memory.language, kind: 'memory' }, input.extract);
    extractedMemories.push({ memory, sem: result.sem, ...(result.error ? { error: result.error } : {}) });
  }
  const queryResults: RawTextRetrievalQueryResult[] = [];
  for (const query of input.queries) {
    // The extractor receives only the raw source contract. Expected IDs and
    // semantic-equivalence labels are evaluator-private scoring metadata.
    const queryExtraction = await extract({ id: query.id, text: query.text, language: query.language, kind: 'query' }, input.extract);
    const semanticEquivalentMemoryIds = [...(query.semanticEquivalentMemoryIds ?? query.expectedMemoryIds)];
    const routedMemories = input.memories.filter((memory) => !query.targetLanguage || memory.language === query.targetLanguage);
    const routedIds = new Set(routedMemories.map((memory) => memory.id));
    const routedOutEquivalentMemoryIds = semanticEquivalentMemoryIds.filter((id) => !routedIds.has(id));
    const identityAvailableMemories = extractedMemories.filter((entry) => routedIds.has(entry.memory.id) && entry.sem !== null);
    const identityAvailableIds = new Set(identityAvailableMemories.map((entry) => entry.memory.id));
    const identityUnavailableMemoryIds = routedMemories.filter((memory) => !identityAvailableIds.has(memory.id)).map((memory) => memory.id);
    const expectedIds = new Set(query.expectedMemoryIds);
    const identityUnavailableExpectedMemoryIds = identityUnavailableMemoryIds.filter((id) => expectedIds.has(id));
    const identityUnavailableNegativeMemoryIds = identityUnavailableMemoryIds.filter((id) => !expectedIds.has(id));
    const unexaminedNegativePairs = queryExtraction.sem
      ? identityUnavailableNegativeMemoryIds.length
      : Math.max(0, routedMemories.length - query.expectedMemoryIds.length);
    if (!queryExtraction.sem) {
      const failedQueryTn = Math.max(0, routedMemories.length - query.expectedMemoryIds.length);
      queryResults.push({ queryId: query.id, queryLanguage: query.language, targetLanguage: query.targetLanguage ?? null, expectedMemoryIds: [...query.expectedMemoryIds], semanticEquivalentMemoryIds, routedOutEquivalentMemoryIds, retrievedMemoryIds: [], matchedMemoryIds: [], exactRetrievedMemoryIds: [], nearSemanticRetrievedMemoryIds: [], extracted: false, routedCorpusCount: routedMemories.length, candidateCount: identityAvailableMemories.length, identityAvailableCandidateCount: identityAvailableMemories.length, identityUnavailableMemoryIds, identityUnavailableExpectedMemoryIds, identityUnavailableNegativeMemoryIds, examinedNegativePairs: 0, unexaminedNegativePairs, extractionError: queryExtraction.error ?? 'extractor abstained', semanticMatchingFailures: [], rankingFailures: [], ...metrics(0, 0, query.expectedMemoryIds.length, failedQueryTn, 0), top1Correct: false });
      continue;
    }
    const candidates: Array<{ id: string; score: number; exact: boolean }> = [];
    const matchingFailures: string[] = [];
    for (const entry of extractedMemories.filter((candidate) => routedIds.has(candidate.memory.id))) {
      if (!entry.sem) continue;
      // Exact identity is intentionally fail-closed for unframed controlled
      // predicates. Retrieval must report such records as non-matches rather
      // than turning an identity precondition failure into a process failure.
      let exact = false;
      try {
        exact = semanticFingerprint(queryExtraction.sem) === semanticFingerprint(entry.sem);
      } catch {
        exact = false;
      }
      const comparison = exact || !near ? null : near.compareSem(queryExtraction.sem, entry.sem);
      const score = exact ? 1 : (comparison?.similar ? comparison.similarity : -1);
      if (score >= threshold) candidates.push({ id: entry.memory.id, score, exact });
      else if (query.expectedMemoryIds.includes(entry.memory.id)) matchingFailures.push(entry.memory.id);
    }
    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const retrievedMemoryIds = candidates.slice(0, topK).map((candidate) => candidate.id);
    const retrieved = candidates.slice(0, topK);
    const exactRetrievedMemoryIds = retrieved.filter((candidate) => candidate.exact).map((candidate) => candidate.id);
    const nearSemanticRetrievedMemoryIds = retrieved.filter((candidate) => !candidate.exact).map((candidate) => candidate.id);
    const expected = new Set(query.expectedMemoryIds);
    const matchedMemoryIds = retrievedMemoryIds.filter((id) => expected.has(id));
    const fp = retrievedMemoryIds.filter((id) => !expected.has(id)).length;
    const fn = query.expectedMemoryIds.filter((id) => !retrievedMemoryIds.includes(id)).length;
    const rankingFailures = query.expectedMemoryIds.filter((id) => identityAvailableIds.has(id) && !matchingFailures.includes(id) && !retrievedMemoryIds.includes(id));
    const candidateCount = identityAvailableMemories.length;
    const rawTrueNegatives = routedMemories.length - expected.size - fp;
    const examinedNegativePairs = Math.max(0, routedMemories.length - expected.size - unexaminedNegativePairs);
    queryResults.push({ queryId: query.id, queryLanguage: query.language, targetLanguage: query.targetLanguage ?? null, expectedMemoryIds: [...query.expectedMemoryIds], semanticEquivalentMemoryIds, routedOutEquivalentMemoryIds, retrievedMemoryIds, matchedMemoryIds, exactRetrievedMemoryIds, nearSemanticRetrievedMemoryIds, extracted: true, routedCorpusCount: routedMemories.length, candidateCount, identityAvailableCandidateCount: candidateCount, identityUnavailableMemoryIds, identityUnavailableExpectedMemoryIds, identityUnavailableNegativeMemoryIds, examinedNegativePairs, unexaminedNegativePairs, semanticMatchingFailures: matchingFailures, rankingFailures, ...metrics(matchedMemoryIds.length, fp, fn, Math.max(0, rawTrueNegatives), Math.max(0, rawTrueNegatives - unexaminedNegativePairs)), top1Correct: expected.size > 0 && retrievedMemoryIds[0] !== undefined && expected.has(retrievedMemoryIds[0]) });
  }
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  for (const result of queryResults) {
    const expected = new Set(result.expectedMemoryIds);
    tp += result.matchedMemoryIds.length;
    fp += result.retrievedMemoryIds.filter((id) => !expected.has(id)).length;
    fn += result.expectedMemoryIds.filter((id) => !result.retrievedMemoryIds.includes(id)).length;
    tn += Math.max(0, result.routedCorpusCount - result.expectedMemoryIds.length - result.retrievedMemoryIds.filter((id) => !result.expectedMemoryIds.includes(id)).length);
  }
  const byLanguagePair: RawTextRetrievalMetrics['byLanguagePair'] = {};
  const buckets = new Map<string, RawTextRetrievalQueryResult[]>();
  for (const result of queryResults) { const key = `${result.queryLanguage}-${result.targetLanguage ?? '*'}`; buckets.set(key, [...(buckets.get(key) ?? []), result]); }
  for (const [pair, results] of buckets) {
    const pairTp = results.reduce((sum, result) => sum + result.matchedMemoryIds.length, 0);
    const pairFp = results.reduce((sum, result) => sum + result.retrievedMemoryIds.filter((id) => !result.expectedMemoryIds.includes(id)).length, 0);
    const pairFn = results.reduce((sum, result) => sum + result.expectedMemoryIds.filter((id) => !result.retrievedMemoryIds.includes(id)).length, 0);
    const pairTn = results.reduce((sum, result) => {
      const falsePositives = result.retrievedMemoryIds.filter((id) => !result.expectedMemoryIds.includes(id)).length;
      return sum + Math.max(0, result.routedCorpusCount - result.expectedMemoryIds.length - falsePositives);
    }, 0);
    const positiveResults = results.filter((result) => result.expectedMemoryIds.length > 0);
    const pairUnexaminedNegativePairs = results.reduce((sum, result) => sum + result.unexaminedNegativePairs, 0);
    const pairExaminedTrueNegatives = Math.max(0, pairTn - pairUnexaminedNegativePairs);
    byLanguagePair[pair] = { queries: results.length, ...metrics(pairTp, pairFp, pairFn, pairTn, pairExaminedTrueNegatives), examinedNegativePairs: pairExaminedTrueNegatives + pairFp, unexaminedNegativePairs: pairUnexaminedNegativePairs, topKRecall: positiveResults.length > 0 ? positiveResults.reduce((sum, result) => sum + result.recall, 0) / positiveResults.length : 0 };
  }
  const baselines: Record<string, RawTextBaselineMetrics> = {};
  for (const [name, baseline] of Object.entries(input.baselines ?? {})) {
    const baselineResults: Array<{ retrievedMemoryIds: string[]; expectedMemoryIds: string[]; candidateCount: number; failed: boolean }> = [];
    for (const query of input.queries) {
      try {
        const rawQuery = Object.freeze({ id: query.id, text: query.text, language: query.language, ...(query.targetLanguage ? { targetLanguage: query.targetLanguage } : {}) });
        const memories = (query.targetLanguage ? input.memories.filter((memory) => memory.language === query.targetLanguage) : input.memories)
          .map(memory => Object.freeze({ id: memory.id, text: memory.text, language: memory.language }));
        const allowed = new Set(memories.map((memory) => memory.id));
        const retrieved = await baseline({ query: rawQuery, memories, topK });
        const unique = [...new Set(retrieved)];
        const invalid = unique.some((id) => !allowed.has(id));
        baselineResults.push({ retrievedMemoryIds: invalid ? [] : unique.slice(0, topK), expectedMemoryIds: query.expectedMemoryIds, candidateCount: memories.length, failed: invalid });
      } catch {
        const candidateCount = query.targetLanguage ? input.memories.filter((memory) => memory.language === query.targetLanguage).length : input.memories.length;
        baselineResults.push({ retrievedMemoryIds: [], expectedMemoryIds: query.expectedMemoryIds, candidateCount, failed: true });
      }
    }
    baselines[name] = retrievalMetrics(baselineResults);
  }
  const positiveQueryResults = queryResults.filter((result) => result.expectedMemoryIds.length > 0);
  const queryIdentityAvailable = queryResults.filter((result) => result.extracted).length;
  const memoryIdentityAvailable = extractedMemories.filter((entry) => entry.sem !== null).length;
  const conditionalResults = positiveQueryResults.filter((result) => result.extracted && result.expectedMemoryIds.some((id) => extractedMemories.some((entry) => entry.memory.id === id && entry.sem)));
  const conditionalTop1Accuracy = conditionalResults.length > 0 ? conditionalResults.filter((result) => result.top1Correct).length / conditionalResults.length : 0;
  const conditionalRecall = conditionalResults.length > 0 ? conditionalResults.reduce((sum, result) => {
    const eligibleExpected = result.expectedMemoryIds.filter((id) => !result.identityUnavailableMemoryIds.includes(id));
    const matched = result.retrievedMemoryIds.filter((id) => eligibleExpected.includes(id)).length;
    return sum + (eligibleExpected.length > 0 ? matched / eligibleExpected.length : 0);
  }, 0) / conditionalResults.length : 0;
  const negativeResults = queryResults.filter((result) => result.expectedMemoryIds.length === 0);
  const comparableNegativeResults = negativeResults.filter((result) => result.extracted && result.routedCorpusCount > 0 && result.identityUnavailableMemoryIds.length === 0);
  const routedRawCandidatePairs = queryResults.reduce((sum, result) => sum + result.routedCorpusCount, 0);
  const identityAvailableCandidatePairs = queryResults.reduce((sum, result) => sum + result.identityAvailableCandidateCount, 0);
  const unexaminedNegativePairs = queryResults.reduce((sum, result) => sum + result.unexaminedNegativePairs, 0);
  const examinedTrueNegatives = Math.max(0, tn - unexaminedNegativePairs);
  const examinedNegativePairs = examinedTrueNegatives + fp;
  const positiveTop1Accuracy = positiveQueryResults.length > 0
    ? positiveQueryResults.filter((result) => result.top1Correct).length / positiveQueryResults.length
    : 0;
  return {
    version: RAW_TEXT_RETRIEVAL_VERSION,
    threshold,
    topK,
    mode,
    inputMode: 'raw-text-only',
    retrievalBasis: 'candidate-identity-not-promoted',
    metrics: {
      queries: queryResults.length,
      memoryCount: input.memories.length,
      queryExtractionFailures: queryResults.filter((result) => !result.extracted).length,
      memoryExtractionFailures: extractedMemories.filter((entry) => !entry.sem).length,
      queryIdentityAvailable,
      memoryIdentityAvailable,
      queryIdentityCoverage: input.queries.length > 0 ? queryIdentityAvailable / input.queries.length : 0,
      memoryIdentityCoverage: input.memories.length > 0 ? memoryIdentityAvailable / input.memories.length : 0,
      routedRawCandidatePairs,
      identityAvailableCandidatePairs,
      identityUnavailableCandidatePairs: routedRawCandidatePairs - identityAvailableCandidatePairs,
      identityUnavailableExpectedCandidatePairs: queryResults.reduce((sum, result) => sum + result.identityUnavailableExpectedMemoryIds.length, 0),
      identityUnavailableNegativeCandidatePairs: queryResults.reduce((sum, result) => sum + result.identityUnavailableNegativeMemoryIds.length, 0),
      examinedNegativePairs,
      unexaminedNegativePairs,
      conditionalQueryCount: conditionalResults.length,
      conditionalTop1Accuracy,
      conditionalRecall,
      semanticMatchingFailures: queryResults.reduce((sum, result) => sum + result.semanticMatchingFailures.length, 0),
      rankingFailures: queryResults.reduce((sum, result) => sum + result.rankingFailures.length, 0),
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      trueNegatives: tn,
      exactRetrievedCount: queryResults.reduce((sum, result) => sum + result.exactRetrievedMemoryIds.length, 0),
      nearSemanticRetrievedCount: queryResults.reduce((sum, result) => sum + result.nearSemanticRetrievedMemoryIds.length, 0),
      ...metrics(tp, fp, fn, tn, examinedTrueNegatives),
      top1Accuracy: positiveTop1Accuracy,
      positiveTop1Accuracy,
      negativeRejectionAccuracy: comparableNegativeResults.length > 0
        ? comparableNegativeResults.filter((result) => result.retrievedMemoryIds.length === 0).length / comparableNegativeResults.length
        : 0,
      negativeQueryCount: negativeResults.length,
      negativeComparableQueryCount: comparableNegativeResults.length,
      topKRecall: positiveQueryResults.length > 0
        ? positiveQueryResults.reduce((sum, result) => sum + result.recall, 0) / positiveQueryResults.length
        : 0,
      byLanguagePair,
    },
    queryResults,
    baselines,
  };
}
