import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type { LunumSem } from '@corpunum/lunum';
import { runRawTextRetrievalEvaluation } from '../src/raw-text-retrieval.js';

interface CriticalDifference {
  id: string;
  sourceTextA: string;
  sourceTextB: string;
  semA: LunumSem;
  semB: LunumSem;
}

async function findWorkspaceRoot(start: string): Promise<string> {
  let current = path.resolve(start);
  for (;;) {
    try {
      await access(path.join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`workspace root not found above ${start}`);
      current = parent;
    }
  }
}

const workspaceRoot = await findWorkspaceRoot(process.cwd());
const datasetPath = path.join(workspaceRoot, 'datasets/adversarial/critical-semantic-differences-v1.jsonl');
const items: CriticalDifference[] = (await readFile(datasetPath, 'utf8'))
  .split(/\r?\n/u)
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as CriticalDifference);

test('raw-text critical mutations do not retrieve their unmutated memory', async () => {
  const byText = new Map<string, LunumSem>();
  for (const item of items) {
    byText.set(item.sourceTextA, item.semA);
    byText.set(item.sourceTextB, item.semB);
  }
  const report = await runRawTextRetrievalEvaluation({
    memories: items.map((item) => ({ id: `${item.id}:source`, text: item.sourceTextA, language: 'en' })),
    queries: items.map((item) => ({ id: `${item.id}:mutation-query`, text: item.sourceTextB, language: 'en', expectedMemoryIds: [] })),
    extract: ({ text }) => byText.get(text) ?? null,
    threshold: 0.8,
    topK: 1,
  });

  assert.equal(report.inputMode, 'raw-text-only');
  assert.equal(report.metrics.queryExtractionFailures, 0);
  assert.equal(report.metrics.memoryExtractionFailures, 0);
  assert.equal(report.metrics.falsePositives, 0, `critical mutation false positives: ${report.queryResults.filter((result) => result.retrievedMemoryIds.length > 0).map((result) => result.queryId).join(', ')}`);
  assert.equal(report.metrics.top1Accuracy, 1);
});
