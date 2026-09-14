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
  const results = [];
  for (const item of items) {
    const report = await runRawTextRetrievalEvaluation({
      memories: [{ id: `${item.id}:source`, text: item.sourceTextA, language: 'en' }],
      queries: [{ id: `${item.id}:mutation-query`, text: item.sourceTextB, language: 'en', expectedMemoryIds: [] }],
      extract: ({ text }) => text === item.sourceTextA ? item.semA : text === item.sourceTextB ? item.semB : null,
      threshold: 0.8,
      topK: 1,
    });
    results.push({ item, report });
  }

  assert.equal(results.every(({ report }) => report.inputMode === 'raw-text-only'), true);
  const comparable = results.filter(({ report }) => report.metrics.queryIdentityAvailable === 1 && report.metrics.memoryIdentityAvailable === 1);
  assert.ok(comparable.length > 0, 'at least one critical pair must remain identity-comparable');
  assert.equal(results.every(({ report }) => report.metrics.falsePositives === 0), true, `critical mutation false positives: ${results.filter(({ report }) => report.metrics.falsePositives > 0).map(({ item }) => item.id).join(', ')}`);
  assert.equal(comparable.every(({ report }) => report.metrics.negativeRejectionAccuracy === 1), true);
});
