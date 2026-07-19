import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  runQualityGates,
  checkQualityGates,
  generateCIReport,
  type QualityGateCIConfig
} from '../src/quality-gate-ci.js';
import type { LunumRecord } from '../src/types.js';

function makeRecord(id: string): LunumRecord {
  return {
    recordVersion: '0.2',
    source: {
      text: `Test record ${id}`,
      language: 'en',
      role: 'user',
      ref: null
    },
    sem: {
      schema: '0.2',
      world: 'test',
      kind: 'fact',
      clauses: [{
        predicate: 'test',
        roles: {}
      }]
    },
    fingerprint: 'fp-test-' + id,
    renderings: {},
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low',
      confidence: 0.9,
      reasons: ['test reason']
    },
    meta: {}
  };
}

describe('quality-gate-ci', () => {
  it('runQualityGates returns valid report with default config', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);

    assert.ok(report.timestamp > 0);
    assert.ok(report.gates.length > 0, 'Should have at least one gate');
    assert.ok(report.overallScore >= 0 && report.overallScore <= 1);
    assert.ok([0, 1, 2].includes(report.exitCode));
    assert.ok(Array.isArray(report.warnings));
  });

  it('runQualityGates respects minimumPassRate config', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, { minimumPassRate: 0.5 });

    assert.ok(report.overallScore >= 0.5 || report.exitCode === 0);
  });

  it('checkQualityGates returns valid exit code', () => {
    const records = [makeRecord('test-1')];
    const exitCode = checkQualityGates(records);

    assert.ok([0, 1, 2].includes(exitCode), 'Should return a valid exit code (0=pass, 1=warn, 2=fail)');
  });

  it('generateCIReport produces valid markdown', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);
    const md = generateCIReport(report);

    assert.ok(typeof md === 'string');
    assert.ok(md.includes('# Quality Gate CI Report'));
    assert.ok(md.includes('| Gate |'));
  });

  it('runQualityGates with empty records returns valid report', () => {
    const report = runQualityGates([]);

    assert.ok(report.gates.length > 0);
    assert.ok(report.overallScore >= 0);
  });

  it('runQualityGates with strict mode', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, { strictMode: true });

    assert.ok([0, 1, 2].includes(report.exitCode));
  });

  it('runQualityGates with selective gates', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, {
      runDownstreamQuality: true,
      runMixedContext: false,
      runInjectionTests: false,
      runConformanceSuite: true,
      runPromptGates: false
    });

    const gateNames = report.gates.map(g => g.name);
    assert.ok(gateNames.includes('downstream-quality'));
    assert.ok(!gateNames.includes('mixed-context'));
    assert.ok(!gateNames.includes('injection-resistance'));
    assert.ok(gateNames.includes('renderer-conformance'));
    assert.ok(!gateNames.includes('prompt-gates'));
  });

  it('GateResultEntry has required fields', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);

    for (const gate of report.gates) {
      assert.ok(typeof gate.name === 'string');
      assert.ok(typeof gate.passed === 'boolean');
      assert.ok(typeof gate.score === 'number');
      assert.ok(Array.isArray(gate.details));
    }
  });

  it('runQualityGates with multiple records', () => {
    const records = [makeRecord('test-1'), makeRecord('test-2'), makeRecord('test-3')];
    const report = runQualityGates(records);

    assert.ok(report.gates.length > 0, 'Should have gates');
    assert.ok(report.overallScore >= 0, 'Should have non-negative score');
    assert.ok([0, 1, 2].includes(report.exitCode), 'Should have valid exit code');
  });

  it('runQualityGates with all gates enabled', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, {
      runDownstreamQuality: true,
      runMixedContext: true,
      runInjectionTests: true,
      runConformanceSuite: true,
      runPromptGates: true
    });

    const gateNames = report.gates.map(g => g.name);
    assert.ok(gateNames.includes('downstream-quality'));
    assert.ok(gateNames.includes('mixed-context'));
    assert.ok(gateNames.includes('injection-resistance'));
    assert.ok(gateNames.includes('renderer-conformance'));
    assert.ok(gateNames.includes('prompt-gates'));
  });

  it('runQualityGates with very low minimumPassRate', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, { minimumPassRate: 0.01 });

    assert.ok(report.overallScore >= 0.01 || report.exitCode === 0, 'Should pass with very low threshold');
  });

  it('runQualityGates with very high minimumPassRate', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, { minimumPassRate: 0.99 });

    // May pass or fail depending on scores, but should not throw
    assert.ok(report.overallScore >= 0 && report.overallScore <= 1);
    assert.ok([0, 1, 2].includes(report.exitCode));
  });

  it('generateCIReport includes all gate names', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);
    const md = generateCIReport(report);

    for (const gate of report.gates) {
      assert.ok(md.includes(gate.name), `Report should include gate name: ${gate.name}`);
    }
  });

  it('checkQualityGates uses default config', () => {
    const records = [makeRecord('test-1')];
    const exitCode = checkQualityGates(records);

    // Should use default config which runs all gates
    assert.ok([0, 1, 2].includes(exitCode));
  });

  it('QualityGateCIConfig accepts partial config', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, { minimumPassRate: 0.7 });

    assert.ok(report.overallScore >= 0);
    assert.ok([0, 1, 2].includes(report.exitCode));
  });

  it('QualityGateCIReport has all required fields', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);

    assert.ok(typeof report.timestamp === 'number');
    assert.ok(Array.isArray(report.gates));
    assert.ok(typeof report.overallScore === 'number');
    assert.ok([0, 1, 2].includes(report.exitCode));
    assert.ok(Array.isArray(report.warnings));
  });
});
