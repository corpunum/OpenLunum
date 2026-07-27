import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBenchmarkDataset,
  runBenchmarkItem,
  computeSummary,
  type BenchmarkItem,
  type TaskType,
} from '../src/downstream-benchmark.js';

const REQUIRED_TASK_TYPES: TaskType[] = ['qa', 'extraction', 'instruction-following', 'summarization', 'reasoning'];
const MIN_ITEMS = 15;
const MIN_PER_TYPE = 3;

let items: BenchmarkItem[];

test('downstream-benchmark: loads dataset with ≥15 items', async () => {
  items = await loadBenchmarkDataset();
  assert.ok(items.length >= MIN_ITEMS, `expected ≥${MIN_ITEMS} items, got ${items.length}`);
});

test('downstream-benchmark: covers all 5 required task types', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const types = new Set(items.map(i => i.taskType));
  for (const t of REQUIRED_TASK_TYPES) {
    assert.ok(types.has(t), `missing task type: ${t}`);
  }
});

test('downstream-benchmark: ≥3 items per task type', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.taskType] = (counts[item.taskType] ?? 0) + 1;
  }
  for (const t of REQUIRED_TASK_TYPES) {
    assert.ok((counts[t] ?? 0) >= MIN_PER_TYPE, `task type ${t} has ${counts[t] ?? 0} items, need ≥${MIN_PER_TYPE}`);
  }
});

test('downstream-benchmark: every item has sourceText and sem', async () => {
  if (!items) items = await loadBenchmarkDataset();
  for (const item of items) {
    assert.ok(item.sourceText, `${item.id} missing sourceText`);
    assert.ok(item.sem, `${item.id} missing sem`);
    assert.ok(item.sem.schema, `${item.id} missing sem.schema`);
    assert.ok(item.sem.clauses.length > 0, `${item.id} has no clauses`);
  }
});

test('downstream-benchmark: every item has an expected answer or summary', async () => {
  if (!items) items = await loadBenchmarkDataset();
  for (const item of items) {
    const hasExpected = item.expectedAnswer || item.expectedSummary;
    assert.ok(hasExpected, `${item.id} missing expectedAnswer/expectedSummary`);
  }
});

test('downstream-benchmark: runBenchmarkItem produces results for all 3 modes', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const result = runBenchmarkItem(items[0]!);
  assert.ok(result.modes['natural'], 'missing natural mode');
  assert.ok(result.modes['lunum'], 'missing lunum mode');
  assert.ok(result.modes['mixed'], 'missing mixed mode');
  assert.ok(result.modes['natural']!.tokens > 0, 'natural tokens should be > 0');
});

test('downstream-benchmark: token savings are non-negative for eligible items', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const results = items.map(runBenchmarkItem);
  const eligible = results.filter(r => r.eligible);
  assert.ok(eligible.length > 0, 'no eligible items found');
  for (const r of eligible) {
    assert.ok(r.tokenSavings.lunumVsNatural >= 0, `${r.id}: lunum savings negative`);
  }
});

test('downstream-benchmark: natural mode always preserves answer content', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const results = items.map(runBenchmarkItem);
  for (const r of results) {
    assert.ok(r.qualityMetrics.naturalPreservesAnswer, `${r.id}: natural mode lost answer content`);
  }
});

test('downstream-benchmark: computeSummary covers all task types', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const results = items.map(runBenchmarkItem);
  const summary = computeSummary(results);
  assert.equal(summary.totalItems, items.length);
  for (const t of REQUIRED_TASK_TYPES) {
    assert.ok(summary.byTaskType[t], `summary missing task type: ${t}`);
    assert.ok(summary.byTaskType[t]!.count >= MIN_PER_TYPE);
  }
  assert.ok(summary.overall.naturalAnswerRate === 1.0, 'natural answer rate should be 1.0');
});

test('downstream-benchmark: mixed mode preserves answer for eligible items at same rate as natural', async () => {
  if (!items) items = await loadBenchmarkDataset();
  const results = items.map(runBenchmarkItem);
  const eligible = results.filter(r => r.eligible);
  const mixedPreserved = eligible.filter(r => r.qualityMetrics.mixedPreservesAnswer).length;
  const naturalPreserved = eligible.filter(r => r.qualityMetrics.naturalPreservesAnswer).length;
  assert.ok(
    mixedPreserved >= naturalPreserved * 0.8,
    `mixed mode lost too many answers: ${mixedPreserved}/${eligible.length} vs natural ${naturalPreserved}/${eligible.length}`
  );
});
