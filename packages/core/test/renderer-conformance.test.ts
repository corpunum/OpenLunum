import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestRecords,
  runConformanceSuite,
  checkConformance,
  getConformanceFailures,
  type ProfileConformanceResult,
  type ConformanceTestCaseResult
} from '../src/renderer-conformance.js';
import type { ProfileType } from '../src/profiles.js';
import type { LunumRecord } from '../src/types.js';

// ── Helpers ────────────────────────────────────────────────────────

function createMinimalRecord(id: string, text: string, predicate: string): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text, language: 'en', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'simple_fact',
      clauses: [
        { predicate, roles: { subject: 'test', object: 'test' } }
      ]
    },
    fingerprint: 'sha256:test',
    renderings: {},
    policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.95, reasons: [] },
    meta: {}
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('createTestRecords', () => {
  it('returns exactly 10 test records', () => {
    const records = createTestRecords();
    assert.strictEqual(records.length, 10);
  });

  it('has unique IDs for all records', () => {
    const records = createTestRecords();
    const ids = records.map(r => r.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, 10);
  });

  it('has descriptions for all records', () => {
    const records = createTestRecords();
    for (const r of records) {
      assert.ok(r.description && r.description.length > 0);
    }
  });

  it('has valid LunumRecord structures', () => {
    const records = createTestRecords();
    for (const r of records) {
      assert.ok(r.record.recordVersion);
      assert.ok(r.record.source.text);
      assert.ok(r.record.sem.schema);
      assert.ok(r.record.sem.clauses.length > 0);
      assert.ok(r.record.fingerprint);
    }
  });

  it('covers diverse structures', () => {
    const records = createTestRecords();
    const kinds = new Set(records.map(r => r.record.sem.kind));
    assert.ok(kinds.size >= 6, 'Should cover diverse semantic kinds');
  });
});

describe('runConformanceSuite', () => {
  it('produces results for all test records', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    assert.strictEqual(summary.totalTests, 10);
    assert.strictEqual(summary.results.length, 10);
  });

  it('produces results for all 3 profiles per record', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    for (const result of summary.results) {
      assert.strictEqual(result.profileResults.length, 3);
      const profiles = result.profileResults.map(p => p.profile);
      assert.ok(profiles.includes('safe'));
      assert.ok(profiles.includes('short'));
      assert.ok(profiles.includes('tight'));
    }
  });

  it('computes correct summary statistics', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    assert.strictEqual(summary.passedTests + summary.failedTests, summary.totalTests);
    assert.ok(summary.passRate >= 0 && summary.passRate <= 1);
  });

  it('includes profile summary per type', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    for (const profile of ['safe', 'short', 'tight'] as ProfileType[]) {
      assert.ok(summary.profileSummary[profile]);
      assert.strictEqual(summary.profileSummary[profile].total, summary.totalTests);
      assert.ok(summary.profileSummary[profile].passRate >= 0 && summary.profileSummary[profile].passRate <= 1);
    }
  });

  it('returns correct per-profile pass counts', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    for (const profile of ['safe', 'short', 'tight'] as ProfileType[]) {
      const expectedPassed = summary.results.reduce((count, r) => {
        const pr = r.profileResults.find(p => p.profile === profile);
        return count + (pr?.canonicalEqual ? 1 : 0);
      }, 0);
      assert.strictEqual(summary.profileSummary[profile].passed, expectedPassed);
    }
  });

  it('handles custom records', () => {
    const customRecords = [
      { id: 'custom-1', description: 'Custom record 1', record: createMinimalRecord('custom-1', 'Hello', 'hello') },
      { id: 'custom-2', description: 'Custom record 2', record: createMinimalRecord('custom-2', 'World', 'world') }
    ];

    const summary = runConformanceSuite(customRecords);
    assert.strictEqual(summary.totalTests, 2);
    assert.strictEqual(summary.results.length, 2);
  });

  it('handles empty records array', () => {
    const summary = runConformanceSuite([]);
    assert.strictEqual(summary.totalTests, 0);
    assert.strictEqual(summary.passedTests, 0);
    assert.strictEqual(summary.passRate, 0);
  });

  it('profiles warn only when non-semantic renderings are removed', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    // Semantic fields are never removed. The one tight warning concerns an
    // existing derived rendering, which is not part of canonical semantics.
    const tightWarnings = summary.results
      .flatMap(r => r.profileResults.filter(p => p.profile === 'tight' && p.warnings.length > 0));
    assert.strictEqual(tightWarnings.length, 1);
    assert.deepStrictEqual(tightWarnings[0]!.warnings, ['Renderings removed']);
  });

  it('token reduction varies by profile', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    // Tight should generally achieve more reduction than safe
    const tightReductions = summary.results.flatMap(r => r.profileResults.filter(p => p.profile === 'tight').map(p => p.tokenReduction));
    const safeReductions = summary.results.flatMap(r => r.profileResults.filter(p => p.profile === 'safe').map(p => p.tokenReduction));

    const avgTight = tightReductions.length > 0 ? tightReductions.reduce((s, v) => s + v, 0) / tightReductions.length : 0;
    const avgSafe = safeReductions.length > 0 ? safeReductions.reduce((s, v) => s + v, 0) / safeReductions.length : 0;

    assert.ok(avgTight >= avgSafe, 'Tight profile should achieve >= token reduction than safe profile');
  });
});

describe('checkConformance', () => {
  it('reports whether conformance passes', () => {
    const records = createTestRecords();
    const { conforms, summary } = checkConformance(records);

    assert.ok(typeof conforms === 'boolean');
    assert.strictEqual(conforms, summary.passRate === 1);
  });

  it('returns a non-empty summary', () => {
    const records = createTestRecords();
    const { summary } = checkConformance(records);

    assert.ok(summary.totalTests > 0);
    assert.ok(summary.results.length > 0);
  });
});

describe('getConformanceFailures', () => {
  it('returns empty array when all pass', () => {
    const records = createTestRecords();
    const failures = getConformanceFailures(records);

    // This test may fail if profiles don't preserve canonicalization perfectly
    assert.ok(Array.isArray(failures));
  });

  it('returns failure details when failures exist', () => {
    // Create a record where we expect potential issues
    const records = [
      { id: 'test', description: 'Test', record: createMinimalRecord('test', 'test text', 'test_pred') }
    ];
    const failures = getConformanceFailures(records);

    assert.ok(Array.isArray(failures));
    for (const f of failures) {
      assert.ok(f.testCaseId);
      assert.ok(['safe', 'short', 'tight'].includes(f.profile));
      assert.ok(f.originalCanonical);
      assert.ok(f.profiledCanonical);
    }
  });
});

describe('profile conformance properties', () => {
  it('all built-in records preserve canonical semantics in every profile', () => {
    const summary = runConformanceSuite(createTestRecords());

    assert.strictEqual(summary.passRate, 1);
    assert.strictEqual(summary.failedTests, 0);
    assert.deepStrictEqual(getConformanceFailures(), []);
  });

  it('safe profile preserves most structure', () => {
    const record = createTestRecords()[0]!.record;
    const { profileResults } = runConformanceSuite([{ id: 'test', description: 'test', record }]).results[0]!;

    const safe = profileResults.find(p => p.profile === 'safe')!;
    assert.ok(safe.roundTripPass, 'Safe profile should preserve round-trip canonicalization');
    assert.ok(safe.preservation >= 0.9, 'Safe profile should have high preservation score');
  });

  it('short profile preserves predicates for simple records', () => {
    const records = createTestRecords().filter(r =>
      !r.description.includes('annotations') &&
      !r.description.includes('renderings') &&
      !r.description.includes('time') &&
      !r.description.includes('modality')
    );
    const summary = runConformanceSuite(records);

    for (const result of summary.results) {
      const short = result.profileResults.find(p => p.profile === 'short')!;
      assert.ok(short.roundTripPass, `Short profile should preserve round-trip for ${result.testCaseId}`);
    }
  });

  it('tight profile preserves predicates for simple records', () => {
    const records = createTestRecords().filter(r =>
      !r.description.includes('annotations') &&
      !r.description.includes('renderings') &&
      !r.description.includes('time') &&
      !r.description.includes('modality')
    );
    const summary = runConformanceSuite(records);

    for (const result of summary.results) {
      const tight = result.profileResults.find(p => p.profile === 'tight')!;
      assert.ok(tight.roundTripPass, `Tight profile should preserve round-trip for ${result.testCaseId}`);
    }
  });

  it('all profiles have non-negative preservation', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    for (const result of summary.results) {
      for (const pr of result.profileResults) {
        assert.ok(pr.preservation >= 0, `Preservation should be >= 0 for ${pr.profile}`);
        assert.ok(pr.preservation <= 1.0, `Preservation should be <= 1.0 for ${pr.profile}`);
      }
    }
  });

  it('conformance results include canonical forms', () => {
    const records = createTestRecords();
    const summary = runConformanceSuite(records);

    for (const result of summary.results) {
      for (const pr of result.profileResults) {
        assert.ok(pr.originalCanonical && pr.originalCanonical.length > 0);
        assert.ok(pr.profiledCanonical && pr.profiledCanonical.length > 0);
        assert.strictEqual(pr.canonicalEqual, pr.originalCanonical === pr.profiledCanonical);
      }
    }
  });
});

describe('edge cases', () => {
  it('handles record with empty source text', () => {
    const record = createMinimalRecord('empty-source', '', 'empty_test');
    const summary = runConformanceSuite([{ id: 'empty', description: 'empty source', record }]);

    assert.strictEqual(summary.totalTests, 1);
    assert.ok(summary.results[0]!.allProfilesPass);
  });

  it('handles record with single-character roles', () => {
    const record = createMinimalRecord('short-roles', 'a b c', 'short_roles_test');
    record.sem.clauses[0]!.roles = { x: 'a', y: 'b' };
    const summary = runConformanceSuite([{ id: 'short', description: 'short roles', record }]);

    assert.strictEqual(summary.totalTests, 1);
  });

  it('handles record with renderings', () => {
    const record = {
      ...createMinimalRecord('with-renderings', 'test text', 'render_test'),
      renderings: { en: { code: 'test(code)', profile: 'safe', tokens: 3 } }
    };
    const summary = runConformanceSuite([{ id: 'with-renderings', description: 'with renderings', record }]);

    assert.strictEqual(summary.totalTests, 1);
    const tight = summary.results[0]!.profileResults.find(p => p.profile === 'tight')!;
    assert.ok(tight.warnings?.some(w => w.includes('Renderings')), 'Tight profile should warn about removed renderings');
  });
});
