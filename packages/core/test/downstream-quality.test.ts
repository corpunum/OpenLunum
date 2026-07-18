import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateQuality,
  validateGate,
  createDefaultEvaluator,
  type QualityEvaluator,
  type DownstreamTaskResult,
  type QualityGate
} from '../src/index.js';

describe('downstream-quality', () => {
  function buildEvaluator(overrides: Partial<QualityEvaluator> = {}): QualityEvaluator {
    return {
      gates: [
        {
          name: 'test-gate',
          taskType: 'qa',
          minimumScore: 0.7,
          minimumMetrics: { accuracy: 0.7 },
          warnThreshold: 0.85,
          failThreshold: 0.5
        }
      ],
      results: [],
      ...overrides
    };
  }

  function buildResult(overrides: Partial<DownstreamTaskResult> = {}): DownstreamTaskResult {
    return {
      taskId: 'task-1',
      taskType: 'qa',
      quality: [
        { metric: 'accuracy', value: 0.85, baseline: 0.9, delta: -0.05, unit: 'ratio' }
      ],
      overallScore: 0.85,
      gateResult: 'pass',
      warnings: [],
      ...overrides
    };
  }

  describe('evaluateQuality', () => {
    it('returns pass for score above warn threshold', () => {
      const evaluator = buildEvaluator();
      const result = buildResult({ overallScore: 0.9 });
      const gateEval = evaluateQuality(evaluator, 'qa', result);
      assert.ok(gateEval);
      assert.strictEqual(gateEval.result, 'pass');
      assert.strictEqual(gateEval.score, 0.9);
    });

    it('returns warn for score between fail and warn thresholds', () => {
      const evaluator = buildEvaluator();
      const result = buildResult({ overallScore: 0.6 });
      const gateEval = evaluateQuality(evaluator, 'qa', result);
      assert.ok(gateEval);
      assert.strictEqual(gateEval.result, 'warn');
      assert.ok(gateEval.delta < -0.09 && gateEval.delta > -0.11, `delta ${gateEval.delta} should be near -0.1`);
    });

    it('returns fail for score below fail threshold', () => {
      const evaluator = buildEvaluator();
      const result = buildResult({ overallScore: 0.4 });
      const gateEval = evaluateQuality(evaluator, 'qa', result);
      assert.ok(gateEval);
      assert.strictEqual(gateEval.result, 'fail');
    });

    it('returns null for unknown task type', () => {
      const evaluator = buildEvaluator();
      const result = buildResult({ taskType: 'extraction' });
      const gateEval = evaluateQuality(evaluator, 'extraction', result);
      assert.strictEqual(gateEval, null);
    });

    it('tracks metric violations as warnings', () => {
      const evaluator = buildEvaluator();
      const result = buildResult({
        overallScore: 0.8,
        quality: [{ metric: 'accuracy', value: 0.6, baseline: 0.9, delta: -0.3, unit: 'ratio' }]
      });
      const gateEval = evaluateQuality(evaluator, 'qa', result);
      assert.ok(gateEval);
      assert.ok(gateEval.warnings.some(w => w.includes('accuracy')));
    });

    it('records all metrics in evaluation', () => {
      const evaluator = buildEvaluator();
      const result = buildResult({
        quality: [
          { metric: 'accuracy', value: 0.9, baseline: 0.95, delta: -0.05, unit: 'ratio' },
          { metric: 'f1', value: 0.88, baseline: 0.92, delta: -0.04, unit: 'ratio' }
        ],
        overallScore: 0.9
      });
      const gateEval = evaluateQuality(evaluator, 'qa', result);
      assert.ok(gateEval);
      assert.ok(gateEval.metrics.accuracy);
      assert.ok(gateEval.metrics.f1);
    });
  });

  describe('validateGate', () => {
    it('validates a complete gate', () => {
      const gate: QualityGate = {
        name: 'test',
        taskType: 'qa',
        minimumScore: 0.7,
        minimumMetrics: { accuracy: 0.7 },
        warnThreshold: 0.85,
        failThreshold: 0.5
      };
      const result = validateGate(gate);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('rejects gate missing name', () => {
      const gate = { name: '' } as Partial<QualityGate> as QualityGate;
      const result = validateGate(gate);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('name')));
    });

    it('rejects gate missing taskType', () => {
      const gate = { taskType: '' } as unknown as QualityGate;
      const result = validateGate(gate);
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('taskType')));
    });

    it('rejects invalid minimumScore', () => {
      const gate = buildEvaluator().gates[0]!;
      const result = validateGate({ ...gate, minimumScore: 1.5 });
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('minimumScore')));
    });

    it('rejects invalid warnThreshold', () => {
      const gate = buildEvaluator().gates[0]!;
      const result = validateGate({ ...gate, warnThreshold: -0.1 });
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('warnThreshold')));
    });

    it('rejects invalid failThreshold', () => {
      const gate = buildEvaluator().gates[0]!;
      const result = validateGate({ ...gate, failThreshold: 2 });
      assert.strictEqual(result.ok, false);
      assert.ok(result.errors.some(e => e.includes('failThreshold')));
    });
  });

  describe('createDefaultEvaluator', () => {
    it('creates evaluator with three default gates', () => {
      const evaluator = createDefaultEvaluator();
      assert.strictEqual(evaluator.gates.length, 3);
      assert.strictEqual(evaluator.gates[0]!.name, 'qa-gate');
      assert.strictEqual(evaluator.gates[1]!.name, 'extraction-gate');
      assert.strictEqual(evaluator.gates[2]!.name, 'classification-gate');
    });

    it('creates gates with valid configurations', () => {
      const evaluator = createDefaultEvaluator();
      for (const gate of evaluator.gates) {
        const result = validateGate(gate);
        assert.strictEqual(result.ok, true, `gate ${gate.name} should be valid`);
      }
    });
  });

  describe('task types', () => {
    it('supports all task types', () => {
      const evaluator = buildEvaluator();
      for (const taskType of ['qa', 'summarization', 'extraction', 'classification', 'generation', 'reasoning', 'other'] as const) {
        const result = buildResult({ taskType });
        // Should not throw
        evaluateQuality(evaluator, taskType, result);
      }
    });
  });

  describe('quality metrics', () => {
    it('supports all quality metric types', () => {
      for (const metric of ['accuracy', 'recall', 'precision', 'f1', 'semantic_similarity', 'token_efficiency'] as const) {
        // Should not throw
        buildResult({ quality: [{ metric, value: 0.8, baseline: 0.9, delta: -0.1, unit: 'ratio' }] });
      }
    });
  });
});
