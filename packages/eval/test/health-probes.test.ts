import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHealth,
  semValidationProbe,
  fingerprintProbe,
  schemaRegistryProbe,
  ReadinessGate,
  FAILOVER_PROCEDURES,
  type HealthProbe,
  type HealthReport,
} from '../src/health-probes.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeProbe(overrides: Partial<HealthProbe> & { name: string }): HealthProbe {
  return {
    check: () => true,
    timeoutMs: 500,
    critical: false,
    ...overrides,
  };
}

// ── checkHealth ────────────────────────────────────────────────────

describe('checkHealth', () => {
  it('passes when all probes pass', () => {
    const report = checkHealth([
      makeProbe({ name: 'a', critical: true }),
      makeProbe({ name: 'b', critical: false }),
    ]);
    assert.strictEqual(report.healthy, true);
    assert.strictEqual(report.ready, true);
    assert.strictEqual(report.probes.length, 2);
    assert.ok(report.timestamp);
  });

  it('fails when any probe fails', () => {
    const report = checkHealth([
      makeProbe({ name: 'ok', critical: false }),
      makeProbe({ name: 'bad', critical: false, check: () => false }),
    ]);
    assert.strictEqual(report.healthy, false);
  });

  it('ready=true when only non-critical probes fail', () => {
    const report = checkHealth([
      makeProbe({ name: 'critical-ok', critical: true }),
      makeProbe({ name: 'non-critical-bad', critical: false, check: () => false }),
    ]);
    assert.strictEqual(report.healthy, false);
    assert.strictEqual(report.ready, true);
  });

  it('ready=false when a critical probe fails', () => {
    const report = checkHealth([
      makeProbe({ name: 'critical-bad', critical: true, check: () => false }),
      makeProbe({ name: 'non-critical-ok', critical: false }),
    ]);
    assert.strictEqual(report.healthy, false);
    assert.strictEqual(report.ready, false);
  });

  it('captures error message when probe throws', () => {
    const report = checkHealth([
      makeProbe({
        name: 'throwing',
        critical: true,
        check: () => { throw new Error('boom'); },
      }),
    ]);
    assert.strictEqual(report.healthy, false);
    assert.strictEqual(report.probes[0]!.passed, false);
    assert.strictEqual(report.probes[0]!.error, 'boom');
  });

  it('records durationMs for each probe', () => {
    const report = checkHealth([makeProbe({ name: 'timed' })]);
    assert.strictEqual(typeof report.probes[0]!.durationMs, 'number');
    assert.ok(report.probes[0]!.durationMs >= 0);
  });
});

// ── Built-in probes ────────────────────────────────────────────────

describe('built-in probes', () => {
  it('semValidationProbe passes on a known-good sem', () => {
    const report = checkHealth([semValidationProbe]);
    assert.strictEqual(report.probes[0]!.passed, true);
  });

  it('fingerprintProbe passes on a known-good sem', () => {
    const report = checkHealth([fingerprintProbe]);
    assert.strictEqual(report.probes[0]!.passed, true);
  });

  it('schemaRegistryProbe passes for lunum-sem/0.1-draft', () => {
    const report = checkHealth([schemaRegistryProbe]);
    assert.strictEqual(report.probes[0]!.passed, true);
  });
});

// ── ReadinessGate ──────────────────────────────────────────────────

describe('ReadinessGate', () => {
  it('returns ready when all critical probes pass', () => {
    const result = ReadinessGate.check([
      makeProbe({ name: 'c1', critical: true }),
      makeProbe({ name: 'c2', critical: true }),
    ]);
    assert.strictEqual(result.ready, true);
    assert.deepStrictEqual(result.failures, []);
  });

  it('returns failures list for failing critical probes', () => {
    const result = ReadinessGate.check([
      makeProbe({ name: 'ok-crit', critical: true }),
      makeProbe({ name: 'bad-crit', critical: true, check: () => false }),
      makeProbe({ name: 'bad-non', critical: false, check: () => false }),
    ]);
    assert.strictEqual(result.ready, false);
    assert.deepStrictEqual(result.failures, ['bad-crit']);
  });
});

// ── FAILOVER_PROCEDURES ───────────────────────────────────────────

describe('FAILOVER_PROCEDURES', () => {
  it('has at least 3 entries', () => {
    assert.ok(FAILOVER_PROCEDURES.length >= 3);
  });

  it('every procedure has non-empty steps', () => {
    for (const proc of FAILOVER_PROCEDURES) {
      assert.ok(proc.id.length > 0, `procedure id must be non-empty`);
      assert.ok(proc.trigger.length > 0, `procedure trigger must be non-empty`);
      assert.ok(proc.steps.length > 0, `procedure ${proc.id} must have steps`);
      assert.ok(proc.verification.length > 0, `procedure ${proc.id} must have verification`);
    }
  });

  it('contains expected procedure ids', () => {
    const ids = FAILOVER_PROCEDURES.map((p) => p.id);
    assert.ok(ids.includes('router-restart'));
    assert.ok(ids.includes('model-eviction'));
    assert.ok(ids.includes('disk-full'));
  });
});
