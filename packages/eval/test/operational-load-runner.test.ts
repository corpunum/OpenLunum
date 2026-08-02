import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_LEVELS,
  OPERATION_TYPES,
  simulateLoadTest,
  runOperationalLoadSuite,
} from '../src/operational-load-runner.js';

describe('operational-load-runner', () => {
  describe('LOAD_LEVELS', () => {
    it('has 5 entries', () => {
      assert.equal(LOAD_LEVELS.length, 5);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(LOAD_LEVELS));
    });

    it('covers idle, light, moderate, heavy, peak', () => {
      const names = LOAD_LEVELS.map(l => l.name);
      assert.deepEqual(names, ['idle', 'light', 'moderate', 'heavy', 'peak']);
    });

    it('has the expected rps values', () => {
      const byName = Object.fromEntries(LOAD_LEVELS.map(l => [l.name, l.rps]));
      assert.equal(byName.idle, 1);
      assert.equal(byName.light, 10);
      assert.equal(byName.moderate, 50);
      assert.equal(byName.heavy, 100);
      assert.equal(byName.peak, 500);
    });

    it('has strictly increasing rps and SLO thresholds', () => {
      for (let i = 1; i < LOAD_LEVELS.length; i++) {
        const current = LOAD_LEVELS[i];
        const previous = LOAD_LEVELS[i - 1];
        assert.ok(current);
        assert.ok(previous);
        assert.ok(current.rps > previous.rps);
        assert.ok(current.p99SloMs > previous.p99SloMs);
      }
    });
  });

  describe('OPERATION_TYPES', () => {
    it('has 4 entries', () => {
      assert.equal(OPERATION_TYPES.length, 4);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(OPERATION_TYPES));
    });

    it('covers parse, realize, fingerprint, compare', () => {
      const names = OPERATION_TYPES.map(o => o.name).sort();
      assert.deepEqual(names, ['compare', 'fingerprint', 'parse', 'realize']);
    });
  });

  describe('simulateLoadTest', () => {
    it('returns valid latency metrics for a known combination', () => {
      const result = simulateLoadTest('idle', 'parse');
      assert.equal(result.level, 'idle');
      assert.equal(result.operation, 'parse');
      assert.ok(result.metrics.p50Ms > 0);
      assert.ok(result.metrics.p95Ms > 0);
      assert.ok(result.metrics.p99Ms > 0);
      assert.ok(result.metrics.errorRate >= 0 && result.metrics.errorRate <= 1);
      assert.ok(result.metrics.throughputRps >= 0);
      assert.ok(result.metrics.queueDepth >= 0);
      assert.equal(typeof result.meetsSlo, 'boolean');
      assert.equal(typeof result.degraded, 'boolean');
    });

    it('is deterministic across repeated calls with the same inputs', () => {
      const a = simulateLoadTest('moderate', 'compare');
      const b = simulateLoadTest('moderate', 'compare');
      assert.deepEqual(a, b);
    });

    it('produces different results for different operations at the same level', () => {
      const a = simulateLoadTest('heavy', 'parse');
      const b = simulateLoadTest('heavy', 'realize');
      assert.notDeepEqual(a.metrics, b.metrics);
    });

    it('throws for an unknown level or operation', () => {
      assert.throws(() => simulateLoadTest('unknown' as never, 'parse'));
      assert.throws(() => simulateLoadTest('idle', 'unknown' as never));
    });

    it('P99 > P95 > P50 latency ordering holds across all level x operation combinations', () => {
      for (const level of LOAD_LEVELS) {
        for (const op of OPERATION_TYPES) {
          const result = simulateLoadTest(level.name, op.name);
          assert.ok(
            result.metrics.p99Ms > result.metrics.p95Ms,
            `p99 should exceed p95 at ${level.name}/${op.name}`,
          );
          assert.ok(
            result.metrics.p95Ms > result.metrics.p50Ms,
            `p95 should exceed p50 at ${level.name}/${op.name}`,
          );
        }
      }
    });

    it('idle load meets SLO for every operation', () => {
      for (const op of OPERATION_TYPES) {
        const result = simulateLoadTest('idle', op.name);
        assert.ok(result.meetsSlo, `idle/${op.name} should meet SLO`);
        assert.ok(!result.degraded);
      }
    });

    it('heavy and peak load show degradation for at least one operation', () => {
      const heavyDegraded = OPERATION_TYPES.some(op => simulateLoadTest('heavy', op.name).degraded);
      const peakDegraded = OPERATION_TYPES.some(op => simulateLoadTest('peak', op.name).degraded);
      assert.ok(heavyDegraded, 'expected degradation at heavy load');
      assert.ok(peakDegraded, 'expected degradation at peak load');
    });

    it('peak load has higher p99 latency than idle load for every operation', () => {
      for (const op of OPERATION_TYPES) {
        const idle = simulateLoadTest('idle', op.name);
        const peak = simulateLoadTest('peak', op.name);
        assert.ok(peak.metrics.p99Ms > idle.metrics.p99Ms);
      }
    });
  });

  describe('runOperationalLoadSuite', () => {
    const report = runOperationalLoadSuite();

    it('produces one measurement per level x operation combination', () => {
      assert.equal(report.measurements.length, LOAD_LEVELS.length * OPERATION_TYPES.length);
    });

    it('produces a summary per operation', () => {
      assert.equal(report.byOperation.length, OPERATION_TYPES.length);
      for (const summary of report.byOperation) {
        assert.ok(OPERATION_TYPES.some(o => o.name === summary.operation));
        assert.ok(summary.avgP99Ms > 0);
        assert.ok(summary.maxErrorRate >= 0);
        assert.equal(typeof summary.meetsSloAtModerate, 'boolean');
      }
    });

    it('produces a summary per level', () => {
      assert.equal(report.byLevel.length, LOAD_LEVELS.length);
      for (const summary of report.byLevel) {
        assert.ok(LOAD_LEVELS.some(l => l.name === summary.level));
        assert.ok(summary.avgP99Ms > 0);
        assert.equal(typeof summary.allOperationsPass, 'boolean');
      }
    });

    it('all operations pass at moderate load', () => {
      for (const summary of report.byOperation) {
        assert.ok(
          summary.meetsSloAtModerate,
          `expected ${summary.operation} to meet SLO at moderate load`,
        );
      }
      const moderateLevel = report.byLevel.find(l => l.level === 'moderate');
      assert.ok(moderateLevel);
      assert.ok(moderateLevel.allOperationsPass);
    });

    it('idle and light levels have no degraded operations', () => {
      for (const levelName of ['idle', 'light'] as const) {
        const summary = report.byLevel.find(l => l.level === levelName);
        assert.ok(summary);
        assert.ok(summary.allOperationsPass, `expected ${levelName} to have no degraded operations`);
      }
    });

    it('produces an overall readiness verdict consistent with moderate-load SLO compliance', () => {
      assert.ok(['ready', 'degraded', 'not-ready'].includes(report.verdict));
      const allMeetModerateSlo = report.byOperation.every(op => op.meetsSloAtModerate);
      if (report.verdict === 'not-ready') {
        assert.ok(!allMeetModerateSlo);
      } else {
        assert.ok(allMeetModerateSlo);
      }
    });

    it('reports the first degraded level in ascending load order, if any', () => {
      const order = LOAD_LEVELS.map(l => l.name);
      if (report.firstDegradationLevel !== null) {
        assert.ok(order.includes(report.firstDegradationLevel));
        const degradedIndex = order.indexOf(report.firstDegradationLevel);
        for (let i = 0; i < degradedIndex; i++) {
          const earlierSummary = report.byLevel.find(l => l.level === order[i]);
          assert.ok(earlierSummary?.allOperationsPass);
        }
      }
    });

    it('supports a custom subset of levels and operations', () => {
      const subsetReport = runOperationalLoadSuite(
        LOAD_LEVELS.filter(l => l.name === 'idle' || l.name === 'moderate'),
        OPERATION_TYPES.filter(o => o.name === 'parse'),
      );
      assert.equal(subsetReport.measurements.length, 2);
      assert.equal(subsetReport.byOperation.length, 1);
      assert.equal(subsetReport.byLevel.length, 2);
    });
  });
});
