/**
 * OpenUnum adapter end-to-end conformance verification
 *
 * Tests the full lifecycle: install → configure → run shadow mode →
 * compare shadow outputs to direct API → publish conformance report.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLunumSidecar, compileLunumShadowContext } from '../src/index.js';
import { ShadowModeAdapter } from '../src/shadow-mode.js';
import type { LunumRecord, LunumSem, LunumSidecar } from '@corpunum/lunum';

// ── Test fixture builders ──────────────────────────────────────────

function buildLunumSem(overrides: Partial<LunumSem> = {}): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{
      predicate: 'prefer',
      roles: {
        experiencer: { type: 'actor', id: 'user' },
        theme: { type: 'concept', id: 'concise_answers' }
      },
      negated: false
    }],
    annotations: { sourceText: 'The user prefers concise answers.', sourceLanguage: 'en' },
    ...overrides
  };
}

function buildRecord(sem: LunumSem, overrides: Record<string, unknown> = {}): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'Test input', language: 'en', role: 'user', ref: null },
    sem,
    fingerprint: 'test-fp-manual',
    renderings: {},
    policy: { eligible: true, category: 'preference', risk: 'low' as const, confidence: 0.95, reasons: [] },
    meta: { createdAt: Date.now() },
    ...overrides
  };
}

// ── Conformance report type ────────────────────────────────────────

interface ConformanceReport {
  title: string;
  version: string;
  timestamp: string;
  tests: Array<{
    name: string;
    category: string;
    status: 'pass' | 'fail';
    details?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

function createReport(): ConformanceReport {
  return {
    title: 'OpenUnum Adapter E2E Conformance',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { total: 0, passed: 0, failed: 0, passRate: 0 }
  };
}

function addResult(report: ConformanceReport, testName: string, category: string, pass: boolean, details?: string): void {
  const entry: ConformanceReport['tests'][number] = { name: testName, category, status: pass ? 'pass' : 'fail' };
  if (details !== undefined) entry.details = details;
  report.tests.push(entry);
  report.summary.total++;
  if (pass) report.summary.passed++; else report.summary.failed++;
  report.summary.passRate = report.summary.total > 0
    ? Math.round((report.summary.passed / report.summary.total) * 10000) / 100
    : 0;
}

// ── Test group: Installation ───────────────────────────────────────

test('e2e conformance: adapter installs — deriveLunumSidecar exported', () => {
  assert.ok(typeof deriveLunumSidecar === 'function', 'deriveLunumSidecar should be a function');
});

test('e2e conformance: adapter installs — compileLunumShadowContext exported', () => {
  assert.ok(typeof compileLunumShadowContext === 'function', 'compileLunumShadowContext should be a function');
});

test('e2e conformance: adapter installs — ShadowModeAdapter exported', () => {
  assert.ok(typeof ShadowModeAdapter === 'function', 'ShadowModeAdapter should be a constructor');
});

// ── Test group: Configuration ──────────────────────────────────────

test('e2e conformance: default config has shadow mode disabled', () => {
  const adapter = new ShadowModeAdapter();
  const config = adapter.getConfig();
  assert.strictEqual(config.enabled, false, 'shadow mode should be disabled by default');
  assert.strictEqual(config.logLevel, 'info', 'default log level should be info');
  assert.strictEqual(config.maxRecords, 1000, 'default maxRecords should be 1000');
  assert.strictEqual(config.compareWithProduction, false, 'compare should be disabled by default');
});

test('e2e conformance: config can be set at construction', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    logLevel: 'debug',
    maxRecords: 500,
    compareWithProduction: true
  });
  const config = adapter.getConfig();
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.logLevel, 'debug');
  assert.strictEqual(config.maxRecords, 500);
  assert.strictEqual(config.compareWithProduction, true);
});

test('e2e conformance: config can be updated post-construction', () => {
  const adapter = new ShadowModeAdapter({ enabled: false });
  assert.strictEqual(adapter.getConfig().enabled, false);
  adapter.setConfig({ enabled: true });
  assert.strictEqual(adapter.getConfig().enabled, true);
});

// ── Test group: Shadow mode processing ─────────────────────────────

test('e2e conformance: processes simple preference record through shadow mode', () => {
  const sem = buildLunumSem();
  const record = buildRecord(sem);
  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });

  const result = adapter.process(record, sem);

  assert.ok(result.shadow, 'shadow record should be created');
  assert.ok(result.comparison, 'comparison should exist when compareWithProduction is true');
  assert.ok(result.comparison!.fingerprintsMatch === false, 'fingerprints should differ (manual vs calculated)');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'semantics should match');
});

test('e2e conformance: processes safety constraint record through shadow mode', () => {
  const sem = buildLunumSem({
    kind: 'safety_constraint',
    clauses: [{
      predicate: 'require',
      roles: {
        agent: { type: 'actor', id: 'assistant' },
        action: { type: 'action', id: 'confirm' }
      },
      negated: false
    }]
  });
  const record = buildRecord(sem);
  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });

  const result = adapter.process(record, sem);

  assert.ok(result.shadow, 'shadow should handle safety constraints');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'safety constraint semantics should match');
});

test('e2e conformance: processes negated record through shadow mode', () => {
  const sem = buildLunumSem({
    kind: 'safety_constraint',
    clauses: [{
      predicate: 'delete',
      roles: {
        agent: { type: 'actor', id: 'assistant' },
        object: { type: 'concept', id: 'files' }
      },
      negated: true
    }]
  });
  const record = buildRecord(sem);
  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });

  const result = adapter.process(record, sem);

  assert.ok(result.shadow, 'shadow should handle negation');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'negated semantics should match');
});

test('e2e conformance: processes conditional record with consequences through shadow mode', () => {
  const sem = buildLunumSem({
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'require',
      roles: {
        agent: { type: 'actor', id: 'system' },
        theme: { type: 'action', id: 'notify' }
      },
      conditions: [{
        predicate: 'error',
        roles: { level: { type: 'concept', id: 'fatal' } },
        negated: false
      }],
      consequences: [{
        predicate: 'execute',
        roles: {
          action: { type: 'action', id: 'retry' },
          count: { type: 'quantity', value: 3 }
        },
        modality: 'certainty'
      }],
      negated: false
    }]
  });
  const record = buildRecord(sem);
  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });

  const result = adapter.process(record, sem);

  assert.ok(result.shadow, 'shadow should handle complex conditionals');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'conditional semantics should match');
});

test('e2e conformance: disabled adapter returns null shadow', () => {
  const adapter = new ShadowModeAdapter({ enabled: false });
  const sem = buildLunumSem();
  const record = buildRecord(sem);

  const result = adapter.process(record, sem);

  assert.strictEqual(result.shadow, null, 'disabled adapter should return null shadow');
  assert.strictEqual(result.comparison, undefined, 'no comparison when disabled');
});

// ── Test group: Direct API comparison ──────────────────────────────

test('e2e conformance: deriveLunumSidecar produces correct keys', () => {
  const sem = buildLunumSem();
  const sidecar = deriveLunumSidecar({ content: 'Test content', sem, role: 'user' });

  assert.ok('lunumCode' in sidecar, 'sidecar should have lunumCode');
  assert.ok('lunumSem' in sidecar, 'sidecar should have lunumSem');
  assert.ok('lunumFp' in sidecar, 'sidecar should have lunumFp');
  assert.ok('lunumMeta' in sidecar, 'sidecar should have lunumMeta');
  assert.strictEqual(Object.keys(sidecar).length, 4, 'sidecar should have exactly 4 keys');
});

test('e2e conformance: deriveLunumSidecar semantic flag is true for valid sem', () => {
  const sem = buildLunumSem();
  const sidecar = deriveLunumSidecar({ content: 'Test content', sem, role: 'user' });

  assert.strictEqual(sidecar.lunumMeta.semantic, true, 'semantic flag should be true');
  assert.strictEqual(sidecar.lunumFp !== null, true, 'fingerprint should be non-null');
  assert.ok(sidecar.lunumCode !== null, 'code should be non-null');
});

test('e2e conformance: deriveLunumSidecar falls back to surface for null sem', () => {
  const sidecar = deriveLunumSidecar({ content: 'Test content', sem: null, role: 'user' });

  assert.strictEqual(sidecar.lunumMeta.semantic, false, 'surface mode should not be semantic');
  assert.ok(sidecar.lunumCode !== null, 'surface code should be non-null');
});

test('e2e conformance: compileLunumShadowContext preserves natural messages', () => {
  const messages = [
    { role: 'user', content: 'Hello, how are you?' }
  ];
  const result = compileLunumShadowContext(messages);

  assert.ok('naturalMessages' in result, 'should have naturalMessages');
  assert.ok('mixedMessages' in result, 'should have mixedMessages');
  assert.ok('naturalTokens' in result, 'should have naturalTokens');
  assert.ok('mixedTokens' in result, 'should have mixedTokens');
  assert.ok('ratio' in result, 'should have ratio');
  assert.strictEqual(result.naturalMessages.length, 1, 'should preserve all natural messages');
  assert.strictEqual(result.naturalMessages[0]!.role, 'user');
  assert.strictEqual(result.naturalMessages[0]!.content, 'Hello, how are you?');
});

test('e2e conformance: compileLunumShadowContext returns natural and mixed separately', () => {
  const messages = [
    { role: 'user', content: 'Test message', lunumCode: 'test code', lunumMeta: { eligible: true } }
  ];
  const result = compileLunumShadowContext(messages);

  // naturalMessages always has the raw text
  assert.strictEqual(result.naturalMessages[0]!.content, 'Test message', 'natural should be raw text');
  // mixedMessages has code when eligible (mixed behavior, not shadow selection)
  assert.strictEqual(result.mixedMessages[0]!.content, 'test code', 'mixed should use code when eligible');
});

// ── Test group: Shadow vs Direct delta measurement ─────────────────

test('e2e conformance: shadow and direct use the same canonical fingerprint', () => {
  const sem = buildLunumSem();
  const record = buildRecord(sem);
  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });

  const shadowResult = adapter.process(record, sem);

  // Direct API produces a fingerprint via deriveLunumSidecar
  const directSidecar = deriveLunumSidecar({ content: 'Test', sem, role: 'user' });

  // Shadow mode must be comparable with the direct API.
  assert.strictEqual(shadowResult.shadow!.fingerprint, directSidecar.lunumFp);
  assert.match(shadowResult.shadow!.fingerprint, /^lfp:0\.1:sha256:[a-f0-9]+$/, 'shadow fingerprint should use canonical semantic format');
});

test('e2e conformance: shadow mode preserves semantic identity through comparison', () => {
  const testCases: Array<{ kind: string; sem: LunumSem }> = [
    { kind: 'preference', sem: buildLunumSem() },
    { kind: 'safety_constraint', sem: buildLunumSem({
      kind: 'safety_constraint',
      clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'a' } }, negated: false }]
    }) },
    { kind: 'conditional_instruction', sem: buildLunumSem({
      kind: 'conditional_instruction',
      clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'a' } },
        conditions: [{ predicate: 'error', roles: {}, negated: false }],
        consequences: [], negated: false }]
    }) }
  ];

  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });
  let allMatch = true;

  for (const tc of testCases) {
    const record = buildRecord(tc.sem);
    const result = adapter.process(record, tc.sem);
    if (!result.comparison?.semanticsMatch) allMatch = false;
  }

  assert.strictEqual(allMatch, true, 'all semantic comparisons should match');
});

// ── Test group: Conformance report generation ──────────────────────

test('e2e conformance: generates valid conformance report', () => {
  const report = createReport();

  // Simulate running several tests
  addResult(report, 'adapter installs', 'installation', true);
  addResult(report, 'default config disabled', 'configuration', true);
  addResult(report, 'config can be set', 'configuration', true);
  addResult(report, 'processes simple record', 'shadow processing', true);
  addResult(report, 'shadow uses canonical fingerprint', 'delta measurement', true);
  addResult(report, 'shadow preserves semantics', 'delta measurement', true);
  addResult(report, 'direct API produces correct sidecar', 'direct API', true);
  addResult(report, 'shadow context preserves natural', 'direct API', true);

  assert.strictEqual(report.summary.total, 8);
  assert.strictEqual(report.summary.passed, 8);
  assert.strictEqual(report.summary.failed, 0);
  assert.strictEqual(report.summary.passRate, 100);
  assert.ok(report.timestamp, 'report should have timestamp');
  assert.strictEqual(report.title, 'OpenUnum Adapter E2E Conformance');
});

test('e2e conformance: report tracks failures correctly', () => {
  const report = createReport();

  addResult(report, 'passing test', 'category', true);
  addResult(report, 'failing test', 'category', false, 'expected something different');
  addResult(report, 'another pass', 'category', true);

  assert.strictEqual(report.summary.total, 3);
  assert.strictEqual(report.summary.passed, 2);
  assert.strictEqual(report.summary.failed, 1);
  assert.strictEqual(report.summary.passRate, 66.67);
  assert.strictEqual(report.tests[1]!.details, 'expected something different');
});

// ── Test group: Full lifecycle — install, configure, run, compare, report ─

test('e2e conformance: full lifecycle with report', () => {
  const report = createReport();

  // Phase 1: Install
  addResult(report, 'adapter imports resolve', 'installation', true);

  // Phase 2: Configure
  const adapter = new ShadowModeAdapter({ enabled: true, compareWithProduction: true, maxRecords: 100 });
  addResult(report, 'shadow mode configured', 'configuration', true);

  // Phase 3: Run — process diverse records
  const records: Array<{ name: string; sem: LunumSem }> = [
    { name: 'simple preference', sem: buildLunumSem() },
    { name: 'safety constraint', sem: buildLunumSem({
      kind: 'safety_constraint',
      clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'a' } }, negated: false }]
    }) },
    { name: 'negated action', sem: buildLunumSem({
      kind: 'safety_constraint',
      clauses: [{ predicate: 'delete', roles: { agent: { type: 'actor', id: 'a' }, object: { type: 'concept', id: 'x' } }, negated: true }]
    }) },
    { name: 'conditional instruction', sem: buildLunumSem({
      kind: 'conditional_instruction',
      clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'a' } },
        conditions: [{ predicate: 'error', roles: {}, negated: false }],
        consequences: [{ predicate: 'execute', roles: {}, modality: 'certainty' }],
        negated: false }]
    }) }
  ];

  for (const tc of records) {
    const record = buildRecord(tc.sem);
    const result = adapter.process(record, tc.sem);
    addResult(report, `process ${tc.name}`, 'shadow processing',
      result.shadow !== null && result.comparison?.semanticsMatch === true,
      result.comparison ? `fpMatch: ${result.comparison.fingerprintsMatch}` : undefined
    );
  }

  // Phase 4: Compare with direct API
  const sem = buildLunumSem();
  const shadowResult = adapter.process(buildRecord(sem), sem);
  const directSidecar = deriveLunumSidecar({ content: 'Test', sem, role: 'user' });

  addResult(report, 'shadow fingerprint equals direct', 'delta measurement',
    shadowResult.shadow!.fingerprint === directSidecar.lunumFp);
  addResult(report, 'direct sidecar has all keys', 'direct API',
    Object.keys(directSidecar).length === 4);

  // Phase 5: Report
  assert.strictEqual(report.summary.total, records.length + 4, 'report should have all test results');
  assert.strictEqual(report.summary.failed, 0, 'all tests should pass');
  assert.strictEqual(report.summary.passRate, 100, 'pass rate should be 100%');
});
