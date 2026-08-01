import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionTimeline,
  detectStaleRetrievals,
  runSessionScenario,
  SESSION_TEST_SCENARIOS,
  type SessionEvent,
} from '../src/long-context-sessions.js';

describe('long-context-sessions', () => {
  describe('buildSessionTimeline', () => {
    it('processes add events into memory', () => {
      const events: SessionEvent[] = [
        { type: 'add', timestamp: 1, key: 'name', value: 'Alice' },
        { type: 'add', timestamp: 2, key: 'age', value: '30' },
      ];
      const timeline = buildSessionTimeline(events);

      assert.strictEqual(timeline.memory.entries.size, 2);
      const name = timeline.memory.entries.get('name');
      assert.ok(name);
      assert.strictEqual(name!.value, 'Alice');
      assert.strictEqual(name!.version, 1);
      assert.strictEqual(name!.expired, false);
    });

    it('detects contradictions', () => {
      const events: SessionEvent[] = [
        { type: 'add', timestamp: 1, key: 'fact', value: 'old' },
        { type: 'contradict', timestamp: 2, key: 'fact', value: 'new' },
      ];
      const timeline = buildSessionTimeline(events);

      assert.strictEqual(timeline.conflicts.length, 1);
      const conflict = timeline.conflicts[0]!;
      assert.strictEqual(conflict.key, 'fact');
      assert.strictEqual(conflict.oldValue, 'old');
      assert.strictEqual(conflict.newValue, 'new');
      assert.strictEqual(conflict.resolution, 'conflict');
    });

    it('handles updates with version increments', () => {
      const events: SessionEvent[] = [
        { type: 'add', timestamp: 1, key: 'score', value: '10' },
        { type: 'update', timestamp: 2, key: 'score', value: '20' },
        { type: 'update', timestamp: 3, key: 'score', value: '30' },
      ];
      const timeline = buildSessionTimeline(events);

      const entry = timeline.memory.entries.get('score');
      assert.ok(entry);
      assert.strictEqual(entry!.value, '30');
      assert.strictEqual(entry!.version, 3);
      assert.strictEqual(entry!.updatedAt, 3);
    });
  });

  describe('detectStaleRetrievals', () => {
    it('finds stale entries', () => {
      const events: SessionEvent[] = [
        { type: 'add', timestamp: 1, key: 'token', value: 'abc' },
        { type: 'expire', timestamp: 2, key: 'token', value: '' },
        { type: 'retrieve', timestamp: 3, key: 'token', value: '' },
      ];
      const timeline = buildSessionTimeline(events);
      const report = detectStaleRetrievals(timeline);

      assert.strictEqual(report.total, 1);
      assert.strictEqual(report.stale, 1);
      assert.strictEqual(report.staleRate, 1);
      assert.strictEqual(report.details[0]!.stale, true);
    });

    it('reports zero stale for fresh data', () => {
      const events: SessionEvent[] = [
        { type: 'add', timestamp: 1, key: 'fresh', value: 'data' },
        { type: 'retrieve', timestamp: 2, key: 'fresh', value: '' },
      ];
      const timeline = buildSessionTimeline(events);
      const report = detectStaleRetrievals(timeline);

      assert.strictEqual(report.total, 1);
      assert.strictEqual(report.stale, 0);
      assert.strictEqual(report.staleRate, 0);
    });
  });

  describe('runSessionScenario', () => {
    it('passes for basic-crud', () => {
      const scenario = SESSION_TEST_SCENARIOS.find(
        (s) => s.name === 'basic-crud',
      );
      assert.ok(scenario);
      const result = runSessionScenario(scenario.events);
      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.staleReport.stale, 0);
    });

    it('detects issues in contradiction scenario', () => {
      const scenario = SESSION_TEST_SCENARIOS.find(
        (s) => s.name === 'contradiction',
      );
      assert.ok(scenario);
      const result = runSessionScenario(scenario.events);
      assert.strictEqual(result.passed, false);
      assert.ok(result.timeline.conflicts.length > 0);
    });
  });

  describe('SESSION_TEST_SCENARIOS', () => {
    it('has at least 4 entries', () => {
      assert.ok(SESSION_TEST_SCENARIOS.length >= 4);
    });
  });
});
