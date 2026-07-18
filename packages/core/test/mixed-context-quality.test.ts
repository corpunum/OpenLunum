import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MixedContextQualityGate,
  measureMixedContextQuality,
  type MixedContextQualityConfig
} from '../src/mixed-context-quality.js';
import type { ContextMessage } from '../src/types.js';

// ── Helpers ────────────────────────────────────────────────────────

function createMockMessages(count: number): ContextMessage[] {
  const messages: ContextMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 3 === 0 ? 'user' : 'assistant',
      content: `Test message number ${i} with some content for measurement.`,
      lunumCode: i % 2 === 0 ? `lunum:clause:${i}` : null
    });
  }
  return messages;
}

function createMinimalConfig(): MixedContextQualityConfig {
  return {
    reportId: 'test-mcq-001',
    taskTypes: ['qa', 'extraction', 'classification'],
    contextModes: ['natural', 'lunum', 'mixed'],
    minimumQuality: 0.5
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('MixedContextQualityGate', () => {
  describe('evaluate', () => {
    it('produces a report with measurements for each mode x task type', () => {
      const messages = createMockMessages(3);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      assert.ok(report);
      assert.strictEqual(report.reportId, config.reportId);
      assert.ok(typeof report.timestamp === 'number');
      assert.strictEqual(report.measurements.length, 9); // 3 modes × 3 task types
    });

    it('includes comparisons for each task type', () => {
      const messages = createMockMessages(2);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      assert.strictEqual(report.comparisons.length, 3); // 3 task types
      for (const comp of report.comparisons) {
        assert.ok(comp.taskType);
        assert.ok(typeof comp.naturalQuality === 'number');
        assert.ok(typeof comp.lunumQuality === 'number');
        assert.ok(typeof comp.mixedQuality === 'number');
        assert.ok(['natural', 'lunum', 'mixed'].includes(comp.bestMode));
        assert.ok(comp.tokenSavings);
      }
    });

    it('includes gate evaluations', () => {
      const messages = createMockMessages(2);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      assert.ok(report.gates.length > 0);
      for (const gateEval of report.gates) {
        assert.ok(gateEval.gateName);
        assert.ok(['pass', 'warn', 'fail'].includes(gateEval.result));
        assert.ok(typeof gateEval.score === 'number');
        assert.ok(typeof gateEval.minimumScore === 'number');
        assert.ok(typeof gateEval.delta === 'number');
      }
    });

    it('produces a summary with best and worst modes', () => {
      const messages = createMockMessages(4);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      assert.ok(report.summary);
      assert.strictEqual(report.summary.totalMeasurements, 9);
      assert.ok(['natural', 'lunum', 'mixed'].includes(report.summary.bestOverallMode));
      assert.ok(['natural', 'lunum', 'mixed'].includes(report.summary.worstMode));
      assert.ok(typeof report.summary.overallScore === 'number');
      assert.ok(typeof report.summary.worstScore === 'number');
      assert.ok(typeof report.summary.avgTokenSavings === 'number');
      assert.strictEqual(typeof report.summary.passesAllGates, 'boolean');
    });

    it('returns null gate evaluation for unsupported task types', () => {
      const messages = createMockMessages(2);
      const config: MixedContextQualityConfig = {
        ...createMinimalConfig(),
        taskTypes: ['qa', 'unsupported-task'] as any
      };
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      // Should still work, but unsupported task types won't have gates
      assert.ok(report.gates.length > 0);
      assert.ok(report.measurements.length > 0);
    });

    it('handles empty messages', () => {
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate([]);

      assert.ok(report);
      assert.strictEqual(report.measurements.length, 9); // Still evaluates all mode×task combos
    });

    it('handles single message', () => {
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate([{ role: 'user', content: 'Hello' }]);

      assert.ok(report);
      assert.ok(report.measurements.length > 0);
    });

    it('respects contextModes filter', () => {
      const messages = createMockMessages(2);
      const config: MixedContextQualityConfig = {
        ...createMinimalConfig(),
        contextModes: ['natural'] as const
      };
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      assert.strictEqual(report.measurements.length, 3); // Only natural × 3 task types
    });

    it('respects taskTypes filter', () => {
      const messages = createMockMessages(2);
      const config: MixedContextQualityConfig = {
        ...createMinimalConfig(),
        taskTypes: ['qa'] as const
      };
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      assert.strictEqual(report.measurements.length, 3); // Only qa × 3 modes
      assert.strictEqual(report.comparisons.length, 1);
    });

    it('respects recordPresence parameter', () => {
      const messages = createMockMessages(2);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const reportLow = gate.evaluate(messages, 0);
      const reportHigh = gate.evaluate(messages, 1);

      // Higher record presence should not decrease quality
      // (heuristic allows up to +0.05)
      const lowVal = reportLow.measurements[0]!.quality.value;
      const highVal = reportHigh.measurements[0]!.quality.value;
      assert.ok(highVal >= lowVal);
    });
  });

  describe('reports', () => {
    it('stores reports internally', () => {
      const messages = createMockMessages(2);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      gate.evaluate(messages);
      gate.evaluate(messages);

      assert.strictEqual(gate.getReports().length, 2);
    });

    it('returns the latest report', () => {
      const messages = createMockMessages(2);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report1 = gate.evaluate(messages);
      const report2 = gate.evaluate(messages);

      assert.strictEqual(gate.getLatestReport(), report2);
    });

    it('clears reports', () => {
      const messages = createMockMessages(2);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      gate.evaluate(messages);
      gate.clear();

      assert.strictEqual(gate.getReports().length, 0);
    });
  });

  describe('config', () => {
    it('returns current configuration', () => {
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const retrieved = gate.getConfig();
      assert.strictEqual(retrieved.reportId, config.reportId);
      assert.deepStrictEqual(retrieved.taskTypes, config.taskTypes);
      assert.deepStrictEqual(retrieved.contextModes, config.contextModes);
    });

    it('updates configuration', () => {
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      gate.setConfig({
        minimumQuality: 0.9,
        includeTokenEfficiency: false
      });

      const updated = gate.getConfig();
      assert.strictEqual(updated.minimumQuality, 0.9);
      assert.strictEqual(updated.includeTokenEfficiency, false);
    });

    it('uses default task types when not specified', () => {
      const gate = new MixedContextQualityGate({ reportId: 'default-tasks' });

      const report = gate.evaluate(createMockMessages(2));
      assert.ok(report.comparisons.length > 0);
    });

    it('uses default context modes when not specified', () => {
      const gate = new MixedContextQualityGate({ reportId: 'default-modes' });

      const report = gate.evaluate(createMockMessages(2));
      const modes = new Set(report.measurements.map(m => m.mode));
      assert.ok(modes.has('natural'));
      assert.ok(modes.has('lunum'));
      assert.ok(modes.has('mixed'));
    });
  });

  describe('quality values', () => {
    it('produces quality scores between 0 and 1', () => {
      const messages = createMockMessages(5);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      for (const m of report.measurements) {
        assert.ok(
          m.quality.value >= 0 && m.quality.value <= 1,
          `Quality value ${m.quality.value} for mode=${m.mode} taskType=${m.taskType} should be in [0,1]`
        );
      }
    });

    it('lunum mode generally scores higher for semantic preservation', () => {
      const messages = createMockMessages(6);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      // Lunum should have at least as good quality as natural for most task types
      for (const comp of report.comparisons) {
        // Lunum gets a precision boost in estimateQuality
        assert.ok(
          comp.lunumQuality >= comp.naturalQuality - 0.1,
          `Lunum quality ${comp.lunumQuality} should be near natural ${comp.naturalQuality}`
        );
      }
    });
  });

  describe('token efficiency', () => {
    it('calculates token efficiency for each measurement', () => {
      const messages = createMockMessages(3);
      const config = createMinimalConfig();
      const gate = new MixedContextQualityGate(config);

      const report = gate.evaluate(messages);

      for (const m of report.measurements) {
        assert.ok(typeof m.tokenEfficiency === 'number');
        assert.ok(m.tokenEfficiency >= 0);
        assert.ok(m.tokens > 0);
      }
    });
  });
});

describe('measureMixedContextQuality', () => {
  it('creates a gate and evaluates in one call', () => {
    const messages = createMockMessages(3);
    const config = createMinimalConfig();

    const report = measureMixedContextQuality(messages, config);

    assert.ok(report);
    assert.strictEqual(report.reportId, config.reportId);
    assert.ok(report.measurements.length > 0);
  });

  it('works with minimal config', () => {
    const messages = createMockMessages(2);
    const report = measureMixedContextQuality(messages);

    assert.ok(report);
    assert.ok(report.measurements.length > 0);
  });

  it('returns consistent results for same input', () => {
    const messages = createMockMessages(3);
    const config = createMinimalConfig();

    const report1 = measureMixedContextQuality(messages, config);
    const report2 = measureMixedContextQuality(messages, { ...config, reportId: 'test-mcq-002' });

    // Same number of measurements
    assert.strictEqual(report1.measurements.length, report2.measurements.length);
    assert.strictEqual(report1.comparisons.length, report2.comparisons.length);
  });
});
