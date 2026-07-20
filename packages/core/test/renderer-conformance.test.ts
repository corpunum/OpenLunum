import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkConformance,
  createTestRecords,
  getConformanceFailures,
  runConformanceSuite,
} from '../src/renderer-conformance.js';
import type { LunumRecord } from '../src/types.js';

function minimalRecord(): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'A minimal record.', language: 'en', role: 'user', ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'exist', roles: { subject: 'record' } }],
    },
    fingerprint: 'lfp:0.1:sha256:0000000000000000',
    renderings: {},
    policy: { eligible: true, category: 'fact', risk: 'low', confidence: 1, reasons: ['test'] },
    meta: {},
  };
}

test('built-in conformance records are diverse and deterministic', () => {
  const records = createTestRecords();
  assert.equal(records.length, 10);
  assert.equal(new Set(records.map((record) => record.id)).size, 10);
  assert.ok(new Set(records.map((record) => record.record.sem.kind)).size >= 6);
  assert.ok(records.every((record) => record.description.length > 0));
});

test('conformance suite decodes every emitted profile and reports full success', () => {
  const summary = runConformanceSuite();
  assert.equal(summary.totalTests, 10);
  assert.equal(summary.passedTests, 10);
  assert.equal(summary.failedTests, 0);
  assert.equal(summary.passRate, 1);

  for (const result of summary.results) {
    assert.equal(result.profileResults.length, 3);
    assert.equal(result.allProfilesPass, true);
    assert.deepEqual(result.profileResults.map((profile) => profile.profile), ['safe', 'short', 'tight']);
    for (const profile of result.profileResults) {
      assert.equal(profile.roundTripPass, true);
      assert.equal(profile.canonicalEqual, true);
      assert.equal(profile.originalCanonical, profile.profiledCanonical);
      assert.equal(profile.preservation, 1);
      assert.deepEqual(profile.warnings, []);
    }
  }

  for (const profile of ['safe', 'short', 'tight'] as const) {
    assert.deepEqual(summary.profileSummary[profile], { total: 10, passed: 10, passRate: 1 });
  }
});

test('checkConformance and failure extraction agree with the decoded results', () => {
  const checked = checkConformance();
  assert.equal(checked.conforms, true);
  assert.equal(checked.summary.passRate, 1);
  assert.deepEqual(getConformanceFailures(), []);
});

test('conformance suite handles custom and empty record sets', () => {
  const custom = [{ id: 'custom', description: 'custom record', record: minimalRecord() }];
  const customSummary = runConformanceSuite(custom);
  assert.equal(customSummary.totalTests, 1);
  assert.equal(customSummary.passRate, 1);

  const empty = runConformanceSuite([]);
  assert.deepEqual(
    { total: empty.totalTests, passed: empty.passedTests, failed: empty.failedTests, passRate: empty.passRate },
    { total: 0, passed: 0, failed: 0, passRate: 0 },
  );
  assert.deepEqual(getConformanceFailures([]), []);
});

test('conformance token metrics preserve honest profile ordering without requiring natural-language savings', () => {
  const summary = runConformanceSuite();
  for (const result of summary.results) {
    const safe = result.profileResults.find((profile) => profile.profile === 'safe')!;
    const short = result.profileResults.find((profile) => profile.profile === 'short')!;
    const tight = result.profileResults.find((profile) => profile.profile === 'tight')!;
    assert.ok(short.tokenReduction >= safe.tokenReduction, `${result.testCaseId}: short should not be larger than safe`);
    assert.ok(tight.tokenReduction >= short.tokenReduction, `${result.testCaseId}: tight should not be larger than short`);
  }
});

test('existing renderings are retained rather than silently discarded', () => {
  const source = createTestRecords().find((record) => record.id === 'renderings')!;
  const summary = runConformanceSuite([source]);
  assert.equal(summary.passRate, 1);
  for (const profile of summary.results[0]!.profileResults) {
    assert.deepEqual(profile.warnings, []);
  }
});
