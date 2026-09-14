/**
 * Failover procedure tests for the Lunum API service.
 *
 * Tests the documented failover procedures, decision logic,
 * and execution paths defined in packages/api/src/failover-procedures.ts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FAILOVER_PROCEDURES,
  determineFailoverProcedures,
  isRecoverable,
  executeFailoverProcedure,
  runFailover,
} from '../src/failover-procedures.js';
import type { ComponentHealth } from '../src/failover-procedures.js';

// ── Test: Default procedures definition ────────────────────────────

test('failover: defines exactly 5 procedures', () => {
  assert.strictEqual(
    DEFAULT_FAILOVER_PROCEDURES.length,
    5,
    'should have exactly 5 failover procedures'
  );
});

test('failover: each procedure has required fields', () => {
  for (const proc of DEFAULT_FAILOVER_PROCEDURES) {
    assert.ok(proc.id.length > 0, `procedure ${proc.id} has non-empty id`);
    assert.ok(proc.name.length > 0, `procedure ${proc.id} has non-empty name`);
    assert.ok(proc.trigger.length > 0, `procedure ${proc.id} has non-empty trigger`);
    assert.ok(
      proc.steps.length >= 3,
      `procedure ${proc.id} has at least 3 steps`
    );
    assert.ok(proc.verification.length > 0, `procedure ${proc.id} has verification`);
    assert.ok(proc.maxRecoveryMs > 0, `procedure ${proc.id} has positive maxRecoveryMs`);
  }
});

test('failover: procedure IDs are unique', () => {
  const ids = DEFAULT_FAILOVER_PROCEDURES.map((p) => p.id);
  const unique = new Set(ids);
  assert.strictEqual(
    ids.length,
    unique.size,
    'all procedure IDs should be unique'
  );
});

test('failover: all procedures have valid triggers', () => {
  const validTriggers = [
    'model-unhealthy',
    'datastore-unhealthy',
    'core-unhealthy',
    'auth-unavailable',
    'multiple-unhealthy',
  ];
  for (const proc of DEFAULT_FAILOVER_PROCEDURES) {
    assert.ok(
      validTriggers.includes(proc.trigger),
      `trigger "${proc.trigger}" should be valid`
    );
  }
});

// ── Test: Procedure content ────────────────────────────────────────

test('failover: model-recovery procedure has exponential backoff steps', () => {
  const proc = DEFAULT_FAILOVER_PROCEDURES.find(
    (p) => p.id === 'model-recovery'
  );
  assert.ok(proc, 'model-recovery procedure should exist');
  const stepsStr = proc!.steps.join(' ');
  assert.ok(
    stepsStr.includes('1 second') || stepsStr.includes('second'),
    'should mention first retry timing'
  );
  assert.ok(
    stepsStr.includes('exponential backoff'),
    'should mention exponential backoff'
  );
});

test('failover: datastore-recovery includes schema validation', () => {
  const proc = DEFAULT_FAILOVER_PROCEDURES.find(
    (p) => p.id === 'datastore-recovery'
  );
  assert.ok(proc, 'datastore-recovery procedure should exist');
  const stepsStr = proc!.steps.join(' ');
  assert.ok(
    stepsStr.includes('schema') || stepsStr.includes('compatibility'),
    'should include schema validation'
  );
});

test('failover: full-restart is the last procedure in the list', () => {
  const last = DEFAULT_FAILOVER_PROCEDURES[DEFAULT_FAILOVER_PROCEDURES.length - 1];
  assert.strictEqual(last!.id, 'full-restart', 'last procedure should be full-restart');
});

test('failover: full-restart has the highest maxRecoveryMs', () => {
  const fullRestart = DEFAULT_FAILOVER_PROCEDURES.find(
    (p) => p.id === 'full-restart'
  );
  assert.ok(fullRestart, 'full-restart procedure should exist');
  for (const proc of DEFAULT_FAILOVER_PROCEDURES) {
    if (proc.id !== 'full-restart') {
      assert.ok(
        fullRestart!.maxRecoveryMs >= proc.maxRecoveryMs,
        `full-restart maxRecoveryMs (${fullRestart!.maxRecoveryMs}) should be >= ${proc.id} (${proc.maxRecoveryMs})`
      );
    }
  }
});

// ── Test: Failover decision logic ──────────────────────────────────

test('failover: determineFailoverProcedures returns procedure for unhealthy model', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Connection refused' },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 1);
  assert.strictEqual(procedures[0]!.id, 'model-recovery');
});

test('failover: determineFailoverProcedures returns procedure for unhealthy datastore', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Timeout' },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 1);
  assert.strictEqual(procedures[0]!.id, 'datastore-recovery');
});

test('failover: determineFailoverProcedures returns procedure for unhealthy core', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Module error' },
    { name: 'datastore', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 1);
  assert.strictEqual(procedures[0]!.id, 'core-restart');
});

test('failover: determineFailoverProcedures returns procedure for unavailable auth', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'auth', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Auth timeout' },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 1);
  assert.strictEqual(procedures[0]!.id, 'auth-degrade');
});

test('failover: determineFailoverProcedures triggers full-restart when multiple components unhealthy', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error 1' },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error 2' },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  const procedures = determineFailoverProcedures(components);
  // 2 out of 3 is >= ceil(3/2) = 2, so full-restart
  assert.strictEqual(procedures.length, 1);
  assert.strictEqual(procedures[0]!.id, 'full-restart');
});

test('failover: determineFailoverProcedures returns no procedures when all ok', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 0);
});

test('failover: determineFailoverProcedures returns no procedures when all degraded', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'degraded', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'degraded', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'degraded', lastCheckedAt: new Date().toISOString() },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 0);
});

test('failover: determineFailoverProcedures triggers full-restart when all components unhealthy', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error' },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error' },
    { name: 'model', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error' },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 1);
  assert.strictEqual(procedures[0]!.id, 'full-restart');
});

// ── Test: Recoverability check ─────────────────────────────────────

test('failover: isRecoverable returns true when no unhealthy components', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  assert.strictEqual(isRecoverable(components, 60_000), true);
});

test('failover: isRecoverable returns true when single non-stale unhealthy component', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Timeout' },
  ];

  assert.strictEqual(isRecoverable(components, 60_000), true);
});

test('failover: isRecoverable returns false when single stale unhealthy component', () => {
  const oldTime = new Date(Date.now() - 120_000).toISOString(); // 2 minutes ago
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: oldTime, error: 'Timeout' },
  ];

  assert.strictEqual(isRecoverable(components, 60_000), false);
});

test('failover: isRecoverable returns false when two unhealthy components', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error 1' },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error 2' },
  ];

  assert.strictEqual(isRecoverable(components, 60_000), false);
});

// ── Test: Procedure execution ──────────────────────────────────────

test('failover: executeFailoverProcedure succeeds by default', async () => {
  const proc = DEFAULT_FAILOVER_PROCEDURES[0]!;
  const result = await executeFailoverProcedure(proc, 10, true);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.procedureId, proc.id);
  assert.strictEqual(result.verificationPassed, true);
  assert.ok(result.recoveryMs >= 10);
});

test('failover: executeFailoverProcedure fails when simulateSuccess is false', async () => {
  const proc = DEFAULT_FAILOVER_PROCEDURES[0]!;
  const result = await executeFailoverProcedure(proc, 10, false);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.procedureId, proc.id);
  assert.strictEqual(result.verificationPassed, false);
  assert.ok(typeof result.error === 'string');
});

test('failover: executeFailoverProcedure includes custom error message', async () => {
  const proc = DEFAULT_FAILOVER_PROCEDURES[0]!;
  const result = await executeFailoverProcedure(proc, 10, false, 'Custom failure reason');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Custom failure reason');
});

test('failover: executeFailoverProcedure completes within maxRecoveryMs', async () => {
  const proc = DEFAULT_FAILOVER_PROCEDURES[0]!;
  const result = await executeFailoverProcedure(proc, 50, true);

  assert.ok(result.recoveryMs < proc.maxRecoveryMs, 'should complete within max recovery time');
});

// ── Test: Full failover run ────────────────────────────────────────

test('failover: runFailover returns empty array when no unhealthy components', async () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  const results = await runFailover(components, { simulateDelayMs: 1 });
  assert.strictEqual(results.length, 0);
});

test('failover: runFailover returns results for unhealthy components', async () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'ok', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Timeout' },
    { name: 'model', status: 'ok', lastCheckedAt: new Date().toISOString() },
  ];

  const results = await runFailover(components, { simulateDelayMs: 1 });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0]!.procedureId, 'datastore-recovery');
  assert.strictEqual(results[0]!.success, true);
});

test('failover: runFailover returns full-restart when multiple components unhealthy', async () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error' },
    { name: 'datastore', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error' },
    { name: 'model', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Error' },
  ];

  const results = await runFailover(components, { simulateDelayMs: 1 });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0]!.procedureId, 'full-restart');
});

test('failover: runFailover with simulation error', async () => {
  const components: ComponentHealth[] = [
    { name: 'model', status: 'unhealthy', lastCheckedAt: new Date().toISOString(), error: 'Timeout' },
  ];

  const results = await runFailover(components, {
    simulateDelayMs: 1,
    simulateSuccess: false,
    simulateError: 'Simulated failure',
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0]!.success, false);
  assert.strictEqual(results[0]!.error, 'Simulated failure');
});

// ── Test: Edge cases ───────────────────────────────────────────────

test('failover: empty components array returns no procedures', () => {
  const procedures = determineFailoverProcedures([]);
  assert.strictEqual(procedures.length, 0);
});

test('failover: empty components array is recoverable', () => {
  assert.strictEqual(isRecoverable([], 60_000), true);
});

test('failover: degraded status does not trigger failover', () => {
  const components: ComponentHealth[] = [
    { name: 'core', status: 'degraded', lastCheckedAt: new Date().toISOString() },
    { name: 'datastore', status: 'degraded', lastCheckedAt: new Date().toISOString() },
    { name: 'model', status: 'degraded', lastCheckedAt: new Date().toISOString() },
  ];

  const procedures = determineFailoverProcedures(components);
  assert.strictEqual(procedures.length, 0);
  assert.strictEqual(isRecoverable(components, 60_000), true);
});
