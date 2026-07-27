import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot } from './io.js';

export interface CrossLanguageRetrievalItem {
  id: string;
  queryLanguage: string;
  targetLanguage: string;
  semanticGroup: string;
  queryId: string;
  expectedMatchIds: string[];
  negative: boolean;
  negativeTargetGroup?: string;
  rationale: string;
}

export interface MultilingualRecord {
  id: string;
  semanticGroup: string;
  sourceLanguage: string;
  sourceText: string;
  goldSem: LunumSem;
  fingerprint: string;
}

export interface PairResult {
  id: string;
  queryLanguage: string;
  targetLanguage: string;
  semanticGroup: string;
  negative: boolean;
  fingerprintMatch: boolean;
  expectedMatch: boolean;
  correct: boolean;
}

export interface LanguagePairMetrics {
  pair: string;
  positiveCount: number;
  negativeCount: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface CrossLanguageSummary {
  totalPairs: number;
  positivePairs: number;
  negativePairs: number;
  overallPrecision: number;
  overallRecall: number;
  overallF1: number;
  byLanguagePair: LanguagePairMetrics[];
}

export async function loadRetrievalDataset(datasetPath?: string): Promise<CrossLanguageRetrievalItem[]> {
  const root = await findWorkspaceRoot();
  const filePath = datasetPath ?? path.join(root, 'datasets', 'cross-language-retrieval-v1.jsonl');
  const content = await readFile(filePath, 'utf-8');
  return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as CrossLanguageRetrievalItem);
}

export async function loadMultilingualRecords(): Promise<Map<string, MultilingualRecord>> {
  const root = await findWorkspaceRoot();
  const records = new Map<string, MultilingualRecord>();
  for (const file of ['multilingual-core-v1.jsonl', 'multilingual-extended-v1.jsonl']) {
    const content = await readFile(path.join(root, 'datasets', 'dev', file), 'utf-8');
    for (const line of content.split('\n').filter(l => l.trim())) {
      const item = JSON.parse(line) as {
        id: string;
        semanticGroup: string;
        sourceLanguage: string;
        sourceText: string;
        goldSem: LunumSem;
      };
      const fp = fingerprintSem(item.goldSem);
      records.set(item.id, {
        id: item.id,
        semanticGroup: item.semanticGroup,
        sourceLanguage: item.sourceLanguage,
        sourceText: item.sourceText,
        goldSem: item.goldSem,
        fingerprint: fp,
      });
    }
  }
  return records;
}

export function evaluateRetrievalPair(
  item: CrossLanguageRetrievalItem,
  records: Map<string, MultilingualRecord>,
): PairResult {
  const queryRecord = records.get(item.queryId);
  if (!queryRecord) {
    return {
      id: item.id,
      queryLanguage: item.queryLanguage,
      targetLanguage: item.targetLanguage,
      semanticGroup: item.semanticGroup,
      negative: item.negative,
      fingerprintMatch: false,
      expectedMatch: !item.negative,
      correct: false,
    };
  }

  if (item.negative) {
    const targetGroup = item.negativeTargetGroup ?? '';
    const targetRecords = [...records.values()].filter(
      r => r.semanticGroup === targetGroup && r.sourceLanguage === item.targetLanguage,
    );
    const anyMatch = targetRecords.some(r => r.fingerprint === queryRecord.fingerprint);
    return {
      id: item.id,
      queryLanguage: item.queryLanguage,
      targetLanguage: item.targetLanguage,
      semanticGroup: item.semanticGroup,
      negative: true,
      fingerprintMatch: anyMatch,
      expectedMatch: false,
      correct: !anyMatch,
    };
  }

  const expectedRecords = item.expectedMatchIds
    .map(id => records.get(id))
    .filter((r): r is MultilingualRecord => r !== undefined);
  const matched = expectedRecords.some(r => r.fingerprint === queryRecord.fingerprint);
  return {
    id: item.id,
    queryLanguage: item.queryLanguage,
    targetLanguage: item.targetLanguage,
    semanticGroup: item.semanticGroup,
    negative: false,
    fingerprintMatch: matched,
    expectedMatch: true,
    correct: matched,
  };
}

export function computePrecisionRecall(results: PairResult[]): CrossLanguageSummary {
  const positive = results.filter(r => !r.negative);
  const negative = results.filter(r => r.negative);

  const tp = positive.filter(r => r.fingerprintMatch && r.expectedMatch).length;
  const fn = positive.filter(r => !r.fingerprintMatch && r.expectedMatch).length;
  const fp = negative.filter(r => r.fingerprintMatch && !r.expectedMatch).length;
  const tn = negative.filter(r => !r.fingerprintMatch && !r.expectedMatch).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  const byPair = new Map<string, PairResult[]>();
  for (const r of results) {
    const key = `${r.queryLanguage}→${r.targetLanguage}`;
    (byPair.get(key) ?? (byPair.set(key, []), byPair.get(key)!)).push(r);
  }

  const byLanguagePair: LanguagePairMetrics[] = [];
  for (const [pair, items] of byPair) {
    const pPos = items.filter(r => !r.negative);
    const pNeg = items.filter(r => r.negative);
    const pTp = pPos.filter(r => r.fingerprintMatch).length;
    const pFn = pPos.filter(r => !r.fingerprintMatch).length;
    const pFp = pNeg.filter(r => r.fingerprintMatch).length;
    const pTn = pNeg.filter(r => !r.fingerprintMatch).length;
    const pPrec = pTp + pFp > 0 ? pTp / (pTp + pFp) : 1.0;
    const pRec = pTp + pFn > 0 ? pTp / (pTp + pFn) : 0;
    const pF1 = pPrec + pRec > 0 ? 2 * pPrec * pRec / (pPrec + pRec) : 0;
    byLanguagePair.push({
      pair,
      positiveCount: pPos.length,
      negativeCount: pNeg.length,
      truePositives: pTp,
      trueNegatives: pTn,
      falsePositives: pFp,
      falseNegatives: pFn,
      precision: pPrec,
      recall: pRec,
      f1: pF1,
    });
  }

  return {
    totalPairs: results.length,
    positivePairs: positive.length,
    negativePairs: negative.length,
    overallPrecision: precision,
    overallRecall: recall,
    overallF1: f1,
    byLanguagePair,
  };
}
