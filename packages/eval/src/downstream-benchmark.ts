import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  compileContext,
  renderSem,
  classifyEligibility,
} from '@corpunum/lunum';
import type { LunumSem, ContextMessage, ContextMode } from '@corpunum/lunum';
import { findWorkspaceRoot } from './io.js';

export type TaskType = 'qa' | 'extraction' | 'instruction-following' | 'summarization' | 'reasoning';

export interface BenchmarkItem {
  id: string;
  taskType: TaskType;
  sourceText: string;
  sem: LunumSem;
  question?: string;
  instruction?: string;
  extractionTarget?: string;
  expectedAnswer?: string;
  expectedSummary?: string;
}

export interface ModeResult {
  mode: ContextMode;
  tokens: number;
  content: string;
}

export interface BenchmarkResult {
  id: string;
  taskType: TaskType;
  modes: Record<string, ModeResult>;
  tokenSavings: {
    lunumVsNatural: number;
    mixedVsNatural: number;
  };
  qualityMetrics: {
    naturalPreservesAnswer: boolean;
    lunumPreservesAnswer: boolean;
    mixedPreservesAnswer: boolean;
  };
  eligible: boolean;
}

export interface BenchmarkSummary {
  totalItems: number;
  byTaskType: Record<string, {
    count: number;
    avgLunumSavings: number;
    avgMixedSavings: number;
    naturalAnswerRate: number;
    lunumAnswerRate: number;
    mixedAnswerRate: number;
  }>;
  overall: {
    avgLunumSavings: number;
    avgMixedSavings: number;
    naturalAnswerRate: number;
    lunumAnswerRate: number;
    mixedAnswerRate: number;
  };
}

const MODES: ContextMode[] = ['natural', 'lunum', 'mixed'];

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function answerPreserved(contextContent: string, expectedAnswer: string): boolean {
  const normContext = normalizeForComparison(contextContent);
  const normAnswer = normalizeForComparison(expectedAnswer);
  const answerTokens = normAnswer.split(' ').filter(Boolean);
  const matchCount = answerTokens.filter(token => normContext.includes(token)).length;
  return matchCount / answerTokens.length >= 0.5;
}

function getExpected(item: BenchmarkItem): string | undefined {
  return item.expectedAnswer ?? item.expectedSummary;
}

export function runBenchmarkItem(item: BenchmarkItem): BenchmarkResult {
  let lunumCode: string;
  try {
    const rendered = renderSem(item.sem, { profile: 'generic-en-pivot/0.1' });
    lunumCode = rendered.code;
  } catch {
    lunumCode = '';
  }

  const policy = classifyEligibility({
    category: item.sem.kind,
    risk: 'low',
    confidence: 0.95,
    sourceText: item.sourceText,
    semantic: true,
  });

  const message: ContextMessage = {
    role: 'user',
    content: item.sourceText,
    source: { text: item.sourceText },
    lunumCode: lunumCode || null,
    lunumMeta: policy,
  };

  const modes: Record<string, ModeResult> = {};
  for (const mode of MODES) {
    const compilation = compileContext([message], { mode });
    const selected = compilation.selectedMessages;
    const content = selected.map(m => m.content).join('\n');
    const tokens = mode === 'natural' ? compilation.naturalTokens
      : mode === 'lunum' ? compilation.lunumTokens
      : compilation.mixedTokens;
    modes[mode] = { mode, tokens, content };
  }

  const naturalTokens = modes['natural']!.tokens;
  const lunumTokens = modes['lunum']!.tokens;
  const mixedTokens = modes['mixed']!.tokens;

  const expected = getExpected(item);
  const qualityMetrics = {
    naturalPreservesAnswer: expected ? answerPreserved(modes['natural']!.content, expected) : true,
    lunumPreservesAnswer: expected ? answerPreserved(modes['lunum']!.content, expected) : true,
    mixedPreservesAnswer: expected ? answerPreserved(modes['mixed']!.content, expected) : true,
  };

  return {
    id: item.id,
    taskType: item.taskType,
    modes,
    tokenSavings: {
      lunumVsNatural: naturalTokens > 0 ? 1 - lunumTokens / naturalTokens : 0,
      mixedVsNatural: naturalTokens > 0 ? 1 - mixedTokens / naturalTokens : 0,
    },
    qualityMetrics,
    eligible: policy.eligible,
  };
}

export async function loadBenchmarkDataset(datasetPath?: string): Promise<BenchmarkItem[]> {
  const root = await findWorkspaceRoot();
  const filePath = datasetPath ?? path.join(root, 'datasets', 'downstream-benchmark-v1.jsonl');
  const content = await readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as BenchmarkItem);
}

export function computeSummary(results: BenchmarkResult[]): BenchmarkSummary {
  const byTaskType: Record<string, BenchmarkResult[]> = {};
  for (const r of results) {
    (byTaskType[r.taskType] ??= []).push(r);
  }

  const taskSummaries: BenchmarkSummary['byTaskType'] = {};
  for (const [taskType, items] of Object.entries(byTaskType)) {
    const avgLunum = items.reduce((s, r) => s + r.tokenSavings.lunumVsNatural, 0) / items.length;
    const avgMixed = items.reduce((s, r) => s + r.tokenSavings.mixedVsNatural, 0) / items.length;
    taskSummaries[taskType] = {
      count: items.length,
      avgLunumSavings: avgLunum,
      avgMixedSavings: avgMixed,
      naturalAnswerRate: items.filter(r => r.qualityMetrics.naturalPreservesAnswer).length / items.length,
      lunumAnswerRate: items.filter(r => r.qualityMetrics.lunumPreservesAnswer).length / items.length,
      mixedAnswerRate: items.filter(r => r.qualityMetrics.mixedPreservesAnswer).length / items.length,
    };
  }

  const all = results;
  return {
    totalItems: all.length,
    byTaskType: taskSummaries,
    overall: {
      avgLunumSavings: all.reduce((s, r) => s + r.tokenSavings.lunumVsNatural, 0) / all.length,
      avgMixedSavings: all.reduce((s, r) => s + r.tokenSavings.mixedVsNatural, 0) / all.length,
      naturalAnswerRate: all.filter(r => r.qualityMetrics.naturalPreservesAnswer).length / all.length,
      lunumAnswerRate: all.filter(r => r.qualityMetrics.lunumPreservesAnswer).length / all.length,
      mixedAnswerRate: all.filter(r => r.qualityMetrics.mixedPreservesAnswer).length / all.length,
    },
  };
}
