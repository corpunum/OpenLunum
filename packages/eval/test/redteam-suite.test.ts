import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runRedTeamSuite, saveRedTeamReport } from '../src/redteam-suite.js';

describe('Red-Team Security Evaluation Suite', () => {
  it('executes red-team suite without failures and generates report', async () => {
    const summary = runRedTeamSuite();
    assert.ok(summary.totalTests > 0, 'Suite should contain test cases');
    assert.strictEqual(summary.failCount, 0, `${summary.failCount} red-team test cases failed`);
    assert.strictEqual(summary.passCount, summary.totalTests);

    const savedPath = await saveRedTeamReport(summary);
    assert.ok(savedPath.endsWith('redteam-report.json'), `Report should be saved to redteam-report.json, got: ${savedPath}`);
  });

  it('validates all specific attack categories are covered', () => {
    const summary = runRedTeamSuite();
    const categories = Object.keys(summary.byCategory);
    const requiredCategories = [
      'prompt-injection',
      'semantic-confusion',
      'boundary-conditions',
      'schema-poisoning',
      'fingerprint-collision',
      'unicode-encoding'
    ];

    for (const cat of requiredCategories) {
      assert.ok(categories.includes(cat), `Missing required red-team category: ${cat}`);
      const catSummary = summary.byCategory[cat];
      assert.ok(catSummary != null && catSummary.total > 0, `Category ${cat} should contain at least one test case`);
      assert.strictEqual(catSummary.failed, 0, `Category ${cat} has failures`);
    }
  });

  it('ensures fingerprint collision normalization behavior', () => {
    const summary = runRedTeamSuite();
    const case1 = summary.results.find((r) => r.id === 'FC-001');
    const case2 = summary.results.find((r) => r.id === 'FC-002');
    assert.ok(case1?.fingerprint != null);
    assert.ok(case2?.fingerprint != null);
    assert.strictEqual(case1.fingerprint, case2.fingerprint, 'FC-001 and FC-002 should canonicalize to the exact same fingerprint');
  });

  it('ensures unicode normalization converts full-width ASCII to standard ASCII', () => {
    const summary = runRedTeamSuite();
    const unicodeCase = summary.results.find((r) => r.id === 'UE-001');
    assert.ok(unicodeCase?.canonicalSem != null);
    assert.strictEqual(unicodeCase.canonicalSem.world, 'world');
    assert.strictEqual(unicodeCase.canonicalSem.kind, 'kind');
    const clause = unicodeCase.canonicalSem.clauses[0];
    assert.ok(clause != null);
    assert.strictEqual(clause.predicate, 'predicate');
  });
});
