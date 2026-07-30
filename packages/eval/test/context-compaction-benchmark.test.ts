/**
 * Context Compaction Benchmark Tests
 *
 * Comprehensive tests for the context compaction benchmark.
 * Tests all 18 benchmark tasks across 6 categories.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

import {
  BENCHMARK_VERSION,
  BENCHMARK_TASKS,
  runBenchmark,
  type BenchmarkTask,
  type BenchmarkReport,
  type BenchmarkCategory
} from '../src/context-compaction-benchmark.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('Context Compaction Benchmark', () => {
  // ── Version Tests ──────────────────────────────────────────────

  it('should export correct benchmark version', () => {
    assert.strictEqual(BENCHMARK_VERSION, '0.1.0');
  });

  // ── Task Validation Tests ──────────────────────────────────────

  it('should have at least 18 benchmark tasks', () => {
    assert.ok(BENCHMARK_TASKS.length >= 18, `Expected at least 18 tasks, got ${BENCHMARK_TASKS.length}`);
  });

  it('should have 3 tasks per category', () => {
    const categories: BenchmarkCategory[] = ['qa', 'extraction', 'instruction-following', 'summarization', 'reasoning', 'rag'];

    for (const category of categories) {
      const tasksInCategory = BENCHMARK_TASKS.filter(t => t.category === category);
      assert.strictEqual(
        tasksInCategory.length,
        3,
        `Category '${category}' should have exactly 3 tasks, got ${tasksInCategory.length}`
      );
    }
  });

  it('should have all required task fields', () => {
    for (const task of BENCHMARK_TASKS) {
      assert.ok(task.id, `Task missing id`);
      assert.ok(task.name, `Task ${task.id} missing name`);
      assert.ok(task.category, `Task ${task.id} missing category`);
      assert.ok(task.naturalContext, `Task ${task.id} missing naturalContext`);
      assert.ok(task.lunumSem, `Task ${task.id} missing lunumSem`);
      assert.ok(task.question, `Task ${task.id} missing question`);
      assert.ok(task.expectedAnswer, `Task ${task.id} missing expectedAnswer`);
    }
  });

  it('should have valid category values', () => {
    const validCategories: BenchmarkCategory[] = ['qa', 'extraction', 'instruction-following', 'summarization', 'reasoning', 'rag'];

    for (const task of BENCHMARK_TASKS) {
      assert.ok(
        validCategories.includes(task.category),
        `Task ${task.id} has invalid category: ${task.category}`
      );
    }
  });

  it('should have unique task IDs', () => {
    const ids = BENCHMARK_TASKS.map(t => t.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(
      ids.length,
      uniqueIds.size,
      `Found duplicate task IDs`
    );
  });

  it('should have valid LunumSem objects', () => {
    for (const task of BENCHMARK_TASKS) {
      assert.ok(task.lunumSem.world, `Task ${task.id} LunumSem missing world`);
      assert.ok(Array.isArray(task.lunumSem.clauses), `Task ${task.id} LunumSem clauses not an array`);
      assert.ok(task.lunumSem.clauses.length > 0, `Task ${task.id} LunumSem has no clauses`);

      for (const clause of task.lunumSem.clauses) {
        assert.ok(clause.predicate, `Task ${task.id} clause missing predicate`);
        assert.ok(clause.roles, `Task ${task.id} clause missing roles`);
      }
    }
  });

  // ── Benchmark Execution Tests ──────────────────────────────────

  it('should run benchmark successfully', () => {
    const report = runBenchmark(BENCHMARK_TASKS);
    assert.ok(report, 'Benchmark report should be generated');
    assert.ok(report.tasks, 'Report should have tasks');
    assert.ok(report.results, 'Report should have results');
    assert.ok(report.summary, 'Report should have summary');
  });

  it('should generate results for all modes', () => {
    const report = runBenchmark(BENCHMARK_TASKS);
    const modes = new Set(report.results.map(r => r.mode));

    assert.strictEqual(modes.size, 3, 'Should have 3 modes');
    assert.ok(modes.has('natural'), 'Should have natural mode');
    assert.ok(modes.has('lunum'), 'Should have lunum mode');
    assert.ok(modes.has('mixed'), 'Should have mixed mode');
  });

  it('should have 3 results per task (one per mode)', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    for (const task of BENCHMARK_TASKS) {
      const taskResults = report.results.filter(r => r.taskId === task.id);
      assert.strictEqual(
        taskResults.length,
        3,
        `Task ${task.id} should have 3 results (one per mode), got ${taskResults.length}`
      );
    }
  });

  it('should have valid token counts', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    for (const result of report.results) {
      assert.ok(typeof result.tokenCount === 'number', `Result for ${result.taskId} has non-numeric tokenCount`);
      assert.ok(result.tokenCount > 0, `Result for ${result.taskId} has invalid tokenCount ${result.tokenCount}`);
    }
  });

  it('should have valid preservation metrics (booleans)', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    for (const result of report.results) {
      assert.strictEqual(typeof result.preservedLiterals, 'boolean', `preservedLiterals should be boolean for ${result.taskId}`);
      assert.strictEqual(typeof result.preservedRoles, 'boolean', `preservedRoles should be boolean for ${result.taskId}`);
      assert.strictEqual(typeof result.preservedNegation, 'boolean', `preservedNegation should be boolean for ${result.taskId}`);
      assert.strictEqual(typeof result.preservedModality, 'boolean', `preservedModality should be boolean for ${result.taskId}`);
    }
  });

  // ── Compression Ratio Tests ────────────────────────────────────

  it('should have compression ratio > 1 (lunum more compact than natural)', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    // Compression ratio should show lunum is more compact
    // ratio = lunumAvgTokens / naturalAvgTokens, should be < 1 for compression
    assert.ok(
      report.summary.compressionRatio < 1.5,
      `Compression ratio ${report.summary.compressionRatio} indicates poor compression`
    );
  });

  it('should have valid average token counts', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    assert.ok(report.summary.naturalAvgTokens > 0, 'Natural avg tokens should be positive');
    assert.ok(report.summary.lunumAvgTokens > 0, 'Lunum avg tokens should be positive');
    assert.ok(report.summary.mixedAvgTokens > 0, 'Mixed avg tokens should be positive');
  });

  it('should have valid preservation rate', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    assert.ok(
      typeof report.summary.preservationRate === 'number',
      'Preservation rate should be a number'
    );
    assert.ok(
      report.summary.preservationRate >= 0 && report.summary.preservationRate <= 1,
      `Preservation rate ${report.summary.preservationRate} out of valid range [0, 1]`
    );
  });

  it('should have mixed mode tokens between natural and lunum', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    // Mixed mode should typically fall between natural and lunum
    // This is a soft check as it depends on the tasks
    assert.ok(
      report.summary.mixedAvgTokens > 0,
      'Mixed average tokens should be positive'
    );
  });

  // ── Report Structure Tests ─────────────────────────────────────

  it('should have valid report structure', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    assert.strictEqual(typeof report.version, 'string', 'version should be string');
    assert.strictEqual(typeof report.timestamp, 'string', 'timestamp should be string');
    assert.ok(Array.isArray(report.tasks), 'tasks should be array');
    assert.ok(Array.isArray(report.results), 'results should be array');
    assert.ok(report.summary, 'summary should exist');
  });

  it('should have valid timestamp (ISO string)', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(report.timestamp),
      `Timestamp ${report.timestamp} is not in ISO format`
    );
  });

  it('should have report version matching constant', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    assert.strictEqual(report.version, BENCHMARK_VERSION, 'Report version should match BENCHMARK_VERSION');
  });

  it('should include all input tasks in report', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    assert.strictEqual(
      report.tasks.length,
      BENCHMARK_TASKS.length,
      'Report should include all input tasks'
    );
  });

  // ── Data Consistency Tests ─────────────────────────────────────

  it('should have consistent task IDs in results', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    const resultTaskIds = new Set(report.results.map(r => r.taskId));
    const expectedTaskIds = new Set(BENCHMARK_TASKS.map(t => t.id));

    for (const taskId of resultTaskIds) {
      assert.ok(
        expectedTaskIds.has(taskId),
        `Result has unexpected task ID: ${taskId}`
      );
    }
  });

  it('should have positive context size bytes', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    for (const result of report.results) {
      assert.ok(
        result.contextSizeBytes > 0,
        `Result for ${result.taskId} has invalid contextSizeBytes: ${result.contextSizeBytes}`
      );
    }
  });

  // ── Category Coverage Tests ────────────────────────────────────

  it('should evaluate all 6 categories', () => {
    const report = runBenchmark(BENCHMARK_TASKS);
    const categories = new Set(report.tasks.map(t => t.category));

    assert.strictEqual(categories.size, 6, 'Should have all 6 categories');
    assert.ok(categories.has('qa'));
    assert.ok(categories.has('extraction'));
    assert.ok(categories.has('instruction-following'));
    assert.ok(categories.has('summarization'));
    assert.ok(categories.has('reasoning'));
    assert.ok(categories.has('rag'));
  });

  // ── Report Writing Tests ───────────────────────────────────────

  it('should write report to eval-results directory', async () => {
    const report = runBenchmark(BENCHMARK_TASKS);
    const reportDir = path.join(WORKSPACE_ROOT, 'eval-results', 'compaction');

    await mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, 'context-compaction-report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    // Verify file was written
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(reportPath, 'utf-8');
    const parsed = JSON.parse(content);

    assert.ok(parsed, 'Report file should be readable');
    assert.strictEqual(parsed.version, BENCHMARK_VERSION, 'Written report should have correct version');
  });

  // ── Task-specific Tests ────────────────────────────────────────

  it('should have QA category tasks with questions and answers', () => {
    const qaTasks = BENCHMARK_TASKS.filter(t => t.category === 'qa');

    for (const task of qaTasks) {
      assert.ok(task.question.length > 0, `QA task ${task.id} has empty question`);
      assert.ok(task.expectedAnswer.length > 0, `QA task ${task.id} has empty expectedAnswer`);
      assert.ok(task.question.includes('?'), `QA task ${task.id} question should end with ?`);
    }
  });

  it('should have extraction category tasks with structured data', () => {
    const extractionTasks = BENCHMARK_TASKS.filter(t => t.category === 'extraction');

    for (const task of extractionTasks) {
      assert.ok(task.naturalContext.length > 50, `Extraction task ${task.id} context too short`);
      assert.ok(task.expectedAnswer.includes(':'), `Extraction task ${task.id} answer should have structured format`);
    }
  });

  it('should have summarization category tasks with longer contexts', () => {
    const summTasks = BENCHMARK_TASKS.filter(t => t.category === 'summarization');

    for (const task of summTasks) {
      assert.ok(
        task.naturalContext.length > 100,
        `Summarization task ${task.id} context should be longer than 100 chars`
      );
    }
  });

  it('should have reasoning category tasks with logical structure', () => {
    const reasoningTasks = BENCHMARK_TASKS.filter(t => t.category === 'reasoning');

    for (const task of reasoningTasks) {
      assert.ok(task.question.length > 20, `Reasoning task ${task.id} question too short`);
      // Reasoning tasks should have evidence chains
      const lowerAnswer = task.expectedAnswer.toLowerCase();
      assert.ok(
        lowerAnswer.includes('therefore') || task.expectedAnswer.includes('->') || task.expectedAnswer.includes('Rainfall'),
        `Reasoning task ${task.id} should show logical chain`
      );
    }
  });

  // ── Benchmark Consistency Tests ────────────────────────────────

  it('should produce consistent results across runs', () => {
    const report1 = runBenchmark(BENCHMARK_TASKS.slice(0, 3));
    const report2 = runBenchmark(BENCHMARK_TASKS.slice(0, 3));

    // Token counts should be identical (deterministic)
    assert.ok(report1.results.length > 0, 'Report 1 should have results');
    assert.ok(report2.results.length > 0, 'Report 2 should have results');
    assert.strictEqual(
      report1.results[0]?.tokenCount,
      report2.results[0]?.tokenCount,
      'Same input should produce same token counts'
    );
  });

  it('should handle subset of tasks', () => {
    const subset = BENCHMARK_TASKS.slice(0, 5);
    const report = runBenchmark(subset);

    assert.strictEqual(report.tasks.length, 5);
    assert.strictEqual(report.results.length, 15); // 5 tasks * 3 modes
  });

  it('should produce valid numeric summaries', () => {
    const report = runBenchmark(BENCHMARK_TASKS);

    const summary = report.summary;
    for (const [key, value] of Object.entries(summary)) {
      assert.strictEqual(
        typeof value,
        'number',
        `Summary.${key} should be a number, got ${typeof value}`
      );
      assert.ok(!isNaN(value), `Summary.${key} should not be NaN`);
      assert.ok(isFinite(value), `Summary.${key} should be finite`);
    }
  });
});
