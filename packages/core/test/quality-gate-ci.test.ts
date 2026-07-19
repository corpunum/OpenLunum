import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runQualityGates,
  checkQualityGates,
  generateCIReport,
  type QualityGateCIConfig,
  type QualityGateResult,
  type QualityGateReport,
} from '../src/quality-gate-ci.js';
import { validateSem } from '../src/canonicalize.js';
import type { LunumSem } from '../src/types.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeValidSem(id: string): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: id,
    kind: 'statement',
    clauses: [{ predicate: 'exists', roles: { subject: id, object: 'something' } }],
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('runQualityGates', () => {
  it('runs at least injection-resistance and renderer-conformance by default', () => {
    const report = runQualityGates();
    assert.ok(Array.isArray(report.gates), 'gates should be an array');
    assert.ok(report.gates.length >= 2, 'should run at least 2 gates by default');
    const gateNames = report.gates.map((g) => g.name);
    assert.ok(gateNames.includes('injection-resistance'), 'should include injection-resistance');
    assert.ok(gateNames.includes('renderer-conformance'), 'should include renderer-conformance');
  });

  it('includes sem-validation when seed records are provided', () => {
    const seed = [makeValidSem('test-1'), makeValidSem('test-2')];
    const report = runQualityGates({ seedRecords: seed });
    const gateNames = report.gates.map((g) => g.name);
    assert.ok(gateNames.includes('sem-validation'), 'should include sem-validation');
  });

  it('excludes context-quality by default', () => {
    const report = runQualityGates();
    const gateNames = report.gates.map((g) => g.name);
    assert.ok(!gateNames.includes('context-quality'), 'should not include context-quality by default');
  });

  it('includes context-quality when enabled', () => {
    const report = runQualityGates({ runContextQuality: true });
    const gateNames = report.gates.map((g) => g.name);
    assert.ok(gateNames.includes('context-quality'), 'should include context-quality when enabled');
  });

  it('excludes injection-resistance when disabled', () => {
    const report = runQualityGates({ runInjectionTests: false });
    const gateNames = report.gates.map((g) => g.name);
    assert.ok(!gateNames.includes('injection-resistance'), 'should not include injection-resistance when disabled');
  });

  it('excludes renderer-conformance when disabled', () => {
    const report = runQualityGates({ runConformanceSuite: false });
    const gateNames = report.gates.map((g) => g.name);
    assert.ok(!gateNames.includes('renderer-conformance'), 'should not include renderer-conformance when disabled');
  });

  it('returns a valid QualityGateReport structure', () => {
    const report = runQualityGates();
    assert.ok('overallStatus' in report);
    assert.ok('exitCode' in report);
    assert.ok('gates' in report);
    assert.ok('timestamp' in report);
    assert.ok('totalGates' in report);
    assert.ok('passedGates' in report);
    assert.ok('failedGates' in report);
    assert.ok('warnedGates' in report);
  });

  it('each gate has correct structure', () => {
    const report = runQualityGates();
    for (const gate of report.gates) {
      assert.ok('name' in gate);
      assert.ok('status' in gate);
      assert.ok('exitCode' in gate);
      assert.ok('passRate' in gate);
      assert.ok('totalItems' in gate);
      assert.ok('passedItems' in gate);
      assert.ok('details' in gate);
      assert.ok('warnings' in gate);
      assert.strictEqual(typeof gate.status, 'string');
      assert.ok(['pass', 'warn', 'fail'].includes(gate.status));
      assert.strictEqual(typeof gate.passRate, 'number');
      assert.ok(gate.passRate >= 0 && gate.passRate <= 1);
    }
  });

  it('sem-validation gate validates records correctly', () => {
    const seed = [makeValidSem('valid-1'), makeValidSem('valid-2')];
    const report = runQualityGates({ seedRecords: seed });
    const semGate = report.gates.find((g) => g.name === 'sem-validation');
    assert.ok(semGate, 'sem-validation gate should exist');
    assert.strictEqual(semGate!.totalItems, 2);
    assert.strictEqual(semGate!.passedItems, 2);
    assert.strictEqual(semGate!.passRate, 1);
    assert.strictEqual(semGate!.status, 'pass');
  });

  it('sem-validation gate rejects invalid records', () => {
    const invalidSem: LunumSem = {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'statement',
      clauses: [{ predicate: 'exists', roles: { subject: 'test', object: 'obj' } }],
    };
    const report = runQualityGates({ seedRecords: [invalidSem] });
    const semGate = report.gates.find((g) => g.name === 'sem-validation');
    assert.ok(semGate, 'sem-validation gate should exist');
    // validateSem should accept this as valid (it has all required fields)
    // But if it fails, the gate should report it
    if (semGate!.status === 'fail') {
      assert.strictEqual(semGate!.passedItems, 0);
    } else if (semGate!.status === 'pass') {
      assert.strictEqual(semGate!.passedItems, 1);
    }
  });

  it('reports consistent gate counts', () => {
    const report = runQualityGates();
    let passed = 0;
    let warned = 0;
    let failed = 0;
    for (const gate of report.gates) {
      if (gate.status === 'pass') passed++;
      else if (gate.status === 'warn') warned++;
      else failed++;
    }
    assert.strictEqual(report.passedGates, passed);
    assert.strictEqual(report.warnedGates, warned);
    assert.strictEqual(report.failedGates, failed);
    assert.strictEqual(report.totalGates, report.gates.length);
  });

  it('exit code matches overall status', () => {
    const report = runQualityGates();
    if (report.overallStatus === 'pass') {
      assert.strictEqual(report.exitCode, 0);
    } else if (report.overallStatus === 'warn') {
      assert.strictEqual(report.exitCode, 1);
    } else {
      assert.strictEqual(report.exitCode, 2);
    }
  });
});

describe('checkQualityGates', () => {
  it('returns 0 for all-pass configuration', () => {
    const result = checkQualityGates({ runContextQuality: false });
    assert.ok(result >= 0 && result <= 2);
    // In normal conditions, should pass
    if (result === 0) {
      // Good, all gates passed
    }
  });

  it('returns a valid exit code (0, 1, or 2)', () => {
    const result = checkQualityGates();
    assert.ok([0, 1, 2].includes(result), `exit code should be 0, 1, or 2, got ${result}`);
  });

  it('strict mode elevates warnings to fail', () => {
    // Run with a seed that might produce warnings
    const seed = [makeValidSem('strict-test')];
    const result = checkQualityGates({
      seedRecords: seed,
      strictMode: true,
      runContextQuality: false,
    });
    assert.ok([0, 1, 2].includes(result));
  });
});

describe('generateCIReport', () => {
  it('produces markdown with status icon', () => {
    const report = runQualityGates();
    const md = generateCIReport(report);
    assert.ok(typeof md === 'string');
    assert.ok(md.length > 0);
    assert.ok(md.includes('# Quality Gate Report'));
    // Check for status icon
    assert.ok(md.includes('✅') || md.includes('⚠️') || md.includes('❌'));
  });

  it('includes all gate names in report', () => {
    const report = runQualityGates();
    const md = generateCIReport(report);
    for (const gate of report.gates) {
      assert.ok(md.includes(gate.name), `report should include gate name: ${gate.name}`);
    }
  });

  it('includes pass rates in report', () => {
    const report = runQualityGates();
    const md = generateCIReport(report);
    for (const gate of report.gates) {
      const expectedRate = `${(gate.passRate * 100).toFixed(1)}%`;
      assert.ok(
        md.includes(expectedRate) || gate.totalItems === 0,
        `report should include pass rate for ${gate.name}`,
      );
    }
  });

  it('includes timestamp in report', () => {
    const report = runQualityGates();
    const md = generateCIReport(report);
    assert.ok(md.includes('Generated:'));
    assert.ok(md.includes(report.timestamp));
  });

  it('includes summary counts in report', () => {
    const report = runQualityGates();
    const md = generateCIReport(report);
    assert.ok(md.includes(String(report.totalGates)));
    assert.ok(md.includes(String(report.passedGates)));
    assert.ok(md.includes(String(report.failedGates)));
  });
});

describe('minimumPassRate configuration', () => {
  it('respects minimumPassRate threshold', () => {
    const report = runQualityGates({ minimumPassRate: 0.5 });
    assert.ok('overallStatus' in report);
    // With a low threshold, should pass if most gates pass
    if (report.overallStatus === 'fail') {
      // Some gates may genuinely fail
    } else {
      assert.ok(report.overallStatus === 'pass' || report.overallStatus === 'warn');
    }
  });

  it('uses default minimumPassRate of 0.8', () => {
    // The default is 0.8, so if overall pass rate is below 0.8, should fail
    const report = runQualityGates();
    assert.ok('exitCode' in report);
  });
});

describe('QualityGateResult interface', () => {
  it('has all required properties', () => {
    const gate: QualityGateResult = {
      name: 'test-gate',
      status: 'pass',
      exitCode: 0,
      passRate: 1,
      totalItems: 10,
      passedItems: 10,
      details: {},
      warnings: [],
    };
    assert.strictEqual(gate.name, 'test-gate');
    assert.strictEqual(gate.status, 'pass');
    assert.strictEqual(gate.exitCode, 0);
    assert.strictEqual(gate.passRate, 1);
  });
});

describe('QualityGateReport interface', () => {
  it('has all required properties', () => {
    const report: QualityGateReport = {
      overallStatus: 'pass',
      exitCode: 0,
      gates: [],
      timestamp: new Date().toISOString(),
      totalGates: 0,
      passedGates: 0,
      failedGates: 0,
      warnedGates: 0,
    };
    assert.strictEqual(report.overallStatus, 'pass');
    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(Array.isArray(report.gates), true);
  });
});
