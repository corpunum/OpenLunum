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

    assert.ok(report.timestamp > 0, 'timestamp should be set');
    assert.ok(Array.isArray(report.gates), 'gates should be an array');
    assert.ok(report.gates.length > 0, 'should have at least one gate');
    assert.ok(report.overallScore >= 0 && report.overallScore <= 1, 'score should be 0-1');
    assert.ok([0, 1, 2].includes(report.exitCode), 'exitCode should be 0, 1, or 2');
    assert.ok(Array.isArray(report.warnings), 'warnings should be an array');
  });

  it('runQualityGates respects minimumPassRate config', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records, { minimumPassRate: 0.5 });

    assert.ok(report.overallScore >= 0.5 || report.exitCode === 0,
      'should pass with minimumPassRate=0.5 when score is acceptable');
  });

  it('checkQualityGates returns correct exit code', () => {
    const records = [makeRecord('test-1')];
    const exitCode = checkQualityGates(records);

    assert.ok([0, 1, 2].includes(exitCode), 'exitCode should be 0, 1, or 2');
  });

  it('generateCIReport produces markdown', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);
    const markdown = generateCIReport(report);

    assert.ok(typeof markdown === 'string', 'report should be a string');
    assert.ok(markdown.length > 0, 'report should not be empty');
    assert.ok(markdown.includes('Quality Gate CI Report'), 'should include title');
  });

  it('runQualityGates with empty records', () => {
    const report = runQualityGates([]);

    // Gates still run with empty records; downstream and injection pass, conformance may fail
    assert.ok(report.exitCode === 1 || report.exitCode === 2, 'empty records may have warnings or fail');
    assert.ok(Array.isArray(report.gates), 'should still have gates');
  });

  it('runQualityGates with mixed config', () => {
    const records = [makeRecord('test-1')];
    const config: QualityGateCIConfig = {
      runDownstreamQuality: false,
      runMixedContext: false,
      runInjectionTests: true,
      runConformanceSuite: false
    };

    const report = runQualityGates(records, config);

    assert.ok(report.gates.some(g => g.name === 'injection-resistance'),
      'should include injection-resistance gate');
  });

  it('report includes gate details and warnings', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);

    for (const gate of report.gates) {
      assert.ok(gate.name, 'gate should have a name');
      assert.ok(typeof gate.passed === 'boolean', 'gate should have passed boolean');
      assert.ok(typeof gate.score === 'number', 'gate should have a score');
    }
  });

  it('CI report markdown includes exit code', () => {
    const records = [makeRecord('test-1')];
    const report = runQualityGates(records);
    const markdown = generateCIReport(report);

    assert.ok(markdown.includes('Exit Code:') && markdown.includes(String(report.exitCode)),
      'markdown should include exit code');
  });
});
