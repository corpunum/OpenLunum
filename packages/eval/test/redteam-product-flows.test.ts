import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProductFlowRedTeam, PRODUCT_FLOW_TEST_CASES } from '../src/redteam-product-flows.js';

describe('Red-Team Product Flow Evaluation Suite', () => {
  it('executes all product flow test cases without throwing', () => {
    const summary = runProductFlowRedTeam();
    assert.ok(summary.totalTests > 0);
    assert.strictEqual(summary.results.length, summary.totalTests);
  });

  it('all injection attempts get expected outcome with zero failures', () => {
    const summary = runProductFlowRedTeam();
    assert.strictEqual(summary.failCount, 0, `${summary.failCount} product flow test cases failed: ${summary.results.filter((r) => !r.passed).map((r) => `${r.id}: expected=${r.expected} actual=${r.actual}`).join(', ')}`);
    assert.strictEqual(summary.passCount, summary.totalTests);
  });

  it('summary counts match total cases', () => {
    const summary = runProductFlowRedTeam();
    assert.strictEqual(summary.passCount + summary.failCount, summary.totalTests);
    let categoryTotal = 0;
    for (const cat of Object.values(summary.byCategory)) {
      categoryTotal += cat.total;
      assert.strictEqual(cat.passed + cat.failed, cat.total);
    }
    assert.strictEqual(categoryTotal, summary.totalTests);
  });

  it('each category has at least 2 test cases', () => {
    const summary = runProductFlowRedTeam();
    const requiredCategories = [
      'cli-injection',
      'jsonl-poisoning',
      'schema-injection',
      'fingerprint-attack',
      'unicode-normalization'
    ];

    for (const cat of requiredCategories) {
      const catSummary = summary.byCategory[cat];
      assert.ok(catSummary != null, `Missing required category: ${cat}`);
      assert.ok(catSummary.total >= 2, `Category ${cat} should have at least 2 test cases, got ${catSummary.total}`);
    }
  });

  it('test case IDs in static array match categories', () => {
    const cliCases = PRODUCT_FLOW_TEST_CASES.filter((tc) => tc.category === 'cli-injection');
    const jsonlCases = PRODUCT_FLOW_TEST_CASES.filter((tc) => tc.category === 'jsonl-poisoning');
    const schemaCases = PRODUCT_FLOW_TEST_CASES.filter((tc) => tc.category === 'schema-injection');
    const fpCases = PRODUCT_FLOW_TEST_CASES.filter((tc) => tc.category === 'fingerprint-attack');
    const unicodeCases = PRODUCT_FLOW_TEST_CASES.filter((tc) => tc.category === 'unicode-normalization');

    assert.ok(cliCases.length >= 2);
    assert.ok(jsonlCases.length >= 2);
    assert.ok(schemaCases.length >= 2);
    assert.ok(fpCases.length >= 2);
    assert.ok(unicodeCases.length >= 2);
  });

  it('fingerprint-attack cases with same semantic content produce same fingerprint', () => {
    const summary = runProductFlowRedTeam();
    const fa1 = summary.results.find((r) => r.id === 'FA-001');
    const fa2 = summary.results.find((r) => r.id === 'FA-002');
    assert.ok(fa1?.fingerprint != null);
    assert.ok(fa2?.fingerprint != null);
    assert.strictEqual(fa1.fingerprint, fa2.fingerprint);
  });
});
