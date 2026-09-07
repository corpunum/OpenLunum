import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NearSemanticFingerprintGenerator, validateSemanticCandidate } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, readJson, writeJson } from './io.js';
import { computeThresholdSweep, scorePairs, type LabeledPair } from './threshold-sweep.js';
import { extractStructuredJson } from './parse-experiment.js';

interface RawExtraction { id: string; kind: 'memory' | 'query'; valid: boolean; rawOutput: string }
interface RetrievalReport { queryResults: Array<{ queryId: string; expectedMemoryIds: string[] }>; metrics: Record<string, unknown> }
interface CriticalPair { id: string; semA: LunumSem; semB: LunumSem }

const THRESHOLDS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

async function latestRun(root: string): Promise<string> {
  const explicit = process.argv[2];
  if (explicit) return path.isAbsolute(explicit) ? explicit : path.join(root, explicit);
  throw new Error('Usage: node stage2-threshold-calibration.js <retrieval-run-directory>');
}

export async function runStage2ThresholdCalibration(): Promise<string> {
  const root = await findWorkspaceRoot();
  const run = await latestRun(root);
  const report = await readJson<RetrievalReport>(path.join(run, 'retrieval-report.json'));
  const extractions = await readJson<RawExtraction[]>(path.join(run, 'raw-extractions.json'));
  const semById = new Map<string, LunumSem>();
  let extractionFailures = 0;
  for (const item of extractions) {
    try {
      const parsed = extractStructuredJson(item.rawOutput);
      const validation = validateSemanticCandidate(parsed);
      if (!item.valid || !validation.ok || (parsed as Record<string, unknown>).status === 'abstain') throw new Error('not a usable extracted Sem');
      semById.set(item.id, parsed as LunumSem);
    } catch { extractionFailures += 1; }
  }
  const pairs: LabeledPair[] = [];
  for (const query of report.queryResults) {
    const querySem = semById.get(query.queryId);
    if (!querySem) continue;
    for (const [memoryId, memorySem] of [...semById.entries()].filter(([id]) => id.startsWith('m-'))) {
      pairs.push({ id: `${query.queryId}:${memoryId}`, source: 'raw-model-extraction', label: query.expectedMemoryIds.includes(memoryId) ? 'positive' : 'negative', semA: querySem, semB: memorySem });
    }
  }
  const scored = scorePairs(pairs);
  const sweep = computeThresholdSweep(scored, THRESHOLDS);
  const falsePositivesAt08 = scored.filter((pair) => pair.label === 'negative' && pair.similarity >= 0.8).map((pair) => ({ id: pair.id, similarity: pair.similarity, hardCompatible: pair.hardCompatible }));
  const criticalItems = (await readFile(path.join(root, 'datasets/adversarial/critical-semantic-differences-v1.jsonl'), 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as CriticalPair);
  const criticalGenerator = new NearSemanticFingerprintGenerator(0.8);
  const critical = criticalItems.map((item) => {
    const result = criticalGenerator.compareSem(item.semA, item.semB);
    return { id: item.id, similarity: result.similarity, hardCompatible: result.hardCompatible ?? false, similarAt08: result.similar };
  });
  const output = path.join(root, 'reports/experiments/threshold-sweep', `stage2-extracted-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  await mkdir(output, { recursive: true });
  await writeJson(path.join(output, 'summary.json'), { version: 'stage2-threshold-calibration/0.1', sourceRun: path.relative(root, run), extractionFailures, pairCounts: { total: pairs.length, positive: pairs.filter((pair) => pair.label === 'positive').length, negative: pairs.filter((pair) => pair.label === 'negative').length }, sweep, falsePositivesAt08, critical, sourceMetrics: report.metrics });
  return output;
}

if (process.argv[1]?.endsWith('stage2-threshold-calibration.js')) console.log(await runStage2ThresholdCalibration());
