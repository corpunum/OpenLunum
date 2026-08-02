import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PASS_CONFIG,
  RETENTION_TEST_ITEMS,
  simulatePass,
  runRetentionPasses,
  runMultiItemRetention,
} from '../src/retention-pass-runner.js';

describe('retention-pass-runner', () => {
  describe('DEFAULT_PASS_CONFIG', () => {
    it('runs 5 passes by default', () => {
      assert.equal(DEFAULT_PASS_CONFIG.maxPasses, 5);
    });

    it('has 0.85 preservation threshold', () => {
      assert.equal(DEFAULT_PASS_CONFIG.preservationThreshold, 0.85);
    });
  });

  describe('RETENTION_TEST_ITEMS', () => {
    it('has 5 test items', () => {
      assert.equal(RETENTION_TEST_ITEMS.length, 5);
    });

    it('covers multiple languages', () => {
      const langs = new Set(RETENTION_TEST_ITEMS.map(i => i.language));
      assert.ok(langs.size >= 3);
    });
  });

  describe('simulatePass', () => {
    it('pass 1 has high preservation', () => {
      const result = simulatePass(1, 'test content', 'test content');
      assert.ok(result.exactPreservation > 0.95);
      assert.ok(result.passedThreshold);
    });

    it('later passes have lower preservation', () => {
      const pass1 = simulatePass(1, 'test', 'test');
      const pass5 = simulatePass(5, 'test', 'test');
      assert.ok(pass5.exactPreservation < pass1.exactPreservation);
    });

    it('drift from original increases with passes', () => {
      const pass1 = simulatePass(1, 'test', 'test');
      const pass3 = simulatePass(3, 'test', 'test');
      assert.ok(pass3.driftFromOriginal > pass1.driftFromOriginal);
    });

    it('preserves negation for early passes', () => {
      const result = simulatePass(1, 'test', 'test');
      assert.ok(result.negationPreserved);
    });
  });

  describe('runRetentionPasses', () => {
    it('runs configured number of passes', () => {
      const report = runRetentionPasses('test-1', 'test content', 'en');
      assert.equal(report.totalPasses, 5);
      assert.equal(report.passes.length, 5);
    });

    it('produces stable verdict for good content', () => {
      const report = runRetentionPasses('test-1', 'test content here', 'en');
      assert.equal(report.verdict, 'stable');
    });

    it('records accumulated drift', () => {
      const report = runRetentionPasses('test-1', 'test', 'en');
      assert.ok(report.accumulatedDrift >= 0);
    });

    it('respects stopOnFailure', () => {
      const config = { ...DEFAULT_PASS_CONFIG, maxPasses: 100, stopOnFailure: true };
      const report = runRetentionPasses('test-1', 'x', 'en', config);
      if (report.firstFailurePass !== null) {
        assert.equal(report.totalPasses, report.firstFailurePass);
      }
    });

    it('custom maxPasses works', () => {
      const config = { ...DEFAULT_PASS_CONFIG, maxPasses: 3 };
      const report = runRetentionPasses('test-1', 'content', 'en', config);
      assert.equal(report.totalPasses, 3);
    });
  });

  describe('runMultiItemRetention', () => {
    it('runs all test items', () => {
      const report = runMultiItemRetention(RETENTION_TEST_ITEMS);
      assert.equal(report.totalItems, 5);
    });

    it('produces pass verdict for test items', () => {
      const report = runMultiItemRetention(RETENTION_TEST_ITEMS);
      assert.equal(report.verdict, 'pass');
    });

    it('computes average final preservation', () => {
      const report = runMultiItemRetention(RETENTION_TEST_ITEMS);
      assert.ok(report.averageFinalPreservation > 0);
      assert.ok(report.averageFinalPreservation <= 1);
    });

    it('identifies worst item', () => {
      const report = runMultiItemRetention(RETENTION_TEST_ITEMS);
      assert.ok(report.worstItem.length > 0);
      assert.ok(report.worstPreservation > 0);
    });

    it('counts stable/degrading/failed', () => {
      const report = runMultiItemRetention(RETENTION_TEST_ITEMS);
      assert.equal(report.stableCount + report.degradingCount + report.failedCount, report.totalItems);
    });
  });
});
