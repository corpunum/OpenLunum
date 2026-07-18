import { test } from 'node:test';
import assert from 'node:assert';
import { ConformanceReportGenerator } from '../src/conformance-reports.js';

test('ConformanceReportGenerator generates hook report', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [
    { name: 'hook1', passed: true },
    { name: 'hook2', passed: true }
  ];
  
  const report = generator.generateHookReport(checks);
  
  assert.strictEqual(report.integration, 'hook');
  assert.strictEqual(report.totalChecks, 2);
  assert.strictEqual(report.passedChecks, 2);
  assert.strictEqual(report.failedChecks, 0);
  assert.ok(report.passed);
});

test('ConformanceReportGenerator generates plugin report', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [
    { name: 'plugin1', passed: true },
    { name: 'plugin2', passed: false, error: 'Failed' }
  ];
  
  const report = generator.generatePluginReport(checks);
  
  assert.strictEqual(report.integration, 'plugin');
  assert.strictEqual(report.totalChecks, 2);
  assert.strictEqual(report.passedChecks, 1);
  assert.strictEqual(report.failedChecks, 1);
  assert.strictEqual(report.passed, false);
});

test('ConformanceReportGenerator generates CLI report', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [
    { name: 'cli1', passed: true },
    { name: 'cli2', passed: true }
  ];
  
  const report = generator.generateCliReport(checks);
  
  assert.strictEqual(report.integration, 'cli');
  assert.ok(report.passed);
});

test('ConformanceReportGenerator formats as JSON', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [{ name: 'test', passed: true }];
  const report = generator.generateHookReport(checks);
  
  const json = generator.formatAsJson(report);
  const parsed = JSON.parse(json);
  
  assert.strictEqual(parsed.id, report.id);
  assert.strictEqual(parsed.integration, 'hook');
});

test('ConformanceReportGenerator formats as text', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [{ name: 'test', passed: true }];
  const report = generator.generateHookReport(checks);
  
  const text = generator.formatAsText(report);
  
  assert.ok(text.includes('Conformance Report'));
  assert.ok(text.includes('hook'));
});

test('ConformanceReportGenerator formats as summary', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [{ name: 'test', passed: true }];
  const report = generator.generateHookReport(checks);
  
  const summary = generator.formatAsSummary(report);
  
  assert.ok(summary.includes('HOOK'));
  assert.ok(summary.includes('1/1'));
});

test('ConformanceReportGenerator counts reports', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [{ name: 'test', passed: true }];
  generator.generateHookReport(checks);
  generator.generatePluginReport(checks);
  
  assert.strictEqual(generator.getReportCount(), 2);
});

test('ConformanceReportGenerator resets count', () => {
  const generator = new ConformanceReportGenerator();
  
  const checks = [{ name: 'test', passed: true }];
  generator.generateHookReport(checks);
  generator.reset();
  
  assert.strictEqual(generator.getReportCount(), 0);
});