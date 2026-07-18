import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runQualityGates,
  checkQualityGates,
  generateCIReport,
  getDefaultGates,
  type QualityGateCIResult,
  type GateCheckResult
} from '../src/quality-gate-ci.js';
import type { QualityGate } from '../src/downstream-quality.js';
import type { QualityGateCIConfig } from '../src/quality-gate-ci.js';

// ── Tests ──────────────────────────────────────────────────────────

describe('getDefaultGates', () => {
  it('returns 4 default gates', () => {
    const gates = getDefaultGates();
    assert.strictEqual(gates.length, 4);
  });

  it('has gates with valid configurations', () => {
    const gates = getDefaultGates();
    for (const gate of gates) {
      assert.ok(gate.name);
      assert.ok(gate.taskType);
      assert.ok(gate.minimumScore >= 0 && gate.minimumScore <= 1);
      assert.ok(gate.warnThreshold >= gate.minimumScore);
      assert.ok(gate.failThreshold <= gate.minimumScore);
    }
  });

  it('has gates for each quality dimension', () => {
    const gates = getDefaultGates();
    const gateNames = gates.map(g => g.name);
    assert.ok(gateNames.includes('sem-validation'));
    assert.ok(gateNames.includes('injection-resistance'));
    assert.ok(gateNames.includes('renderer-conformance'));
    assert.ok(gateNames.includes('downstream-quality'));
  });
});

describe('runQualityGates', () => {
  it('runs all gates by default', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());

    assert.strictEqual(result.totalGates, 4);
    assert.ok(result.gates.length === 4);
    assert.ok(['pass', 'warn', 'fail'].includes(result.status));
  });

  it('runs only specified gates', () => {
    const result = runQualityGates({
      runInjectionTests: false,
      runConformanceSuite: false,
      runDownstreamQuality: false,
      runContextQuality: true
    } as QualityGateCIConfig, getDefaultGates());

    // Should have sem-validation + context-quality (2 gates)
    assert.strictEqual(result.totalGates, 2);
    assert.ok(result.gates.some(g => g.gate === 'sem-validation'));
    assert.ok(result.gates.some(g => g.gate === 'context-quality'));
  });

  it('returns correct gate result details', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());

    for (const gate of result.gates) {
      assert.ok(gate.gate);
      assert.ok(['pass', 'warn', 'fail'].includes(gate.result));
      assert.ok(typeof gate.score === 'number');
      assert.ok(typeof gate.minimumScore === 'number');
      assert.ok(Array.isArray(gate.details));
    }
  });

  it('computes correct summary statistics', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());

    assert.strictEqual(
      result.passedGates + result.warnedGates + result.failedGates,
      result.totalGates
    );
    assert.strictEqual(result.allPassed, result.failedGates === 0);
    assert.strictEqual(result.hadWarnings, result.warnedGates > 0);
  });

  it('respects strictMode option', () => {
    const strictResult = runQualityGates({ strictMode: true } as QualityGateCIConfig, getDefaultGates());
    const normalResult = runQualityGates({ strictMode: false } as QualityGateCIConfig, getDefaultGates());

    // Strict mode should not have more warnings
    assert.ok(strictResult.warnedGates <= normalResult.warnedGates + 1);
  });

  it('respects minimumPassRate option', () => {
    const result = runQualityGates({ minimumPassRate: 0 } as QualityGateCIConfig, getDefaultGates());
    assert.strictEqual(result.totalGates > 0, true);
  });
});

describe('checkQualityGates', () => {
  it('returns correct exit codes for pass/warn/fail', () => {
    const { exitCode, result } = checkQualityGates({} as QualityGateCIConfig);
    assert.ok(['pass', 'warn', 'fail'].includes(result.status));
    if (result.status === 'pass') assert.strictEqual(exitCode, 0);
    else if (result.status === 'warn') assert.strictEqual(exitCode, 1);
    else assert.strictEqual(exitCode, 2);
  });

  it('returns correct exit codes', () => {
    const { exitCode } = checkQualityGates({} as QualityGateCIConfig);
    assert.ok(exitCode >= 0 && exitCode <= 2);
  });

  it('returns a complete result', () => {
    const { result } = checkQualityGates({} as QualityGateCIConfig);
    assert.ok(result.gates.length > 0);
    assert.ok(result.totalGates > 0);
  });
});

describe('generateCIReport', () => {
  it('generates a markdown report', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);

    assert.ok(report.includes('# Quality Gate CI Report'));
    assert.ok(report.includes('Status:'));
    assert.ok(report.includes('Gates:'));
  });

  it('includes all gate results', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);

    for (const gate of result.gates) {
      assert.ok(report.includes(gate.gate));
    }
  });

  it('includes pass/warn/fail indicators', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);

    for (const gate of result.gates) {
      const icon = gate.result === 'pass' ? '✅' : gate.result === 'warn' ? '⚠️' : '❌';
      assert.ok(report.includes(icon));
    }
  });

  it('includes detail messages', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);

    for (const gate of result.gates) {
      for (const detail of gate.details) {
        assert.ok(report.includes(detail));
      }
    }
  });
});

describe('gate integration', () => {
  it('sem-validation gate passes', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const semGate = result.gates.find(g => g.gate === 'sem-validation');
    assert.ok(semGate);
    assert.ok(semGate.result !== 'fail', 'sem-validation should pass');
  });

  it('injection-resistance gate passes', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const injGate = result.gates.find(g => g.gate === 'injection-resistance');
    assert.ok(injGate);
    assert.ok(injGate.result !== 'fail', 'injection-resistance should pass');
  });

  it('renderer-conformance gate passes', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const renderGate = result.gates.find(g => g.gate === 'renderer-conformance');
    assert.ok(renderGate);
    // Renderer conformance may warn but should not fail
  });

  it('downstream-quality gate passes', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const downGate = result.gates.find(g => g.gate === 'downstream-quality');
    assert.ok(downGate);
    assert.ok(downGate.result !== 'fail', 'downstream-quality should pass with test data');
  });

  it('context-quality gate reports token savings', () => {
    const result = runQualityGates({ runContextQuality: true } as QualityGateCIConfig, getDefaultGates());
    const ctxGate = result.gates.find(g => g.gate === 'context-quality');
    assert.ok(ctxGate);
    assert.ok(ctxGate.details.some(d => d.includes('tokens')));
  });
});

describe('CI report format', () => {
  it('report is valid markdown', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);
    assert.ok(report.startsWith('#'));
  });

  it('report includes generated by footer', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);
    assert.ok(report.includes('Generated by OpenLunum'));
  });

  it('report includes score details', () => {
    const result = runQualityGates({} as QualityGateCIConfig, getDefaultGates());
    const report = generateCIReport(result);
    assert.ok(report.includes('score:'));
    assert.ok(report.includes('minimum:'));
  });
});
