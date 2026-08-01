import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPACTION_TASKS,
  DEFAULT_RUN_CONFIG,
  simulateCompactionMeasurement,
  runCompactionBenchmark,
  type CompactionTask,
  type ContextMode,
} from '../src/compaction-execution-runner.js';

describe('compaction-execution-runner', () => {
  describe('COMPACTION_TASKS', () => {
    it('has 9 tasks (3 per mode)', () => {
      assert.equal(COMPACTION_TASKS.length, 9);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(COMPACTION_TASKS));
    });

    it('covers all 3 context modes', () => {
      const modes = new Set(COMPACTION_TASKS.map(t => t.contextMode));
      assert.ok(modes.has('natural'));
      assert.ok(modes.has('lunum'));
      assert.ok(modes.has('mixed'));
    });
  });

  describe('DEFAULT_RUN_CONFIG', () => {
    it('uses simulated mode', () => {
      assert.equal(DEFAULT_RUN_CONFIG.mode, 'simulated');
    });

    it('targets local model', () => {
      assert.ok(DEFAULT_RUN_CONFIG.modelId.includes('local'));
    });
  });

  describe('simulateCompactionMeasurement', () => {
    it('natural mode has compression ratio 1.0', () => {
      const task: CompactionTask = { id: 'test', category: 'qa', inputText: 'hello world', expectedOutput: 'hello', contextMode: 'natural' };
      const result = simulateCompactionMeasurement(task);
      assert.equal(result.compressionRatio, 1.0);
      assert.equal(result.semanticPreservation, 1.0);
    });

    it('lunum mode has compression ratio < 1.0', () => {
      const task: CompactionTask = { id: 'test', category: 'qa', inputText: 'hello world test input for compression', expectedOutput: 'hello', contextMode: 'lunum' };
      const result = simulateCompactionMeasurement(task);
      assert.ok(result.compressionRatio < 1.0);
      assert.ok(result.outputTokens < result.inputTokens);
    });

    it('mixed mode has compression between natural and lunum', () => {
      const task: CompactionTask = { id: 'test', category: 'qa', inputText: 'test input text for mixed mode comparison', expectedOutput: 'test', contextMode: 'mixed' };
      const result = simulateCompactionMeasurement(task);
      assert.ok(result.compressionRatio < 1.0);
      assert.ok(result.compressionRatio > 0.5);
    });

    it('preserves semantic content above 90%', () => {
      for (const mode of ['natural', 'lunum', 'mixed'] as const) {
        const task: CompactionTask = { id: `test-${mode}`, category: 'qa', inputText: 'test input', expectedOutput: 'test', contextMode: mode };
        const result = simulateCompactionMeasurement(task);
        assert.ok(result.semanticPreservation >= 0.9, `${mode} semantic preservation too low: ${result.semanticPreservation}`);
      }
    });
  });

  describe('runCompactionBenchmark', () => {
    it('runs all tasks and produces report', () => {
      const report = runCompactionBenchmark();
      assert.equal(report.measurements.length, 9);
      assert.ok(report.overallCompressionRatio > 0);
      assert.ok(report.overallPreservation > 0);
    });

    it('has summaries for all 3 modes', () => {
      const report = runCompactionBenchmark();
      assert.ok(report.byMode.natural.taskCount > 0);
      assert.ok(report.byMode.lunum.taskCount > 0);
      assert.ok(report.byMode.mixed.taskCount > 0);
    });

    it('lunum saves tokens compared to natural', () => {
      const report = runCompactionBenchmark();
      assert.ok(report.byMode.lunum.avgCompressionRatio < report.byMode.natural.avgCompressionRatio);
    });

    it('produces compaction-justified verdict', () => {
      const report = runCompactionBenchmark();
      assert.equal(report.verdict, 'compaction-justified');
    });

    it('selects best mode', () => {
      const report = runCompactionBenchmark();
      assert.ok(['natural', 'lunum', 'mixed'].includes(report.bestMode));
    });

    it('has high task success rate', () => {
      const report = runCompactionBenchmark();
      assert.ok(report.taskSuccessRate >= 0.9);
    });

    it('uses provided config', () => {
      const config = { ...DEFAULT_RUN_CONFIG, modelId: 'test-model' };
      const report = runCompactionBenchmark(COMPACTION_TASKS, config);
      assert.equal(report.config.modelId, 'test-model');
    });
  });
});
